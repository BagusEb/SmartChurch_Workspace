# cv_attendance/camera/webcam_stream.py
import cv2
from ..config import FRAME_WIDTH, FRAME_HEIGHT   # ← relative import


class WebcamStream:
    def __init__(self, camera_index: int = 0):
        self.camera_index = camera_index
        self.cap = None

    def open(self) -> bool:
        self.cap = cv2.VideoCapture(self.camera_index, cv2.CAP_DSHOW)
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH,  FRAME_WIDTH)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)
        return self.cap.isOpened()

    def read_frame(self):
        """
        Return (True, frame) atau (False, None).
        """
        if self.cap is None:
            return False, None
        ret, frame = self.cap.read()
        if not ret:
            return False, None
        return True, frame

    def release(self):
        if self.cap:
            self.cap.release()
            self.cap = None

    def __enter__(self):
        self.open()
        return self

    def __exit__(self, *_):
        self.release()