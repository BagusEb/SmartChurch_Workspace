from rest_framework import viewsets
from django.contrib.auth.models import User
from .models import (
    Member,
    Guest,
    MemberFaceEmbedding,
    TimelineDataRecord,
    Attendance,
    AIConversation,
    SummaryReport,
)
from .serializers import (
    MemberSerializer,
    GuestSerializer,
    MemberFaceEmbeddingSerializer,
    TimelineDataRecordSerializer,
    AttendanceSerializer,
    AIConversationSerializer,
    SummaryReportSerializer,
    UserWithProfileSerializer,
)


class MemberViewSet(viewsets.ModelViewSet):
    queryset = Member.objects.all().order_by("-created_at")
    serializer_class = MemberSerializer


class GuestViewSet(viewsets.ModelViewSet):
    queryset = Guest.objects.all().order_by("-created_at")
    serializer_class = GuestSerializer


class MemberFaceEmbeddingViewSet(viewsets.ModelViewSet):
    queryset = MemberFaceEmbedding.objects.select_related("member").all()
    serializer_class = MemberFaceEmbeddingSerializer


class TimelineDataRecordViewSet(viewsets.ModelViewSet):
    queryset = (
        TimelineDataRecord.objects.select_related(
            "matched_member", "final_member", "final_guest"
        )
        .all()
        .order_by("-capture_time")
    )
    serializer_class = TimelineDataRecordSerializer


class AttendanceViewSet(viewsets.ModelViewSet):
    queryset = (
        Attendance.objects.select_related("member", "guest", "timeline_data")
        .all()
        .order_by("-attendance_date", "-check_in_time")
    )
    serializer_class = AttendanceSerializer


class AIConversationViewSet(viewsets.ModelViewSet):
    queryset = AIConversation.objects.all().order_by("-last_activity_at")
    serializer_class = AIConversationSerializer


class SummaryReportViewSet(viewsets.ModelViewSet):
    queryset = SummaryReport.objects.all().order_by("-report_date")
    serializer_class = SummaryReportSerializer


class UserManageViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by("-date_joined")
    serializer_class = UserWithProfileSerializer
