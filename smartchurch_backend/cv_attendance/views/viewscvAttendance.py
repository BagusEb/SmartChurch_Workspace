#smartchurch_backend/cv_attendance/views/viewscvAttendance.py
import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from ..monitor_window import CameraMonitorWindow
from ..cv_engine import SessionManager
from ..cv_engine_enroll import RegistrationSessionManager


def _get_attendance_manager():
    return SessionManager.get_instance()


def _get_registration_manager():
    return RegistrationSessionManager.get_instance()

def _parse_json_body(request):
    try:
        return json.loads(request.body or b"{}"), None
    except json.JSONDecodeError:
        return None, "Body tidak valid, harus JSON."


def _build_running_attendance_response(attendance_manager):
    return {
        "success": False,
        "mode": "attendance",
        "message": "Sesi attendance sudah berjalan.",
        "session_id": attendance_manager.current_session_id,
        "session_name": attendance_manager.current_session_name,
    }


def _build_running_registration_response(registration_manager):
    return {
        "success": True,
        "mode": "registration",
        "registration_required": True,
        "message": "Sesi registration sudah berjalan.",
        "session_id": None,
        "session_name": registration_manager.registration_name,
        "registration_name": registration_manager.registration_name,
    }

def _get_active_monitor_source():
    attendance_manager = _get_attendance_manager()
    registration_manager = _get_registration_manager()

    if attendance_manager.is_running:
        return {
            "manager": attendance_manager,
            "mode": "attendance",
            "session_name": (
                attendance_manager.current_session_name
            ),
        }

    if registration_manager.is_running:
        return {
            "manager": registration_manager,
            "mode": "registration",
            "session_name": (
                registration_manager.registration_name
            ),
        }

    return None



# ── VIEWS ────────────────────────────────────────────────────────
@csrf_exempt
@require_http_methods(["POST"])
def start_attendance_session(request):
    """
    POST /api/cv/attendance/start/

    Start attendance saja.
    Tidak otomatis fallback ke registration.

    Dipakai untuk tombol:
    - Mulai Sesi Absensi
    """

    body, body_error = _parse_json_body(request)

    if body_error:
        return JsonResponse(
            {
                "success": False,
                "message": body_error,
            },
            status=400,
        )

    session_name = body.get("session_name", "").strip()

    if not session_name:
        return JsonResponse(
            {
                "success": False,
                "message": "Nama sesi absensi tidak boleh kosong.",
            },
            status=400,
        )

    attendance_manager = _get_attendance_manager()
    registration_manager = _get_registration_manager()

    if attendance_manager.is_running:
        return JsonResponse(
            _build_running_attendance_response(attendance_manager),
            status=409,
        )

    if registration_manager.is_running:
        return JsonResponse(
            {
                "success": False,
                "mode": "registration",
                "message": (
                    "Tidak bisa memulai attendance karena sesi registration "
                    "sedang berjalan. Hentikan registration terlebih dahulu."
                ),
                "session_id": None,
                "session_name": registration_manager.registration_name,
            },
            status=409,
        )

    success, message = attendance_manager.start_session(
        session_name=session_name
    )

    if not success:
        return JsonResponse(
            {
                "success": False,
                "mode": "attendance",
                "registration_required": (
                    "Tidak ada embedding aktif" in message
                ),
                "message": message,
                "session_id": None,
                "session_name": None,
            },
            status=400,
        )

    return JsonResponse(
        {
            "success": True,
            "mode": "attendance",
            "registration_required": False,
            "message": message,
            "session_id": attendance_manager.current_session_id,
            "session_name": attendance_manager.current_session_name,
        },
        status=200,
    )

