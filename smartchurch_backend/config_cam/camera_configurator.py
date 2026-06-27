# smartchurch_backend\config_cam\camera_configurator.py

import os
import sys
import re
import json
from pathlib import Path
from datetime import datetime

import cv2
import numpy as np
import tkinter as tk
from tkinter import ttk, messagebox


# ============================================================
# APP CONSTANTS
# ============================================================

APP_TITLE = "SmartChurch Camera Configurator"

LIVE_WINDOW = "SmartChurch - Live Camera ROI Drawing"
CROP_WINDOW = "SmartChurch - Crop Preview"
RESIZE_WINDOW = "SmartChurch - AI Resize Preview"

SCREEN_USAGE_WIDTH = 0.92
SCREEN_USAGE_HEIGHT = 0.62

CROP_DISPLAY_RATIO = 0.42
RESIZE_DISPLAY_RATIO = 0.42

DEFAULT_AI_WIDTH = 960
DEFAULT_AI_HEIGHT = 480
MAX_AI_WIDTH = 2560
MAX_AI_HEIGHT = 1440

LOCK_AI_RESIZE_TO_CROP_RATIO = True

DET_SIZE_MULTIPLE = 32
DET_SIZE_SUGGESTION_COUNT = 5
MAX_DET_SIZE_WIDTH = 2560
MAX_DET_SIZE_HEIGHT = 1440

DET_SIZE_SCALE_FACTORS = (
    1.00,
    1.15,
    1.33,
    1.50,
    1.75,
    2.00,
    2.25,
    2.50,
    2.75,
    3.00,
)

BOX_COLOR = (0, 255, 255)
HANDLE_COLOR = (0, 180, 255)
TEXT_COLOR = (255, 255, 255)
GREEN = (0, 220, 0)
RED = (0, 0, 255)
ORANGE = (0, 165, 255)

HANDLE_SIZE = 8
HIT_MARGIN = 14
MIN_ROI_WIDTH = 20
MIN_ROI_HEIGHT = 20


# ============================================================
# PATH HANDLING
# ============================================================

def find_backend_root() -> Path:
    env_root = os.getenv("SMARTCHURCH_BACKEND_ROOT")

    if env_root:
        root = Path(env_root).resolve()
        if (root / "cv_attendance" / "config.py").exists():
            return root

    if getattr(sys, "frozen", False):
        start = Path(sys.executable).resolve().parent
    else:
        start = Path(__file__).resolve().parent

    for candidate in [start, *start.parents]:
        if (candidate / "cv_attendance" / "config.py").exists():
            return candidate

    raise RuntimeError(
        "Folder smartchurch_backend tidak ditemukan. "
        "Pastikan EXE berada di dalam struktur project smartchurch_backend/config_cam "
        "atau set environment SMARTCHURCH_BACKEND_ROOT."
    )


def resolve_camera_runtime_config_path(backend_root: Path) -> Path:
    """
    Path JSON runtime camera.

    Prioritas:
    1. Environment CAMERA_RUNTIME_CONFIG_PATH
    2. Default: smartchurch_backend/runtime_data/camera/camera_runtime_config.json
    """
    raw_path = os.getenv("CAMERA_RUNTIME_CONFIG_PATH")

    if raw_path:
        path = Path(raw_path)

        if not path.is_absolute():
            path = backend_root / path

        return path.resolve()

    return backend_root / "runtime_data" / "camera" / "camera_runtime_config.json"


BACKEND_ROOT = find_backend_root()
CONFIG_JSON_PATH = resolve_camera_runtime_config_path(BACKEND_ROOT)
CONFIG_PY_PATH = BACKEND_ROOT / "cv_attendance" / "config.py"
ENV_PATH = BACKEND_ROOT / ".env"


def load_rtsp_url():
    rtsp_url = os.getenv("RTSP_URL")

    if rtsp_url:
        return rtsp_url.strip()

    if not ENV_PATH.exists():
        raise RuntimeError(
            f"RTSP_URL tidak ditemukan. File .env juga tidak ada di: {ENV_PATH}"
        )

    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()

        if not line or line.startswith("#"):
            continue

        if line.startswith("RTSP_URL="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")

    raise RuntimeError("RTSP_URL tidak ditemukan di file .env.")


def parse_config_py_defaults():
    defaults = {
        "ENABLE_SOURCE_CROP": True,
        "SOURCE_DETECTION_CROP": [1033, 275, 3058, 1286],
        "ENABLE_AI_RESIZE": True,
        "AI_FRAME_WIDTH": DEFAULT_AI_WIDTH,
        "AI_FRAME_HEIGHT": DEFAULT_AI_HEIGHT,
        "INSIGHTFACE_DET_SIZE": [928, 480],
    }

    if not CONFIG_PY_PATH.exists():
        return defaults

    text = CONFIG_PY_PATH.read_text(encoding="utf-8", errors="ignore")

    def parse_bool(name, fallback):
        match = re.search(rf"^\s*{name}\s*=\s*(True|False)", text, re.MULTILINE)
        if not match:
            return fallback
        return match.group(1) == "True"

    def parse_int(name, fallback):
        match = re.search(rf"^\s*{name}\s*=\s*(\d+)", text, re.MULTILINE)
        if not match:
            return fallback
        return int(match.group(1))

    def parse_tuple(name, fallback, expected_count):
        match = re.search(rf"^\s*{name}\s*=\s*\(([^)]*)\)", text, re.MULTILINE)
        if not match:
            return fallback

        values = []
        for item in match.group(1).split(","):
            item = item.strip()
            if item:
                values.append(int(item))

        if len(values) != expected_count:
            return fallback

        return values

    defaults["ENABLE_SOURCE_CROP"] = parse_bool(
        "ENABLE_SOURCE_CROP",
        defaults["ENABLE_SOURCE_CROP"],
    )
    defaults["SOURCE_DETECTION_CROP"] = parse_tuple(
        "SOURCE_DETECTION_CROP",
        defaults["SOURCE_DETECTION_CROP"],
        4,
    )
    defaults["ENABLE_AI_RESIZE"] = parse_bool(
        "ENABLE_AI_RESIZE",
        defaults["ENABLE_AI_RESIZE"],
    )
    defaults["AI_FRAME_WIDTH"] = parse_int(
        "AI_FRAME_WIDTH",
        defaults["AI_FRAME_WIDTH"],
    )
    defaults["AI_FRAME_HEIGHT"] = parse_int(
        "AI_FRAME_HEIGHT",
        defaults["AI_FRAME_HEIGHT"],
    )
    defaults["INSIGHTFACE_DET_SIZE"] = parse_tuple(
        "INSIGHTFACE_DET_SIZE",
        defaults["INSIGHTFACE_DET_SIZE"],
        2,
    )

    return defaults


def load_existing_camera_config():
    defaults = parse_config_py_defaults()

    if not CONFIG_JSON_PATH.exists():
        return defaults

    try:
        data = json.loads(CONFIG_JSON_PATH.read_text(encoding="utf-8"))
        defaults.update(data)
    except Exception:
        pass

    return defaults


# ============================================================
# SCREEN / DISPLAY HELPERS
# ============================================================

def get_screen_size():
    try:
        root = tk.Tk()
        root.withdraw()
        screen_w = root.winfo_screenwidth()
        screen_h = root.winfo_screenheight()
        root.destroy()
        return int(screen_w), int(screen_h)
    except Exception:
        return 1366, 768


SCREEN_WIDTH, SCREEN_HEIGHT = get_screen_size()

MAIN_DISPLAY_MAX_WIDTH = int(SCREEN_WIDTH * SCREEN_USAGE_WIDTH)
MAIN_DISPLAY_MAX_HEIGHT = int(SCREEN_HEIGHT * SCREEN_USAGE_HEIGHT)

CROP_DISPLAY_MAX_WIDTH = int(SCREEN_WIDTH * CROP_DISPLAY_RATIO)
CROP_DISPLAY_MAX_HEIGHT = int(SCREEN_HEIGHT * CROP_DISPLAY_RATIO)

RESIZE_DISPLAY_MAX_WIDTH = int(SCREEN_WIDTH * RESIZE_DISPLAY_RATIO)
RESIZE_DISPLAY_MAX_HEIGHT = int(SCREEN_HEIGHT * RESIZE_DISPLAY_RATIO)


def open_rtsp_capture():
    rtsp_url = load_rtsp_url()

    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
        "rtsp_transport;tcp|"
        "stimeout;5000000|"
        "max_delay;500000"
    )

    cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    if not cap.isOpened():
        raise RuntimeError(
            "Gagal membuka RTSP stream. Cek IP CCTV, username, password, channel RTSP, dan jaringan LAN."
        )

    return cap


