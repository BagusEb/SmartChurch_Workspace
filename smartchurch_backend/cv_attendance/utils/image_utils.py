# cv_attendance/utils/image_utils.py
import cv2
import numpy as np
from .logger import get_logger   # ← relative import

logger = get_logger(__name__)

# ── Warna standar (BGR format OpenCV) ─────────────────────────
COLOR_KNOWN     = (0, 220, 0)
COLOR_AMBIGUOUS = (0, 165, 255)
COLOR_UNKNOWN   = (0, 0, 220)
COLOR_ENROLLING = (255, 200, 0)
COLOR_WHITE     = (255, 255, 255)


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
    color_map = {
        "KNOWN":     COLOR_KNOWN,
        "AMBIGUOUS": COLOR_AMBIGUOUS,
        "UNKNOWN":   COLOR_UNKNOWN,
    }
    color = color_map.get(status.upper(), COLOR_WHITE)
    x1, y1, x2, y2 = [int(v) for v in bbox]

    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

    label      = f"{name}  {confidence:.0%}"
    font       = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.55
    thickness  = 1
    (tw, th), _ = cv2.getTextSize(label, font, font_scale, thickness)

    label_y1 = max(0, y1 - th - 10)
    label_y2 = y1
    cv2.rectangle(frame, (x1, label_y1), (x1 + tw + 8, label_y2), color, -1)

    text_color = (0, 0, 0) if status == "KNOWN" else COLOR_WHITE
    cv2.putText(frame, label, (x1 + 4, label_y2 - 4),
                font, font_scale, text_color, thickness)
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
        arr   = np.frombuffer(image_bytes, dtype=np.uint8)
        image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if image is None:
            logger.error("decode_bytes_to_image: imdecode menghasilkan None")
        return image
    except Exception as e:
        logger.error(f"decode_bytes_to_image: {e}")
        return None