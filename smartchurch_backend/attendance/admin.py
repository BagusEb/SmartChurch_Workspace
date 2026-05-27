from django.contrib import admin
from .models import (
    Member,
    Guest,
    MemberFaceEmbedding,
    TimelineDataRecord,
    Attendance,
    AIConversation,
    SummaryReport,
    UserProfile,
)


# ==========================================
# MEMBER
# ==========================================
@admin.register(Member)
class MemberAdmin(admin.ModelAdmin):
    list_display = (
        "full_name",
        "nickname",
        "gender",
        "phone",
        "member_status",
        "created_at",
    )
    search_fields = ("full_name", "nickname", "phone", "email")
    list_filter = ("gender", "member_status", "created_at")
    ordering = ("-created_at",)


# ==========================================
# GUEST
# ==========================================
@admin.register(Guest)
class GuestAdmin(admin.ModelAdmin):
    list_display = (
        "full_name",
        "phone",
        "visit_count",
        "first_visit",
        "last_visit",
        "converted_to_member",
    )
    search_fields = ("full_name", "phone")
    list_filter = ("first_visit", "last_visit")
    ordering = ("-created_at",)


# ==========================================
# MEMBER FACE EMBEDDING (DULU: FACE PROFILE)
# ==========================================
@admin.register(MemberFaceEmbedding)
class MemberFaceEmbeddingAdmin(admin.ModelAdmin):
    list_display = ("member", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("member__full_name",)


# ==========================================
# TIMELINE DATA RECORD (DULU: FACE DETECTION)
# ==========================================
@admin.register(TimelineDataRecord)
class TimelineDataRecordAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "capture_time",
        "detection_status",
        "confidence",
        "matched_member",
        "validation_status",
        "final_member",
        "final_guest",
    )
    list_filter = ("detection_status", "validation_status", "capture_time")
    search_fields = (
        "matched_member__full_name",
        "final_member__full_name",
        "final_guest__full_name",
    )
    ordering = ("-capture_time",)


# ==========================================
# ATTENDANCE
# ==========================================
@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "member",
        "guest",
        "attendance_date",
        "check_in_time",
        "confidence",
    )
    list_filter = ("attendance_date",)
    search_fields = ("member__full_name", "guest__full_name")
    ordering = ("-attendance_date", "-check_in_time")


# ==========================================
# AI CONVERSATION
# ==========================================
@admin.register(AIConversation)
class AIConversationAdmin(admin.ModelAdmin):
    list_display = ("conversation_title", "user", "created_at", "last_activity_at")
    search_fields = ("conversation_title", "user__username")
    ordering = ("-last_activity_at",)


# ==========================================
# SUMMARY REPORT
# ==========================================
@admin.register(SummaryReport)
class SummaryReportAdmin(admin.ModelAdmin):
    list_display = (
        "report_start_date",
        "report_end_date",
        "total_attendance",
        "total_members",
        "total_guests",
        "created_at",
    )
    list_filter = ("report_start_date", "report_end_date")
    ordering = ("-created_at",)


# ==========================================
# WORSHIP SESSION
# ==========================================
from .models import WorshipSession

@admin.register(WorshipSession)
class WorshipSessionAdmin(admin.ModelAdmin):
    list_display = ("id", "session_name", "date", "start_time", "end_time", "status")
    list_filter = ("status", "date")
    search_fields = ("session_name",)
    ordering = ("-date", "-start_time")


admin.site.register(UserProfile)
