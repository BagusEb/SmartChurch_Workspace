from rest_framework import viewsets, status, generics
from rest_framework.pagination import PageNumberPagination
from rest_framework.decorators import action
from rest_framework.response import Response
from django.core.paginator import Paginator, EmptyPage, PageNotAnInteger
from ..models import Member, Guest, MemberFaceEmbedding
from ..serializers import MemberSerializer, GuestSerializer, MemberFaceEmbeddingSerializer, MemberPhotoSerializer

class MemberViewSet(viewsets.ModelViewSet):
    queryset = Member.objects.all().order_by('-created_at')
    serializer_class = MemberSerializer

    @action(detail=True, methods=['get'], url_path='faces')
    def faces(self, request, pk=None):
        member = self.get_object()
        face_embeddings = MemberFaceEmbedding.objects.filter(member=member).order_by('-created_at')

        page = request.query_params.get('page', 1)
        page_size = request.query_params.get('page_size', 10)

        paginator = Paginator(face_embeddings, page_size)

        try:
            paginated_embeddings = paginator.page(page)
        except PageNotAnInteger:
            paginated_embeddings = paginator.page(1)
        except EmptyPage:
            return Response(
                {"detail": "Page not found"},
                status=status.HTTP_404_NOT_FOUND
            )

        serializer = MemberFaceEmbeddingSerializer(paginated_embeddings, many=True)

        return Response({
            'count': paginator.count,
            'num_pages': paginator.num_pages,
            'current_page': paginated_embeddings.number,
            'next': paginated_embeddings.next_page_number() if paginated_embeddings.has_next() else None,
            'previous': paginated_embeddings.previous_page_number() if paginated_embeddings.has_previous() else None,
            'results': serializer.data
        })

class GuestViewSet(viewsets.ModelViewSet):
    queryset = Guest.objects.all().order_by('-created_at')
    serializer_class = GuestSerializer

class MemberFaceEmbeddingViewSet(viewsets.ModelViewSet):
    queryset = MemberFaceEmbedding.objects.select_related('member').all()
    serializer_class = MemberFaceEmbeddingSerializer

# Pagination class for the new photo gallery
class SixPerPagePagination(PageNumberPagination):
    page_size = 6
    page_size_query_param = 'page_size'
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
        member_id = self.kwargs['pk']
        return MemberFaceEmbedding.objects.filter(member_id=member_id).order_by('-created_at')