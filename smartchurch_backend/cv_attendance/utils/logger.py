# cv_attendance/utils/logger.py
import logging
from pathlib import Path


def get_logger(name: str) -> logging.Logger:
    """
    Buat logger bernama `name` dengan format SmartChurch.
    Aman dipanggil berkali-kali — handler tidak ditambah duplikat.
    """
    logger = logging.getLogger(name)

    if logger.handlers:
        return logger

    logger.setLevel(logging.INFO)

    formatter = logging.Formatter(
        fmt="[%(asctime)s] %(levelname)-8s %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # Handler ke console (selalu aktif di Django dev)
    ch = logging.StreamHandler()
    ch.setFormatter(formatter)
    logger.addHandler(ch)

    # Handler ke file (opsional)
    try:
        from cv_attendance.config import LOG_TO_FILE, LOG_FILE_PATH
        if LOG_TO_FILE:
            fh = logging.FileHandler(str(LOG_FILE_PATH), encoding="utf-8")
            fh.setFormatter(formatter)
            logger.addHandler(fh)
    except Exception:
        pass  # Jika config belum tersedia, skip file handler

    logger.propagate = False
    return logger