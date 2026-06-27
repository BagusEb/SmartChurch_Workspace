import json
import os
import subprocess
import threading
from datetime import datetime
from pathlib import Path

from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from cv_attendance.cv_engine import SessionManager
from cv_attendance.cv_engine_enroll import RegistrationSessionManager


BACKEND_ROOT = Path(settings.BASE_DIR)

CAMERA_CONFIG_EXE_PATH = (
    BACKEND_ROOT
    / "config_cam"
    / "dist"
    / "SmartChurchCameraConfigurator"
    / "SmartChurchCameraConfigurator.exe"
)

RUNTIME_CAMERA_DIR = (
    BACKEND_ROOT
    / "runtime_data"
    / "camera"
)

CAMERA_RUNTIME_CONFIG_PATH = (
    RUNTIME_CAMERA_DIR
    / "camera_runtime_config.json"
)

CONFIG_PY_PATH = (
    BACKEND_ROOT
    / "cv_attendance"
    / "config.py"
)

# State ini disimpan ke file agar tetap tersedia setelah Django autoreload.
CAMERA_CONFIG_STATE_PATH = (
    RUNTIME_CAMERA_DIR
    / "camera_configurator_state.json"
)


def _now_iso():
    return datetime.now().isoformat(timespec="seconds")


def _default_camera_config_state():
    return {
        "is_running": False,
        "process_id": None,
        "last_started_at": None,
        "last_finished_at": None,
        "last_exit_code": None,
        "config_changed": False,
        "reload_triggered": False,
        "message": "Camera configurator has not been opened yet.",
    }


def _load_persistent_state():
    default_state = _default_camera_config_state()

    if not CAMERA_CONFIG_STATE_PATH.exists():
        return default_state

    try:
        data = json.loads(
            CAMERA_CONFIG_STATE_PATH.read_text(encoding="utf-8")
        )

        if isinstance(data, dict):
            default_state.update(data)

    except Exception:
        pass

    return default_state


_camera_config_lock = threading.RLock()
_camera_config_process = None
_camera_config_state = _load_persistent_state()


def _write_state_to_file(state_snapshot):
    """
    Menyimpan state secara atomic agar tidak menghasilkan JSON setengah jadi.
    """
    try:
        CAMERA_CONFIG_STATE_PATH.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        temporary_path = CAMERA_CONFIG_STATE_PATH.with_suffix(".json.tmp")

        temporary_path.write_text(
            json.dumps(state_snapshot, indent=2),
            encoding="utf-8",
        )

        temporary_path.replace(CAMERA_CONFIG_STATE_PATH)

    except Exception:
        # Kegagalan menyimpan state tidak boleh menjatuhkan API.
        pass


def _update_camera_config_state(**updates):
    with _camera_config_lock:
        _camera_config_state.update(updates)
        snapshot = dict(_camera_config_state)

    _write_state_to_file(snapshot)
    return snapshot


def _get_camera_config_state():
    with _camera_config_lock:
        return dict(_camera_config_state)


def _get_file_mtime_ns(path):
    try:
        return path.stat().st_mtime_ns
    except OSError:
        return None


def _touch_config_py_for_django_reload():
    """
    Trigger Django development server autoreload.

    Ini bekerja ketika backend dijalankan dengan:
        python manage.py runserver

    Isi config.py tidak diubah. Hanya modification timestamp-nya.
    """
    if not CONFIG_PY_PATH.exists():
        return False

    os.utime(CONFIG_PY_PATH, None)
    return True


def _watch_camera_config_process(process, config_mtime_before):
    """
    Menunggu EXE ditutup.

    Setelah EXE selesai:
    1. Periksa apakah camera_runtime_config.json berubah.
    2. Simpan state ke disk.
    3. Trigger Django autoreload jika konfigurasi berubah.
    """
    global _camera_config_process

    exit_code = process.wait()
    config_mtime_after = _get_file_mtime_ns(
        CAMERA_RUNTIME_CONFIG_PATH
    )

    config_changed = (
        config_mtime_after is not None
        and config_mtime_after != config_mtime_before
    )

    reload_triggered = (
        exit_code == 0
        and config_changed
        and CONFIG_PY_PATH.exists()
    )

    with _camera_config_lock:
        _camera_config_process = None

    if exit_code != 0:
        message = (
            "Camera configurator ditutup dengan "
            f"exit code {exit_code}."
        )

    elif config_changed:
        message = (
            "Camera configurator ditutup. "
            "Konfigurasi berhasil disimpan."
        )

        if reload_triggered:
            message += " Django reload sedang dijalankan."

    else:
        message = (
            "Camera configurator ditutup tanpa perubahan konfigurasi. "
            "Backend tidak perlu di-reload."
        )

    _update_camera_config_state(
        is_running=False,
        process_id=None,
        last_finished_at=_now_iso(),
        last_exit_code=exit_code,
        config_changed=config_changed,
        reload_triggered=reload_triggered,
        message=message,
    )

    # Harus dilakukan setelah state disimpan karena proses Django akan
    # segera dihentikan dan dimuat ulang oleh StatReloader.
    if reload_triggered:
        _touch_config_py_for_django_reload()


