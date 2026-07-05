#smartchurch_backend\cv_attendance\camera\async_rtsp_stream.py

import threading
import time

from .rtsp_stream import RTSPStream


class AsyncRTSPStream:
    def __init__(self, rtsp_url):
        self.stream = RTSPStream(rtsp_url=rtsp_url)

        self._thread = None
        self._lock = threading.Lock()
        self._running = False

        self._latest_frame = None
        self._last_read_at = None
        self.last_error = None

    def open(self):
        if not self.stream.open():
            self.last_error = self.stream.last_error
            return False

        self._running = True

        self._thread = threading.Thread(
            target=self._reader_loop,
            daemon=True,
            name="AsyncRTSPReader",
        )

        self._thread.start()

        return True

    def _reader_loop(self):
        while self._running:
            ok, frame = self.stream.read_frame()

            if ok and frame is not None:
                with self._lock:
                    self._latest_frame = frame
                    self._last_read_at = time.time()
            else:
                self.last_error = self.stream.last_error
                time.sleep(0.02)

    def read_frame(self):
        with self._lock:
            if self._latest_frame is None:
                return False, None

            return True, self._latest_frame.copy()

    def release(self):
        self._running = False

        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2)

        self.stream.release()

        with self._lock:
            self._latest_frame = None