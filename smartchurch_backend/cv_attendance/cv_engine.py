# smartchurch_backend/cv_attendance/cv_engine.py

"""
SessionManager — jantung sistem absensi SmartChurch.

Flow attendance baru:
1. AsyncRTSPStream membaca latest frame.
2. Frame di-crop dan resize untuk AI.
3. FaceDetector.detect_boxes() melakukan face detection.
4. SimpleFaceTracker memberi track_id dan first_detected_at.
5. Selama track aktif, recognition dijalankan berulang secara terkontrol.
6. Setiap track menyimpan best_result:
   KNOWN > UNKNOWN > AMBIGUOUS, lalu similarity/quality terbaik.
7. Selama track aktif tidak ada TimelineDataRecord yang dibuat.
8. Saat track hilang atau session dihentikan:
   - satu best_result difinalisasi;
   - capture_time memakai first_detected_at;
   - face image, embedding, status, dan confidence memakai best_result.
9. KNOWN tetap dideduplikasi per member dalam satu worship session.
"""

import queue
import threading
import time

import cv2
from django.utils import timezone

from .camera.async_rtsp_stream import AsyncRTSPStream
from .config import (
    AI_FRAME_HEIGHT,
    AI_FRAME_WIDTH,
    ENABLE_AI_RESIZE,
    ENABLE_SOURCE_CROP,
    MAX_GUEST_REFERENCE_EMBEDDINGS_PER_GUEST,
    MIN_TRACK_SEEN_COUNT_FOR_RECOGNITION,
    RECOGNITION_FORCE_DET_SCORE_DELTA,
    RECOGNITION_FORCE_SIZE_GROWTH_RATIO,
    RECOGNITION_RETRY_INTERVAL_AMBIGUOUS,
    RECOGNITION_RETRY_INTERVAL_KNOWN,
    RECOGNITION_RETRY_INTERVAL_UNKNOWN,
    RTSP_URL,
    SOURCE_DETECTION_CROP,
    TRACKER_IOU_THRESHOLD,
    TRACKER_MAX_CENTER_DISTANCE,
    TRACKER_MAX_LOST_SECONDS,
)
from .utils.image_utils import draw_detection_label, encode_image_to_bytes
from .utils.logger import get_logger
from .vision.face_detector import FaceDetector
from .vision.face_matcher import FaceMatcher
from .vision.face_validator import FaceValidator
from .vision.simple_tracker import SimpleFaceTracker

logger = get_logger(__name__)

# Karena update evidence KNOWN sekarang hanya dilakukan ketika satu track selesai,
# delta kecil sudah cukup. Nilai ini memakai satuan persen.
KNOWN_CONF_UPDATE_MIN_DELTA = 0.01