def is_window_closed(window_name):
    try:
        return cv2.getWindowProperty(window_name, cv2.WND_PROP_VISIBLE) < 1
    except cv2.error:
        return True


def nothing(_):
    pass


def resize_keep_aspect(image, max_width=900, max_height=500):
    if image is None or image.size == 0:
        return image

    h, w = image.shape[:2]

    if h <= 0 or w <= 0:
        return image

    scale = min(max_width / w, max_height / h, 1.0)

    new_w = max(1, int(w * scale))
    new_h = max(1, int(h * scale))

    if new_w == w and new_h == h:
        return image.copy()

    return cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)


def show_window_exact(window_name, image):
    if image is None or image.size == 0:
        return

    h, w = image.shape[:2]
    cv2.resizeWindow(window_name, max(120, w), max(90, h))
    cv2.imshow(window_name, image)


def safe_ratio(width, height):
    if height <= 0:
        return 0.0
    return width / height


def format_ratio(width, height):
    ratio = safe_ratio(width, height)
    if ratio <= 0:
        return "N/A"
    return f"{ratio:.4f}:1"


def format_pixels(width, height):
    return f"{width * height:,}".replace(",", ".")


def round_up_to_multiple(value, multiple=DET_SIZE_MULTIPLE):
    value = max(1, int(round(value)))
    return int(np.ceil(value / multiple) * multiple)


def round_nearest_to_multiple(value, multiple=DET_SIZE_MULTIPLE):
    value = max(1, float(value))
    return int(max(multiple, round(value / multiple) * multiple))


def build_det_size_suggestions(target_w, target_h, count=DET_SIZE_SUGGESTION_COUNT):
    target_w = max(1, int(target_w))
    target_h = max(1, int(target_h))

    target_ratio = safe_ratio(target_w, target_h)

    if target_ratio <= 0:
        return []

    suggestions = []
    used = set()

    def add_candidate(width, height):
        width = max(DET_SIZE_MULTIPLE, int(width))
        height = max(DET_SIZE_MULTIPLE, int(height))

        if width > MAX_DET_SIZE_WIDTH or height > MAX_DET_SIZE_HEIGHT:
            return

        key = (width, height)

        if key in used:
            return

        ratio = safe_ratio(width, height)
        ratio_error_pct = abs(ratio - target_ratio) / target_ratio * 100
        pixels = width * height
        target_pixels = target_w * target_h
        area_vs_ai_pct = pixels / target_pixels * 100 if target_pixels > 0 else 0

        suggestions.append(
            {
                "width": width,
                "height": height,
                "ratio": ratio,
                "ratio_error_pct": ratio_error_pct,
                "pixels": pixels,
                "area_vs_ai_pct": area_vs_ai_pct,
            }
        )

        used.add(key)

    for scale in DET_SIZE_SCALE_FACTORS:
        candidate_w = round_up_to_multiple(target_w * scale)
        raw_h = candidate_w / target_ratio

        height_candidates = {
            round_nearest_to_multiple(raw_h),
            round_up_to_multiple(raw_h),
        }

        for candidate_h in sorted(height_candidates):
            if candidate_w < target_w:
                candidate_w = round_up_to_multiple(target_w)

            if candidate_h < target_h:
                candidate_h = round_up_to_multiple(target_h)

            add_candidate(candidate_w, candidate_h)

    width_start = round_up_to_multiple(target_w)

    for candidate_w in range(width_start, MAX_DET_SIZE_WIDTH + 1, DET_SIZE_MULTIPLE):
        raw_h = candidate_w / target_ratio

        height_candidates = {
            round_nearest_to_multiple(raw_h),
            round_up_to_multiple(raw_h),
        }

        for candidate_h in sorted(height_candidates):
            if candidate_h < target_h:
                candidate_h = round_up_to_multiple(target_h)

            add_candidate(candidate_w, candidate_h)

        if len(suggestions) >= count * 4:
            break

    suggestions = sorted(
        suggestions,
        key=lambda item: (
            item["pixels"],
            item["ratio_error_pct"],
        ),
    )

    return suggestions[:count]


# ============================================================
# ROI STATE
# ============================================================

