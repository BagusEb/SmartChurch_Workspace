#smartchurch_backend/cv_attendance/camera/rtsp_stream.py

import os
import cv2

from ..config import RTSP_URL


class RTSPStream:
    """
    RTSP camera reader untuk IP Camera Hikvision.
    Tidak ada fallback ke webcam.
    Jika gagal membuka RTSP, return False.
    """

    def __init__(self, rtsp_url: str = RTSP_URL):
        self.rtsp_url = rtsp_url
        self.cap = None
        self.last_error = None

    def _safe_url(self) -> str:
        """
        Mask password supaya tidak bocor di log.
        """
        if "@" not in self.rtsp_url or "://" not in self.rtsp_url:
            return self.rtsp_url

        prefix, rest = self.rtsp_url.split("://", 1)

        if "@" not in rest:
            return self.rtsp_url

        credentials, host_path = rest.split("@", 1)

        if ":" in credentials:
            username = credentials.split(":", 1)[0]
            return f"{prefix}://{username}:***@{host_path}"

        return f"{prefix}://***@{host_path}"

    def open(self) -> bool:
        """
        OpenCV + FFMPEG RTSP.
        Pakai TCP supaya lebih stabil di LAN.
        """

        # Harus diset sebelum VideoCapture dibuat.
        os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
            "rtsp_transport;tcp|"
            "stimeout;5000000|"
            "max_delay;500000"
        )

        self.release()

        self.cap = cv2.VideoCapture(self.rtsp_url, cv2.CAP_FFMPEG)
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

        if not self.cap.isOpened():
            self.last_error = f"Gagal membuka RTSP stream: {self._safe_url()}"
            self.release()
            return False

        ok, frame = self.cap.read()

        if not ok or frame is None:
            self.last_error = (
                f"RTSP terbuka, tetapi frame pertama gagal dibaca: {self._safe_url()}"
            )
            self.release()
            return False

        self.last_error = None
        return True

    def read_frame(self):
        """
        Return:
            (True, frame) kalau berhasil
            (False, None) kalau gagal
        """
        if self.cap is None or not self.cap.isOpened():
            self.last_error = "RTSP stream belum terbuka."
            return False, None

        ok, frame = self.cap.read() #menerima frame dari RTSP stream (frame asli) //5120x1440

        if not ok or frame is None:
            self.last_error = "Gagal membaca frame dari RTSP stream."
            return False, None

        return True, frame

    def release(self):
        if self.cap is not None:
            try:
                self.cap.release()
            except Exception:
                pass

            self.cap = None

    def __enter__(self):
        opened = self.open()

        if not opened:
            raise RuntimeError(self.last_error or "Gagal membuka RTSP stream")

        return self

    def __exit__(self, *_):
        self.release()