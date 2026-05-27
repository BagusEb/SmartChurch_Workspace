# cv_attendance/views/viewscvAttendance.py
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
from ..video_camera import VideoCamera



# ── MJPEG Generator ──────────────────────────────────────────────
def _gen_mjpeg_frames(session: SessionManager):
    """Generator MJPEG — berhenti otomatis saat session tidak aktif."""
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
    Streaming MJPEG — pasang di <img src="..."> di frontend.
    """
    session = SessionManager.get_instance()
    if not session.is_running:
        return HttpResponse("Sesi tidak aktif. Mulai sesi dulu.", status=503)
    return StreamingHttpResponse(
        _gen_mjpeg_frames(session),
        content_type="multipart/x-mixed-replace; boundary=frame",
    )


@csrf_exempt
@require_http_methods(["POST"])
def start_session(request):
    """
    POST /api/cv/start/
    Body JSON: { "session_name": "Ibadah Sabbath" }

    Flow:
      1. Buat WorshipSession di DB
      2. Pre-populate Attendance untuk semua member active
      3. Load AI model & embeddings
      4. Start camera_loop + db_writer_loop threads
    """
    # Parse body
    try:
        body = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return JsonResponse(
            {"success": False, "message": "Body tidak valid (harus JSON)"},
            status=400,
        )

    session_name = body.get("session_name", "").strip()
    if not session_name:
        return JsonResponse(
            {"success": False, "message": "Nama sesi tidak boleh kosong"},
            status=400,
        )

    manager = SessionManager.get_instance()
    success, message = manager.start_session(session_name=session_name)

    return JsonResponse(
        {
            "success":      success,
            "message":      message,
            "session_id":   manager.current_session_id,
            "session_name": manager.current_session_name,
        },
        status=200 if success else 400,
    )


@csrf_exempt
@require_http_methods(["POST"])
def stop_session(request):
    """
    POST /api/cv/stop/
    Hentikan sesi:
      - Tunggu DB writer selesai flush queue
      - Set end_time & status='closed' pada WorshipSession
      - Tutup kamera
    """
    manager = SessionManager.get_instance()
    success, message = manager.stop_session()
    return JsonResponse(
        {"success": success, "message": message},
        status=200 if success else 400,
    )


@require_http_methods(["GET"])
def detection_log(request):
    """
    GET /api/cv/logs/
    Ambil semua log deteksi yang belum dikirim (drain log_queue).
    Frontend polling ini setiap ~1 detik.

    Response:
      {
        "logs": [{"time", "name", "status", "similarity", "is_update"}, ...],
        "stats": {"known": N, "ambiguous": N, "unknown": N}
      }
    """
    manager = SessionManager.get_instance()
    return JsonResponse(
        {
            "logs":  manager.get_detection_logs(),
            "stats": manager.stats,
        }
    )


@require_http_methods(["GET"])
def session_status(request):
    """
    GET /api/cv/status/
    Cek status sesi + statistik + info session aktif.

    Response:
      {
        "is_running": bool,
        "stats": {...},
        "db_queue_size": int,
        "total_references": int,
        "session_id": int|null,
        "session_name": str|null
      }
    """
    manager = SessionManager.get_instance()
    return JsonResponse(manager.get_status())

@require_http_methods(["GET"])
def session_attendance_result(request, session_id):
    """
    GET /api/cv/session-result/<session_id>/
    Return ringkasan lengkap attendance untuk session yang sudah selesai.
    """
    from attendance.models import Attendance, Member, WorshipSession, TimelineDataRecord
    try:
        # Ambil info session
        try:
            worship_session = WorshipSession.objects.get(id=session_id)
        except WorshipSession.DoesNotExist:
            return JsonResponse({'error': 'Session tidak ditemukan'}, status=404)

        # Ambil semua attendance rows untuk session ini
        rows = (
            Attendance.objects
            .filter(session_id=session_id)
            .select_related('member')
        )

        present_count = 0
        absent_count  = 0
        for row in rows:
            if row.attendance_date is not None:
                present_count += 1
            else:
                absent_count += 1

        # Total member active saat ini
        total_active_members = Member.objects.filter(member_status='active').count()

        # Perlu validasi: TimelineDataRecord pending (unknown/ambiguous)
        # dalam rentang waktu session
        need_validation_count = 0
        if worship_session.start_time and worship_session.end_time:
            need_validation_count = TimelineDataRecord.objects.filter(
                capture_time__gte=worship_session.start_time,
                capture_time__lte=worship_session.end_time,
                validation_status='pending',
                detection_status__in=['unknown', 'ambiguous'],
            ).count()
        elif worship_session.start_time:
            # Session baru saja ditutup, end_time mungkin baru di-set
            need_validation_count = TimelineDataRecord.objects.filter(
                capture_time__gte=worship_session.start_time,
                validation_status='pending',
                detection_status__in=['unknown', 'ambiguous'],
            ).count()

        # Total deteksi = hadir + perlu validasi
        total_detected = present_count + need_validation_count

        return JsonResponse({
            'session_id':           session_id,
            'session_name':         worship_session.session_name,
            'session_date':         str(worship_session.date),
            'start_time':           worship_session.start_time.isoformat() if worship_session.start_time else None,
            'end_time':             worship_session.end_time.isoformat()   if worship_session.end_time   else None,
            'total_active_members': total_active_members,
            'total_detected':       total_detected,
            'present_count':        present_count,
            'absent_count':         absent_count,
            'need_validation_count': need_validation_count,
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)