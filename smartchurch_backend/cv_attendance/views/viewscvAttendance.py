#smartchurch_backend/cv_attendance/views/viewscvAttendance.py
import json
import time

from django.http import (
    StreamingHttpResponse,
    JsonResponse,
    HttpResponse,
)
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from ..cv_engine import SessionManager
from ..cv_engine_enroll import RegistrationSessionManager
from ..video_camera import VideoCamera


def _get_attendance_manager():
    return SessionManager.get_instance()


def _get_registration_manager():
    return RegistrationSessionManager.get_instance()


def _get_active_video_manager():
    attendance_manager = _get_attendance_manager()
    registration_manager = _get_registration_manager()

    if attendance_manager.is_running:
        return attendance_manager

    if registration_manager.is_running:
        return registration_manager

    return None


# ── MJPEG Generator ──────────────────────────────────────────────
def _gen_mjpeg_frames(session):
    """Generator MJPEG — berhenti otomatis saat manager tidak aktif."""
    camera = VideoCamera(session)

    while session.is_running:
        frame = camera.get_frame()

        if frame:
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n"
                + frame
                + b"\r\n"
            )
        else:
            time.sleep(0.03)


# ── VIEWS ────────────────────────────────────────────────────────

@require_http_methods(["GET"])
def video_feed(request):
    """
    GET /api/cv/video/

    Bisa streaming:
    - attendance mode
    - registration mode
    """
    active_manager = _get_active_video_manager()

    if not active_manager:
        return HttpResponse("Tidak ada sesi kamera aktif.", status=503)

    return StreamingHttpResponse(
        _gen_mjpeg_frames(active_manager),
        content_type="multipart/x-mixed-replace; boundary=frame",
    )


@csrf_exempt
@require_http_methods(["POST"])
def start_session(request):
    """
    POST /api/cv/start/

    Flow normal:
      - Jika embedding aktif ada: mulai attendance session.
      - Jika embedding aktif kosong: otomatis mulai registration mode.
    """
    try:
        body = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return JsonResponse(
            {"success": False, "message": "Body tidak valid, harus JSON."},
            status=400,
        )

    session_name = body.get("session_name", "").strip()

    if not session_name:
        return JsonResponse(
            {"success": False, "message": "Nama sesi tidak boleh kosong."},
            status=400,
        )

    attendance_manager = _get_attendance_manager()
    registration_manager = _get_registration_manager()

    if attendance_manager.is_running:
        return JsonResponse(
            {
                "success": False,
                "mode": "attendance",
                "message": "Sesi attendance sudah berjalan.",
                "session_id": attendance_manager.current_session_id,
                "session_name": attendance_manager.current_session_name,
            },
            status=400,
        )

    if registration_manager.is_running:
        return JsonResponse(
            {
                "success": True,
                "mode": "registration",
                "registration_required": True,
                "message": "Sesi registration sudah berjalan.",
                "session_id": None,
                "session_name": registration_manager.registration_name,
            },
            status=200,
        )

    success, message = attendance_manager.start_session(session_name=session_name)

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

    # Jika gagal karena belum ada embedding aktif, otomatis masuk registration mode.
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
                "message": reg_message if reg_success else reg_message,
                "original_message": message,
                "session_id": None,
                "session_name": registration_manager.registration_name,
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
    """
    try:
        body = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        body = {}

    registration_name = body.get("registration_name") or "Initial Face Registration"

    attendance_manager = _get_attendance_manager()
    registration_manager = _get_registration_manager()

    if attendance_manager.is_running:
        return JsonResponse(
            {
                "success": False,
                "message": "Tidak bisa memulai registration karena attendance sedang berjalan.",
            },
            status=400,
        )

    success, message = registration_manager.start_registration(registration_name)

    return JsonResponse(
        {
            "success": success,
            "mode": "registration",
            "message": message,
            "session_id": None,
            "session_name": registration_manager.registration_name,
        },
        status=200 if success else 400,
    )


@csrf_exempt
@require_http_methods(["POST"])
def stop_session(request):
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
    Return ringkasan lengkap attendance untuk session yang sudah selesai.
    """
    from attendance.models import Attendance, Member, WorshipSession, TimelineDataRecord

    try:
        try:
            worship_session = WorshipSession.objects.get(id=session_id)
        except WorshipSession.DoesNotExist:
            return JsonResponse({"error": "Session tidak ditemukan"}, status=404)

        rows = (
            Attendance.objects
            .filter(session_id=session_id)
            .select_related("member")
        )

        present_count = 0
        absent_count = 0

        for row in rows:
            if row.attendance_date is not None:
                present_count += 1
            else:
                absent_count += 1

        total_active_members = Member.objects.filter(member_status="active").count()

        need_validation_count = 0

        if worship_session.start_time and worship_session.end_time:
            need_validation_count = TimelineDataRecord.objects.filter(
                capture_time__gte=worship_session.start_time,
                capture_time__lte=worship_session.end_time,
                validation_status="pending",
                detection_status__in=["unknown", "ambiguous"],
            ).count()

        elif worship_session.start_time:
            need_validation_count = TimelineDataRecord.objects.filter(
                capture_time__gte=worship_session.start_time,
                validation_status="pending",
                detection_status__in=["unknown", "ambiguous"],
            ).count()

        total_detected = present_count + need_validation_count

        return JsonResponse(
            {
                "session_id": session_id,
                "session_name": worship_session.session_name,
                "session_date": str(worship_session.date),
                "start_time": worship_session.start_time.isoformat()
                if worship_session.start_time
                else None,
                "end_time": worship_session.end_time.isoformat()
                if worship_session.end_time
                else None,
                "total_active_members": total_active_members,
                "total_detected": total_detected,
                "present_count": present_count,
                "absent_count": absent_count,
                "need_validation_count": need_validation_count,
            }
        )

    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)