def _get_active_camera_session():
    """
    Configurator tidak boleh dibuka ketika attendance atau registration
    menggunakan kamera.
    """
    attendance_status = SessionManager.get_instance().get_status()

    if attendance_status.get("is_running"):
        return {
            "active": True,
            "mode": "attendance",
            "message": (
                "Tidak bisa membuka Setting Camera karena sesi absensi "
                "sedang berjalan. Hentikan sesi terlebih dahulu."
            ),
        }

    registration_status = (
        RegistrationSessionManager.get_instance().get_status()
    )

    if registration_status.get("is_running"):
        return {
            "active": True,
            "mode": "registration",
            "message": (
                "Tidak bisa membuka Setting Camera karena sesi registration "
                "sedang berjalan. Hentikan registration terlebih dahulu."
            ),
        }

    return {
        "active": False,
        "mode": None,
        "message": None,
    }


@api_view(["POST"])
def open_camera_configurator(request):
    """
    Membuka Camera Configurator di komputer tempat Django berjalan.
    """
    global _camera_config_process

    active_session = _get_active_camera_session()

    if active_session["active"]:
        return Response(
            {
                "success": False,
                "message": active_session["message"],
                "active_mode": active_session["mode"],
            },
            status=status.HTTP_409_CONFLICT,
        )

    if os.name != "nt":
        return Response(
            {
                "success": False,
                "message": (
                    "Camera Configurator hanya dapat dijalankan "
                    "pada backend Windows."
                ),
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    if not CAMERA_CONFIG_EXE_PATH.exists():
        return Response(
            {
                "success": False,
                "message": (
                    "File SmartChurchCameraConfigurator.exe "
                    "tidak ditemukan."
                ),
                "expected_path": str(CAMERA_CONFIG_EXE_PATH),
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    with _camera_config_lock:
        if (
            _camera_config_process is not None
            and _camera_config_process.poll() is None
        ):
            return Response(
                {
                    "success": False,
                    "message": "Camera configurator sedang berjalan.",
                    "state": _get_camera_config_state(),
                },
                status=status.HTTP_409_CONFLICT,
            )

        try:
            config_mtime_before = _get_file_mtime_ns(
                CAMERA_RUNTIME_CONFIG_PATH
            )

            creation_flags = subprocess.CREATE_NEW_PROCESS_GROUP

            process = subprocess.Popen(
                [str(CAMERA_CONFIG_EXE_PATH)],
                cwd=str(CAMERA_CONFIG_EXE_PATH.parent),
                shell=False,
                creationflags=creation_flags,
            )

            _camera_config_process = process

            state_snapshot = _update_camera_config_state(
                is_running=True,
                process_id=process.pid,
                last_started_at=_now_iso(),
                last_finished_at=None,
                last_exit_code=None,
                config_changed=False,
                reload_triggered=False,
                message="Camera configurator sedang berjalan.",
            )

            watcher = threading.Thread(
                target=_watch_camera_config_process,
                args=(process, config_mtime_before),
                daemon=True,
                name="CameraConfiguratorWatcher",
            )
            watcher.start()

            return Response(
                {
                    "success": True,
                    "message": (
                        "Camera configurator berhasil dibuka "
                        "di komputer server."
                    ),
                    "exe_path": str(CAMERA_CONFIG_EXE_PATH),
                    "state": state_snapshot,
                },
                status=status.HTTP_200_OK,
            )

        except Exception as exc:
            _camera_config_process = None

            state_snapshot = _update_camera_config_state(
                is_running=False,
                process_id=None,
                last_finished_at=_now_iso(),
                last_exit_code=None,
                config_changed=False,
                reload_triggered=False,
                message=f"Gagal membuka camera configurator: {exc}",
            )

            return Response(
                {
                    "success": False,
                    "message": (
                        f"Gagal membuka camera configurator: {exc}"
                    ),
                    "state": state_snapshot,
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


@api_view(["GET"])
def camera_configurator_status(request):
    return Response(
        {
            "success": True,
            "backend_online": True,
            "state": _get_camera_config_state(),
            "exe_path": str(CAMERA_CONFIG_EXE_PATH),
            "exe_exists": CAMERA_CONFIG_EXE_PATH.exists(),
            "runtime_config_path": str(
                CAMERA_RUNTIME_CONFIG_PATH
            ),
            "runtime_config_exists": (
                CAMERA_RUNTIME_CONFIG_PATH.exists()
            ),
        },
        status=status.HTTP_200_OK,
    )