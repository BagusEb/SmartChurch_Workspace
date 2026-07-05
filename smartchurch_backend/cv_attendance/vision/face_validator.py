# cv_attendance/vision/face_validator.py
from ..config import (
    MATCH_THRESHOLD_KNOWN,
    MIN_DETECTION_SCORE,
    MIN_FACE_SIZE_FOR_RECOGNITION,
)
from ..utils.logger import get_logger

logger = get_logger(__name__)


class FaceValidator:
    @staticmethod
    def classify(
        similarity: float,
        det_score: float,
        face_size: int,
    ) -> str:
        """
        Return: "KNOWN" | "AMBIGUOUS" | "UNKNOWN"

        AMBIGUOUS:
            Wajah terdeteksi, tetapi bukti deteksinya belum cukup
            untuk proses recognition karena detection score rendah
            atau ukuran wajah terlalu kecil.

        UNKNOWN:
            Wajah cukup layak diproses, tetapi similarity belum
            mencapai threshold untuk dikenali sebagai member.

        KNOWN:
            Wajah cukup layak diproses dan similarity mencapai
            threshold pengenalan member.
        """

        if det_score < MIN_DETECTION_SCORE:
            logger.debug(
                f"AMBIGUOUS: detection score rendah "
                f"({det_score:.2f})"
            )
            return "AMBIGUOUS"

        if face_size < MIN_FACE_SIZE_FOR_RECOGNITION:
            logger.debug(
                f"AMBIGUOUS: wajah terlalu kecil "
                f"({face_size}px)"
            )
            return "AMBIGUOUS"

        if similarity < MATCH_THRESHOLD_KNOWN:
            logger.debug(
                f"UNKNOWN: similarity belum mencapai threshold "
                f"({similarity:.3f})"
            )
            return "UNKNOWN"

        logger.debug(
            f"KNOWN: similarity memenuhi threshold "
            f"({similarity:.3f})"
        )
        return "KNOWN"

    @staticmethod
    def get_display_name(
        status: str,
        member_name: str,
    ) -> str:
        if status == "KNOWN":
            return member_name

        if status == "UNKNOWN":
            return "Unknown"

        return "AMBIGUOUS"

    @staticmethod
    def get_reason(
        similarity: float,
        det_score: float,
        face_size: int,
    ) -> str:
        if det_score < MIN_DETECTION_SCORE:
            return (
                f"Kualitas deteksi rendah "
                f"({det_score:.0%})"
            )

        if face_size < MIN_FACE_SIZE_FOR_RECOGNITION:
            return (
                f"Wajah terlalu kecil "
                f"({face_size}px)"
            )

        if similarity < MATCH_THRESHOLD_KNOWN:
            return (
                f"Similarity rendah "
                f"({similarity:.0%})"
            )

        return "OK"