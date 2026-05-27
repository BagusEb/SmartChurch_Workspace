"""
URL configuration for smartchurch_backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import TokenRefreshView

# Import Custom Serializer dan View yang baru
from rest_framework_simplejwt.views import TokenObtainPairView
from attendance.serializers import CustomTokenObtainPairSerializer
from chatbot_ai import views as chatbot_views


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


medias = static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("attendance.urls")),
    # --- JALUR LOGIN JWT YANG SUDAH DI-CUSTOM ---
    path("api/token/", CustomTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    # --- CHAT ENDPOINT ---
    path("api/chat/", chatbot_views.chat, name="chat"),
    path(
        "api/chat/<uuid:thread_id>/",
        chatbot_views.chat,
        name="chat_thread_with_id",
    ),
    *medias,
    
    path("api/", include("cv_attendance.urls")),
    *static(settings.STATIC_URL, document_root=settings.STATIC_ROOT),
]
