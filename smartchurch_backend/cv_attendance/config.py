# cv_attendance/config.py
import os
import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
BACKEND_ROOT = BASE_DIR.parent

# ── KAMERA CCTV / RTSP ───────────────────────────────────────
RTSP_URL = os.getenv("RTSP_URL")

RUNTIME_DATA_DIR = BACKEND_ROOT / "runtime_data"

CAMERA_RUNTIME_DIR = RUNTIME_DATA_DIR / "camera"
LOG_RUNTIME_DIR = RUNTIME_DATA_DIR / "logs"
# ============================================================
# CAMERA RUNTIME CONFIG
# ============================================================

CAMERA_RUNTIME_CONFIG_PATH = CAMERA_RUNTIME_DIR / "camera_runtime_config.json"


def _load_camera_runtime_config():
    default_config = {
        "ENABLE_SOURCE_CROP": True,
        "SOURCE_DETECTION_CROP": [1033, 275, 3058, 1286],

        "ENABLE_AI_RESIZE": True,
        "AI_FRAME_WIDTH": 903,
        "AI_FRAME_HEIGHT": 451,

        "INSIGHTFACE_DET_SIZE": [928, 480],
    }

    if not CAMERA_RUNTIME_CONFIG_PATH.exists():
        return default_config

    try:
        data = json.loads(CAMERA_RUNTIME_CONFIG_PATH.read_text(encoding="utf-8"))

        if not isinstance(data, dict):
            return default_config

        default_config.update(data)
        return default_config

    except Exception:
        return default_config


def _to_bool(value, fallback=False):
    if isinstance(value, bool):
        return value

    if isinstance(value, str):
        return value.strip().lower() in ("true", "1", "yes", "on")

    return fallback


def _to_int(value, fallback):
    try:
        return int(value)
    except Exception:
        return fallback


def _to_tuple_int(value, expected_len, fallback):
    try:
        values = tuple(int(v) for v in value)

        if len(values) != expected_len:
            return fallback

        return values

    except Exception:
        return fallback


_camera_runtime_config = _load_camera_runtime_config()


# ============================================================
# FRAME PROCESSING PIPELINE
# ============================================================

ENABLE_SOURCE_CROP = _to_bool(
    _camera_runtime_config.get("ENABLE_SOURCE_CROP"),
    True,
)

SOURCE_DETECTION_CROP = _to_tuple_int(
    _camera_runtime_config.get("SOURCE_DETECTION_CROP"),
    4,
    (1033, 275, 3058, 1286),
)

ENABLE_AI_RESIZE = _to_bool(
    _camera_runtime_config.get("ENABLE_AI_RESIZE"),
    True,
)

AI_FRAME_WIDTH = _to_int(
    _camera_runtime_config.get("AI_FRAME_WIDTH"),
    903,
)

AI_FRAME_HEIGHT = _to_int(
    _camera_runtime_config.get("AI_FRAME_HEIGHT"),
    451,
)

INSIGHTFACE_DET_SIZE = _to_tuple_int(
    _camera_runtime_config.get("INSIGHTFACE_DET_SIZE"),
    2,
    (928, 480),
)


# INSIGHTFACE
INSIGHTFACE_MODEL_NAME = "buffalo_l"
INSIGHTFACE_CTX_ID     = 0
 
 # Auto GPU -> CPU fallback
USE_GPU_IF_AVAILABLE = True
GPU_DEVICE_ID = 0


# DETEKSI WAJAH
MIN_FACE_SIZE = 3 #ukuran berapa pixel agar wajah di proses

# ── ATTENDANCE MATCHING THRESHOLDS ────────────────────────────
MATCH_THRESHOLD_KNOWN     = 0.45 #minimal kemiripan untuk dianggap KNOWN
MATCH_THRESHOLD_AMBIGUOUS = 0.15
MIN_DETECTION_SCORE       = 0.20  #seberapa yakin dia itu wajah
DETECTION_COOLDOWN        = 30    # detik cooldown untuk KNOWN (1 timeline row per window)

# ── UNKNOWN/AMBIGUOUS TRACKING ────────────────────────────────
# Berapa detik wajah unknown/ambiguous di-track di RAM sebelum expire
UNKNOWN_FACE_WINDOW     = 10   # detik
# Cosine similarity minimum untuk dianggap wajah yang sama (unknown/ambiguous)
UNKNOWN_SAME_FACE_SIM   = 0.75

# LOGGING
LOG_LEVEL     = "INFO"
LOG_TO_FILE   = True
LOG_FILE_PATH = LOG_RUNTIME_DIR / "smartchurch_ai.log"

# ── REGISTRATION / ENROLLMENT MODE ─────────────────────────────
# Mode registration tidak memakai cooldown attendance.
# Dia hanya mencegah wajah yang masih terus terlihat tersimpan berkali-kali setiap frame.
# Jika wajah hilang dari deteksi lalu muncul lagi setelah timeout ini, akan disimpan lagi.
ENROLL_LOST_TIMEOUT = 1.2

# Similarity untuk menganggap wajah masih track yang sama selama masih terlihat.
ENROLL_SAME_FACE_SIM = UNKNOWN_SAME_FACE_SIM