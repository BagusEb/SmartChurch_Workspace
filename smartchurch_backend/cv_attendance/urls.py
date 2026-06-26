# cv_attandance/urls.py

from django.urls import path

from .views.viewscvAttendance import (
    video_feed,
    start_session,
    stop_session,
    detection_log,
    session_status,
    session_attendance_result,
    start_registration,
    stop_registration,
)

from .views.viewsValidationregistration import (
    registration_validation_groups,
    registration_member_data,
    registration_assign_member_faces_action,
    registration_reject_faces_action,
)

from .views.viewsValidationai import (
    validation_ai_sessions,
    validation_ai_session_detail,
    validation_ai_member_guest_data,
)

from .views.viewsValidationaction import (
    validation_ai_verify_action,
    validation_ai_reject_action,
    validation_ai_find_guest_by_ai_action,
    validation_ai_confirm_guest_action,
    validation_ai_add_member_face_action,
)
app_name = "cv_attendance"

urlpatterns = [
    path("cv/start/", start_session, name="cv_start"),
    path("cv/stop/", stop_session, name="cv_stop"),
    path("cv/video/", video_feed, name="cv_video"),
    path("cv/logs/", detection_log, name="cv_logs"),
    path("cv/status/", session_status, name="cv_status"),
    path(
        "cv/session-result/<int:session_id>/",
        session_attendance_result,
        name="cv_session_result",
    ),

    # ================= VALIDATION AI =================
    path(
        "cv/validation-ai/sessions/",
        validation_ai_sessions,
        name="validation_ai_sessions",
    ),
    path(
        "cv/validation-ai/sessions/<int:session_id>/",
        validation_ai_session_detail,
        name="validation_ai_session_detail",
    ),

    path(
        "cv/validation-ai/data-member-guest/",
        validation_ai_member_guest_data,
        name="validation_ai_member_guest_data",
    ),

    path(
        "cv/validation-ai/actions/verify/",
        validation_ai_verify_action,
        name="validation_ai_verify_action",
    ),
    path(
        "cv/validation-ai/actions/reject/",
        validation_ai_reject_action,
        name="validation_ai_reject_action",
    ),
    path(
        "cv/validation-ai/actions/guest/find-by-ai/",
        validation_ai_find_guest_by_ai_action,
        name="validation_ai_find_guest_by_ai_action",
    ),
    path(
        "cv/validation-ai/actions/guest/confirm/",
        validation_ai_confirm_guest_action,
        name="validation_ai_confirm_guest_action",
    ),
    path(
        "cv/validation-ai/actions/member/add-face/",
        validation_ai_add_member_face_action,
        name="validation_ai_add_member_face_action",
    ),

    path(
        "cv/registration/start/",
        start_registration,
        name="cv_registration_start",
    ),
    path(
        "cv/registration/stop/",
        stop_registration,
        name="cv_registration_stop",
    ),

    # ================= VALIDATION REGISTRATION =================
    path(
        "cv/validation-registration/groups/",
        registration_validation_groups,
        name="registration_validation_groups",
    ),
    path(
        "cv/validation-registration/members/",
        registration_member_data,
        name="registration_member_data",
    ),
    path(
        "cv/validation-registration/actions/member/add-face/",
        registration_assign_member_faces_action,
        name="registration_assign_member_faces_action",
    ),
    path(
        "cv/validation-registration/actions/reject/",
        registration_reject_faces_action,
        name="registration_reject_faces_action",
    ),
]