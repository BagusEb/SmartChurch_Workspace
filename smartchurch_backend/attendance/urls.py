from rest_framework.routers import DefaultRouter
from django.urls import path, include

from .views.members_views import MemberViewSet, GuestViewSet, MemberFaceEmbeddingViewSet, MemberPhotosListView
from .views.records_views import (
    TimelineDataRecordViewSet,
    AttendanceViewSet,
    WorshipSessionViewSet,
    SummaryReportViewSet,
    FollowupMemberViewSet,
)
from .views.users_views import UserManageViewSet
from .views.ai_views import AIConversationViewSet

router = DefaultRouter()
router.register(r"members", MemberViewSet)
router.register(r"worship-sessions", WorshipSessionViewSet, basename="worshipsession")
router.register(r"guests", GuestViewSet)
router.register(r"face-embeddings", MemberFaceEmbeddingViewSet)
router.register(r"timeline", TimelineDataRecordViewSet)
router.register(r'attendances', AttendanceViewSet, basename='attendance')
router.register(r"reports", SummaryReportViewSet)
router.register(r"manage-users", UserManageViewSet)
router.register(r"ai-conversations", AIConversationViewSet)
router.register(r"followup-members", FollowupMemberViewSet)

urlpatterns = [
    path("", include(router.urls)),
    path("members/<int:pk>/photos/", MemberPhotosListView.as_view(), name="member-photos-list"),
]
