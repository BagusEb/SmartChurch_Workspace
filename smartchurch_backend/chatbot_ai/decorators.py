from functools import wraps
from django.http import JsonResponse
from rest_framework_simplejwt.tokens import UntypedToken
from rest_framework_simplejwt.exceptions import TokenError, InvalidToken


def jwt_required(view_func):
    @wraps(view_func)
    async def wrapper(request, *args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return JsonResponse({"error": "Authentication required"}, status=401)
        try:
            UntypedToken(auth.split(" ")[1])
        except (TokenError, InvalidToken) as e:
            return JsonResponse({"error": str(e)}, status=401)
        return await view_func(request, *args, **kwargs)
    return wrapper
