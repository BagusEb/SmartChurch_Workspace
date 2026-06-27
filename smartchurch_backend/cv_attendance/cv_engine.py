# smartchurch_backend/cv_attendance/cv_engine.py
"""
SessionManager — jantung sistem absensi SmartChurch.
Singleton: 1 instance sepanjang Django running.

Thread:
  - camera_loop    : baca frame → detect → match → push ke queues
  - db_writer_loop : db_queue → Django ORM → PostgreSQL

Flow Start Session:
  1. Load AI model & embeddings
  2. Buat WorshipSession di DB
  3. Pre-populate Attendance untuk SEMUA member active
  4. Start camera_loop + db_writer_loop threads

Deduplication Logic (RAM Tracking):
  - KNOWN     : track by member_id, window = DETECTION_COOLDOWN detik
                → update confidence saja jika muncul lagi dalam window
  - UNKNOWN/AMBIGUOUS : track by face encoding similarity, window = UNKNOWN_FACE_WINDOW detik
                → update confidence jika face encoding mirip (cosine sim ≥ threshold)
  - Setelah window expired & di-push ke DB → hapus dari RAM
    → jika muncul lagi = row baru di TimelineDataRecord (OK)
"""

import threading
import queue
import time
import uuid

from django.utils import timezone

import cv2
import numpy as np

#from .camera.webcam_stream import WebcamStream
from .camera.rtsp_stream import RTSPStream
from .vision.face_detector import FaceDetector
from .vision.face_matcher import FaceMatcher
from .vision.face_validator import FaceValidator
from .utils.image_utils import encode_image_to_bytes, draw_detection_label
from .utils.logger import get_logger
from .config import (
    RTSP_URL,
    ENABLE_SOURCE_CROP,
    SOURCE_DETECTION_CROP,
    ENABLE_AI_RESIZE,
    AI_FRAME_WIDTH,
    AI_FRAME_HEIGHT,
    DETECTION_COOLDOWN,
    MATCH_THRESHOLD_KNOWN,
    MATCH_THRESHOLD_AMBIGUOUS,
    MIN_DETECTION_SCORE,
    UNKNOWN_FACE_WINDOW,
    UNKNOWN_SAME_FACE_SIM,
)

logger = get_logger(__name__)


