# cv_attendance/config.py
from pathlib import Path
BASE_DIR = Path(__file__).resolve().parent

# KAMERA
CAMERA_SOURCE = 0

# Resolusi kamera
FRAME_WIDTH  = 1920
FRAME_HEIGHT = 1080

# INSIGHTFACE
INSIGHTFACE_MODEL_NAME = "buffalo_l"
INSIGHTFACE_CTX_ID     = 0
 
# DETEKSI WAJAH
MIN_FACE_SIZE = 10 #ukuran berapa pixel agar wajah di proses

# ── ATTENDANCE MATCHING THRESHOLDS ────────────────────────────
MATCH_THRESHOLD_KNOWN     = 0.45 #minimal kemiripan untuk dianggap KNOWN
MATCH_THRESHOLD_AMBIGUOUS = 0.15
MIN_DETECTION_SCORE       = 0.40  #seberapa yakin dia itu wajah
DETECTION_COOLDOWN        = 30    # detik cooldown untuk KNOWN (1 timeline row per window)

# ── UNKNOWN/AMBIGUOUS TRACKING ────────────────────────────────
# Berapa detik wajah unknown/ambiguous di-track di RAM sebelum expire
UNKNOWN_FACE_WINDOW     = 10   # detik
# Cosine similarity minimum untuk dianggap wajah yang sama (unknown/ambiguous)
UNKNOWN_SAME_FACE_SIM   = 0.75

# LOGGING
LOG_LEVEL     = "INFO"
LOG_TO_FILE   = True
LOG_FILE_PATH = BASE_DIR / "smartchurch_ai.log"