class SessionManager:
    _instance = None
    _lock = threading.Lock()

    def __init__(self):
        self.detector = FaceDetector()
        self.matcher = FaceMatcher()
        self.camera = AsyncRTSPStream(rtsp_url=RTSP_URL)

        self.tracker = self._new_tracker()

        self.log_queue = queue.Queue(maxsize=500)
        self.db_queue = queue.Queue(maxsize=1000)

        self.is_running = False
        self.cam_thread = None
        self.db_thread = None
        self._camera_finished_event = threading.Event()

        # Statistik menghitung event final yang berhasil masuk DB.
        self.stats = {
            "known": 0,
            "guest": 0,
            "ambiguous": 0,
            "unknown": 0,
        }

        self.latest_frame = None

        self._frame_lock = threading.Lock()
        self._monitor_state_lock = threading.Lock()
        self._monitor_enabled = False

        self.current_session_id = None
        self.current_session_name = None

        # member_id -> {
        #   "timeline_id": int | None,
        #   "best_conf": float,
        # }
        self._session_seen_members = {}

        # guest_id -> {
        #   "timeline_id": int | None,
        #   "best_conf": float,
        # }
        self._session_seen_guests = {}

        self._session_seen_members_lock = threading.Lock()

        self._last_frame_pipeline_log_at = 0.0
        self._last_perf_log_at = 0.0

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()

        return cls._instance

    @staticmethod
    def _new_tracker():
        return SimpleFaceTracker(
            iou_threshold=TRACKER_IOU_THRESHOLD,
            max_center_distance=TRACKER_MAX_CENTER_DISTANCE,
            max_lost_seconds=TRACKER_MAX_LOST_SECONDS,
            min_seen_count_for_recognition=(
                MIN_TRACK_SEEN_COUNT_FOR_RECOGNITION
            ),
            ambiguous_retry_interval=(
                RECOGNITION_RETRY_INTERVAL_AMBIGUOUS
            ),
            unknown_retry_interval=(
                RECOGNITION_RETRY_INTERVAL_UNKNOWN
            ),
            known_retry_interval=(
                RECOGNITION_RETRY_INTERVAL_KNOWN
            ),
            force_size_growth_ratio=(
                RECOGNITION_FORCE_SIZE_GROWTH_RATIO
            ),
            force_det_score_delta=(
                RECOGNITION_FORCE_DET_SCORE_DELTA
            ),
        )

    def _safe_queue_put(self, q, item, queue_name="queue"):
        try:
            q.put_nowait(item)
            return True
        except queue.Full:
            logger.warning(
                f"[SessionManager] {queue_name} penuh, item dibuang."
            )
            return False

    # ============================================================
    # DB helpers for start / stop
    # ============================================================

    def _load_embeddings(self) -> list:
        """
        Memuat reference wajah untuk attendance.

        Sumber:
        1. MemberFaceEmbedding milik member aktif.
        2. Attendance guest lama melalui:
        Attendance.facedetection.face_encoding.

        Guest yang sudah converted_to_member tidak dimuat.
        """

        from attendance.models import (
            Attendance,
            MemberFaceEmbedding,
        )

        references = []

        # ============================================================
        # MEMBER REFERENCES
        # ============================================================
        member_embeddings = (
            MemberFaceEmbedding.objects
            .filter(
                member__isnull=False,
                is_active=True,
                face_encoding__isnull=False,
                member__member_status="active",
            )
            .select_related("member")
            .order_by("member_id", "id")
        )

        for face_embedding in member_embeddings:
            if (
                face_embedding.member is None
                or not face_embedding.face_encoding
            ):
                continue

            references.append(
                {
                    "identity_type": "member",
                    "identity_id": face_embedding.member_id,
                    "member_id": face_embedding.member_id,
                    "guest_id": None,
                    "full_name": face_embedding.member.full_name,
                    "face_encoding": face_embedding.face_encoding,
                    "source": "member_face_embedding",
                    "source_id": face_embedding.id,
                }
            )

        # ============================================================
        # GUEST REFERENCES
        #
        # Guest tidak lagi menyimpan face_encoding.
        # Encoding diambil dari attendance lama -> facedetection.
        # ============================================================
        guest_attendances = (
            Attendance.objects
            .filter(
                guest__isnull=False,

                # Jangan load guest yang telah menjadi member.
                guest__converted_to_member__isnull=True,

                facedetection__isnull=False,
                facedetection__face_encoding__isnull=False,
            )
            .select_related(
                "guest",
                "facedetection",
            )
            .order_by(
                "guest_id",
                "-check_in_time",
                "-id",
            )
        )

        guest_reference_counts = {}

        for attendance in guest_attendances:
            guest = attendance.guest
            facedetection = attendance.facedetection

            if not guest or not facedetection:
                continue

            face_encoding = facedetection.face_encoding

            if not face_encoding:
                continue

            current_count = guest_reference_counts.get(
                guest.id,
                0,
            )

            if (
                current_count
                >= MAX_GUEST_REFERENCE_EMBEDDINGS_PER_GUEST
            ):
                continue

            references.append(
                {
                    "identity_type": "guest",
                    "identity_id": guest.id,
                    "member_id": None,
                    "guest_id": guest.id,
                    "full_name": guest.full_name or f"Guest #{guest.id}",
                    "face_encoding": face_encoding,
                    "source": "guest_attendance_timeline",
                    "source_id": facedetection.id,
                    "attendance_id": attendance.id,
                }
            )

            guest_reference_counts[guest.id] = (
                current_count + 1
            )

        member_reference_count = sum(
            1
            for reference in references
            if reference["identity_type"] == "member"
        )

        guest_reference_count = sum(
            1
            for reference in references
            if reference["identity_type"] == "guest"
        )

        logger.info(
            "[SessionManager] Face references loaded: "
            f"member={member_reference_count} | "
            f"guest={guest_reference_count} | "
            f"total={len(references)}"
        )

        return references

    @staticmethod
    def _create_worship_session(session_name: str):
        from attendance.models import WorshipSession

        now = timezone.now()

        session = WorshipSession.objects.create(
            session_name=session_name,
            date=now.date(),
            start_time=now,
            status="active",
        )

        logger.info(
            f"[SessionManager] WorshipSession dibuat: "
            f"id={session.id} | '{session_name}'"
        )

        return session

    @staticmethod
    def _close_worship_session(session_id: int):
        from attendance.models import WorshipSession

        try:
            session = WorshipSession.objects.get(id=session_id)
            session.end_time = timezone.now()
            session.status = "closed"
            session.save(update_fields=["end_time", "status"])

            logger.info(
                f"[SessionManager] WorshipSession {session_id} ditutup"
            )

        except WorshipSession.DoesNotExist:
            logger.warning(
                f"[SessionManager] WorshipSession {session_id} "
                f"tidak ditemukan saat close"
            )

        except Exception as exc:
            logger.error(
                f"[SessionManager] Gagal menutup WorshipSession: {exc}"
            )

    # ============================================================
    # Start / stop session
    # ============================================================

    def start_session(self, session_name: str = "Ibadah") -> tuple[bool, str]:
        if self.is_running:
            return False, "Sesi sudah berjalan."

        session_name = (session_name or "").strip()

        if not session_name:
            return False, "Nama sesi tidak boleh kosong."

        self.tracker = self._new_tracker()
        self._session_seen_members = {}
        self._session_seen_guests = {}
        self.stats = {
            "known": 0,
            "guest": 0,
            "ambiguous": 0,
            "unknown": 0,
        }
        self._last_frame_pipeline_log_at = 0.0
        self._last_perf_log_at = 0.0
        self._flush_queues()
        self._camera_finished_event.clear()

        try:
            self.detector.load_model()
        except Exception as exc:
            return False, f"Gagal load AI model: {exc}"

        try:
            references  = self._load_embeddings()
        except Exception as exc:
            return False, f"Gagal load embeddings dari DB: {exc}"

        if not references :
            return False, "Tidak ada embedding aktif. Lakukan face enroll dulu."

        self.matcher.load_from_db(references )

        try:
            worship_session = self._create_worship_session(session_name)
            self.current_session_id = worship_session.id
            self.current_session_name = session_name
        except Exception as exc:
            return False, f"Gagal membuat Worship Session: {exc}"

        if not self.camera.open():
            self._close_worship_session(worship_session.id)
            self.current_session_id = None
            self.current_session_name = None

            return (
                False,
                "Gagal membuka CCTV RTSP. Periksa IP, username, password, "
                "channel 101, dan jaringan LAN.",
            )

        self.latest_frame = None
        self.set_monitor_enabled(False)
        self.is_running = True

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

        return True, f"Sesi '{session_name}' berhasil dimulai."

    def stop_session(self) -> tuple[bool, str]:
        if not self.is_running:
            return False, "Tidak ada sesi yang sedang berjalan."

        self.is_running = False
        self.set_monitor_enabled(False)

        # Release lebih awal agar read_latest_frame/cap.read segera terbuka.
        self.camera.release()

        if self.cam_thread and self.cam_thread.is_alive():
            self.cam_thread.join(timeout=6)

            if self.cam_thread.is_alive():
                logger.warning(
                    "[SessionManager] Camera thread belum berhenti setelah timeout."
                )

        # Camera thread mem-finalisasi seluruh active track pada blok finally.
        if self.db_thread and self.db_thread.is_alive():
            remaining = self.db_queue.qsize()

            if remaining:
                logger.info(
                    f"[SessionManager] Menunggu DB writer: "
                    f"{remaining} item..."
                )

            self.db_thread.join(timeout=20)

            if self.db_thread.is_alive():
                logger.warning(
                    "[SessionManager] DB writer timeout, beberapa data "
                    "mungkin belum tersimpan."
                )

        if self.current_session_id:
            self._close_worship_session(self.current_session_id)

        self.latest_frame = None

        session_name = self.current_session_name or "Unknown"

        self.current_session_id = None
        self.current_session_name = None
        self._session_seen_members = {}
        self._session_seen_guests = {}

        logger.info(f"[SessionManager] Sesi '{session_name}' dihentikan.")

        return True, f"Sesi '{session_name}' berhasil dihentikan."

    # ============================================================
    # Public accessors
    # ============================================================

    def get_status(self) -> dict:
        return {
            "is_running": self.is_running,
            "stats": self.stats,
            "db_queue_size": self.db_queue.qsize(),
            "log_queue_size": self.log_queue.qsize(),
            "total_references": self.matcher.total_references,
            "reference_counts": self.matcher.reference_counts,
            "session_id": self.current_session_id,
            "session_name": self.current_session_name,
            "active_tracks": len(self.tracker.tracks),
            "seen_known_members": len(
                self._session_seen_members
            ),
            "seen_known_guests": len(
                self._session_seen_guests
            ),
            "camera": self.camera.get_status(),
        }

    def set_monitor_enabled(self, enabled: bool):
        with self._monitor_state_lock:
            self._monitor_enabled = bool(enabled)

        if not enabled:
            with self._frame_lock:
                self.latest_frame = None

    def is_monitor_enabled(self) -> bool:
        with self._monitor_state_lock:
            return self._monitor_enabled

    def get_latest_frame_copy(self):
        with self._frame_lock:
            if self.latest_frame is None:
                return None

            return self.latest_frame.copy()

    def get_detection_logs(self) -> list:
        logs = []

        while not self.log_queue.empty():
            try:
                logs.append(self.log_queue.get_nowait())
            except queue.Empty:
                break

        return logs

    # ============================================================
    # Internal helpers
    # ============================================================

    def _flush_queues(self):
        for q in (self.log_queue, self.db_queue):
            while not q.empty():
                try:
                    q.get_nowait()
                except queue.Empty:
                    break

    def _prepare_frame_for_ai(self, frame):
        if frame is None or frame.size == 0:
            return frame

        original_h, original_w = frame.shape[:2]
        working_frame = frame

        if ENABLE_SOURCE_CROP:
            x1, y1, x2, y2 = SOURCE_DETECTION_CROP

            x1 = max(0, min(int(x1), original_w - 1))
            y1 = max(0, min(int(y1), original_h - 1))
            x2 = max(0, min(int(x2), original_w))
            y2 = max(0, min(int(y2), original_h))

            if x2 <= x1 or y2 <= y1:
                logger.warning(
                    "[AttendanceFramePipeline] SOURCE_DETECTION_CROP "
                    f"tidak valid. crop={SOURCE_DETECTION_CROP}, "
                    f"original={original_w}x{original_h}. "
                    "Frame asli dipakai tanpa crop."
                )
            else:
                working_frame = frame[y1:y2, x1:x2]

        crop_h, crop_w = working_frame.shape[:2]

        if ENABLE_AI_RESIZE:
            target_w = int(AI_FRAME_WIDTH)
            target_h = int(AI_FRAME_HEIGHT)

            if target_w <= 0 or target_h <= 0:
                logger.warning(
                    "[AttendanceFramePipeline] AI_FRAME_WIDTH atau "
                    "AI_FRAME_HEIGHT tidak valid. Resize dilewati."
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
        now = time.time()

        if now - self._last_frame_pipeline_log_at >= 5:
            self._last_frame_pipeline_log_at = now

            logger.info(
                "[AttendanceFramePipeline] "
                f"original={original_w}x{original_h} | "
                f"after_crop={crop_w}x{crop_h} | "
                f"final_ai={final_w}x{final_h} | "
                f"source_crop={ENABLE_SOURCE_CROP} | "
                f"ai_resize={ENABLE_AI_RESIZE}"
            )

        return working_frame

    @staticmethod
    def _best_result_for_display(track):
        best_result = track.get("best_result")

        if best_result:
            return (
                str(best_result.get("status") or "AMBIGUOUS").upper(),
                best_result.get("display_name") or "AMBIGUOUS",
                float(best_result.get("similarity") or 0.0),
            )

        return "AMBIGUOUS", "TRACKING", 0.0

    def _push_provisional_log(
        self,
        track_id,
        best_result,
        frame_sequence=None,
        best_updated=False,
    ):
        if not best_result:
            return

        self._safe_queue_put(
            self.log_queue,
            {
                "time": timezone.now().strftime("%H:%M:%S"),
                "name": best_result.get("display_name") or "AMBIGUOUS",
                "status": str(
                    best_result.get("status") or "AMBIGUOUS"
                ).upper(),
                "similarity": round(
                    float(best_result.get("similarity") or 0.0),
                    3,
                ),
                "is_update": True,
                "provisional": True,
                "best_updated": bool(best_updated),
                "track_id": track_id,
                "frame_sequence": frame_sequence,
            },
            "log_queue",
        )

    def _finalize_expired_tracks(self, expired_tracks, reason):
        for track in expired_tracks:
            self._finalize_track_event(track, reason=reason)

    def _finalize_all_active_tracks(self, reason):
        tracks = self.tracker.finalize_all()
        self._finalize_expired_tracks(tracks, reason=reason)

    # ============================================================
    # Camera + AI thread
    # ============================================================

    def _camera_loop(self):
        logger.info("[CameraThread] Dimulai.")

        last_frame_sequence = None

        try:
            while self.is_running:
                read_ms = 0.0
                prep_ms = 0.0
                detect_ms = 0.0
                recognition_ms_total = 0.0
                detections = []
                tracked_faces = []

                try:
                    t0 = time.perf_counter()

                    ok, frame, frame_sequence = (
                        self.camera.read_latest_frame(
                            last_sequence=last_frame_sequence,
                            copy_frame=False,
                            wait_timeout=0.25,
                        )
                    )

                    read_ms = (
                        time.perf_counter() - t0
                    ) * 1000

                    if not ok or frame is None:
                        expired_tracks = self.tracker.collect_expired()

                        self._finalize_expired_tracks(
                            expired_tracks,
                            reason="track_lost_no_new_frame",
                        )
                        continue

                    last_frame_sequence = frame_sequence
                    frame_detected_at = timezone.now()

                    t0 = time.perf_counter()

                    frame_ai = self._prepare_frame_for_ai(frame)

                    prep_ms = (
                        time.perf_counter() - t0
                    ) * 1000

                    if frame_ai is None or frame_ai.size == 0:
                        continue

                    monitor_enabled = self.is_monitor_enabled()

                    annotated = (
                        frame_ai.copy()
                        if monitor_enabled
                        else None
                    )

                    t0 = time.perf_counter()

                    detections = self.detector.detect_boxes(frame_ai)

                    detect_ms = (
                        time.perf_counter() - t0
                    ) * 1000

                    tracked_faces, expired_tracks = self.tracker.update(
                        detections,
                        detected_at=frame_detected_at,
                    )

                    self._finalize_expired_tracks(
                        expired_tracks,
                        reason="track_lost",
                    )

                    for tracked_face in tracked_faces:
                        track = tracked_face["track"]
                        track_id = tracked_face["track_id"]

                        det_score = float(
                            tracked_face.get("det_score") or 0.0
                        )
                        face_size = int(
                            tracked_face.get("face_size") or 0
                        )

                        should_recognize = (
                            self.tracker.should_attempt_recognition(
                                track_id=track_id,
                                face_size=face_size,
                                det_score=det_score,
                            )
                        )

                        if should_recognize:
                            recognition_started = time.perf_counter()

                            try:
                                embedding = (
                                    self.detector.embed_detected_face(
                                        frame_ai,
                                        tracked_face,
                                    )
                                )

                                match = self.matcher.match(embedding)

                                status = FaceValidator.classify(
                                    similarity=match["similarity"],
                                    det_score=det_score,
                                    face_size=face_size,
                                    identity_type=match.get("identity_type"),
                                )

                                display_name = (
                                    FaceValidator.get_display_name(
                                        status,
                                        match["name"],
                                    )
                                )

                                result = self.tracker.record_recognition(
                                    track_id=track_id,
                                    status=status,
                                    display_name=display_name,
                                    identity_type=match.get("identity_type"),
                                    member_id=match.get("member_id"),
                                    guest_id=match.get("guest_id"),
                                    similarity=match["similarity"],
                                    det_score=det_score,
                                    face_size=face_size,
                                    face_crop=tracked_face.get("face_crop"),
                                    embedding=embedding,
                                    recognized_at=frame_detected_at,
                                )

                                best_result = result.get("best_result")

                                if (
                                    result.get("best_updated")
                                    or result.get("status_changed")
                                    or self.tracker.should_log(
                                        track_id,
                                        interval_seconds=1.5,
                                    )
                                ):
                                    self._push_provisional_log(
                                        track_id=track_id,
                                        best_result=best_result,
                                        frame_sequence=frame_sequence,
                                        best_updated=result.get(
                                            "best_updated",
                                            False,
                                        ),
                                    )

                            except Exception as recognition_exc:
                                logger.warning(
                                    f"[CameraThread] Recognition gagal "
                                    f"track_id={track_id}: "
                                    f"{recognition_exc}"
                                )

                            finally:
                                recognition_ms_total += (
                                    time.perf_counter()
                                    - recognition_started
                                ) * 1000

                        else:
                            best_result = track.get("best_result")

                            if (
                                best_result
                                and self.tracker.should_log(
                                    track_id,
                                    interval_seconds=1.5,
                                )
                            ):
                                self._push_provisional_log(
                                    track_id=track_id,
                                    best_result=best_result,
                                    frame_sequence=frame_sequence,
                                    best_updated=False,
                                )

                        if annotated is not None:
                            (
                                display_status,
                                display_name,
                                display_similarity,
                            ) = self._best_result_for_display(track)

                            draw_detection_label(
                                annotated,
                                tracked_face["bbox"],
                                display_name,
                                display_similarity,
                                display_status,
                            )

                    if annotated is not None:
                        with self._frame_lock:
                            self.latest_frame = annotated

                    self._log_perf_if_needed(
                        read_ms=read_ms,
                        prep_ms=prep_ms,
                        detect_ms=detect_ms,
                        recognition_ms=recognition_ms_total,
                        detections_count=len(detections),
                        tracked_count=len(tracked_faces),
                    )

                except Exception as exc:
                    logger.error(
                        "[CameraThread] "
                        f"Error pada frame sequence "
                        f"{last_frame_sequence}: {exc}"
                    )

        finally:
            # Track yang masih terlihat ketika tombol stop ditekan tetap
            # difinalisasi memakai evidence terbaiknya.
            self._finalize_all_active_tracks(reason="session_stopped")
            self._camera_finished_event.set()
            self.set_monitor_enabled(False)
            logger.info("[CameraThread] Selesai.")

    def _log_perf_if_needed(
        self,
        read_ms: float,
        prep_ms: float,
        detect_ms: float,
        recognition_ms: float,
        detections_count: int,
        tracked_count: int,
    ):
        now = time.time()

        if now - self._last_perf_log_at < 3:
            return

        self._last_perf_log_at = now

        logger.info(
            "[Perf] "
            f"read={read_ms:.1f}ms | "
            f"prep={prep_ms:.1f}ms | "
            f"detect={detect_ms:.1f}ms | "
            f"recognition={recognition_ms:.1f}ms | "
            f"faces={detections_count} | "
            f"tracks={tracked_count} | "
            f"active_tracks={len(self.tracker.tracks)} | "
            f"member_seen={len(self._session_seen_members)} | "
            f"guest_seen={len(self._session_seen_guests)} | "
            f"db_q={self.db_queue.qsize()} | "
            f"log_q={self.log_queue.qsize()}"
        )

    # ============================================================
    # Track finalization + queue push
    # ============================================================
    def _finalize_track_event(
        self,
        track: dict,
        reason: str,
    ):
        """
        Finalisasi satu track tepat satu kali.

        Recognized identity:
        - KNOWN -> member
        - GUEST -> guest

        UNKNOWN dan AMBIGUOUS hanya masuk TimelineDataRecord pending.
        """

        if not track or track.get("finalized"):
            return

        self.tracker.mark_finalized(track)

        best_result = track.get("best_result")
        track_id = track.get("track_id")

        if not best_result:
            logger.debug(
                "[TrackFinalizer] Skip track tanpa recognition result: "
                f"track_id={track_id} | reason={reason}"
            )
            return

        status = str(
            best_result.get("status") or "AMBIGUOUS"
        ).upper()

        display_name = (
            best_result.get("display_name")
            or "AMBIGUOUS"
        )

        identity_type = str(
            best_result.get("identity_type") or ""
        ).lower() or None

        member_id = best_result.get("member_id")
        guest_id = best_result.get("guest_id")

        # Perlindungan terhadap result final yang kehilangan owner id.
        if status == "KNOWN" and member_id is None:
            logger.warning(
                "[TrackFinalizer] KNOWN tanpa member_id, "
                f"diubah menjadi UNKNOWN. track_id={track_id}"
            )
            status = "UNKNOWN"
            identity_type = None
            display_name = "Unknown"

        if status == "GUEST" and guest_id is None:
            logger.warning(
                "[TrackFinalizer] GUEST tanpa guest_id, "
                f"diubah menjadi UNKNOWN. track_id={track_id}"
            )
            status = "UNKNOWN"
            identity_type = None
            display_name = "Unknown"

        similarity = float(
            best_result.get("similarity") or 0.0
        )

        confidence_pct = round(
            similarity * 100,
            2,
        )

        capture_time = (
            track.get("first_detected_at")
            or best_result.get("recognized_at")
            or timezone.now()
        )

        # ============================================================
        # WAKTU TERAKHIR WAJAH TERLIHAT
        # ============================================================
        last_detected_at = (
            track.get("last_detected_at")
            or best_result.get("recognized_at")
            or capture_time
        )

        face_crop = best_result.get("face_crop")
        embedding = best_result.get("embedding")

        if face_crop is None or embedding is None:
            logger.warning(
                "[TrackFinalizer] Track tidak memiliki evidence lengkap: "
                f"track_id={track_id} | status={status}"
            )
            return

        face_image_bytes = encode_image_to_bytes(
            face_crop,
            quality=80,
        )

        face_encoding = (
            embedding.tolist()
            if hasattr(embedding, "tolist")
            else embedding
        )

        is_recognized_member = (
            status == "KNOWN"
            and member_id is not None
        )

        is_recognized_guest = (
            status == "GUEST"
            and guest_id is not None
        )

        seen_map = None
        identity_id = None

        if is_recognized_member:
            seen_map = self._session_seen_members
            identity_id = member_id
            identity_type = "member"

        elif is_recognized_guest:
            seen_map = self._session_seen_guests
            identity_id = guest_id
            identity_type = "guest"

        # ============================================================
        # DEDUPLIKASI MEMBER / GUEST DALAM SESSION YANG SAMA
        # ============================================================
        if seen_map is not None:
            with self._session_seen_members_lock:
                existing = seen_map.get(identity_id)

                if existing:
                    old_best_conf = float(
                        existing.get("best_conf") or 0.0
                    )

                    # Evidence wajah hanya diganti jika confidence baru
                    # lebih baik daripada evidence yang sekarang.
                    should_update_evidence = (
                        confidence_pct
                        >= old_best_conf
                        + KNOWN_CONF_UPDATE_MIN_DELTA
                    )

                    # ========================================================
                    # PENTING:
                    #
                    # Re-detection SELALU dikirim ke DB karena check_out_time
                    # harus terus bergerak mengikuti detection terbaru.
                    #
                    # Tetapi confidence/image/encoding hanya di-update jika
                    # should_update_evidence=True.
                    # ========================================================
                    queued = self._safe_queue_put(
                        self.db_queue,
                        {
                            "action": "update_recognized_best_evidence",

                            "identity_type": identity_type,
                            "identity_id": identity_id,

                            "member_id": member_id,
                            "guest_id": guest_id,

                            "session_id": self.current_session_id,

                            "timeline_id": existing.get(
                                "timeline_id"
                            ),

                            # =================================================
                            # CHECK OUT
                            # =================================================
                            "check_out_time": last_detected_at,

                            # =================================================
                            # BEST EVIDENCE
                            # =================================================
                            "should_update_evidence": (
                                should_update_evidence
                            ),

                            "confidence_pct": confidence_pct,

                            "face_image_bytes": (
                                face_image_bytes
                            ),

                            "face_encoding": (
                                face_encoding
                            ),

                            "track_id": track_id,
                        },
                        "db_queue",
                    )

                    # Update cache confidence hanya jika item benar-benar
                    # berhasil dimasukkan ke DB queue.
                    if queued and should_update_evidence:
                        existing["best_conf"] = confidence_pct

                    self._safe_queue_put(
                        self.log_queue,
                        {
                            "time": (
                                last_detected_at.strftime("%H:%M:%S")
                            ),
                            "name": display_name,
                            "status": status,
                            "identity_type": identity_type,
                            "member_id": member_id,
                            "guest_id": guest_id,

                            "similarity": round(
                                similarity,
                                3,
                            ),

                            "confidence_updated": (
                                should_update_evidence
                            ),

                            # Informasi tambahan untuk debugging frontend/log.
                            "check_out_updated": bool(queued),

                            "check_out_time": (
                                last_detected_at.isoformat()
                                if last_detected_at
                                else None
                            ),

                            "is_update": True,
                            "provisional": False,
                            "finalized": True,
                            "finalization_reason": reason,
                            "track_id": track_id,
                        },
                        "log_queue",
                    )

                    self.tracker.mark_db_pushed(track)
                    return

                seen_map[identity_id] = {
                    "timeline_id": None,
                    "best_conf": confidence_pct,
                }

        self._safe_queue_put(
            self.log_queue,
            {
                "time": capture_time.strftime("%H:%M:%S"),
                "name": display_name,
                "status": status,
                "identity_type": identity_type,
                "member_id": member_id,
                "guest_id": guest_id,
                "similarity": round(similarity, 3),
                "is_update": False,
                "provisional": False,
                "finalized": True,
                "finalization_reason": reason,
                "track_id": track_id,
            },
            "log_queue",
        )

        queued = self._safe_queue_put(
            self.db_queue,
            {
                "action": "create",
                "capture_time": capture_time,
                "best_recognized_at": (
                    best_result.get("recognized_at")
                ),
                "face_image_bytes": face_image_bytes,
                "face_encoding": face_encoding,
                "detection_status": status.lower(),
                "confidence_pct": confidence_pct,

                "identity_type": identity_type,
                "identity_id": identity_id,

                # UNKNOWN/AMBIGUOUS tetap dapat menyimpan kandidat
                # member terdekat seperti flow sebelumnya.
                "matched_member_id": member_id,
                "matched_guest_id": guest_id,

                "status": status,
                "session_id": self.current_session_id,
                "track_id": track_id,
                "recognition_attempts": int(
                    track.get("recognition_attempts") or 0
                ),
                "finalization_reason": reason,
            },
            "db_queue",
        )

        if queued:
            self.tracker.mark_db_pushed(track)
            return

        # Rollback cache RAM jika gagal masuk queue.
        if seen_map is not None and identity_id is not None:
            with self._session_seen_members_lock:
                current_entry = seen_map.get(identity_id)

                if (
                    current_entry
                    and current_entry.get("timeline_id") is None
                ):
                    seen_map.pop(identity_id, None)

        logger.error(
            "[TrackFinalizer] Gagal memasukkan event ke DB queue: "
            f"track_id={track_id} | "
            f"status={status} | "
            f"member_id={member_id} | "
            f"guest_id={guest_id}"
        )

    # ============================================================
    # DB writer thread
    # ============================================================

    def _db_writer_loop(self):
        import django.db

        logger.info("[DBWriter] Dimulai.")

        while True:
            if (
                not self.is_running
                and self._camera_finished_event.is_set()
                and self.db_queue.empty()
            ):
                break

            try:
                data = self.db_queue.get(timeout=0.5)
            except queue.Empty:
                continue

            try:
                action = data.get("action", "create")

                if action == "create":
                    timeline_id = self._save_detection_to_db(data)

                    if timeline_id:
                        status = str(
                            data.get("status") or ""
                        ).upper()

                        member_id = data.get(
                            "matched_member_id"
                        )
                        guest_id = data.get(
                            "matched_guest_id"
                        )

                        if (
                            status == "KNOWN"
                            and member_id is not None
                        ):
                            with self._session_seen_members_lock:
                                entry = self._session_seen_members.get(
                                    member_id
                                )

                                if entry:
                                    entry["timeline_id"] = timeline_id

                        elif (
                            status == "GUEST"
                            and guest_id is not None
                        ):
                            with self._session_seen_members_lock:
                                entry = self._session_seen_guests.get(
                                    guest_id
                                )

                                if entry:
                                    entry["timeline_id"] = timeline_id

                        stat_key = status.lower()

                        if stat_key in self.stats:
                            self.stats[stat_key] += 1

                elif action == "update_recognized_best_evidence":
                    self._update_recognized_best_evidence_in_db(
                        data
                    )
                else:
                    logger.warning(
                        f"[DBWriter] Unknown action: {action}"
                    )

            except Exception as exc:
                logger.error(f"[DBWriter] Error: {exc}")

            finally:
                self.db_queue.task_done()
                django.db.connection.close()

        logger.info("[DBWriter] Selesai.")

    @staticmethod
    def _update_recognized_best_evidence_in_db(
        data: dict,
    ):
        """
        Memproses re-detection Member atau Guest dalam session yang sama.

        Rules:

        1. check_in_time TIDAK pernah diubah.
        Check-in tetap waktu ketika identity pertama kali attendance.

        2. check_out_time SELALU bergerak ke detection terbaru.

        3. confidence hanya di-update jika evidence baru lebih baik.

        4. TimelineDataRecord.face_image dan face_encoding hanya
        diganti jika evidence baru mempunyai confidence lebih tinggi.

        5. Guest.visit_count / first_visit / last_visit tidak berubah
        karena ini masih attendance session yang sama.

        6. TimelineDataRecord.capture_time juga tidak berubah karena
        tetap merepresentasikan detection pertama/evidence attendance.
        """

        from django.db.models import Q

        from attendance.models import (
            Attendance,
            TimelineDataRecord,
        )

        identity_type = str(
            data.get("identity_type") or ""
        ).strip().lower()

        identity_id = data.get("identity_id")
        session_id = data.get("session_id")
        timeline_id = data.get("timeline_id")

        check_out_time = data.get(
            "check_out_time"
        )

        should_update_evidence = bool(
            data.get("should_update_evidence")
        )

        confidence = round(
            float(
                data.get("confidence_pct") or 0.0
            ),
            2,
        )

        if (
            identity_type not in {
                "member",
                "guest",
            }
            or not identity_id
            or not session_id
        ):
            logger.warning(
                "[DBWriter] Re-detection diabaikan karena "
                "identity/session tidak valid: "
                f"type={identity_type} | "
                f"id={identity_id} | "
                f"session_id={session_id}"
            )
            return

        attendance_filter = {
            "session_id": session_id,
        }

        if identity_type == "member":
            attendance_filter["member_id"] = (
                identity_id
            )
        else:
            attendance_filter["guest_id"] = (
                identity_id
            )

        try:
            attendance_queryset = (
                Attendance.objects
                .filter(**attendance_filter)
            )

            # ====================================================
            # 1. UPDATE CHECK OUT
            # ====================================================
            #
            # Check-out selalu bergerak maju.
            #
            # Filter check_out_time__lt digunakan sebagai pengamanan
            # jika suatu saat DB queue diproses tidak persis berdasarkan
            # chronological event.
            #
            # Dengan demikian timestamp yang lebih lama tidak dapat
            # menimpa checkout yang lebih baru.
            # ====================================================
            check_out_updated = 0

            if check_out_time is not None:
                check_out_updated = (
                    attendance_queryset
                    .filter(
                        Q(check_out_time__isnull=True)
                        | Q(
                            check_out_time__lt=(
                                check_out_time
                            )
                        )
                    )
                    .update(
                        check_out_time=check_out_time
                    )
                )

            # ====================================================
            # 2. UPDATE BEST EVIDENCE
            # ====================================================
            #
            # Bagian ini TIDAK selalu berjalan.
            #
            # Hanya berjalan kalau confidence pada re-detection
            # lebih bagus daripada evidence sebelumnya.
            # ====================================================
            evidence_updated = False

            if should_update_evidence:

                # Kalau timeline_id di cache RAM belum tersedia,
                # resolve dari Attendance.
                if not timeline_id:
                    attendance = (
                        attendance_queryset
                        .filter(
                            facedetection_id__isnull=False
                        )
                        .only(
                            "facedetection_id"
                        )
                        .first()
                    )

                    if attendance:
                        timeline_id = (
                            attendance.facedetection_id
                        )

                # -----------------------------------------------
                # Update TimelineDataRecord
                # -----------------------------------------------
                if timeline_id:
                    timeline_updated = (
                        TimelineDataRecord.objects
                        .filter(
                            id=timeline_id
                        )
                        .filter(
                            Q(confidence__isnull=True)
                            | Q(
                                confidence__lt=confidence
                            )
                        )
                        .update(
                            confidence=confidence,

                            # Evidence image baru.
                            face_image=data.get(
                                "face_image_bytes"
                            ),

                            # Embedding baru.
                            face_encoding=data.get(
                                "face_encoding"
                            ),
                        )
                    )

                    evidence_updated = bool(
                        timeline_updated
                    )

                # -----------------------------------------------
                # Update confidence Attendance
                # -----------------------------------------------
                (
                    attendance_queryset
                    .filter(
                        Q(confidence__isnull=True)
                        | Q(
                            confidence__lt=confidence
                        )
                    )
                    .update(
                        confidence=confidence
                    )
                )

            logger.info(
                "[DBWriter] Recognized re-detection processed: "
                f"type={identity_type} | "
                f"id={identity_id} | "
                f"session_id={session_id} | "
                f"timeline_id={timeline_id} | "
                f"check_out_time={check_out_time} | "
                f"check_out_updated={bool(check_out_updated)} | "
                f"new_confidence={confidence}% | "
                f"should_update_evidence={should_update_evidence} | "
                f"evidence_updated={evidence_updated}"
            )

        except Exception as exc:
            logger.error(
                "[DBWriter] Gagal update recognized re-detection: "
                f"type={identity_type} | "
                f"id={identity_id} | "
                f"session_id={session_id} | "
                f"error={exc}"
            )


    @staticmethod
    def _save_detection_to_db(
        data: dict,
    ) -> int | None:
        """
        Menyimpan hasil final track.

        Flow:
        - KNOWN:
            Timeline verified + Attendance member.
        - GUEST:
            Timeline verified + Attendance guest.
            Guest row lama di-update, tidak membuat Guest baru.
        - UNKNOWN / AMBIGUOUS:
            Timeline pending saja.
        """

        from django.db import transaction

        from attendance.models import (
            Attendance,
            Guest,
            TimelineDataRecord,
            WorshipSession,
        )

        capture_time = data["capture_time"]

        member_id = data.get("matched_member_id")
        guest_id = data.get("matched_guest_id")

        confidence = round(
            float(data.get("confidence_pct") or 0.0),
            2,
        )

        status = str(
            data.get("status") or ""
        ).upper()

        session_id = data.get("session_id")

        is_member = (
            status == "KNOWN"
            and member_id is not None
        )

        is_guest = (
            status == "GUEST"
            and guest_id is not None
        )

        is_recognized = is_member or is_guest

        # Model lama memakai "know", bukan "known".
        # Guest recognized juga disimpan sebagai detection_status="know".
        # Pembedanya adalah final_member atau final_guest.
        detection_status_map = {
            "KNOWN": "know",
            "GUEST": "know",
            "UNKNOWN": "unknown",
            "AMBIGUOUS": "ambiguous",
        }

        detection_status_db = detection_status_map.get(
            status,
            status.lower(),
        )

        if is_recognized and not session_id:
            logger.error(
                "[DBWriter] Recognized identity tidak dapat disimpan "
                "karena session_id kosong."
            )
            return None

        try:
            with transaction.atomic():
                worship_session = None
                guest = None

                if is_recognized:
                    worship_session = (
                        WorshipSession.objects
                        .select_for_update()
                        .filter(id=session_id)
                        .first()
                    )

                    if not worship_session:
                        raise ValueError(
                            f"WorshipSession id={session_id} "
                            "tidak ditemukan."
                        )

                if is_guest:
                    guest = (
                        Guest.objects
                        .select_for_update()
                        .filter(id=guest_id)
                        .first()
                    )

                    if not guest:
                        raise ValueError(
                            f"Guest id={guest_id} tidak ditemukan."
                        )

                    # Perlindungan tambahan jika guest dikonversi
                    # ketika session sedang berlangsung.
                    if guest.converted_to_member_id is not None:
                        raise ValueError(
                            f"Guest id={guest_id} sudah dikonversi "
                            "menjadi member dan tidak boleh diproses "
                            "sebagai Guest."
                        )

                timeline = TimelineDataRecord.objects.create(
                    capture_time=capture_time,
                    face_image=data.get("face_image_bytes"),
                    face_encoding=data.get("face_encoding"),
                    detection_status=detection_status_db,
                    confidence=confidence,

                    # Kandidat member lama tetap disimpan hanya jika ada.
                    matched_member_id=(
                        member_id
                        if member_id is not None
                        else None
                    ),

                    validation_status=(
                        "verified"
                        if is_recognized
                        else "pending"
                    ),
                    validated_at=(
                        capture_time
                        if is_recognized
                        else None
                    ),
                    final_member_id=(
                        member_id
                        if is_member
                        else None
                    ),
                    final_guest_id=(
                        guest_id
                        if is_guest
                        else None
                    ),
                    notes="",
                )

                # ======================================================
                # MEMBER AUTO ATTENDANCE
                # ======================================================
                if is_member:
                    existing_attendance = (
                        Attendance.objects
                        .select_for_update()
                        .filter(
                            session_id=session_id,
                            member_id=member_id,
                        )
                        .first()
                    )

                    if (
                        existing_attendance
                        and existing_attendance.facedetection_id
                    ):
                        existing_timeline_id = (
                            existing_attendance.facedetection_id
                        )

                        timeline.delete()

                        logger.info(
                            "[DBWriter] Member duplicate dicegah: "
                            f"member_id={member_id} | "
                            f"session_id={session_id} | "
                            f"existing_timeline_id="
                            f"{existing_timeline_id}"
                        )

                        return existing_timeline_id

                    if existing_attendance:
                        existing_attendance.member_id = member_id
                        existing_attendance.guest = None
                        existing_attendance.facedetection = timeline
                        existing_attendance.session_id = session_id
                        existing_attendance.attendance_date = (
                            capture_time.date()
                        )
                        existing_attendance.check_in_time = (
                            capture_time
                        )
                        existing_attendance.confidence = confidence
                        existing_attendance.notes = (
                            existing_attendance.notes or ""
                        )

                        existing_attendance.save(
                            update_fields=[
                                "member",
                                "guest",
                                "facedetection",
                                "session",
                                "attendance_date",
                                "check_in_time",
                                "confidence",
                                "notes",
                            ]
                        )

                        attendance = existing_attendance

                    else:
                        attendance = Attendance.objects.create(
                            member_id=member_id,
                            guest=None,
                            facedetection=timeline,
                            session_id=session_id,
                            attendance_date=(
                                capture_time.date()
                            ),
                            check_in_time=capture_time,
                            # Belum ada detection berikutnya.
                            check_out_time=None,
                            confidence=confidence,
                            notes="",
                        )

                    logger.info(
                        "[DBWriter] MEMBER attendance saved: "
                        f"attendance_id={attendance.id} | "
                        f"member_id={member_id} | "
                        f"timeline_id={timeline.id} | "
                        f"session_id={session_id}"
                    )

                    return timeline.id

                # ======================================================
                # GUEST AUTO ATTENDANCE
                # ======================================================
                if is_guest:
                    existing_attendance = (
                        Attendance.objects
                        .select_for_update()
                        .filter(
                            session_id=session_id,
                            guest_id=guest_id,
                        )
                        .first()
                    )

                    if (
                        existing_attendance
                        and existing_attendance.facedetection_id
                    ):
                        existing_timeline_id = (
                            existing_attendance.facedetection_id
                        )

                        timeline.delete()

                        logger.info(
                            "[DBWriter] Guest duplicate dicegah: "
                            f"guest_id={guest_id} | "
                            f"session_id={session_id} | "
                            f"existing_timeline_id="
                            f"{existing_timeline_id}"
                        )

                        return existing_timeline_id

                    if existing_attendance:
                        # Attendance manual/legacy sudah ada.
                        # Evidence dilengkapi, tetapi visit_count tidak
                        # ditambah lagi karena attendance memang sudah ada.
                        existing_attendance.member = None
                        existing_attendance.guest_id = guest_id
                        existing_attendance.facedetection = timeline
                        existing_attendance.session_id = session_id
                        existing_attendance.attendance_date = (
                            capture_time.date()
                        )
                        existing_attendance.check_in_time = (
                            capture_time
                        )
                        existing_attendance.confidence = confidence
                        existing_attendance.notes = (
                            existing_attendance.notes or ""
                        )

                        existing_attendance.save(
                            update_fields=[
                                "member",
                                "guest",
                                "facedetection",
                                "session",
                                "attendance_date",
                                "check_in_time",
                                "confidence",
                                "notes",
                            ]
                        )

                        attendance = existing_attendance
                        visit_incremented = False

                    else:
                        attendance = Attendance.objects.create(
                            member=None,
                            guest_id=guest_id,
                            facedetection=timeline,
                            session_id=session_id,
                            attendance_date=(
                                capture_time.date()
                            ),
                            check_in_time=capture_time,
                            
                            confidence=confidence,
                            notes="",
                        )

                        visit_incremented = True

                    # Guest hanya di-update ketika attendance session ini
                    # benar-benar baru dibuat.
                    if visit_incremented:
                        visit_date = capture_time.date()

                        guest.visit_count = (
                            int(guest.visit_count or 0) + 1
                        )

                        if (
                            guest.first_visit is None
                            or visit_date < guest.first_visit
                        ):
                            guest.first_visit = visit_date

                        if (
                            guest.last_visit is None
                            or visit_date > guest.last_visit
                        ):
                            guest.last_visit = visit_date

                        guest.save(
                            update_fields=[
                                "visit_count",
                                "first_visit",
                                "last_visit",
                            ]
                        )

                    logger.info(
                        "[DBWriter] GUEST attendance saved: "
                        f"attendance_id={attendance.id} | "
                        f"guest_id={guest_id} | "
                        f"timeline_id={timeline.id} | "
                        f"session_id={session_id} | "
                        f"visit_incremented={visit_incremented} | "
                        f"visit_count={guest.visit_count}"
                    )

                    return timeline.id

                # ======================================================
                # UNKNOWN / AMBIGUOUS
                # ======================================================
                logger.info(
                    f"[DBWriter] {status} finalized: "
                    f"timeline_id={timeline.id} | "
                    f"track_id={data.get('track_id')} | "
                    f"first_detected_at="
                    f"{capture_time.isoformat()} | "
                    f"attempts="
                    f"{data.get('recognition_attempts')}"
                )

                return timeline.id

        except Exception as exc:
            logger.error(
                "[DBWriter] _save_detection_to_db error: "
                f"{exc}"
            )
            return None