class SessionManager:
    _instance = None
    _lock = threading.Lock()

    def __init__(self):
        self.detector = FaceDetector()
        self.matcher  = FaceMatcher()
        self.camera   = RTSPStream(rtsp_url=RTSP_URL)

        self.frame_queue = queue.Queue(maxsize=2)
        self.log_queue   = queue.Queue()   # → frontend polling log
        self.db_queue    = queue.Queue()   # → DB writer thread

        self.is_running = False
        self.cam_thread = None
        self.db_thread  = None

        self.stats = {"known": 0, "ambiguous": 0, "unknown": 0}
        self.latest_frame = None

        # Current WorshipSession
        self.current_session_id   = None
        self.current_session_name = None

        # ── RAM Tracking untuk deduplikasi ───────────────────────
        # Lock tunggal untuk kedua tracking dict
        self._tracking_lock = threading.Lock()

        # KNOWN tracking: {member_id (int): TrackEntry}
        # TrackEntry = {"timeline_id": int|None, "best_conf": float, "timestamp": float}
        self._known_tracking: dict = {}

        # UNKNOWN/AMBIGUOUS tracking: {face_key (str): TrackEntry + "encoding"}
        # face_key = "unk_<8hex>"
        self._unknown_tracking: dict = {}
        self._last_frame_debug_log_at = 0

    # ── Singleton ──────────────────────────────────────────────────
    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    # ══════════════════════════════════════════════════════════════
    # DB HELPERS (dijalankan di main thread saat start/stop)
    # ══════════════════════════════════════════════════════════════

    def _load_embeddings(self) -> list:
        from attendance.models import MemberFaceEmbedding

        rows = (
            MemberFaceEmbedding.objects
            .filter(
                member__isnull=False,
                is_active=True,
                face_encoding__isnull=False,
                member__member_status="active",
            )
            .select_related("member")
        )

        return [
            {
                "member_id": fe.member.id,
                "full_name": fe.member.full_name,
                "face_encoding": fe.face_encoding,
            }
            for fe in rows
            if fe.member is not None and fe.face_encoding
        ]

    def _create_worship_session(self, session_name: str):
        """Buat WorshipSession baru, return object-nya."""
        from attendance.models import WorshipSession
        from django.utils import timezone
        now = timezone.now()
        session = WorshipSession.objects.create(
            session_name=session_name,
            date=now.date(),
            start_time=now,
            status="active",
        )
        logger.info(f"[SessionManager] WorshipSession dibuat: id={session.id} | '{session_name}'")
        return session

    def _prepopulate_attendance(self, worship_session) -> int:
        """
        Buat Attendance row untuk SEMUA member active.
        Semua field (kecuali member & session) dibiarkan null.
        Return: jumlah row yang dibuat.
        """
        from attendance.models import Member, Attendance
        active_members = Member.objects.filter(member_status="active")
        created = 0
        for member in active_members:
            # Pakai get_or_create supaya aman jika dipanggil 2x
            _, was_created = Attendance.objects.get_or_create(
                member=member,
                session=worship_session,
                defaults={},   # semua field lain null
            )
            if was_created:
                created += 1
        logger.info(
            f"[SessionManager] Pre-populated {created} attendance rows "
            f"untuk session_id={worship_session.id}"
        )
        return created

    def _close_worship_session(self, session_id: int):
        """Set end_time & status='closed' pada WorshipSession aktif."""
        from attendance.models import WorshipSession
        from django.utils import timezone
        try:
            session = WorshipSession.objects.get(id=session_id)
            session.end_time = timezone.now()
            session.status   = "closed"
            session.save(update_fields=["end_time", "status"])
            logger.info(f"[SessionManager] WorshipSession {session_id} ditutup")
        except WorshipSession.DoesNotExist:
            logger.warning(f"[SessionManager] WorshipSession {session_id} tidak ditemukan saat close")
        except Exception as e:
            logger.error(f"[SessionManager] Gagal menutup WorshipSession: {e}")

    # ══════════════════════════════════════════════════════════════
    # START SESSION
    # ══════════════════════════════════════════════════════════════

    def start_session(self, session_name: str = "Ibadah") -> tuple[bool, str]:
        if self.is_running:
            return False, "Sesi sudah berjalan"

        session_name = session_name.strip()
        if not session_name:
            return False, "Nama sesi tidak boleh kosong"

        # 1. Load AI model
        try:
            self.detector.load_model()
        except Exception as e:
            return False, f"Gagal load AI model: {e}"

        # 2. Load embeddings dari DB
        try:
            embeddings = self._load_embeddings()
        except Exception as e:
            return False, f"Gagal load embeddings dari DB: {e}"

        if not embeddings:
            return False, "Tidak ada embedding aktif. Lakukan face enroll dulu."

        self.matcher.load_from_db(embeddings)

        # 3. Buat WorshipSession di DB
        try:
            worship_session = self._create_worship_session(session_name)
            self.current_session_id   = worship_session.id
            self.current_session_name = session_name
        except Exception as e:
            return False, f"Gagal membuat Worship Session: {e}"

        # 4. Pre-populate Attendance untuk semua member active
        try:
            self._prepopulate_attendance(worship_session)
        except Exception as e:
            # Non-fatal — catat saja, tetap lanjut
            logger.error(f"[SessionManager] Pre-populate gagal (non-fatal): {e}")

        # 5. Reset state
        self.stats = {"known": 0, "ambiguous": 0, "unknown": 0}
        self._flush_queues()
        with self._tracking_lock:
            self._known_tracking   = {}
            self._unknown_tracking = {}

        # 6. Buka kamera
        if not self.camera.open():
            # Rollback: tutup session yang baru dibuat
            self._close_worship_session(worship_session.id)
            self.current_session_id   = None
            self.current_session_name = None
            return False, "Gagal membuka CCTV RTSP. Periksa IP, username, password, channel 101, dan jaringan LAN."

        self.is_running = True

        # 7. Start threads
        self.cam_thread = threading.Thread(
            target=self._camera_loop,
            daemon=True,
            name="CV-CameraThread",
        )
        self.db_thread = threading.Thread(
            target=self._db_writer_loop,
            daemon=True,
            name="CV-DBWriterThread",
        )
        self.cam_thread.start()
        self.db_thread.start()

        logger.info(
            f"[SessionManager] Sesi '{session_name}' dimulai. "
            f"session_id={self.current_session_id} | "
            f"{self.matcher.total_references} embedding dimuat."
        )
        return True, f"Sesi '{session_name}' berhasil dimulai"

    # ══════════════════════════════════════════════════════════════
    # STOP SESSION
    # ══════════════════════════════════════════════════════════════

    def stop_session(self) -> tuple[bool, str]:
        if not self.is_running:
            return False, "Tidak ada sesi yang sedang berjalan"

        self.is_running = False

        # Tunggu camera thread selesai
        if self.cam_thread and self.cam_thread.is_alive():
            self.cam_thread.join(timeout=4)

        # Tunggu DB writer habiskan antrean
        if self.db_thread and self.db_thread.is_alive():
            remaining = self.db_queue.qsize()
            if remaining:
                logger.info(f"[SessionManager] Menunggu DB writer: {remaining} item...")
            self.db_thread.join(timeout=15)
            if self.db_thread.is_alive():
                logger.warning("[SessionManager] DB writer timeout, beberapa data mungkin belum tersimpan.")

        # Tutup WorshipSession di DB
        if self.current_session_id:
            self._close_worship_session(self.current_session_id)

        self.camera.release()
        self.latest_frame = None

        session_name = self.current_session_name or "Unknown"
        self.current_session_id   = None
        self.current_session_name = None

        logger.info(f"[SessionManager] Sesi '{session_name}' dihentikan.")
        return True, f"Sesi '{session_name}' berhasil dihentikan"

    # ══════════════════════════════════════════════════════════════
    # PUBLIC ACCESSORS
    # ══════════════════════════════════════════════════════════════

    def get_status(self) -> dict:
        return {
            "is_running":       self.is_running,
            "stats":            self.stats,
            "db_queue_size":    self.db_queue.qsize(),
            "total_references": self.matcher.total_references,
            "session_id":       self.current_session_id,
            "session_name":     self.current_session_name,
        }

    def get_latest_frame_jpeg(self) -> bytes | None:
        if self.latest_frame is None:
            return None
        ok, buf = cv2.imencode(".jpg", self.latest_frame)
        return buf.tobytes() if ok else None

    def get_detection_logs(self) -> list:
        """Drain log_queue dan return semua entry."""
        logs = []
        while not self.log_queue.empty():
            try:
                logs.append(self.log_queue.get_nowait())
            except queue.Empty:
                break
        return logs

    # ── Internal ───────────────────────────────────────────────────

    def _flush_queues(self):
        for q in (self.frame_queue, self.log_queue, self.db_queue):
            while not q.empty():
                try:
                    q.get_nowait()
                except queue.Empty:
                    break

    # --─ CAMERA HANDLING ─────────────────────────────────────────────
    def _prepare_frame_for_ai(self, frame):
        """
        Pipeline baru:
        1. Terima frame asli RTSP.
        2. Crop area penting dari frame asli jika ENABLE_SOURCE_CROP=True.
        3. Resize hasil crop jika ENABLE_AI_RESIZE=True.
        4. Return frame final untuk InsightFace.

        Catatan:
        - SOURCE_DETECTION_CROP memakai koordinat frame asli RTSP.
        - AI_FRAME_WIDTH/AI_FRAME_HEIGHT adalah ukuran final yang masuk ke model.
        """

        if frame is None or frame.size == 0:
            return frame

        original_h, original_w = frame.shape[:2]
        working_frame = frame

        # 1. Crop dari frame asli RTSP
        if ENABLE_SOURCE_CROP:
            x1, y1, x2, y2 = SOURCE_DETECTION_CROP

            x1 = max(0, min(int(x1), original_w - 1))
            y1 = max(0, min(int(y1), original_h - 1))
            x2 = max(0, min(int(x2), original_w))
            y2 = max(0, min(int(y2), original_h))

            if x2 <= x1 or y2 <= y1:
                logger.warning(
                    "[AttendanceFramePipeline] SOURCE_DETECTION_CROP tidak valid. "
                    f"crop={SOURCE_DETECTION_CROP}, original={original_w}x{original_h}. "
                    "Frame asli dipakai tanpa crop."
                )
            else:
                working_frame = frame[y1:y2, x1:x2]

        crop_h, crop_w = working_frame.shape[:2]

        # 2. Optional resize hasil crop
        if ENABLE_AI_RESIZE:
            target_w = int(AI_FRAME_WIDTH)
            target_h = int(AI_FRAME_HEIGHT)

            if target_w <= 0 or target_h <= 0:
                logger.warning(
                    "[AttendanceFramePipeline] AI_FRAME_WIDTH/AI_FRAME_HEIGHT tidak valid. "
                    f"AI_FRAME_WIDTH={AI_FRAME_WIDTH}, AI_FRAME_HEIGHT={AI_FRAME_HEIGHT}. "
                    "Resize dilewati."
                )
            else:
                interpolation = (
                    cv2.INTER_AREA
                    if crop_w > target_w or crop_h > target_h
                    else cv2.INTER_LINEAR
                )

                working_frame = cv2.resize(
                    working_frame,
                    (target_w, target_h),
                    interpolation=interpolation,
                )

        final_h, final_w = working_frame.shape[:2]

        # Log ukuran frame setiap 5 detik supaya mudah debug
        now = time.time()

        if now - self._last_frame_debug_log_at >= 5:
            self._last_frame_debug_log_at = now
            logger.info(
                "[AttendanceFramePipeline] "
                f"original={original_w}x{original_h} | "
                f"after_crop={crop_w}x{crop_h} | "
                f"final_ai={final_w}x{final_h} | "
                f"source_crop={ENABLE_SOURCE_CROP} | "
                f"ai_resize={ENABLE_AI_RESIZE}"
            )

        return working_frame
    # ══════════════════════════════════════════════════════════════
    # THREAD 1 — CAMERA + AI PIPELINE
    # ══════════════════════════════════════════════════════════════

    def _camera_loop(self):
        logger.info("[CameraThread] Dimulai.")
        while self.is_running:
            ok, frame = self.camera.read_frame()
            if not ok or frame is None:
                time.sleep(0.01)
                continue

            frame_ai = self._prepare_frame_for_ai(frame)
            annotated = frame_ai.copy()
            try:
                faces = self.detector.detect(frame_ai)
                for face in faces:
                    match  = self.matcher.match(face["embedding"])
                    status = FaceValidator.classify(
                        similarity=match["similarity"],
                        det_score=face["det_score"],
                        face_size=face["face_size"],
                    )
                    display_name = FaceValidator.get_display_name(status, match["name"])
                    draw_detection_label(
                        annotated, face["bbox"],
                        display_name, match["similarity"], status,
                    )
                    self._maybe_push(face, match, status, display_name)
            except Exception as e:
                logger.error(f"[CameraThread] Error: {e}")

            self.latest_frame = annotated

        logger.info("[CameraThread] Selesai.")

    # ── Core logic: deduplikasi + push ke queues ──────────────────

    def _maybe_push(self, face: dict, match: dict, status: str, display_name: str):
        """
        Tentukan apakah deteksi ini perlu membuat row baru di TimelineDataRecord,
        atau cukup update confidence yang sudah ada.

        Dedup rules:
          KNOWN     → track by member_id, window = DETECTION_COOLDOWN detik
          UNKNOWN/AMBIGUOUS → track by encoding similarity, window = UNKNOWN_FACE_WINDOW detik
        """
        member_id      = match["member_id"]
        now            = time.time()
        now_dt         = timezone.now()
        confidence_pct = round(match["similarity"] * 100, 2)

        # ── Cek KNOWN ──────────────────────────────────────────────
        if status == "KNOWN" and member_id is not None:
            with self._tracking_lock:
                entry = self._known_tracking.get(member_id)

                if entry and (now - entry["timestamp"]) < DETECTION_COOLDOWN:
                    # ── Orang yang sama, masih dalam window → update confidence saja
                    if confidence_pct > entry["best_conf"]:
                        entry["best_conf"] = confidence_pct
                        if entry["timeline_id"] is not None:
                            # Update confidence di DB (non-blocking)
                            self.db_queue.put({
                                "action":      "update_confidence",
                                "timeline_id": entry["timeline_id"],
                                "confidence":  confidence_pct,
                            })
                    # Tetap push ke log agar frontend tau ada deteksi
                    self.log_queue.put({
                        "time":       now_dt.strftime("%H:%M:%S"),
                        "name":       display_name,
                        "status":     status,
                        "similarity": round(match["similarity"], 3),
                        "is_update":  True,   # flag: bukan row baru
                    })
                    return   # ← early exit, tidak buat row baru

                # Window expired atau pertama kali → buat entry baru
                # (hapus entry lama jika ada)
                if entry:
                    del self._known_tracking[member_id]

                # Buat entry placeholder; timeline_id akan diisi oleh DB writer nanti
                self._known_tracking[member_id] = {
                    "timeline_id": None,      # belum ada, pending DB write
                    "best_conf":   confidence_pct,
                    "timestamp":   now,
                }
            # face_key tidak dipakai untuk KNOWN
            face_key_for_db = None

        # ── Cek UNKNOWN / AMBIGUOUS ────────────────────────────────
        elif status in ("UNKNOWN", "AMBIGUOUS"):
            face_key_for_db = None

            with self._tracking_lock:
                # Hapus entries yang sudah expired
                expired = [
                    k for k, v in self._unknown_tracking.items()
                    if (now - v["timestamp"]) >= UNKNOWN_FACE_WINDOW
                ]
                for k in expired:
                    del self._unknown_tracking[k]

                # Cari wajah yang mirip di window aktif
                query      = face["embedding"]
                query_norm = query / (np.linalg.norm(query) + 1e-8)
                found_key  = None

                for k, v in self._unknown_tracking.items():
                    ref      = np.array(v["encoding"], dtype=np.float32)
                    ref_norm = ref / (np.linalg.norm(ref) + 1e-8)
                    if float(np.dot(query_norm, ref_norm)) >= UNKNOWN_SAME_FACE_SIM:
                        found_key = k
                        break

                if found_key:
                    # ── Wajah yang sama dalam window → update confidence saja
                    entry = self._unknown_tracking[found_key]
                    if confidence_pct > entry["best_conf"]:
                        entry["best_conf"] = confidence_pct
                        if entry["timeline_id"] is not None:
                            self.db_queue.put({
                                "action":      "update_confidence",
                                "timeline_id": entry["timeline_id"],
                                "confidence":  confidence_pct,
                            })
                    self.log_queue.put({
                        "time":       now_dt.strftime("%H:%M:%S"),
                        "name":       display_name,
                        "status":     status,
                        "similarity": round(match["similarity"], 3),
                        "is_update":  True,
                    })
                    return   # ← early exit

                # Wajah baru → buat entry tracking
                face_key_for_db = f"unk_{uuid.uuid4().hex[:8]}"
                self._unknown_tracking[face_key_for_db] = {
                    "timeline_id": None,
                    "best_conf":   confidence_pct,
                    "timestamp":   now,
                    "encoding":    face["embedding"].tolist(),
                }

        else:
            face_key_for_db = None

        # ── Push log ke frontend ───────────────────────────────────
        self.log_queue.put({
            "time":       now_dt.strftime("%H:%M:%S"),
            "name":       display_name,
            "status":     status,
            "similarity": round(match["similarity"], 3),
            "is_update":  False,
        })

        # ── Push ke DB writer ──────────────────────────────────────
        self.db_queue.put({
            "action":              "create",
            "capture_time":        now_dt,
            "face_image_bytes":    encode_image_to_bytes(face["face_crop"]),
            "face_encoding":       face["embedding"].tolist(),
            "detection_status":    status.lower(),
            "confidence_pct":      confidence_pct,
            "matched_member_id":   member_id,
            "status":              status,
            "session_id":          self.current_session_id,
            # Callback info — DB writer pakai ini untuk update tracking dict
            "member_id_tracking":  member_id if status == "KNOWN" else None,
            "face_key_tracking":   face_key_for_db,
        })

    # ══════════════════════════════════════════════════════════════
    # THREAD 2 — DB WRITER
    # ══════════════════════════════════════════════════════════════

    def _db_writer_loop(self):
        """
        Konsumsi db_queue satu per satu.
        Terus jalan sampai is_running=False DAN queue kosong.
        """
        import django.db
        logger.info("[DBWriter] Dimulai.")

        while True:
            if not self.is_running and self.db_queue.empty():
                break
            try:
                data = self.db_queue.get(timeout=0.5)
            except queue.Empty:
                continue

            try:
                action = data.get("action", "create")

                if action == "update_confidence":
                    # ── Hanya update confidence di TimelineDataRecord ──
                    self._update_confidence_in_db(data)

                elif action == "create":
                    # ── Buat row baru di TimelineDataRecord (+ update Attendance jika KNOWN) ──
                    timeline_id = self._save_detection_to_db(data)

                    if timeline_id:
                        # Setelah sukses, update tracking dict dengan timeline_id asli
                        member_id_t  = data.get("member_id_tracking")
                        face_key_t   = data.get("face_key_tracking")

                        with self._tracking_lock:
                            if member_id_t is not None and member_id_t in self._known_tracking:
                                self._known_tracking[member_id_t]["timeline_id"] = timeline_id
                            if face_key_t and face_key_t in self._unknown_tracking:
                                self._unknown_tracking[face_key_t]["timeline_id"] = timeline_id

                        # Update stats
                        stat_key = data["status"].lower()
                        if stat_key in self.stats:
                            self.stats[stat_key] += 1

            except Exception as e:
                logger.error(f"[DBWriter] Error: {e}")
            finally:
                self.db_queue.task_done()
                # Tutup koneksi DB thread ini — cegah connection leak
                django.db.connection.close()

        logger.info("[DBWriter] Selesai.")

    # ── DB helpers (static, tidak butuh self) ─────────────────────

    @staticmethod
    def _update_confidence_in_db(data: dict):
        """Update confidence pada row TimelineDataRecord yang sudah ada."""
        from attendance.models import TimelineDataRecord
        try:
            updated = TimelineDataRecord.objects.filter(
                id=data["timeline_id"]
            ).update(confidence=data["confidence"])
            if updated:
                logger.debug(
                    f"[DBWriter] Updated confidence "
                    f"timeline_id={data['timeline_id']} → {data['confidence']}%"
                )
        except Exception as e:
            logger.error(f"[DBWriter] Gagal update confidence: {e}")

    @staticmethod
    def _save_detection_to_db(data: dict) -> int | None:
        """
        Simpan 1 deteksi ke DB.
        - Selalu buat TimelineDataRecord.
        - Hanya KNOWN: update row Attendance yang sudah di-pre-populate.
        Return: timeline_id jika sukses, None jika gagal.
        """
        from django.db import transaction
        from attendance.models import TimelineDataRecord, Attendance

        capture_time = data["capture_time"]
        member_id    = data["matched_member_id"]
        confidence   = round(data["confidence_pct"], 2)
        status       = data["status"]           # "KNOWN" | "UNKNOWN" | "AMBIGUOUS"
        session_id   = data.get("session_id")
        is_known     = (status == "KNOWN" and member_id is not None)

        # Map status ke choices di model (model pakai "know", bukan "known")
        detection_status_map = {
            "KNOWN":     "know",
            "UNKNOWN":   "unknown",
            "AMBIGUOUS": "ambiguous",
        }
        detection_status_db = detection_status_map.get(status, status.lower())

        try:
            with transaction.atomic():
                # ── 1. Selalu buat TimelineDataRecord ───────────────
                timeline = TimelineDataRecord.objects.create(
                    capture_time     = capture_time,
                    face_image       = data["face_image_bytes"],
                    face_encoding    = data["face_encoding"],
                    detection_status = detection_status_db,
                    confidence       = confidence,
                    matched_member_id= member_id,
                    validation_status= "verified" if is_known else "pending",
                    validated_at     = capture_time if is_known else None,
                    final_member_id  = member_id if is_known else None,
                )

                # ── 2. Hanya KNOWN: update Attendance yang di-pre-populate ──
                if is_known and session_id:
                    updated_rows = Attendance.objects.filter(
                        member_id       = member_id,
                        session_id      = session_id,
                        attendance_date__isnull = True,   # Belum check-in
                    ).update(
                        attendance_date  = capture_time.date(),
                        check_in_time    = capture_time,
                        confidence       = confidence,
                        facedetection_id = timeline.id,   # Link ke timeline record
                    )

                    if updated_rows > 0:
                        logger.info(
                            f"[DBWriter] KNOWN check-in: member_id={member_id} | "
                            f"timeline_id={timeline.id} | session_id={session_id}"
                        )
                    else:
                        # Member sudah hadir sebelumnya (attendance_date sudah terisi)
                        logger.debug(
                            f"[DBWriter] KNOWN sudah hadir: member_id={member_id} | "
                            f"timeline_id={timeline.id} baru (setelah cooldown)"
                        )
                elif not is_known:
                    logger.debug(
                        f"[DBWriter] {status}: timeline_id={timeline.id} | "
                        f"validation_status=pending"
                    )

            return timeline.id

        except Exception as e:
            logger.error(f"[DBWriter] _save_detection_to_db error: {e}")
            return None