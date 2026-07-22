#smartchurch_backend\cv_attendance\rtsp_fps_tester.py

"""
RTSP FPS Tester - SmartChurch CCTV

Tujuan:
1. Mengecek apakah RTSP CCTV benar-benar mengirim berapa FPS.
2. Mengecek ukuran frame asli dari CCTV.
3. Mengecek jumlah frame yang berhasil dibaca selama durasi test.
4. Mengecek read latency OpenCV/FFMPEG.
5. Mengecek apakah ada frame duplicate secara kasar.
6. Membantu menentukan strategi frame skipping / AI FPS limiter.

Cara run:
    cd smartchurch_backend
    python -m cv_attendance.rtsp_fps_tester

Opsional:
    python -m cv_attendance.rtsp_fps_tester --duration 30
    python -m cv_attendance.rtsp_fps_tester --display
    python -m cv_attendance.rtsp_fps_tester --save-sample
    python -m cv_attendance.rtsp_fps_tester --url "rtsp://user:pass@ip:554/Streaming/Channels/101"
"""

import argparse
import os
import sys
import time
import json
import statistics
from pathlib import Path
from datetime import datetime

import cv2
import numpy as np


# ============================================================
# PATH SETUP
# ============================================================

CURRENT_FILE = Path(__file__).resolve()
CV_ATTENDANCE_DIR = CURRENT_FILE.parent
BACKEND_ROOT = CV_ATTENDANCE_DIR.parent

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


# ============================================================
# ENV LOADER
# ============================================================

def load_dotenv_simple(env_path: Path):
    """
    Loader .env sederhana supaya RTSP_URL bisa terbaca saat script
    dijalankan langsung, tanpa Django runserver.
    """
    if not env_path.exists():
        return

    try:
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()

            if not line or line.startswith("#"):
                continue

            if "=" not in line:
                continue

            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")

            if key and key not in os.environ:
                os.environ[key] = value

    except Exception as exc:
        print(f"[WARN] Gagal membaca .env: {exc}")


load_dotenv_simple(BACKEND_ROOT / ".env")


# ============================================================
# HELPERS
# ============================================================

def safe_url(rtsp_url: str) -> str:
    """
    Mask password supaya tidak bocor di terminal.
    """
    if not rtsp_url:
        return ""

    if "://" not in rtsp_url or "@" not in rtsp_url:
        return rtsp_url

    prefix, rest = rtsp_url.split("://", 1)

    if "@" not in rest:
        return rtsp_url

    credentials, host_path = rest.split("@", 1)

    if ":" in credentials:
        username = credentials.split(":", 1)[0]
        return f"{prefix}://{username}:***@{host_path}"

    return f"{prefix}://***@{host_path}"


def fourcc_to_string(value):
    try:
        value = int(value)
        return "".join([chr((value >> 8 * i) & 0xFF) for i in range(4)])
    except Exception:
        return "unknown"


def frame_hash_small(frame: np.ndarray) -> int:
    """
    Hash kasar frame untuk mengecek duplicate.
    Supaya ringan, frame diperkecil dulu.
    """
    try:
        small = cv2.resize(frame, (64, 18), interpolation=cv2.INTER_AREA)
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        return hash(gray.tobytes())
    except Exception:
        return 0


def percentile(values, pct):
    if not values:
        return 0.0

    values_sorted = sorted(values)
    index = int(round((pct / 100) * (len(values_sorted) - 1)))
    index = max(0, min(index, len(values_sorted) - 1))

    return values_sorted[index]


def mb(value_bytes):
    return value_bytes / (1024 * 1024)


def ensure_dir(path: Path):
    path.mkdir(parents=True, exist_ok=True)
    return path


# ============================================================
# RTSP OPEN
# ============================================================

def open_rtsp(rtsp_url: str):
    """
    Menggunakan OpenCV + FFMPEG seperti pipeline utama.
    """
    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
        "rtsp_transport;tcp|"
        "stimeout;5000000|"
        "max_delay;500000"
    )

    cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    return cap


# ============================================================
# MAIN TEST
# ============================================================

