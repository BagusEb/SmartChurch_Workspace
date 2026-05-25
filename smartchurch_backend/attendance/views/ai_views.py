from rest_framework import viewsets
from ..models import AIConversation
from ..serializers import AIConversationSerializer


class AIConversationViewSet(viewsets.ModelViewSet):
    queryset = AIConversation.objects.none()
    serializer_class = AIConversationSerializer

    def get_queryset(self):
        user = getattr(self.request, "user", None)

        if user and user.is_authenticated:
            return AIConversation.objects.filter(user=user).order_by(
                "-last_activity_at"
            )
        return AIConversation.objects.none()
