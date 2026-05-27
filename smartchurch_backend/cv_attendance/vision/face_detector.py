# cv_attendance/vision/face_detector.py
import numpy as np
from insightface.app import FaceAnalysis
from ..utils.logger import get_logger          # ← relative
from ..config import (                          # ← relative
    INSIGHTFACE_MODEL_NAME,
    INSIGHTFACE_CTX_ID,
    MIN_FACE_SIZE,
)

logger = get_logger(__name__)


class FaceDetector:
    def __init__(self):
        self.model = None
        self._is_loaded = False

    def load_model(self):
        if self._is_loaded:
            return
        logger.info(f"Loading InsightFace model '{INSIGHTFACE_MODEL_NAME}'...")
        self.model = FaceAnalysis(
            name=INSIGHTFACE_MODEL_NAME,
            providers=["CPUExecutionProvider"],
        )
        self.model.prepare(ctx_id=INSIGHTFACE_CTX_ID, det_size=(1280, 1280))
        self._is_loaded = True
        logger.info("InsightFace model siap")

    def detect(self, frame: np.ndarray) -> list:
        if not self._is_loaded:
            self.load_model()

        frame_rgb = frame[:, :, ::-1]   # BGR → RGB
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

            results.append({
                "bbox":      bbox,
                "embedding": face.embedding,
                "det_score": float(face.det_score),
                "face_crop": face_crop,
                "face_size": face_size,
            })
        return results

    def detect_single_largest(self, frame: np.ndarray):
        faces = self.detect(frame)
        if not faces:
            return None
        return max(faces, key=lambda f: f["face_size"])