def run_rtsp_test(
    rtsp_url: str,
    duration: float = 20.0,
    warmup: float = 2.0,
    display: bool = False,
    save_sample: bool = False,
    output_dir: Path | None = None,
):
    print("=" * 72)
    print("SmartChurch RTSP FPS Tester")
    print("=" * 72)
    print(f"Backend root : {BACKEND_ROOT}")
    print(f"RTSP URL     : {safe_url(rtsp_url)}")
    print(f"Duration     : {duration:.1f} seconds")
    print(f"Warmup       : {warmup:.1f} seconds")
    print(f"Display      : {display}")
    print(f"Save sample  : {save_sample}")
    print("=" * 72)

    cap = open_rtsp(rtsp_url)

    if not cap.isOpened():
        print("[ERROR] Gagal membuka RTSP stream.")
        print("Cek IP CCTV, username, password, channel, dan jaringan LAN.")
        return None

    reported_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    reported_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    reported_fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    reported_fourcc = fourcc_to_string(cap.get(cv2.CAP_PROP_FOURCC))

    print("[INFO] RTSP berhasil dibuka.")
    print(f"[INFO] CAP_PROP_FRAME_WIDTH  : {reported_width}")
    print(f"[INFO] CAP_PROP_FRAME_HEIGHT : {reported_height}")
    print(f"[INFO] CAP_PROP_FPS          : {reported_fps:.2f}")
    print(f"[INFO] CAP_PROP_FOURCC       : {reported_fourcc}")
    print("=" * 72)

    # ------------------------------------------------------------
    # Warmup
    # ------------------------------------------------------------
    print(f"[INFO] Warmup {warmup:.1f} detik...")

    warmup_end = time.perf_counter() + warmup

    while time.perf_counter() < warmup_end:
        ok, _ = cap.read()

        if not ok:
            time.sleep(0.02)

    print("[INFO] Warmup selesai.")
    print("=" * 72)

    # ------------------------------------------------------------
    # Measurement
    # ------------------------------------------------------------
    start_perf = time.perf_counter()
    end_perf = start_perf + duration

    total_reads = 0
    successful_frames = 0
    failed_reads = 0

    first_frame_shape = None
    last_success_time = None
    inter_frame_gaps_ms = []
    read_times_ms = []
    frame_hashes = []
    per_second_counts = {}

    sample_saved = False
    sample_path = None

    print("[INFO] Mulai test membaca frame...")
    print("[INFO] Tekan Q pada window display untuk stop lebih awal.")
    print("=" * 72)

    while time.perf_counter() < end_perf:
        read_start = time.perf_counter()
        ok, frame = cap.read()
        read_end = time.perf_counter()

        total_reads += 1
        read_ms = (read_end - read_start) * 1000.0
        read_times_ms.append(read_ms)

        now_perf = time.perf_counter()
        elapsed = now_perf - start_perf
        second_index = int(elapsed)

        if ok and frame is not None:
            successful_frames += 1
            per_second_counts[second_index] = per_second_counts.get(second_index, 0) + 1

            if first_frame_shape is None:
                first_frame_shape = frame.shape

            if last_success_time is not None:
                gap_ms = (now_perf - last_success_time) * 1000.0
                inter_frame_gaps_ms.append(gap_ms)

            last_success_time = now_perf

            frame_hashes.append(frame_hash_small(frame))

            if save_sample and not sample_saved:
                if output_dir is None:
                    output_dir = BACKEND_ROOT / "runtime_data" / "rtsp_tests"

                ensure_dir(output_dir)

                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                sample_path = output_dir / f"rtsp_sample_{timestamp}.jpg"

                cv2.imwrite(str(sample_path), frame)
                sample_saved = True

            if display:
                preview = frame

                h, w = preview.shape[:2]
                max_w = 1280

                if w > max_w:
                    scale = max_w / float(w)
                    preview = cv2.resize(
                        preview,
                        (int(w * scale), int(h * scale)),
                        interpolation=cv2.INTER_AREA,
                    )

                cv2.putText(
                    preview,
                    f"RTSP TEST | frame={successful_frames} | elapsed={elapsed:.1f}s",
                    (20, 35),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.8,
                    (0, 255, 0),
                    2,
                    cv2.LINE_AA,
                )

                cv2.imshow("SmartChurch RTSP FPS Tester", preview)

                key = cv2.waitKey(1) & 0xFF

                if key in (ord("q"), ord("Q"), 27):
                    print("[INFO] Test dihentikan manual oleh user.")
                    break

        else:
            failed_reads += 1
            time.sleep(0.01)

    total_duration = time.perf_counter() - start_perf

    cap.release()

    if display:
        try:
            cv2.destroyWindow("SmartChurch RTSP FPS Tester")
            cv2.waitKey(1)
        except Exception:
            pass

    # ------------------------------------------------------------
    # Analysis
    # ------------------------------------------------------------
    actual_fps = successful_frames / total_duration if total_duration > 0 else 0.0

    unique_hash_count = len(set(frame_hashes))
    duplicate_estimate = max(0, successful_frames - unique_hash_count)
    duplicate_ratio = (
        duplicate_estimate / successful_frames
        if successful_frames > 0
        else 0.0
    )

    if first_frame_shape:
        frame_h, frame_w = first_frame_shape[:2]
        channels = first_frame_shape[2] if len(first_frame_shape) >= 3 else 1
    else:
        frame_h, frame_w, channels = 0, 0, 0

    raw_frame_bytes = frame_w * frame_h * channels
    raw_frame_mb = mb(raw_frame_bytes)
    raw_throughput_mb_s = raw_frame_mb * actual_fps

    read_avg = statistics.mean(read_times_ms) if read_times_ms else 0.0
    read_min = min(read_times_ms) if read_times_ms else 0.0
    read_max = max(read_times_ms) if read_times_ms else 0.0
    read_p95 = percentile(read_times_ms, 95)

    gap_avg = statistics.mean(inter_frame_gaps_ms) if inter_frame_gaps_ms else 0.0
    gap_min = min(inter_frame_gaps_ms) if inter_frame_gaps_ms else 0.0
    gap_max = max(inter_frame_gaps_ms) if inter_frame_gaps_ms else 0.0
    gap_p95 = percentile(inter_frame_gaps_ms, 95)

    per_second_fps = [
        {
            "second": sec,
            "frames": count,
        }
        for sec, count in sorted(per_second_counts.items())
    ]

    result = {
        "tested_at": datetime.now().isoformat(timespec="seconds"),
        "rtsp_url_safe": safe_url(rtsp_url),
        "duration_seconds": round(total_duration, 3),
        "reported": {
            "width": reported_width,
            "height": reported_height,
            "fps": round(reported_fps, 3),
            "fourcc": reported_fourcc,
        },
        "actual": {
            "successful_frames": successful_frames,
            "failed_reads": failed_reads,
            "total_reads": total_reads,
            "actual_fps": round(actual_fps, 3),
            "frame_width": frame_w,
            "frame_height": frame_h,
            "channels": channels,
            "raw_frame_mb": round(raw_frame_mb, 3),
            "raw_throughput_mb_s": round(raw_throughput_mb_s, 3),
        },
        "latency_ms": {
            "read_avg": round(read_avg, 3),
            "read_min": round(read_min, 3),
            "read_max": round(read_max, 3),
            "read_p95": round(read_p95, 3),
            "inter_frame_gap_avg": round(gap_avg, 3),
            "inter_frame_gap_min": round(gap_min, 3),
            "inter_frame_gap_max": round(gap_max, 3),
            "inter_frame_gap_p95": round(gap_p95, 3),
        },
        "duplicate_estimate": {
            "unique_hash_count": unique_hash_count,
            "duplicate_estimate": duplicate_estimate,
            "duplicate_ratio": round(duplicate_ratio, 4),
        },
        "per_second_fps": per_second_fps,
        "sample_path": str(sample_path) if sample_path else None,
    }

    # ------------------------------------------------------------
    # Save JSON report
    # ------------------------------------------------------------
    if output_dir is None:
        output_dir = BACKEND_ROOT / "runtime_data" / "rtsp_tests"

    ensure_dir(output_dir)

    report_name = f"rtsp_test_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    report_path = output_dir / report_name

    report_path.write_text(
        json.dumps(result, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    # ------------------------------------------------------------
    # Print Summary
    # ------------------------------------------------------------
    print("=" * 72)
    print("HASIL RTSP TEST")
    print("=" * 72)
    print(f"Durasi real test        : {total_duration:.2f} detik")
    print(f"Frame berhasil dibaca   : {successful_frames}")
    print(f"Read gagal              : {failed_reads}")
    print(f"Actual decoded FPS      : {actual_fps:.2f} FPS")
    print(f"Reported camera FPS     : {reported_fps:.2f} FPS")
    print("-" * 72)
    print(f"Resolusi actual frame   : {frame_w} x {frame_h}")
    print(f"Channel warna           : {channels}")
    print(f"Raw size per frame      : {raw_frame_mb:.2f} MB")
    print(f"Raw throughput approx   : {raw_throughput_mb_s:.2f} MB/s")
    print("-" * 72)
    print(f"Read latency avg        : {read_avg:.2f} ms")
    print(f"Read latency p95        : {read_p95:.2f} ms")
    print(f"Read latency min/max    : {read_min:.2f} / {read_max:.2f} ms")
    print("-" * 72)
    print(f"Inter-frame gap avg     : {gap_avg:.2f} ms")
    print(f"Inter-frame gap p95     : {gap_p95:.2f} ms")
    print(f"Inter-frame gap min/max : {gap_min:.2f} / {gap_max:.2f} ms")
    print("-" * 72)
    print(f"Unique frame estimate   : {unique_hash_count}")
    print(f"Duplicate estimate      : {duplicate_estimate}")
    print(f"Duplicate ratio         : {duplicate_ratio * 100:.2f}%")
    print("-" * 72)
    print("FPS per detik:")
    for row in per_second_fps:
        print(f"  detik {row['second']:02d}: {row['frames']} frame")

    print("-" * 72)
    print(f"JSON report             : {report_path}")

    if sample_path:
        print(f"Sample frame            : {sample_path}")

    print("=" * 72)

    # ------------------------------------------------------------
    # Recommendation
    # ------------------------------------------------------------
    print("REKOMENDASI AWAL")
    print("=" * 72)

    if actual_fps <= 0:
        print("❌ Stream tidak stabil. Tidak ada frame valid yang berhasil dibaca.")
    elif actual_fps <= 3:
        print("⚠️ FPS rendah. Jangan pakai frame skipping kasar.")
        print("   Gunakan process-only-new-frame dan AI_TARGET_FPS mengikuti actual FPS.")
    elif actual_fps <= 6.5:
        print("✅ FPS sekitar 6. Ini cocok dengan konfigurasi CCTV kamu.")
        print("   Strategi terbaik: process only new frame + AI_TARGET_FPS 5.")
    elif actual_fps <= 12:
        print("✅ FPS sedang. Bisa pakai AI_TARGET_FPS 5 atau 6.")
        print("   Tidak perlu proses semua frame.")
    else:
        print("⚠️ FPS tinggi. Wajib pakai AI FPS limiter.")
        print("   Rekomendasi awal: AI_TARGET_FPS 5 untuk attendance.")

    if frame_w >= 3000:
        print("⚠️ Resolusi sangat besar.")
        print("   Tetap gunakan crop area penting + resize ke 640x360 sebelum AI.")

    if raw_throughput_mb_s >= 100:
        print("⚠️ Raw frame movement besar.")
        print("   Hindari copy frame berulang dan jangan proses frame yang sama 2x.")

    if duplicate_ratio > 0.20:
        print("⚠️ Banyak frame duplicate terdeteksi.")
        print("   Frame_id wajib dipakai agar AI tidak memproses frame yang sama.")

    print("=" * 72)

    return result


# ============================================================
# CLI
# ============================================================

def parse_args():
    parser = argparse.ArgumentParser(
        description="SmartChurch RTSP FPS Tester"
    )

    parser.add_argument(
        "--url",
        type=str,
        default=None,
        help="RTSP URL manual. Kalau kosong, pakai RTSP_URL dari .env/config.",
    )

    parser.add_argument(
        "--duration",
        type=float,
        default=20.0,
        help="Durasi test dalam detik. Default: 20.",
    )

    parser.add_argument(
        "--warmup",
        type=float,
        default=2.0,
        help="Durasi warmup sebelum pengukuran. Default: 2.",
    )

    parser.add_argument(
        "--display",
        action="store_true",
        help="Tampilkan preview frame saat testing.",
    )

    parser.add_argument(
        "--save-sample",
        action="store_true",
        help="Simpan 1 sample frame asli dari RTSP.",
    )

    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Folder output JSON/sample. Default: runtime_data/rtsp_tests.",
    )

    return parser.parse_args()


def get_default_rtsp_url():
    """
    Prioritas:
    1. --url dari CLI
    2. RTSP_URL dari environment/.env
    3. RTSP_URL dari cv_attendance.config
    """
    env_url = os.getenv("RTSP_URL")

    if env_url:
        return env_url

    try:
        from cv_attendance.config import RTSP_URL
        return RTSP_URL
    except Exception:
        return None


def main():
    args = parse_args()

    rtsp_url = args.url or get_default_rtsp_url()

    if not rtsp_url:
        print("[ERROR] RTSP_URL tidak ditemukan.")
        print("Solusi:")
        print("1. Pastikan .env di smartchurch_backend berisi RTSP_URL=...")
        print("2. Atau run dengan:")
        print('   python -m cv_attendance.rtsp_fps_tester --url "rtsp://user:pass@ip:554/Streaming/Channels/101"')
        sys.exit(1)

    output_dir = Path(args.output_dir).resolve() if args.output_dir else None

    result = run_rtsp_test(
        rtsp_url=rtsp_url,
        duration=args.duration,
        warmup=args.warmup,
        display=args.display,
        save_sample=args.save_sample,
        output_dir=output_dir,
    )

    if result is None:
        sys.exit(2)


if __name__ == "__main__":
    main()