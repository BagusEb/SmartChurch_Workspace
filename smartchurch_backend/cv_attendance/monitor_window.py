import threading
import time
from datetime import datetime

import cv2
import numpy as np


WINDOW_NAME = "SmartChurch - AI Camera Monitor"
WINDOW_WIDTH = 1280
WINDOW_HEIGHT = 720


class CameraMonitorWindow:
    """
    Singleton controller untuk window OpenCV lokal.

    Monitor ini:
    - Tidak membuka RTSP baru.
    - Tidak melakukan JPEG encoding.
    - Tidak mengirim frame ke browser.
    - Mengambil latest annotated frame dari manager aktif.
    """

    _instance = None
    _instance_lock = threading.Lock()

    def __init__(self):
        self._lock = threading.RLock()
        self._thread = None
        self._stop_event = None

        self._state = {
            "is_running": False,
            "mode": None,
            "session_name": None,
            "opened_at": None,
            "closed_at": None,
            "message": "Monitor belum pernah dibuka.",
        }

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            with cls._instance_lock:
                if cls._instance is None:
                    cls._instance = cls()

        return cls._instance

    @staticmethod
    def _now_iso():
        return datetime.now().isoformat(timespec="seconds")

    @staticmethod
    def _is_window_closed():
        try:
            visible = cv2.getWindowProperty(
                WINDOW_NAME,
                cv2.WND_PROP_VISIBLE,
            )
            return visible < 1
        except cv2.error:
            return True

    def get_status(self):
        with self._lock:
            return dict(self._state)

    def open(self, source_manager, mode, session_name=None):
        """
        Membuka monitor untuk manager aktif.

        source_manager harus memiliki:
        - is_running
        - set_monitor_enabled(bool)
        - get_latest_frame_copy()
        """

        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                return (
                    True,
                    "Monitor kamera sudah terbuka.",
                    dict(self._state),
                )

            if not source_manager.is_running:
                return (
                    False,
                    "Tidak ada sesi kamera aktif.",
                    dict(self._state),
                )

            stop_event = threading.Event()
            self._stop_event = stop_event

            source_manager.set_monitor_enabled(True)

            self._state.update(
                {
                    "is_running": True,
                    "mode": mode,
                    "session_name": session_name,
                    "opened_at": self._now_iso(),
                    "closed_at": None,
                    "message": "Monitor kamera sedang berjalan.",
                }
            )

            thread = threading.Thread(
                target=self._window_loop,
                args=(
                    source_manager,
                    stop_event,
                    mode,
                    session_name,
                ),
                daemon=True,
                name="SmartChurch-CameraMonitorWindow",
            )

            self._thread = thread

        thread.start()

        return (
            True,
            "Monitor kamera berhasil dibuka di laptop server.",
            self.get_status(),
        )

    def close(self, wait=False):
        with self._lock:
            thread = self._thread
            stop_event = self._stop_event

            if thread is None or not thread.is_alive():
                return False, "Monitor kamera tidak sedang berjalan."

            if stop_event is not None:
                stop_event.set()

        if (
            wait
            and thread is not threading.current_thread()
        ):
            thread.join(timeout=2)

        return True, "Perintah menutup monitor telah dikirim."

    def _window_loop(
        self,
        source_manager,
        stop_event,
        mode,
        session_name,
    ):
        final_message = "Monitor kamera ditutup."

        try:
            cv2.namedWindow(
                WINDOW_NAME,
                cv2.WINDOW_NORMAL,
            )

            cv2.resizeWindow(
                WINDOW_NAME,
                WINDOW_WIDTH,
                WINDOW_HEIGHT,
            )

            placeholder = np.zeros(
                (540, 960, 3),
                dtype=np.uint8,
            )

            cv2.putText(
                placeholder,
                "Menunggu frame AI...",
                (300, 260),
                cv2.FONT_HERSHEY_SIMPLEX,
                1,
                (220, 220, 220),
                2,
                cv2.LINE_AA,
            )

            cv2.putText(
                placeholder,
                "Q / ESC / tombol X untuk menutup monitor",
                (220, 310),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.65,
                (150, 150, 150),
                1,
                cv2.LINE_AA,
            )

            while not stop_event.is_set():
                if not source_manager.is_running:
                    final_message = (
                        "Monitor ditutup karena sesi telah berakhir."
                    )
                    break

                frame = source_manager.get_latest_frame_copy()

                if frame is None:
                    display_frame = placeholder.copy()
                else:
                    display_frame = frame

                    session_label = (
                        session_name
                        or "SmartChurch Session"
                    )

                    cv2.rectangle(
                        display_frame,
                        (0, 0),
                        (display_frame.shape[1], 44),
                        (20, 20, 20),
                        -1,
                    )

                    cv2.putText(
                        display_frame,
                        f"{mode.upper()} | {session_label}",
                        (14, 29),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.66,
                        (255, 255, 255),
                        2,
                        cv2.LINE_AA,
                    )

                    instruction = "Q / ESC / X = Tutup Monitor"

                    text_size, _ = cv2.getTextSize(
                        instruction,
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.52,
                        1,
                    )

                    text_x = max(
                        10,
                        display_frame.shape[1]
                        - text_size[0]
                        - 15,
                    )

                    cv2.putText(
                        display_frame,
                        instruction,
                        (text_x, 28),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.52,
                        (180, 180, 180),
                        1,
                        cv2.LINE_AA,
                    )

                cv2.imshow(
                    WINDOW_NAME,
                    display_frame,
                )

                key = cv2.waitKey(1) & 0xFF

                if key in (27, ord("q"), ord("Q")):
                    break

                if self._is_window_closed():
                    break

                # Mencegah loop monitor memakai CPU berlebihan.
                time.sleep(0.01)

        except Exception as exc:
            final_message = (
                f"Monitor kamera mengalami error: {exc}"
            )

        finally:
            source_manager.set_monitor_enabled(False)

            try:
                cv2.destroyWindow(WINDOW_NAME)
            except cv2.error:
                pass

            try:
                cv2.waitKey(1)
            except cv2.error:
                pass

            with self._lock:
                self._thread = None
                self._stop_event = None

                self._state.update(
                    {
                        "is_running": False,
                        "closed_at": self._now_iso(),
                        "message": final_message,
                    }
                )