class ROIState:
    def __init__(self):
        self.roi = None
        self.visible = False
        self.drawing_enabled = False

        self.action = None
        self.active_handle = None
        self.start_point = None
        self.start_roi = None

        self.source_width = 1
        self.source_height = 1

        self.display_scale = 1.0
        self.display_width = 1
        self.display_height = 1

    def set_source_geometry(self, source_width, source_height):
        self.source_width = max(1, int(source_width))
        self.source_height = max(1, int(source_height))

        scale = min(
            MAIN_DISPLAY_MAX_WIDTH / self.source_width,
            MAIN_DISPLAY_MAX_HEIGHT / self.source_height,
            1.0,
        )

        self.display_scale = scale
        self.display_width = max(1, int(self.source_width * scale))
        self.display_height = max(1, int(self.source_height * scale))

        if self.roi is not None:
            self.save_normalized_roi()

    def has_roi(self):
        return self.roi is not None

    def display_to_source_point(self, x, y):
        if self.display_scale <= 0:
            return self.clamp_source_point(x, y)

        source_x = int(round(x / self.display_scale))
        source_y = int(round(y / self.display_scale))

        return self.clamp_source_point(source_x, source_y)

    def source_to_display_point(self, x, y):
        display_x = int(round(x * self.display_scale))
        display_y = int(round(y * self.display_scale))
        return display_x, display_y

    def source_to_display_roi(self, roi):
        x1, y1, x2, y2 = roi
        dx1, dy1 = self.source_to_display_point(x1, y1)
        dx2, dy2 = self.source_to_display_point(x2, y2)
        return dx1, dy1, dx2, dy2

    def clamp_source_point(self, x, y):
        x = max(0, min(int(x), self.source_width - 1))
        y = max(0, min(int(y), self.source_height - 1))
        return x, y

    def get_roi(self):
        if self.roi is None:
            return None

        x1, y1, x2, y2 = self.roi

        x1 = max(0, min(int(x1), self.source_width - 1))
        y1 = max(0, min(int(y1), self.source_height - 1))
        x2 = max(1, min(int(x2), self.source_width))
        y2 = max(1, min(int(y2), self.source_height))

        if x2 < x1:
            x1, x2 = x2, x1

        if y2 < y1:
            y1, y2 = y2, y1

        if x2 - x1 < MIN_ROI_WIDTH:
            x2 = min(self.source_width, x1 + MIN_ROI_WIDTH)

        if y2 - y1 < MIN_ROI_HEIGHT:
            y2 = min(self.source_height, y1 + MIN_ROI_HEIGHT)

        return [x1, y1, x2, y2]

    def save_normalized_roi(self):
        if self.roi is None:
            return

        self.roi = list(self.get_roi())


roi_state = ROIState()


def point_inside_roi(x, y, roi):
    x1, y1, x2, y2 = roi
    return x1 <= x <= x2 and y1 <= y <= y2


def get_handles(roi):
    x1, y1, x2, y2 = roi
    cx = (x1 + x2) // 2
    cy = (y1 + y2) // 2

    return {
        "tl": (x1, y1),
        "top": (cx, y1),
        "tr": (x2, y1),
        "right": (x2, cy),
        "br": (x2, y2),
        "bottom": (cx, y2),
        "bl": (x1, y2),
        "left": (x1, cy),
    }


def hit_test_handle(x, y, roi):
    handles = get_handles(roi)

    for name, (hx, hy) in handles.items():
        if abs(x - hx) <= HIT_MARGIN and abs(y - hy) <= HIT_MARGIN:
            return name

    x1, y1, x2, y2 = roi

    if abs(x - x1) <= HIT_MARGIN and y1 <= y <= y2:
        return "left"

    if abs(x - x2) <= HIT_MARGIN and y1 <= y <= y2:
        return "right"

    if abs(y - y1) <= HIT_MARGIN and x1 <= x <= x2:
        return "top"

    if abs(y - y2) <= HIT_MARGIN and x1 <= x <= x2:
        return "bottom"

    return None


def move_roi(start_roi, dx, dy):
    x1, y1, x2, y2 = start_roi
    width = x2 - x1
    height = y2 - y1

    new_x1 = x1 + dx
    new_y1 = y1 + dy

    new_x1 = max(0, min(new_x1, roi_state.source_width - width))
    new_y1 = max(0, min(new_y1, roi_state.source_height - height))

    new_x2 = new_x1 + width
    new_y2 = new_y1 + height

    return [new_x1, new_y1, new_x2, new_y2]


def resize_roi(start_roi, handle, x, y):
    x1, y1, x2, y2 = start_roi

    if handle in ["tl", "left", "bl"]:
        x1 = x

    if handle in ["tr", "right", "br"]:
        x2 = x

    if handle in ["tl", "top", "tr"]:
        y1 = y

    if handle in ["bl", "bottom", "br"]:
        y2 = y

    x1, y1 = roi_state.clamp_source_point(x1, y1)
    x2, y2 = roi_state.clamp_source_point(x2, y2)

    if x2 < x1:
        x1, x2 = x2, x1

    if y2 < y1:
        y1, y2 = y2, y1

    if x2 - x1 < MIN_ROI_WIDTH:
        x2 = min(roi_state.source_width, x1 + MIN_ROI_WIDTH)

    if y2 - y1 < MIN_ROI_HEIGHT:
        y2 = min(roi_state.source_height, y1 + MIN_ROI_HEIGHT)

    return [x1, y1, x2, y2]


def create_default_roi_at_point(x, y):
    default_w = max(400, int(roi_state.source_width * 0.25))
    default_h = max(200, int(roi_state.source_height * 0.35))

    x1 = x
    y1 = y
    x2 = min(roi_state.source_width, x1 + default_w)
    y2 = min(roi_state.source_height, y1 + default_h)

    if x2 - x1 < default_w:
        x1 = max(0, x2 - default_w)

    if y2 - y1 < default_h:
        y1 = max(0, y2 - default_h)

    return [x1, y1, x2, y2]