@csrf_exempt
@require_http_methods(["POST"])
def open_camera_monitor(request):
    """
    Membuka window OpenCV di laptop server.

    Tidak membuka RTSP baru.
    Tidak mengirim frame ke browser.
    """
    source = _get_active_monitor_source()

    if source is None:
        return JsonResponse(
            {
                "success": False,
                "message": (
                    "Tidak ada sesi kamera aktif. "
                    "Mulai sesi attendance atau registration "
                    "terlebih dahulu."
                ),
            },
            status=409,
        )

    monitor = CameraMonitorWindow.get_instance()

    success, message, monitor_state = monitor.open(
        source_manager=source["manager"],
        mode=source["mode"],
        session_name=source["session_name"],
    )

    return JsonResponse(
        {
            "success": success,
            "message": message,
            "state": monitor_state,
        },
        status=200 if success else 409,
    )


@csrf_exempt
@require_http_methods(["POST"])
def close_camera_monitor(request):
    monitor = CameraMonitorWindow.get_instance()

    success, message = monitor.close(
        wait=False
    )

    return JsonResponse(
        {
            "success": success,
            "message": message,
            "state": monitor.get_status(),
        },
        status=200,
    )


@require_http_methods(["GET"])
def camera_monitor_status(request):
    monitor = CameraMonitorWindow.get_instance()

    return JsonResponse(
        {
            "success": True,
            "state": monitor.get_status(),
        },
        status=200,
    )



@csrf_exempt
@require_http_methods(["POST"])
def start_session(request):
    """
    POST /api/cv/start/

    Legacy endpoint.

    Flow lama:
    - Coba start attendance.
    - Jika embedding aktif kosong, otomatis start registration.

    Untuk frontend baru, lebih disarankan memakai:
    - POST /api/cv/attendance/start/
    - POST /api/cv/registration/start/
    """

    body, body_error = _parse_json_body(request)

    if body_error:
        return JsonResponse(
            {
                "success": False,
                "message": body_error,
            },
            status=400,
        )

    session_name = body.get("session_name", "").strip()

    if not session_name:
        return JsonResponse(
            {
                "success": False,
                "message": "Nama sesi tidak boleh kosong.",
            },
            status=400,
        )

    attendance_manager = _get_attendance_manager()
    registration_manager = _get_registration_manager()

    if attendance_manager.is_running:
        return JsonResponse(
            _build_running_attendance_response(attendance_manager),
            status=409,
        )

    if registration_manager.is_running:
        return JsonResponse(
            _build_running_registration_response(registration_manager),
            status=200,
        )

    success, message = attendance_manager.start_session(
        session_name=session_name
    )

    if success:
        return JsonResponse(
            {
                "success": True,
                "mode": "attendance",
                "registration_required": False,
                "message": message,
                "session_id": attendance_manager.current_session_id,
                "session_name": attendance_manager.current_session_name,
            },
            status=200,
        )

    if "Tidak ada embedding aktif" in message:
        reg_success, reg_message = registration_manager.start_registration(
            registration_name=f"Registration - {session_name}"
        )

        return JsonResponse(
            {
                "success": reg_success,
                "mode": "registration",
                "registration_required": True,
                "attendance_started": False,
                "message": reg_message,
                "original_message": message,
                "session_id": None,
                "session_name": registration_manager.registration_name,
                "registration_name": registration_manager.registration_name,
            },
            status=200 if reg_success else 400,
        )

    return JsonResponse(
        {
            "success": False,
            "mode": "attendance",
            "registration_required": False,
            "message": message,
            "session_id": None,
            "session_name": None,
        },
        status=400,
    )

