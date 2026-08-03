from rest_framework import viewsets, status, generics
from rest_framework.pagination import PageNumberPagination
from rest_framework.decorators import action
from rest_framework.response import Response
from django.core.paginator import Paginator, EmptyPage, PageNotAnInteger
from django.db import transaction
from django.db.models import Q
from ..models import Member, Guest, MemberFaceEmbedding, Attendance
from ..serializers import (
    MemberSerializer,
    GuestSerializer,
    MemberFaceEmbeddingSerializer,
    MemberPhotoSerializer,
)


class MemberViewSet(viewsets.ModelViewSet):
    queryset = Member.objects.all().order_by("-created_at")
    serializer_class = MemberSerializer

    @action(detail=True, methods=["get"], url_path="faces")
    def faces(self, request, pk=None):
        member = self.get_object()
        face_embeddings = MemberFaceEmbedding.objects.filter(member=member).order_by(
            "-created_at"
        )

        page = request.query_params.get("page", 1)
        page_size = request.query_params.get("page_size", 10)

        paginator = Paginator(face_embeddings, page_size)

        try:
            paginated_embeddings = paginator.page(page)
        except PageNotAnInteger:
            paginated_embeddings = paginator.page(1)
        except EmptyPage:
            return Response(
                {"detail": "Page not found"}, status=status.HTTP_404_NOT_FOUND
            )

        serializer = MemberFaceEmbeddingSerializer(paginated_embeddings, many=True)

        return Response(
            {
                "count": paginator.count,
                "num_pages": paginator.num_pages,
                "current_page": paginated_embeddings.number,
                "next": (
                    paginated_embeddings.next_page_number()
                    if paginated_embeddings.has_next()
                    else None
                ),
                "previous": (
                    paginated_embeddings.previous_page_number()
                    if paginated_embeddings.has_previous()
                    else None
                ),
                "results": serializer.data,
            }
        )


class GuestViewSet(viewsets.ModelViewSet):
    queryset = Guest.objects.all().order_by("-created_at")
    serializer_class = GuestSerializer

    @action(detail=True, methods=["post"], url_path="convert-to-member")
    def convert_to_member(self, request, pk=None):
        """Convert a guest into a member in one atomic step.

        Steps:
        1. Create a new Member from the guest + request data.
        2. Link the guest to the new member via converted_to_member.
        3. Copy face embeddings from all of the guest's attendance records
           (t_attendance join t_timlinedata_record via facedetection) into
           t_member_face_embedding.
        """
        guest = self.get_object()

        if guest.converted_to_member_id:
            return Response(
                {
                    "success": False,
                    "error": (
                        f"Guest sudah dikonversi menjadi member "
                        f"(id={guest.converted_to_member_id})."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = request.data or {}
        full_name = (payload.get("full_name") or "").strip() or guest.full_name
        gender = (payload.get("gender") or "").strip() or "L"

        if gender not in ["L", "P"]:
            return Response(
                {"success": False, "error": "Gender harus L atau P."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        birth_date_raw = (payload.get("birth_date") or "").strip()
        birth_date = None
        if birth_date_raw:
            from datetime import datetime

            try:
                birth_date = datetime.strptime(birth_date_raw, "%Y-%m-%d").date()
            except ValueError:
                return Response(
                    {
                        "success": False,
                        "error": "birth_date harus format YYYY-MM-DD.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        try:
            with transaction.atomic():
                member = Member.objects.create(
                    full_name=full_name,
                    nickname=(payload.get("nickname") or "").strip() or None,
                    gender=gender,
                    birth_date=birth_date,
                    phone=(payload.get("phone") or "").strip() or guest.phone or None,
                    email=(payload.get("email") or "").strip() or None,
                    address=(payload.get("address") or "").strip() or None,
                    member_status=(payload.get("member_status") or "active").strip()
                    or "active",
                )

                guest.converted_to_member = member
                guest.save(update_fields=["converted_to_member"])

                # Copy face data from top 6 attendance records (by confidence)
                # for this guest, joined through facedetection -> timeline records
                top_timeline_records = list(
                    Attendance.objects.filter(
                        guest_id=guest.id,
                        facedetection__isnull=False,
                        facedetection__face_encoding__isnull=False,
                    )
                    .order_by("-facedetection__confidence")
                    .select_related("facedetection")[:6]
                )

                for attendance in top_timeline_records:
                    record = attendance.facedetection
                    MemberFaceEmbedding.objects.create(
                        member=member,
                        face_encoding=record.face_encoding,
                        face_image=record.face_image,
                        is_active=True,
                    )

        except Exception as e:
            return Response(
                {
                    "success": False,
                    "error": "Gagal mengonversi guest menjadi member.",
                    "detail": str(e),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(
            {
                "success": True,
                "message": "Guest berhasil dikonversi menjadi member.",
            }
        )


class MemberFaceEmbeddingViewSet(viewsets.ModelViewSet):
    queryset = MemberFaceEmbedding.objects.select_related("member").all()
    serializer_class = MemberFaceEmbeddingSerializer


# Pagination class for the new photo gallery
class SixPerPagePagination(PageNumberPagination):
    page_size = 6
    page_size_query_param = "page_size"
    max_page_size = 12


class MemberPhotosListView(generics.ListAPIView):
    """
    API view to retrieve a paginated list of face photos for a specific member.
    Uses a more lightweight serializer and standard DRF pagination.
    """

    serializer_class = MemberPhotoSerializer
    pagination_class = SixPerPagePagination

    def get_queryset(self):
        """
        This view returns a list of all photos for the member
        determined by the `pk` (member_id) portion of the URL.
        """
        member_id = self.kwargs["pk"]
        return MemberFaceEmbedding.objects.filter(member_id=member_id).order_by(
            "-created_at"
        )