def mouse_callback(event, x, y, flags, param):
    source_x, source_y = roi_state.display_to_source_point(x, y)

    if not roi_state.drawing_enabled:
        return

    if event == cv2.EVENT_LBUTTONDOWN:
        roi_state.visible = True

        if not roi_state.has_roi():
            roi_state.roi = [source_x, source_y, source_x + 1, source_y + 1]
            roi_state.action = "new"
            roi_state.start_point = (source_x, source_y)
            roi_state.start_roi = roi_state.roi.copy()
            return

        roi = roi_state.get_roi()
        display_roi = roi_state.source_to_display_roi(roi)

        handle = hit_test_handle(x, y, display_roi)

        if handle:
            roi_state.action = "resize"
            roi_state.active_handle = handle
            roi_state.start_point = (source_x, source_y)
            roi_state.start_roi = list(roi)
            return

        if point_inside_roi(source_x, source_y, roi):
            roi_state.action = "move"
            roi_state.start_point = (source_x, source_y)
            roi_state.start_roi = list(roi)
            return

        roi_state.action = None
        roi_state.active_handle = None
        roi_state.start_point = None
        roi_state.start_roi = None

    elif event == cv2.EVENT_MOUSEMOVE:
        if roi_state.action is None:
            return

        if roi_state.start_point is None or roi_state.start_roi is None:
            return

        sx, sy = roi_state.start_point

        if roi_state.action == "new":
            x1, y1 = sx, sy
            x2, y2 = source_x, source_y

            if abs(x2 - x1) < MIN_ROI_WIDTH and abs(y2 - y1) < MIN_ROI_HEIGHT:
                roi_state.roi = create_default_roi_at_point(sx, sy)
            else:
                roi_state.roi = [x1, y1, x2, y2]

        elif roi_state.action == "move":
            dx = source_x - sx
            dy = source_y - sy
            roi_state.roi = move_roi(roi_state.start_roi, dx, dy)

        elif roi_state.action == "resize":
            roi_state.roi = resize_roi(
                roi_state.start_roi,
                roi_state.active_handle,
                source_x,
                source_y,
            )

    elif event == cv2.EVENT_LBUTTONUP:
        if roi_state.action == "new":
            sx, sy = roi_state.start_point or (source_x, source_y)

            if roi_state.roi is not None:
                x1, y1, x2, y2 = roi_state.roi

                if abs(x2 - x1) < MIN_ROI_WIDTH or abs(y2 - y1) < MIN_ROI_HEIGHT:
                    roi_state.roi = create_default_roi_at_point(sx, sy)

        roi_state.save_normalized_roi()

        roi_state.action = None
        roi_state.active_handle = None
        roi_state.start_point = None
        roi_state.start_roi = None


# ============================================================
# DRAWING HELPERS
# ============================================================

def draw_text_with_background(frame, text, x, y, color=TEXT_COLOR):
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.52
    thickness = 1

    (tw, th), _ = cv2.getTextSize(text, font, font_scale, thickness)

    x = max(0, min(int(x), frame.shape[1] - tw - 10))
    y = max(th + 8, min(int(y), frame.shape[0] - 5))

    cv2.rectangle(
        frame,
        (x - 5, y - th - 8),
        (x + tw + 5, y + 5),
        (0, 0, 0),
        -1,
    )

    cv2.putText(
        frame,
        text,
        (x, y),
        font,
        font_scale,
        color,
        thickness,
        cv2.LINE_AA,
    )


