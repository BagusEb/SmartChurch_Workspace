#smartchurch_backend\cv_attendance\camera\async_rtsp_stream.py

import threading
import time

from .rtsp_stream import RTSPStream


class AsyncRTSPStream:
    """
    Background RTSP reader dengan mekanisme latest-frame.

    Prinsip:
    - RTSP dibaca terus-menerus oleh satu thread khusus.
    - Hanya frame terbaru yang disimpan.
    - Setiap frame baru mendapat sequence ID yang meningkat.
    - Consumer dapat meminta hanya frame yang sequence-nya berbeda.
    - Frame lama tidak dibuat menjadi antrean sehingga latency tetap rendah.
    """

    def __init__(self, rtsp_url):
        self.stream = RTSPStream(rtsp_url=rtsp_url)

        self._thread = None
        self._lock = threading.Lock()
        self._frame_condition = threading.Condition(self._lock)

        self._running = False

        self._latest_frame = None
        self._last_read_at = None

        # Bertambah satu setiap RTSP reader menerima frame baru.
        self._frame_sequence = 0

        self.last_error = None

    def open(self):
        """
        Membuka RTSP dan memulai background reader.
        """

        # Mencegah dua reader thread aktif pada instance yang sama.
        if self._running or (
            self._thread is not None
            and self._thread.is_alive()
        ):
            self.release()

        if not self.stream.open():
            self.last_error = self.stream.last_error
            return False

        with self._frame_condition:
            self._latest_frame = None
            self._last_read_at = None
            self._frame_sequence = 0
            self.last_error = None
            self._running = True

        thread = threading.Thread(
            target=self._reader_loop,
            daemon=True,
            name="AsyncRTSPReader",
        )

        self._thread = thread

        try:
            thread.start()
        except Exception as exc:
            with self._frame_condition:
                self._running = False
                self.last_error = (
                    f"Gagal memulai AsyncRTSPReader: {exc}"
                )
                self._frame_condition.notify_all()

            self.stream.release()
            self._thread = None
            return False

        return True

    def _reader_loop(self):
        """
        Thread ini menjadi satu-satunya bagian yang memanggil cap.read().

        Setiap frame yang berhasil dibaca:
        1. Disimpan sebagai latest frame.
        2. Sequence ID dinaikkan.
        3. Consumer yang menunggu frame baru dibangunkan.
        """

        while True:
            with self._lock:
                if not self._running:
                    break

            ok, frame = self.stream.read_frame()

            if ok and frame is not None:
                now = time.time()

                with self._frame_condition:
                    if not self._running:
                        break

                    # Reader mengganti referensi frame, bukan memodifikasi
                    # frame lama yang sedang digunakan consumer.
                    self._latest_frame = frame
                    self._last_read_at = now
                    self._frame_sequence += 1
                    self.last_error = None

                    # Bangunkan attendance/registration thread yang menunggu.
                    self._frame_condition.notify_all()

            else:
                with self._frame_condition:
                    self.last_error = self.stream.last_error

                # Hindari tight loop jika RTSP sedang mengalami error.
                time.sleep(0.02)

        with self._frame_condition:
            self._frame_condition.notify_all()

    def read_latest_frame(
        self,
        last_sequence=None,
        copy_frame=False,
        wait_timeout=0.25,
    ):
        """
        Mengambil latest frame hanya jika sequence-nya baru.

        Args:
            last_sequence:
                Sequence frame terakhir yang sudah diproses consumer.

                - None:
                  Ambil latest frame apa pun yang tersedia.

                - integer:
                  Return frame hanya jika sequence terbaru berbeda.

            copy_frame:
                True:
                    Return salinan numpy array.

                False:
                    Return referensi frame terbaru tanpa full-frame copy.

                    Aman untuk pipeline saat ini karena frame input hanya
                    dibaca, kemudian crop/resize dilakukan tanpa menggambar
                    langsung pada frame asli.

            wait_timeout:
                Maksimal waktu menunggu frame baru dalam detik.

        Return:
            (True, frame, sequence)
                Jika ada frame baru.

            (False, None, sequence)
                Jika belum ada frame atau sequence masih sama.
        """

        try:
            timeout = max(float(wait_timeout or 0.0), 0.0)
        except (TypeError, ValueError):
            timeout = 0.0

        with self._frame_condition:

            def new_frame_available():
                # Saat stream dihentikan, consumer harus dibangunkan.
                if not self._running:
                    return True

                if self._latest_frame is None:
                    return False

                if last_sequence is None:
                    return True

                return self._frame_sequence != last_sequence

            if not new_frame_available() and timeout > 0:
                self._frame_condition.wait_for(
                    new_frame_available,
                    timeout=timeout,
                )

            current_sequence = self._frame_sequence

            if self._latest_frame is None:
                return False, None, current_sequence

            # Frame sudah pernah diproses oleh consumer ini.
            if (
                last_sequence is not None
                and current_sequence == last_sequence
            ):
                return False, None, current_sequence

            frame = (
                self._latest_frame.copy()
                if copy_frame
                else self._latest_frame
            )

            return True, frame, current_sequence

    def read_frame(self):
        """
        Backward compatibility.

        Method lama tetap tersedia untuk test script atau kode lain yang
        masih mengharapkan return dua nilai:

            ok, frame = camera.read_frame()

        Method ini tidak melakukan filtering sequence.
        """

        ok, frame, _ = self.read_latest_frame(
            last_sequence=None,
            copy_frame=True,
            wait_timeout=0.0,
        )

        return ok, frame

    def get_status(self):
        """
        Status internal RTSP reader untuk debugging.
        """

        with self._lock:
            frame_age_ms = None

            if self._last_read_at is not None:
                frame_age_ms = round(
                    max(
                        0.0,
                        (time.time() - self._last_read_at) * 1000,
                    ),
                    1,
                )

            return {
                "is_running": self._running,
                "latest_sequence": self._frame_sequence,
                "has_frame": self._latest_frame is not None,
                "last_read_at": self._last_read_at,
                "frame_age_ms": frame_age_ms,
                "last_error": self.last_error,
            }

    def release(self):
        """
        Menghentikan background reader dan melepas RTSP.
        """

        with self._frame_condition:
            self._running = False

            # Bangunkan consumer yang sedang menunggu frame baru.
            self._frame_condition.notify_all()

        thread = self._thread

        if (
            thread is not None
            and thread.is_alive()
            and thread is not threading.current_thread()
        ):
            thread.join(timeout=2)

        # Melepas VideoCapture juga membantu membuka cap.read()
        # yang mungkin sedang tertahan.
        self.stream.release()

        if (
            thread is not None
            and thread.is_alive()
            and thread is not threading.current_thread()
        ):
            thread.join(timeout=1)

        with self._frame_condition:
            self._latest_frame = None
            self._last_read_at = None
            self._frame_sequence = 0
            self._thread = None
            self._frame_condition.notify_all()