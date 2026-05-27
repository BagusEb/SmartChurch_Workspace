# cv_attendance/vision/face_embedder.py
import numpy as np
from ..utils.logger import get_logger          # ← relative
from ..utils.image_utils import (               # ← relative
    encode_image_to_bytes,
    decode_bytes_to_image,
)

logger = get_logger(__name__)


class FaceEmbedder:
    @staticmethod
    def normalize(embedding: np.ndarray) -> np.ndarray:
        norm = np.linalg.norm(embedding)
        if norm == 0:
            return embedding
        return embedding / norm

    @staticmethod
    def to_list(embedding: np.ndarray) -> list:
        return FaceEmbedder.normalize(embedding).tolist()

    @staticmethod
    def from_list(embedding_list: list) -> np.ndarray:
        return np.array(embedding_list, dtype=np.float32)

    @staticmethod
    def is_valid(embedding: np.ndarray) -> bool:
        if embedding is None:
            return False
        if embedding.ndim != 1 or embedding.shape[0] != 512:
            return False
        if np.all(embedding == 0):
            return False
        return True

    # Shortcut untuk backward-compatibility
    @staticmethod
    def image_to_bytes(face_crop: np.ndarray, quality: int = 90) -> bytes:
        return encode_image_to_bytes(face_crop, quality)

    @staticmethod
    def bytes_to_image(image_bytes: bytes):
        return decode_bytes_to_image(image_bytes)