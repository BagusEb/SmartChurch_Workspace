"""
RegistrationSessionManager — mode awal untuk face enrollment.

Tujuan:
- Dipakai saat belum ada MemberFaceEmbedding aktif.
- Tidak membuat WorshipSession.
- Tidak membuat Attendance.
- Tidak membuat TimelineDataRecord.
- Semua wajah yang terdeteksi disimpan ke MemberFaceEmbedding sebagai staging:
    member = None
    is_active = None

Logic penyimpanan:
- BUKAN cooldown seperti attendance.
- Selama wajah masih terus terlihat, hanya disimpan 1x.
- Jika wajah hilang dari deteksi lalu muncul lagi setelah ENROLL_LOST_TIMEOUT,
  akan disimpan sebagai row baru.
"""

import queue
import threading
import time
import uuid

import cv2
import django.db
import numpy as np
from django.utils import timezone

from .camera.webcam_stream import WebcamStream
from .config import (
    CAMERA_SOURCE,
    ENROLL_LOST_TIMEOUT,
    ENROLL_SAME_FACE_SIM,
    MIN_DETECTION_SCORE,
)
from .utils.image_utils import encode_image_to_bytes, draw_detection_label
from .utils.logger import get_logger
from .vision.face_detector import FaceDetector

logger = get_logger(__name__)


