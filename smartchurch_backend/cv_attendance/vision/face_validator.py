# cv_attendance/vision/face_validator.py
from ..config import (                          # ← relative
    MATCH_THRESHOLD_KNOWN,
    MATCH_THRESHOLD_AMBIGUOUS,
    MIN_DETECTION_SCORE,
)
from ..utils.logger import get_logger           # ← relative

logger = get_logger(__name__)

_MIN_SIZE_FOR_KNOWN = 10


class FaceValidator:
    @staticmethod
    def classify(similarity: float, det_score: float, face_size: int) -> str:
        """
        Return: "KNOWN" | "AMBIGUOUS" | "UNKNOWN"
        """
        if det_score < MIN_DETECTION_SCORE:
            logger.debug(f"AMBIGUOUS: det_score rendah ({det_score:.2f})")
            return "AMBIGUOUS"

        if face_size < _MIN_SIZE_FOR_KNOWN:
            logger.debug(f"AMBIGUOUS: wajah kecil ({face_size}px)")
            return "AMBIGUOUS"

        if similarity >= MATCH_THRESHOLD_KNOWN:
            logger.debug(f"KNOWN: sim={similarity:.3f}")
            return "KNOWN"

        if similarity >= MATCH_THRESHOLD_AMBIGUOUS:
            logger.debug(f"UNKNOWN: sim sedang ({similarity:.3f})")
            return "UNKNOWN"

        logger.debug(f"AMBIGUOUS: sim rendah ({similarity:.3f})")
        return "AMBIGUOUS"

    @staticmethod
    def get_display_name(status: str, member_name: str) -> str:
        if status == "KNOWN":
            return member_name
        elif status == "UNKNOWN":
            return "Unknown"
        return "AMBIGUOUS"

    @staticmethod
    def get_reason(similarity: float, det_score: float, face_size: int) -> str:
        if det_score < MIN_DETECTION_SCORE:
            return f"Kualitas deteksi rendah ({det_score:.0%})"
        if face_size < _MIN_SIZE_FOR_KNOWN:
            return f"Wajah terlalu kecil ({face_size}px)"
        if similarity < MATCH_THRESHOLD_AMBIGUOUS:
            return f"Similarity sangat rendah ({similarity:.0%})"
        if similarity < MATCH_THRESHOLD_KNOWN:
            return f"Similarity tidak cukup ({similarity:.0%})"
        return "OK"