@csrf_exempt
@require_http_methods(["POST"])
def start_registration(request):
    """
    POST /api/cv/registration/start/

    Manual start registration mode.

    Dipakai untuk tombol:
    - Start Sesi Registration

    Catatan:
    - Tetap memakai RegistrationSessionManager.
    - Tetap memakai FaceDetector.detect().
    - Tidak membuat WorshipSession.
    - Tidak membuat Attendance.
    - Tidak membuat TimelineDataRecord.
    """

    body, body_error = _parse_json_body(request)

    if body_error:
        body = {}

    registration_name = (
        body.get("registration_name")
        or body.get("session_name")
        or "Initial Face Registration"
    )

    registration_name = registration_name.strip() or "Initial Face Registration"

    attendance_manager = _get_attendance_manager()
    registration_manager = _get_registration_manager()

    if attendance_manager.is_running:
        return JsonResponse(
            {
                "success": False,
                "mode": "attendance",
                "message": (
                    "Tidak bisa memulai registration karena attendance "
                    "sedang berjalan. Hentikan attendance terlebih dahulu."
                ),
                "session_id": attendance_manager.current_session_id,
                "session_name": attendance_manager.current_session_name,
            },
            status=409,
        )

    if registration_manager.is_running:
        return JsonResponse(
            _build_running_registration_response(registration_manager),
            status=200,
        )

    success, message = registration_manager.start_registration(
        registration_name=registration_name
    )

    return JsonResponse(
        {
            "success": success,
            "mode": "registration",
            "registration_required": True,
            "message": message,
            "session_id": None,
            "session_name": registration_manager.registration_name,
            "registration_name": registration_manager.registration_name,
        },
        status=200 if success else 400,
    )

@csrf_exempt
@require_http_methods(["POST"])
def stop_session(request):
    CameraMonitorWindow.get_instance().close(
        wait=False
    )
    """
    POST /api/cv/stop/

    Stop mode yang sedang aktif:
    - attendance
    - registration
    """
    attendance_manager = _get_attendance_manager()
    registration_manager = _get_registration_manager()

    if attendance_manager.is_running:
        success, message = attendance_manager.stop_session()

        return JsonResponse(
            {
                "success": success,
                "mode": "attendance",
                "message": message,
            },
            status=200 if success else 400,
        )

    if registration_manager.is_running:
        success, message = registration_manager.stop_registration()

        return JsonResponse(
            {
                "success": success,
                "mode": "registration",
                "message": message,
            },
            status=200 if success else 400,
        )

    return JsonResponse(
        {
            "success": False,
            "mode": "idle",
            "message": "Tidak ada sesi yang sedang berjalan.",
        },
        status=400,
    )


@csrf_exempt
@require_http_methods(["POST"])
def stop_registration(request):
    CameraMonitorWindow.get_instance().close(
        wait=False
    )
    """
    POST /api/cv/registration/stop/
    """
    registration_manager = _get_registration_manager()
    success, message = registration_manager.stop_registration()

    return JsonResponse(
        {
            "success": success,
            "mode": "registration",
            "message": message,
        },
        status=200 if success else 400,
    )


@require_http_methods(["GET"])
def detection_log(request):
    """
    GET /api/cv/logs/

    Return logs sesuai mode aktif.
    """
    attendance_manager = _get_attendance_manager()
    registration_manager = _get_registration_manager()

    if attendance_manager.is_running:
        return JsonResponse(
            {
                "mode": "attendance",
                "logs": attendance_manager.get_detection_logs(),
                "stats": attendance_manager.stats,
            }
        )

    if registration_manager.is_running:
        return JsonResponse(
            {
                "mode": "registration",
                "logs": registration_manager.get_detection_logs(),
                "stats": registration_manager.stats,
            }
        )

    return JsonResponse(
        {
            "mode": "idle",
            "logs": [],
            "stats": {},
        }
    )


@require_http_methods(["GET"])
def session_status(request):
    """
    GET /api/cv/status/

    Response punya mode:
    - attendance
    - registration
    - idle
    """
    attendance_manager = _get_attendance_manager()
    registration_manager = _get_registration_manager()

    if attendance_manager.is_running:
        status_data = attendance_manager.get_status()
        status_data["mode"] = "attendance"
        status_data["registration_required"] = False
        return JsonResponse(status_data)

    if registration_manager.is_running:
        status_data = registration_manager.get_status()
        status_data["registration_required"] = True
        status_data["session_id"] = None
        status_data["session_name"] = registration_manager.registration_name
        return JsonResponse(status_data)

    return JsonResponse(
        {
            "mode": "idle",
            "is_running": False,
            "registration_required": False,
            "stats": {},
            "db_queue_size": 0,
            "total_references": attendance_manager.matcher.total_references,
            "session_id": None,
            "session_name": None,
        }
    )

