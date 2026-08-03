from ..config import (
    MATCH_THRESHOLD_GUEST,
    MATCH_THRESHOLD_KNOWN,
    MIN_DETECTION_SCORE,
    MIN_FACE_SIZE_FOR_RECOGNITION,
)
from ..utils.logger import get_logger

logger = get_logger(__name__)


class FaceValidator:
    @staticmethod
    def get_match_threshold(
        identity_type: str | None,
    ) -> float:
        if str(identity_type or "").lower() == "guest":
            return MATCH_THRESHOLD_GUEST

        return MATCH_THRESHOLD_KNOWN

    @staticmethod
    def classify(
        similarity: float,
        det_score: float,
        face_size: int,
        identity_type: str | None = "member",
    ) -> str:
        """
        Return:
            KNOWN
            GUEST
            AMBIGUOUS
            UNKNOWN

        KNOWN:
            Reference terbaik adalah member dan melewati threshold.

        GUEST:
            Reference terbaik adalah guest dan melewati threshold.

        AMBIGUOUS:
            Detection score atau ukuran wajah belum layak.

        UNKNOWN:
            Wajah layak diproses, tetapi similarity belum mencapai
            threshold recognition.
        """

        normalized_identity_type = str(
            identity_type or ""
        ).strip().lower()

        if det_score < MIN_DETECTION_SCORE:
            logger.debug(
                "AMBIGUOUS: detection score rendah "
                f"({det_score:.3f})"
            )
            return "AMBIGUOUS"

        if face_size < MIN_FACE_SIZE_FOR_RECOGNITION:
            logger.debug(
                "AMBIGUOUS: wajah terlalu kecil "
                f"({face_size}px)"
            )
            return "AMBIGUOUS"

        threshold = FaceValidator.get_match_threshold(
            normalized_identity_type
        )

        if (
            normalized_identity_type
            not in {"member", "guest"}
            or similarity < threshold
        ):
            logger.debug(
                "UNKNOWN: similarity belum memenuhi threshold "
                f"({similarity:.3f} < {threshold:.3f}) | "
                f"type={normalized_identity_type or None}"
            )
            return "UNKNOWN"

        if normalized_identity_type == "guest":
            logger.debug(
                "GUEST: similarity memenuhi threshold "
                f"({similarity:.3f})"
            )
            return "GUEST"

        logger.debug(
            "KNOWN: similarity memenuhi threshold "
            f"({similarity:.3f})"
        )
        return "KNOWN"

    @staticmethod
    def get_display_name(
        status: str,
        matched_name: str,
    ) -> str:
        normalized_status = str(
            status or ""
        ).upper()

        if normalized_status in {"KNOWN", "GUEST"}:
            return matched_name

        if normalized_status == "UNKNOWN":
            return "Unknown"

        return "AMBIGUOUS"

    @staticmethod
    def get_reason(
        similarity: float,
        det_score: float,
        face_size: int,
        identity_type: str | None = "member",
    ) -> str:
        if det_score < MIN_DETECTION_SCORE:
            return (
                "Kualitas deteksi rendah "
                f"({det_score:.0%})"
            )

        if face_size < MIN_FACE_SIZE_FOR_RECOGNITION:
            return (
                "Wajah terlalu kecil "
                f"({face_size}px)"
            )

        threshold = FaceValidator.get_match_threshold(
            identity_type
        )

        if similarity < threshold:
            return (
                "Similarity rendah "
                f"({similarity:.0%})"
            )

        return "OK"