class RegistrationSessionManager:
    _instance = None
    _lock = threading.Lock()

    def __init__(self):
        self.detector = FaceDetector()
        self.camera = WebcamStream(camera_index=CAMERA_SOURCE)

        self.log_queue = queue.Queue()
        self.db_queue = queue.Queue()

        self.is_running = False
        self.cam_thread = None
        self.db_thread = None

        self.latest_frame = None

        self.registration_name = None
        self.started_at = None

        self.stats = {
            "detected": 0,
            "stored": 0,
            "skipped_same_track": 0,
        }

        self._tracking_lock = threading.Lock()

        # Track wajah yang sedang terlihat.
        # key -> {
        #   "encoding": list,
        #   "last_seen": float,
        # }
        self._active_tracks = {}

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def start_registration(self, registration_name="Initial Face Registration"):
        if self.is_running:
            return False, "Sesi registration sudah berjalan."

        registration_name = (registration_name or "").strip() or "Initial Face Registration"

        try:
            self.detector.load_model()
        except Exception as e:
            return False, f"Gagal load AI model untuk registration: {e}"

        self._flush_queues()

        with self._tracking_lock:
            self._active_tracks = {}

        self.stats = {
            "detected": 0,
            "stored": 0,
            "skipped_same_track": 0,
        }

        if not self.camera.open():
            return False, "Gagal membuka kamera untuk registration. Periksa koneksi kamera."

        self.registration_name = registration_name
        self.started_at = timezone.now()
        self.latest_frame = None
        self.is_running = True

        self.cam_thread = threading.Thread(
            target=self._camera_loop,
            daemon=True,
            name="CV-Registration-CameraThread",
        )
        self.db_thread = threading.Thread(
            target=self._db_writer_loop,
            daemon=True,
            name="CV-Registration-DBWriterThread",
        )

        self.cam_thread.start()
        self.db_thread.start()

        logger.info(f"[RegistrationSessionManager] Registration dimulai: {registration_name}")

        return True, (
            "System ini baru berjalan dan belum memiliki data face embedding aktif. "
            "Mode registration dimulai untuk mengumpulkan wajah terlebih dahulu. "
            "Data ini belum masuk attendance."
        )

    def stop_registration(self):
        if not self.is_running:
            return False, "Tidak ada sesi registration yang sedang berjalan."

        self.is_running = False

        if self.cam_thread and self.cam_thread.is_alive():
            self.cam_thread.join(timeout=4)

        if self.db_thread and self.db_thread.is_alive():
            remaining = self.db_queue.qsize()
            if remaining:
                logger.info(f"[RegistrationSessionManager] Menunggu DB writer: {remaining} item...")
            self.db_thread.join(timeout=15)

            if self.db_thread.is_alive():
                logger.warning(
                    "[RegistrationSessionManager] DB writer timeout, beberapa wajah mungkin belum tersimpan."
                )

        self.camera.release()
        self.latest_frame = None

        registration_name = self.registration_name or "Registration"
        self.registration_name = None
        self.started_at = None

        logger.info(f"[RegistrationSessionManager] Registration '{registration_name}' dihentikan.")

        return True, f"Sesi registration '{registration_name}' berhasil dihentikan."

    def get_status(self):
        return {
            "mode": "registration",
            "is_running": self.is_running,
            "registration_name": self.registration_name,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "stats": self.stats,
            "db_queue_size": self.db_queue.qsize(),
        }

    def get_latest_frame_jpeg(self):
        if self.latest_frame is None:
            return None

        ok, buf = cv2.imencode(".jpg", self.latest_frame)
        return buf.tobytes() if ok else None

    def get_detection_logs(self):
        logs = []

        while not self.log_queue.empty():
            try:
                logs.append(self.log_queue.get_nowait())
            except queue.Empty:
                break

        return logs

    def _flush_queues(self):
        for q in (self.log_queue, self.db_queue):
            while not q.empty():
                try:
                    q.get_nowait()
                except queue.Empty:
                    break

    def _cleanup_inactive_tracks(self, now):
        expired_keys = []

        for key, entry in self._active_tracks.items():
            if now - entry["last_seen"] >= ENROLL_LOST_TIMEOUT:
                expired_keys.append(key)

        for key in expired_keys:
            del self._active_tracks[key]

    @staticmethod
    def _cosine_similarity(encoding_a, encoding_b):
        try:
            vec_a = np.array(encoding_a, dtype=np.float32)
            vec_b = np.array(encoding_b, dtype=np.float32)

            norm_a = np.linalg.norm(vec_a)
            norm_b = np.linalg.norm(vec_b)

            if norm_a == 0 or norm_b == 0:
                return 0.0

            return float(np.dot(vec_a / norm_a, vec_b / norm_b))
        except Exception:
            return 0.0

    def _is_same_active_track(self, face_encoding, now):
        """
        Return True jika wajah ini masih dianggap track yang sedang terlihat.
        Jika True, tidak perlu simpan row baru.
        """

        self._cleanup_inactive_tracks(now)

        best_key = None
        best_similarity = -1.0

        for key, entry in self._active_tracks.items():
            similarity = self._cosine_similarity(face_encoding, entry["encoding"])

            if similarity > best_similarity:
                best_similarity = similarity
                best_key = key

        if best_key and best_similarity >= ENROLL_SAME_FACE_SIM:
            self._active_tracks[best_key]["last_seen"] = now
            return True

        return False

    def _create_new_track(self, face_encoding, now):
        track_key = f"reg_{uuid.uuid4().hex[:8]}"

        self._active_tracks[track_key] = {
            "encoding": face_encoding.tolist()
            if hasattr(face_encoding, "tolist")
            else face_encoding,
            "last_seen": now,
        }

        return track_key

    def _camera_loop(self):
        logger.info("[RegistrationCameraThread] Dimulai.")

        while self.is_running:
            ok, frame = self.camera.read_frame()

            if not ok or frame is None:
                time.sleep(0.01)
                continue

            annotated = frame.copy()

            try:
                faces = self.detector.detect(frame)

                for face in faces:
                    det_score = float(face.get("det_score") or 0)

                    if det_score < MIN_DETECTION_SCORE:
                        continue

                    self.stats["detected"] += 1

                    saved_new_face = self._maybe_store_face(face)

                    label = "ENROLL SAVED" if saved_new_face else "ENROLLING"
                    draw_detection_label(
                        annotated,
                        face["bbox"],
                        label,
                        det_score,
                        "ENROLLING",
                    )

            except Exception as e:
                logger.error(f"[RegistrationCameraThread] Error: {e}")

            self.latest_frame = annotated

        logger.info("[RegistrationCameraThread] Selesai.")

    def _maybe_store_face(self, face):
        """
        Simpan wajah jika ini track baru.
        Jika masih wajah yang sama dan masih terus terlihat, skip.
        """

        now = time.time()
        now_dt = timezone.now()
        face_encoding = face["embedding"]

        with self._tracking_lock:
            if self._is_same_active_track(face_encoding, now):
                self.stats["skipped_same_track"] += 1
                return False

            self._create_new_track(face_encoding, now)

        det_score = float(face.get("det_score") or 0)
        confidence_pct = round(det_score * 100, 2)

        face_image_bytes = encode_image_to_bytes(face["face_crop"])

        self.db_queue.put(
            {
                "action": "create_registration_embedding",
                "capture_time": now_dt,
                "face_image_bytes": face_image_bytes,
                "face_encoding": face_encoding.tolist()
                if hasattr(face_encoding, "tolist")
                else face_encoding,
                "confidence_pct": confidence_pct,
            }
        )

        self.log_queue.put(
            {
                "time": now_dt.strftime("%H:%M:%S"),
                "name": "Registration Face",
                "status": "REGISTRATION",
                "similarity": round(det_score, 3),
                "is_update": False,
            }
        )

        return True

    def _db_writer_loop(self):
        logger.info("[RegistrationDBWriter] Dimulai.")

        while True:
            if not self.is_running and self.db_queue.empty():
                break

            try:
                data = self.db_queue.get(timeout=0.5)
            except queue.Empty:
                continue

            try:
                action = data.get("action")

                if action == "create_registration_embedding":
                    embedding_id = self._save_registration_embedding_to_db(data)

                    if embedding_id:
                        self.stats["stored"] += 1

            except Exception as e:
                logger.error(f"[RegistrationDBWriter] Error: {e}")

            finally:
                self.db_queue.task_done()
                django.db.connection.close()

        logger.info("[RegistrationDBWriter] Selesai.")

    @staticmethod
    def _save_registration_embedding_to_db(data):
        from attendance.models import MemberFaceEmbedding

        try:
            embedding = MemberFaceEmbedding.objects.create(
                member=None,
                face_encoding=data["face_encoding"],
                face_image=data["face_image_bytes"],
                is_active=None,
            )

            logger.info(
                f"[RegistrationDBWriter] Registration face saved: embedding_id={embedding.id}"
            )

            return embedding.id

        except Exception as e:
            logger.error(f"[RegistrationDBWriter] Gagal simpan registration embedding: {e}")
            return None