@require_http_methods(["GET"])
def session_attendance_result(request, session_id):
    """
    GET /api/cv/session-result/<session_id>/

    Flow attendance baru:
    - Attendance hanya berisi orang yang benar-benar hadir.
    - Member tidak hadir dihitung dari:
      total member aktif - member hadir.
    """

    from attendance.models import (
        Attendance,
        Member,
        WorshipSession,
        TimelineDataRecord,
    )

    try:
        worship_session = (
            WorshipSession.objects
            .filter(id=session_id)
            .first()
        )

        if not worship_session:
            return JsonResponse(
                {
                    "success": False,
                    "error": "Session tidak ditemukan",
                },
                status=404,
            )

        # attendance_date__isnull=False juga melindungi laporan
        # dari row pre-population lama yang masih belum dibersihkan.
        valid_attendance_rows = (
            Attendance.objects
            .filter(
                session_id=session_id,
                attendance_date__isnull=False,
            )
            .select_related(
                "member",
                "guest",
                "facedetection",
            )
        )

        # Hanya member yang benar-benar hadir.
        present_member_count = (
            valid_attendance_rows
            .filter(member__isnull=False)
            .values("member_id")
            .distinct()
            .count()
        )

        # Guest yang telah dikonfirmasi dan masuk attendance.
        guest_count = (
            valid_attendance_rows
            .filter(guest__isnull=False)
            .values("guest_id")
            .distinct()
            .count()
        )

        total_attendance = (
            present_member_count
            + guest_count
        )

        total_active_members = (
            Member.objects
            .filter(member_status="active")
            .count()
        )

        absent_count = max(
            total_active_members - present_member_count,
            0,
        )

        need_validation_count = 0

        timeline_filter = {
            "validation_status": "pending",
            "detection_status__in": [
                "unknown",
                "ambiguous",
            ],
        }

        if (
            worship_session.start_time
            and worship_session.end_time
        ):
            timeline_filter.update(
                {
                    "capture_time__gte": (
                        worship_session.start_time
                    ),
                    "capture_time__lte": (
                        worship_session.end_time
                    ),
                }
            )

            need_validation_count = (
                TimelineDataRecord.objects
                .filter(**timeline_filter)
                .count()
            )

        elif worship_session.start_time:
            timeline_filter.update(
                {
                    "capture_time__gte": (
                        worship_session.start_time
                    ),
                }
            )

            need_validation_count = (
                TimelineDataRecord.objects
                .filter(**timeline_filter)
                .count()
            )

        # Orang yang sudah hadir + data wajah yang belum divalidasi.
        total_detected = (
            total_attendance
            + need_validation_count
        )

        return JsonResponse(
            {
                "success": True,
                "session_id": session_id,
                "session_name": worship_session.session_name,
                "session_date": (
                    str(worship_session.date)
                    if worship_session.date
                    else None
                ),
                "start_time": (
                    worship_session.start_time.isoformat()
                    if worship_session.start_time
                    else None
                ),
                "end_time": (
                    worship_session.end_time.isoformat()
                    if worship_session.end_time
                    else None
                ),

                # Data member.
                "total_active_members": total_active_members,
                "present_count": present_member_count,
                "absent_count": absent_count,

                # Data guest.
                "guest_count": guest_count,

                # Total final attendance member + guest.
                "total_attendance": total_attendance,

                # Attendance final + pending validation.
                "total_detected": total_detected,
                "need_validation_count": need_validation_count,
            },
            status=200,
        )

    except Exception as exc:
        return JsonResponse(
            {
                "success": False,
                "error": str(exc),
            },
            status=500,
        )