# cv_attendance/vision/face_detector.py
import numpy as np
import onnxruntime as ort
from insightface.app import FaceAnalysis

from ..utils.logger import get_logger
from ..config import (
    INSIGHTFACE_MODEL_NAME,
    MIN_FACE_SIZE,
    USE_GPU_IF_AVAILABLE,
    GPU_DEVICE_ID,
    INSIGHTFACE_DET_SIZE,
)

logger = get_logger(__name__)


class FaceDetector:
    def __init__(self):
        self.model = None
        self._is_loaded = False
        self.active_providers = []
        self.available_providers = []

    def _build_providers(self):
        """
        Urutan provider:
        1. CUDAExecutionProvider jika tersedia dan diizinkan
        2. CPUExecutionProvider sebagai fallback

        Catatan:
        - CUDAExecutionProvider hanya muncul kalau environment benar:
          onnxruntime-gpu + NVIDIA driver + CUDA/cuDNN dependency sesuai.
        - Kalau tidak tersedia, sistem tetap jalan di CPU.
        """
        try:
            self.available_providers = ort.get_available_providers()
        except Exception as e:
            logger.warning(f"Gagal membaca ONNX Runtime providers: {e}")
            self.available_providers = []

        providers = []

        if USE_GPU_IF_AVAILABLE and "CUDAExecutionProvider" in self.available_providers:
            providers.append(
                (
                    "CUDAExecutionProvider",
                    {
                        "device_id": GPU_DEVICE_ID,
                        "arena_extend_strategy": "kNextPowerOfTwo",
                        "cudnn_conv_algo_search": "EXHAUSTIVE",
                        "do_copy_in_default_stream": True,
                    },
                )
            )

        providers.append("CPUExecutionProvider")

        return providers

    def _preload_cuda_dlls_if_possible(self):
        """
        Untuk Windows:
        - ONNX Runtime 1.20.1 belum punya ort.preload_dlls().
        - Import torch CUDA sebelum FaceAnalysis.prepare() membantu load CUDA/cuDNN DLL.
        """
        try:
            import torch

            logger.info(
                f"PyTorch CUDA check: torch={torch.__version__}, "
                f"cuda={torch.version.cuda}, "
                f"cuda_available={torch.cuda.is_available()}, "
                f"gpu={torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'NO GPU'}"
            )

            # Paksa init CUDA ringan agar DLL CUDA benar-benar termuat
            if torch.cuda.is_available():
                torch.zeros(1, device="cuda")
                logger.info("PyTorch CUDA warm-up berhasil.")

        except Exception as e:
            logger.warning(f"PyTorch CUDA preload/warm-up gagal/non-fatal: {e}")

        try:
            if hasattr(ort, "preload_dlls"):
                ort.preload_dlls()
                logger.info("ONNX Runtime preload_dlls dipanggil.")
            else:
                logger.info("ONNX Runtime preload_dlls tidak tersedia pada versi ini. Lanjut pakai PyTorch CUDA preload.")
        except Exception as e:
            logger.warning(f"ONNX Runtime CUDA DLL preload gagal/non-fatal: {e}")

    def load_model(self):
        if self._is_loaded:
            return

        logger.info(f"Loading InsightFace model '{INSIGHTFACE_MODEL_NAME}'...")

        # Preload hanya membantu kalau memang memakai onnxruntime-gpu.
        self._preload_cuda_dlls_if_possible()

        providers = self._build_providers()

        logger.info(f"ONNX Runtime available providers: {self.available_providers}")
        logger.info(f"InsightFace requested providers: {providers}")

        self.model = FaceAnalysis(
            name=INSIGHTFACE_MODEL_NAME,
            providers=providers,
        )

        # ctx_id:
        # - GPU mode: pakai GPU_DEVICE_ID
        # - CPU fallback: pakai -1
        using_cuda = any(
            provider[0] == "CUDAExecutionProvider"
            if isinstance(provider, tuple)
            else provider == "CUDAExecutionProvider"
            for provider in providers
        )

        ctx_id = GPU_DEVICE_ID if using_cuda else -1

        self.model.prepare(
            ctx_id=ctx_id,
            det_size=INSIGHTFACE_DET_SIZE,
        )

        real_providers = set()

        try:
            for task_name, task_model in self.model.models.items():
                session = getattr(task_model, "session", None)
                if session is not None and hasattr(session, "get_providers"):
                    for provider in session.get_providers():
                        real_providers.add(provider)
        except Exception as e:
            logger.warning(f"Gagal membaca real ONNX providers dari InsightFace: {e}")

        logger.info(f"InsightFace real active providers: {list(real_providers)}")

        using_cuda_real = "CUDAExecutionProvider" in real_providers

        self.active_providers = list(real_providers) if real_providers else providers
        self._is_loaded = True

        if using_cuda_real:
            logger.info(
                f"InsightFace model benar-benar aktif dengan GPU CUDA. "
                f"GPU_DEVICE_ID={GPU_DEVICE_ID}, det_size={INSIGHTFACE_DET_SIZE}"
            )
        else:
            logger.warning(
                f"InsightFace model berjalan dengan CPU fallback, bukan GPU. "
                f"det_size={INSIGHTFACE_DET_SIZE}. "
                f"Cek CUDA/cuDNN jika ingin GPU aktif."
            )

    def detect(self, frame: np.ndarray) -> list:
        if not self._is_loaded:
            self.load_model()

        frame_rgb = frame[:, :, ::-1]  # BGR → RGB
        raw_faces = self.model.get(frame_rgb)

        results = []

        for face in raw_faces:
            bbox = face.bbox.astype(int).tolist()
            x1, y1, x2, y2 = bbox

            face_size = min(x2 - x1, y2 - y1)

            if face_size < MIN_FACE_SIZE:
                continue

            pad = 10
            cx1 = max(0, x1 - pad)
            cy1 = max(0, y1 - pad)
            cx2 = min(frame.shape[1], x2 + pad)
            cy2 = min(frame.shape[0], y2 + pad)

            face_crop = frame[cy1:cy2, cx1:cx2]

            results.append(
                {
                    "bbox": bbox,
                    "embedding": face.embedding,
                    "det_score": float(face.det_score),
                    "face_crop": face_crop,
                    "face_size": face_size,
                }
            )

        return results

    def detect_single_largest(self, frame: np.ndarray):
        faces = self.detect(frame)

        if not faces:
            return None

        return max(faces, key=lambda f: f["face_size"])