def draw_roi_on_main_display(frame):
    if not roi_state.visible or not roi_state.has_roi():
        return frame

    source_roi = roi_state.get_roi()
    x1, y1, x2, y2 = source_roi
    roi_w = x2 - x1
    roi_h = y2 - y1

    dx1, dy1, dx2, dy2 = roi_state.source_to_display_roi(source_roi)

    cv2.rectangle(frame, (dx1, dy1), (dx2, dy2), BOX_COLOR, 2)

    display_handles = get_handles((dx1, dy1, dx2, dy2))

    for _, (hx, hy) in display_handles.items():
        cv2.rectangle(
            frame,
            (hx - HANDLE_SIZE // 2, hy - HANDLE_SIZE // 2),
            (hx + HANDLE_SIZE // 2, hy + HANDLE_SIZE // 2),
            HANDLE_COLOR,
            -1,
        )

    draw_text_with_background(
        frame,
        f"SOURCE_DETECTION_CROP=({x1}, {y1}, {x2}, {y2})",
        dx1,
        dy1 - 12 if dy1 >= 35 else dy2 + 25,
        BOX_COLOR,
    )

    draw_text_with_background(
        frame,
        f"crop={roi_w}x{roi_h} | ratio={format_ratio(roi_w, roi_h)}",
        dx1,
        dy1 + 18 if dy1 >= 35 else dy2 + 52,
        GREEN,
    )

    return frame


def make_main_display(frame):
    display = cv2.resize(
        frame,
        (roi_state.display_width, roi_state.display_height),
        interpolation=cv2.INTER_AREA if roi_state.display_scale < 1 else cv2.INTER_LINEAR,
    )

    display = draw_roi_on_main_display(display)

    draw_text_with_background(
        display,
        "Drawing ROI: drag area, drag handle to resize, drag inside box to move",
        20,
        28,
        GREEN,
    )

    draw_text_with_background(
        display,
        "R = reset ROI | Q/ESC = close and save ROI to main window | X = close and save ROI",
        20,
        display.shape[0] - 18,
        TEXT_COLOR,
    )

    return display


def crop_source_frame(frame):
    if frame is None or frame.size == 0:
        return None

    if not roi_state.has_roi():
        return None

    x1, y1, x2, y2 = roi_state.get_roi()
    return frame[y1:y2, x1:x2]


def add_preview_overlay(frame, lines):
    if frame is None or frame.size == 0:
        return frame

    output = frame.copy()
    y = 26

    for line in lines:
        draw_text_with_background(output, line, 16, y, TEXT_COLOR)
        y += 26

    return output


# ============================================================
# RESIZE STATE
# ============================================================

class ResizeState:
    def __init__(self, initial_width, initial_height):
        self.last_width = int(initial_width)
        self.last_height = int(initial_height)
        self.last_crop_ratio = None
        self.last_changed_axis = "width"

    @staticmethod
    def fit_to_limits_by_ratio(width, height, ratio):
        width = max(1, int(round(width)))
        height = max(1, int(round(height)))

        if ratio <= 0:
            width = max(1, min(width, MAX_AI_WIDTH))
            height = max(1, min(height, MAX_AI_HEIGHT))
            return width, height

        if width > MAX_AI_WIDTH:
            width = MAX_AI_WIDTH
            height = int(round(width / ratio))

        if height > MAX_AI_HEIGHT:
            height = MAX_AI_HEIGHT
            width = int(round(height * ratio))

        width = max(1, min(width, MAX_AI_WIDTH))
        height = max(1, min(height, MAX_AI_HEIGHT))

        return width, height

    def sync_to_crop_ratio(self, crop_w, crop_h):
        current_width = cv2.getTrackbarPos("AI Width", RESIZE_WINDOW)
        current_height = cv2.getTrackbarPos("AI Height", RESIZE_WINDOW)

        current_width = max(1, int(current_width))
        current_height = max(1, int(current_height))

        if crop_w <= 0 or crop_h <= 0:
            self.last_width = current_width
            self.last_height = current_height
            return current_width, current_height, False

        crop_ratio = crop_w / crop_h

        if not LOCK_AI_RESIZE_TO_CROP_RATIO:
            self.last_width = current_width
            self.last_height = current_height
            self.last_crop_ratio = crop_ratio
            return current_width, current_height, False

        width_changed = current_width != self.last_width
        height_changed = current_height != self.last_height

        ratio_changed = (
            self.last_crop_ratio is None
            or abs(crop_ratio - self.last_crop_ratio) > 0.0001
        )

        final_width = current_width
        final_height = current_height

        if width_changed and not height_changed:
            self.last_changed_axis = "width"
            final_height = int(round(final_width / crop_ratio))

        elif height_changed and not width_changed:
            self.last_changed_axis = "height"
            final_width = int(round(final_height * crop_ratio))

        elif width_changed and height_changed:
            width_delta = abs(current_width - self.last_width)
            height_delta = abs(current_height - self.last_height)

            if width_delta >= height_delta:
                self.last_changed_axis = "width"
                final_height = int(round(final_width / crop_ratio))
            else:
                self.last_changed_axis = "height"
                final_width = int(round(final_height * crop_ratio))

        elif ratio_changed:
            self.last_changed_axis = "width"
            final_height = int(round(final_width / crop_ratio))

        else:
            if self.last_changed_axis == "height":
                final_width = int(round(final_height * crop_ratio))
            else:
                final_height = int(round(final_width / crop_ratio))

        final_width, final_height = self.fit_to_limits_by_ratio(
            final_width,
            final_height,
            crop_ratio,
        )

        if final_width != current_width:
            cv2.setTrackbarPos("AI Width", RESIZE_WINDOW, final_width)

        if final_height != current_height:
            cv2.setTrackbarPos("AI Height", RESIZE_WINDOW, final_height)

        self.last_width = final_width
        self.last_height = final_height
        self.last_crop_ratio = crop_ratio

        return final_width, final_height, True


def make_ai_frame(crop_frame, enable_resize, ai_width, ai_height):
    if crop_frame is None or crop_frame.size == 0:
        return None

    if not enable_resize:
        return crop_frame.copy()

    crop_h, crop_w = crop_frame.shape[:2]

    interpolation = (
        cv2.INTER_AREA
        if crop_w > ai_width or crop_h > ai_height
        else cv2.INTER_LINEAR
    )

    return cv2.resize(
        crop_frame,
        (int(ai_width), int(ai_height)),
        interpolation=interpolation,
    )


# ============================================================
# TK TOOLTIP
# ============================================================

class Tooltip:
    def __init__(self, widget, text):
        self.widget = widget
        self.text = text
        self.tip_window = None

        widget.bind("<Enter>", self.show)
        widget.bind("<Leave>", self.hide)
        widget.bind("<Button-1>", self.show)

    def show(self, _event=None):
        if self.tip_window is not None:
            return

        x = self.widget.winfo_rootx() + 18
        y = self.widget.winfo_rooty() + 18

        self.tip_window = tw = tk.Toplevel(self.widget)
        tw.wm_overrideredirect(True)
        tw.wm_geometry(f"+{x}+{y}")

        label = tk.Label(
            tw,
            text=self.text,
            justify="left",
            background="#111827",
            foreground="white",
            relief="solid",
            borderwidth=1,
            padx=8,
            pady=6,
            font=("Segoe UI", 9),
        )
        label.pack(ipadx=1)

    def hide(self, _event=None):
        if self.tip_window is not None:
            self.tip_window.destroy()
            self.tip_window = None


# ============================================================
# MAIN TK APP
# ============================================================

class CameraConfiguratorApp:
    def __init__(self, root):
        self.root = root
        self.root.title(APP_TITLE)
        self.root.geometry("850x650")
        self.is_closing = False
        self.root.protocol("WM_DELETE_WINDOW", self.on_app_close)

        self.config_data = load_existing_camera_config()

        existing_roi = self.config_data.get("SOURCE_DETECTION_CROP")
        if isinstance(existing_roi, list) and len(existing_roi) == 4:
            roi_state.roi = [int(v) for v in existing_roi]
            roi_state.visible = True
            roi_state.drawing_enabled = True

        self.source_width = None
        self.source_height = None
        self.crop_width = None
        self.crop_height = None
        self.final_width = None
        self.final_height = None

        self.enable_resize_var = tk.BooleanVar(
            value=bool(self.config_data.get("ENABLE_AI_RESIZE", True))
        )
        self.ai_width_var = tk.IntVar(
            value=int(self.config_data.get("AI_FRAME_WIDTH", DEFAULT_AI_WIDTH))
        )
        self.ai_height_var = tk.IntVar(
            value=int(self.config_data.get("AI_FRAME_HEIGHT", DEFAULT_AI_HEIGHT))
        )

        det_size = self.config_data.get("INSIGHTFACE_DET_SIZE", [928, 480])
        self.selected_det_size_var = tk.StringVar(
            value=f"{int(det_size[0])},{int(det_size[1])}"
        )

        self.status_var = tk.StringVar(value="Ready.")
        self.summary_var = tk.StringVar(value="-")
        self.det_info_var = tk.StringVar(value="-")

        self.build_ui()
        self.populate_det_size_options()
        self.update_summary()

    def build_ui(self):
        title = tk.Label(
            self.root,
            text="SmartChurch Camera Configuration",
            font=("Segoe UI", 18, "bold"),
            anchor="w",
        )
        title.pack(fill="x", padx=18, pady=(16, 4))

        subtitle = tk.Label(
            self.root,
            text="Configure CCTV crop area, optional AI resize, and InsightFace det_size.",
            font=("Segoe UI", 10),
            anchor="w",
            fg="#4B5563",
        )
        subtitle.pack(fill="x", padx=18, pady=(0, 14))

        button_frame = tk.Frame(self.root)
        button_frame.pack(fill="x", padx=18, pady=8)

        self.live_button = tk.Button(
            button_frame,
            text="⚙ Live Camera",
            bg="#FACC15",
            fg="#111827",
            activebackground="#EAB308",
            font=("Segoe UI", 11, "bold"),
            padx=18,
            pady=8,
            command=self.open_live_camera,
        )
        self.live_button.pack(side="left", padx=(0, 10))

        self.preview_button = tk.Button(
            button_frame,
            text="Preview Crop & Resize",
            bg="#2563EB",
            fg="white",
            activebackground="#1D4ED8",
            font=("Segoe UI", 11, "bold"),
            padx=18,
            pady=8,
            command=self.open_preview_crop_resize,
        )
        self.preview_button.pack(side="left", padx=(0, 10))

        self.save_button = tk.Button(
            button_frame,
            text="✓ Set Configuration",
            bg="#16A34A",
            fg="white",
            activebackground="#15803D",
            font=("Segoe UI", 11, "bold"),
            padx=18,
            pady=8,
            command=self.set_configuration,
        )
        self.save_button.pack(side="right")

        config_frame = ttk.LabelFrame(self.root, text="Resize Option")
        config_frame.pack(fill="x", padx=18, pady=10)

        resize_row = tk.Frame(config_frame)
        resize_row.pack(fill="x", padx=12, pady=10)

        resize_check = ttk.Checkbutton(
            resize_row,
            text="Aktifkan AI Resize",
            variable=self.enable_resize_var,
            command=self.update_summary,
        )
        resize_check.pack(side="left")

        info_label = tk.Label(
            resize_row,
            text="!",
            bg="#F59E0B",
            fg="white",
            width=2,
            font=("Segoe UI", 9, "bold"),
            cursor="hand2",
        )
        info_label.pack(side="left", padx=8)

        Tooltip(
            info_label,
            "Resize akan mengurangi resolusi kamera agar sistem lebih ringan.\n"
            "Namun jika terlalu kecil, detail wajah bisa berkurang.",
        )

        value_frame = tk.Frame(config_frame)
        value_frame.pack(fill="x", padx=12, pady=(0, 10))

        tk.Label(value_frame, text="AI Width:", font=("Segoe UI", 10, "bold")).grid(row=0, column=0, sticky="w")
        tk.Label(value_frame, textvariable=self.ai_width_var, font=("Segoe UI", 10)).grid(row=0, column=1, sticky="w", padx=(8, 20))

        tk.Label(value_frame, text="AI Height:", font=("Segoe UI", 10, "bold")).grid(row=0, column=2, sticky="w")
        tk.Label(value_frame, textvariable=self.ai_height_var, font=("Segoe UI", 10)).grid(row=0, column=3, sticky="w", padx=(8, 20))

        info_frame = ttk.LabelFrame(self.root, text="Current Configuration Preview")
        info_frame.pack(fill="both", expand=True, padx=18, pady=10)

        summary_label = tk.Label(
            info_frame,
            textvariable=self.summary_var,
            justify="left",
            anchor="nw",
            font=("Consolas", 10),
        )
        summary_label.pack(fill="both", expand=True, padx=12, pady=12)

        det_frame = ttk.LabelFrame(self.root, text="InsightFace DET_SIZE Suggestions")
        det_frame.pack(fill="x", padx=18, pady=10)

        self.det_options_frame = tk.Frame(det_frame)
        self.det_options_frame.pack(fill="x", padx=12, pady=8)

        status_bar = tk.Label(
            self.root,
            textvariable=self.status_var,
            anchor="w",
            bg="#111827",
            fg="white",
            padx=12,
            pady=6,
            font=("Segoe UI", 9),
        )
        status_bar.pack(fill="x", side="bottom")

    def update_status(self, text):
        self.status_var.set(text)
        self.root.update_idletasks()

    def ensure_source_size(self):
        if self.source_width and self.source_height:
            return True

        cap = None

        try:
            cap = open_rtsp_capture()

            for _ in range(80):
                ok, frame = cap.read()

                if ok and frame is not None:
                    h, w = frame.shape[:2]
                    self.source_width = int(w)
                    self.source_height = int(h)
                    roi_state.set_source_geometry(w, h)
                    return True

            messagebox.showerror("Error", "Gagal membaca frame dari RTSP.")
            return False

        except Exception as e:
            messagebox.showerror("Error", str(e))
            return False

        finally:
            if cap is not None:
                cap.release()

    def get_crop_size(self):
        if not roi_state.has_roi():
            return None, None

        if not self.ensure_source_size():
            return None, None

        roi = roi_state.get_roi()
        x1, y1, x2, y2 = roi

        return x2 - x1, y2 - y1

    def get_final_ai_size(self):
        crop_w, crop_h = self.get_crop_size()

        if crop_w is None or crop_h is None:
            return None, None

        if self.enable_resize_var.get():
            return int(self.ai_width_var.get()), int(self.ai_height_var.get())

        return crop_w, crop_h

    def update_summary(self):
        crop_w, crop_h = self.get_crop_size() if roi_state.has_roi() else (None, None)
        final_w, final_h = self.get_final_ai_size() if roi_state.has_roi() else (None, None)

        lines = []

        lines.append(f"BACKEND_ROOT               = {BACKEND_ROOT}")
        lines.append(f"CONFIG_OUTPUT_JSON         = {CONFIG_JSON_PATH}")
        lines.append("")

        if self.source_width and self.source_height:
            lines.append(f"SOURCE_FRAME_SIZE          = {self.source_width}x{self.source_height}")
            lines.append(f"SOURCE_FRAME_RATIO         = {format_ratio(self.source_width, self.source_height)}")
        else:
            lines.append("SOURCE_FRAME_SIZE          = belum dibaca")

        if roi_state.has_roi():
            x1, y1, x2, y2 = roi_state.get_roi()
            lines.append(f"SOURCE_DETECTION_CROP      = ({x1}, {y1}, {x2}, {y2})")
            lines.append(f"CROP_SIZE                  = {crop_w}x{crop_h}")
            lines.append(f"CROP_RATIO                 = {format_ratio(crop_w, crop_h)}")
            lines.append(f"CROP_PIXELS                = {format_pixels(crop_w, crop_h)} px")
        else:
            lines.append("SOURCE_DETECTION_CROP      = belum dibuat")

        lines.append("")
        lines.append(f"ENABLE_AI_RESIZE           = {bool(self.enable_resize_var.get())}")

        if final_w and final_h:
            lines.append(f"AI_FRAME_SIZE              = {final_w}x{final_h}")
            lines.append(f"AI_FRAME_RATIO             = {format_ratio(final_w, final_h)}")
            lines.append(f"AI_FRAME_PIXELS            = {format_pixels(final_w, final_h)} px")
        else:
            lines.append("AI_FRAME_SIZE              = belum tersedia")

        selected = self.selected_det_size_var.get()
        if selected:
            det_w, det_h = selected.split(",")
            lines.append(f"INSIGHTFACE_DET_SIZE       = ({det_w}, {det_h})")
        else:
            lines.append("INSIGHTFACE_DET_SIZE       = belum dipilih")

        self.summary_var.set("\n".join(lines))

    def populate_det_size_options(self):
        for child in self.det_options_frame.winfo_children():
            child.destroy()

        final_w, final_h = self.get_final_ai_size() if roi_state.has_roi() else (
            int(self.ai_width_var.get()),
            int(self.ai_height_var.get()),
        )

        if final_w is None or final_h is None:
            final_w = int(self.ai_width_var.get())
            final_h = int(self.ai_height_var.get())

        suggestions = build_det_size_suggestions(final_w, final_h)

        if not suggestions:
            tk.Label(
                self.det_options_frame,
                text="Belum ada suggestion. Buat ROI dulu.",
                anchor="w",
            ).pack(fill="x")
            return

        values = []

        for index, item in enumerate(suggestions, start=1):
            width = item["width"]
            height = item["height"]
            value = f"{width},{height}"
            values.append(value)

            text = (
                f"{index}. ({width}, {height}) | "
                f"ratio error {item['ratio_error_pct']:.2f}% | "
                f"pixels {format_pixels(width, height)} | "
                f"area vs AI {item['area_vs_ai_pct']:.2f}%"
            )

            rb = ttk.Radiobutton(
                self.det_options_frame,
                text=text,
                variable=self.selected_det_size_var,
                value=value,
                command=self.update_summary,
            )
            rb.pack(anchor="w", pady=2)

        if self.selected_det_size_var.get() not in values:
            self.selected_det_size_var.set(values[0])

        self.update_summary()

    def open_live_camera(self):
        cap = None

        try:
            self.update_status("Opening live camera...")
            cap = open_rtsp_capture()

            cv2.namedWindow(LIVE_WINDOW, cv2.WINDOW_NORMAL)
            cv2.resizeWindow(LIVE_WINDOW, MAIN_DISPLAY_MAX_WIDTH, MAIN_DISPLAY_MAX_HEIGHT)
            cv2.setMouseCallback(LIVE_WINDOW, mouse_callback)

            roi_state.drawing_enabled = True
            roi_state.visible = True

            self.update_status("Live camera opened. Draw ROI, then close window to save ROI to main window.")

            while True:
                ok, frame = cap.read()

                if not ok or frame is None:
                    continue

                original_h, original_w = frame.shape[:2]

                self.source_width = int(original_w)
                self.source_height = int(original_h)

                roi_state.set_source_geometry(original_w, original_h)

                display = make_main_display(frame)
                show_window_exact(LIVE_WINDOW, display)

                key = cv2.waitKey(1) & 0xFF

                if key == ord("r"):
                    roi_state.roi = None
                    roi_state.visible = True
                    roi_state.drawing_enabled = True

                if key == ord("q") or key == 27:
                    break

                if is_window_closed(LIVE_WINDOW):
                    break

            roi_state.save_normalized_roi()
            self.populate_det_size_options()
            self.update_summary()
            self.update_status("ROI saved to main window.")

        except Exception as e:
            messagebox.showerror("Error", str(e))
            self.update_status("Failed to open live camera.")

        finally:
            if cap is not None:
                cap.release()

            try:
                cv2.destroyWindow(LIVE_WINDOW)
            except Exception:
                pass

    def open_preview_crop_resize(self):
        if not roi_state.has_roi():
            messagebox.showwarning("ROI belum ada", "Buat area crop dulu melalui Live Camera.")
            return

        cap = None

        try:
            self.update_status("Opening crop and resize preview...")
            cap = open_rtsp_capture()

            cv2.namedWindow(CROP_WINDOW, cv2.WINDOW_NORMAL)
            cv2.namedWindow(RESIZE_WINDOW, cv2.WINDOW_NORMAL)

            cv2.resizeWindow(CROP_WINDOW, CROP_DISPLAY_MAX_WIDTH, CROP_DISPLAY_MAX_HEIGHT)
            cv2.resizeWindow(RESIZE_WINDOW, RESIZE_DISPLAY_MAX_WIDTH, RESIZE_DISPLAY_MAX_HEIGHT)

            cv2.createTrackbar(
                "AI Width",
                RESIZE_WINDOW,
                int(self.ai_width_var.get()),
                MAX_AI_WIDTH,
                nothing,
            )

            cv2.createTrackbar(
                "AI Height",
                RESIZE_WINDOW,
                int(self.ai_height_var.get()),
                MAX_AI_HEIGHT,
                nothing,
            )

            resize_state = ResizeState(
                initial_width=int(self.ai_width_var.get()),
                initial_height=int(self.ai_height_var.get()),
            )

            final_w = int(self.ai_width_var.get())
            final_h = int(self.ai_height_var.get())

            self.update_status("Preview opened. Close AI Resize Preview window to save resize value.")

            while True:
                ok, frame = cap.read()

                if not ok or frame is None:
                    continue

                original_h, original_w = frame.shape[:2]
                self.source_width = int(original_w)
                self.source_height = int(original_h)

                roi_state.set_source_geometry(original_w, original_h)
                crop_frame = crop_source_frame(frame)

                if crop_frame is None or crop_frame.size == 0:
                    continue

                crop_h, crop_w = crop_frame.shape[:2]
                self.crop_width = int(crop_w)
                self.crop_height = int(crop_h)

                if not is_window_closed(CROP_WINDOW):
                    crop_preview = resize_keep_aspect(
                        crop_frame,
                        CROP_DISPLAY_MAX_WIDTH,
                        CROP_DISPLAY_MAX_HEIGHT,
                    )

                    crop_preview = add_preview_overlay(
                        crop_preview,
                        [
                            f"CROP FROM SOURCE: {crop_w}x{crop_h}",
                            f"ratio={format_ratio(crop_w, crop_h)} | pixels={format_pixels(crop_w, crop_h)}",
                        ],
                    )

                    show_window_exact(CROP_WINDOW, crop_preview)

                if is_window_closed(RESIZE_WINDOW):
                    break

                enable_resize = bool(self.enable_resize_var.get())

                if enable_resize:
                    final_w, final_h, ratio_locked = resize_state.sync_to_crop_ratio(crop_w, crop_h)
                else:
                    final_w, final_h = crop_w, crop_h
                    ratio_locked = False

                ai_frame = make_ai_frame(
                    crop_frame,
                    enable_resize,
                    final_w,
                    final_h,
                )

                det_suggestions = build_det_size_suggestions(final_w, final_h)
                recommended_det = det_suggestions[0] if det_suggestions else None

                ai_preview = resize_keep_aspect(
                    ai_frame,
                    RESIZE_DISPLAY_MAX_WIDTH,
                    RESIZE_DISPLAY_MAX_HEIGHT,
                )

                resize_status = "ON" if enable_resize else "OFF"
                ratio_lock_status = "ON" if ratio_locked else "OFF"

                overlay_lines = [
                    f"AI RESIZE: {resize_status}",
                    f"RATIO LOCK TO CROP: {ratio_lock_status}",
                    f"AI FRAME: {final_w}x{final_h}",
                    f"ratio={format_ratio(final_w, final_h)} | pixels={format_pixels(final_w, final_h)}",
                ]

                if recommended_det:
                    overlay_lines.append(
                        f"SUGGESTED DET_SIZE: ({recommended_det['width']}, {recommended_det['height']})"
                    )

                ai_preview = add_preview_overlay(ai_preview, overlay_lines)
                show_window_exact(RESIZE_WINDOW, ai_preview)

                key = cv2.waitKey(1) & 0xFF

                if key == ord("q") or key == 27:
                    break

            self.final_width = int(final_w)
            self.final_height = int(final_h)

            if self.enable_resize_var.get():
                self.ai_width_var.set(int(final_w))
                self.ai_height_var.set(int(final_h))
            else:
                self.ai_width_var.set(int(crop_w))
                self.ai_height_var.set(int(crop_h))

            self.populate_det_size_options()
            self.update_summary()
            self.update_status("Resize value saved to main window.")

        except Exception as e:
            messagebox.showerror("Error", str(e))
            self.update_status("Failed to open preview.")

        finally:
            if cap is not None:
                cap.release()

            for window_name in [CROP_WINDOW, RESIZE_WINDOW]:
                try:
                    cv2.destroyWindow(window_name)
                except Exception:
                    pass

    def collect_config_payload(self):
        if not roi_state.has_roi():
            raise ValueError("SOURCE_DETECTION_CROP belum dibuat.")

        if not self.ensure_source_size():
            raise ValueError("Source frame size belum tersedia.")

        x1, y1, x2, y2 = roi_state.get_roi()

        crop_w = x2 - x1
        crop_h = y2 - y1

        enable_resize = bool(self.enable_resize_var.get())

        if enable_resize:
            final_w = int(self.ai_width_var.get())
            final_h = int(self.ai_height_var.get())
        else:
            final_w = crop_w
            final_h = crop_h

        self.populate_det_size_options()

        selected = self.selected_det_size_var.get()

        if not selected:
            raise ValueError("INSIGHTFACE_DET_SIZE belum dipilih.")

        det_w, det_h = [int(v) for v in selected.split(",")]

        payload = {
            "updated_at": datetime.now().isoformat(timespec="seconds"),
            "updated_by": "SmartChurchCameraConfigurator",

            "SOURCE_FRAME_WIDTH": int(self.source_width),
            "SOURCE_FRAME_HEIGHT": int(self.source_height),

            "ENABLE_SOURCE_CROP": True,
            "SOURCE_DETECTION_CROP": [int(x1), int(y1), int(x2), int(y2)],

            "CROP_WIDTH": int(crop_w),
            "CROP_HEIGHT": int(crop_h),

            "ENABLE_AI_RESIZE": bool(enable_resize),
            "AI_FRAME_WIDTH": int(final_w),
            "AI_FRAME_HEIGHT": int(final_h),

            "INSIGHTFACE_DET_SIZE": [int(det_w), int(det_h)],

            "LOCK_AI_RESIZE_TO_CROP_RATIO": bool(LOCK_AI_RESIZE_TO_CROP_RATIO),
        }

        return payload

    def save_configuration_to_disk(self):
        """
        Mengumpulkan konfigurasi lalu menyimpannya secara atomic.

        Return:
            payload konfigurasi yang disimpan.
        """
        payload = self.collect_config_payload()

        CONFIG_JSON_PATH.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        temporary_path = CONFIG_JSON_PATH.with_suffix(
            ".json.tmp"
        )

        temporary_path.write_text(
            json.dumps(payload, indent=2),
            encoding="utf-8",
        )

        temporary_path.replace(CONFIG_JSON_PATH)

        self.config_data = payload
        self.update_summary()

        return payload

    def set_configuration(self):
        """
        Dipanggil oleh tombol Set Configuration.
        """
        try:
            self.save_configuration_to_disk()

            self.update_status(
                f"Configuration saved to {CONFIG_JSON_PATH}"
            )

            messagebox.showinfo(
                "Configuration Saved",
                "Camera configuration berhasil disimpan.\n\n"
                f"File:\n{CONFIG_JSON_PATH}\n\n"
                "Setelah aplikasi ditutup, backend akan "
                "memuat ulang konfigurasi.",
            )

        except Exception as exc:
            messagebox.showerror("Error", str(exc))
            self.update_status(
                "Failed to save configuration."
            )

    def on_app_close(self):
        """
        Dipanggil ketika tombol X pada jendela utama ditekan.

        Jika konfigurasi valid:
        - simpan JSON
        - tutup OpenCV windows
        - tutup Tkinter
        - process EXE selesai dengan exit code 0

        Watcher Django kemudian akan melakukan reload.
        """
        if self.is_closing:
            return

        try:
            self.save_configuration_to_disk()

            self.update_status(
                "Configuration saved. Closing application..."
            )

        except Exception as exc:
            close_without_saving = messagebox.askyesno(
                "Close Without Saving?",
                "Konfigurasi tidak dapat disimpan.\n\n"
                f"Error:\n{exc}\n\n"
                "Tetap tutup aplikasi tanpa menyimpan?",
            )

            if not close_without_saving:
                return

        self.is_closing = True

        try:
            cv2.destroyAllWindows()
        except Exception:
            pass

        try:
            self.root.quit()
        except Exception:
            pass

        try:
            self.root.destroy()
        except Exception:
            pass

def main():
    root = tk.Tk()
    app = CameraConfiguratorApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()