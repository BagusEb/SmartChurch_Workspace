# cv_attendance/video_camera.py
from threading import Lock


class VideoCamera:
    """
    Jembatan antara SessionManager dan MJPEG streaming view.
    Masing-masing punya tugasnya:
      - SessionManager : kelola thread & logika AI
      - VideoCamera    : ambil frame terbaru untuk HTTP response
    """
    def __init__(self, session_manager):
        self.session = session_manager
        self._lock   = Lock()

    def get_frame(self):
        """Return JPEG bytes atau None jika frame belum tersedia."""
        with self._lock:
            return self.session.get_latest_frame_jpeg()