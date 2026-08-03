# cv_attendance/utils/image_utils.py
import cv2
import numpy as np
from .logger import get_logger  # ← relative import

logger = get_logger(__name__)

# ── Warna standar (BGR format OpenCV) ─────────────────────────
COLOR_KNOWN = (0, 220, 0)

# LightSkyBlue RGB(135, 206, 250) dikonversi menjadi BGR.
COLOR_GUEST = (250, 206, 135)

COLOR_AMBIGUOUS = (0, 165, 255)
COLOR_UNKNOWN = (0, 0, 220)
COLOR_ENROLLING = (255, 200, 0)
COLOR_WHITE = (255, 255, 255)
COLOR_BLACK = (0, 0, 0)


def draw_face_box(
    frame: np.ndarray,
    bbox: list,
    color: tuple = COLOR_ENROLLING,
    thickness: int = 2,
) -> np.ndarray:
    x1, y1, x2, y2 = [int(v) for v in bbox]
    cv2.rectangle(frame, (x1, y1), (x2, y2), color, thickness)
    return frame


def draw_detection_label(
    frame: np.ndarray,
    bbox: list,
    name: str,
    confidence: float,
    status: str = "KNOWN",
) -> np.ndarray:
    normalized_status = str(status or "").upper()

    color_map = {
        "KNOWN": COLOR_KNOWN,
        "GUEST": COLOR_GUEST,
        "AMBIGUOUS": COLOR_AMBIGUOUS,
        "UNKNOWN": COLOR_UNKNOWN,
        "TRACKING": COLOR_WHITE,
    }

    color = color_map.get(normalized_status, COLOR_WHITE)
    x1, y1, x2, y2 = [int(v) for v in bbox]

    cv2.rectangle(
        frame,
        (x1, y1),
        (x2, y2),
        color,
        2,
    )

    label = f"{name}  {confidence:.0%}"
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.55
    thickness = 1

    (text_width, text_height), _ = cv2.getTextSize(
        label,
        font,
        font_scale,
        thickness,
    )

    label_y1 = max(0, y1 - text_height - 10)
    label_y2 = y1

    cv2.rectangle(
        frame,
        (x1, label_y1),
        (x1 + text_width + 8, label_y2),
        color,
        -1,
    )

    # Background hijau dan biru muda memakai teks hitam.
    text_color_map = {
        "KNOWN": COLOR_BLACK,
        "GUEST": COLOR_BLACK,
        "ENROLLING": COLOR_BLACK,
    }

    text_color = text_color_map.get(
        normalized_status,
        COLOR_WHITE,
    )

    cv2.putText(
        frame,
        label,
        (x1 + 4, label_y2 - 4),
        font,
        font_scale,
        text_color,
        thickness,
        cv2.LINE_AA,
    )

    return frame


def encode_image_to_bytes(face_crop: np.ndarray, quality: int = 90) -> bytes:
    params = [cv2.IMWRITE_JPEG_QUALITY, quality]
    ok, buffer = cv2.imencode(".jpg", face_crop, params)
    if not ok:
        logger.error("encode_image_to_bytes: gagal encode JPEG")
        return b""
    return buffer.tobytes()


def decode_bytes_to_image(image_bytes: bytes):
    try:
        arr = np.frombuffer(image_bytes, dtype=np.uint8)
        image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if image is None:
            logger.error("decode_bytes_to_image: imdecode menghasilkan None")
        return image
    except Exception as e:
        logger.error(f"decode_bytes_to_image: {e}")
        return None
