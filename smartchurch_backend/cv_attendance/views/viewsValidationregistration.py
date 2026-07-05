#smartchurch_backend\cv_attendance\views\viewsValidationregistration.py

import base64
import json

from django.core.paginator import EmptyPage, PageNotAnInteger, Paginator
from django.db import transaction
from django.db.models import Q
from django.http import JsonResponse
from django.utils.dateparse import parse_date
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from attendance.models import Member, MemberFaceEmbedding


# ============================================================
# COMMON RESPONSE HELPERS
# ============================================================

def ok_response(message="Success", data=None, status=200):
    payload = {
        "success": True,
        "message": message,
    }

    if data:
        payload.update(data)

    return JsonResponse(payload, status=status)


def fail_response(message, status=400, data=None):
    payload = {
        "success": False,
        "message": message,
    }

    if data:
        payload.update(data)

    return JsonResponse(payload, status=status)


def parse_body(request):
    try:
        if not request.body:
            return {}

        return json.loads(request.body.decode("utf-8"))
    except Exception:
        return None


def image_bytes_to_base64(image_bytes):
    if not image_bytes:
        return None

    try:
        encoded = base64.b64encode(image_bytes).decode("utf-8")
        return f"data:image/jpeg;base64,{encoded}"
    except Exception:
        return None


def normalize_text(value):
    return (value or "").strip()


def clean_optional_text(value):
    value = normalize_text(value)
    return value or None


def safe_int(value, default=1, min_value=None, max_value=None):
    try:
        parsed = int(value)
    except Exception:
        parsed = default

    if min_value is not None and parsed < min_value:
        parsed = min_value

    if max_value is not None and parsed > max_value:
        parsed = max_value

    return parsed


def is_valid_encoding(encoding):
    if not encoding:
        return False

    if not isinstance(encoding, list):
        return False

    return len(encoding) > 0


# ============================================================
# SERIALIZERS
# ============================================================

def serialize_member(member):
    return {
        "id": member.id,
        "full_name": member.full_name,
        "nickname": member.nickname,
        "gender": member.gender,
        "birth_date": member.birth_date.isoformat() if member.birth_date else None,
        "phone": member.phone,
        "email": member.email,
        "address": member.address,
        "member_status": member.member_status,
    }


def serialize_registration_embedding(embedding, include_encoding=False):
    """
    Format flat item untuk mode registration.

    Catatan:
    - record_id disediakan supaya frontend bisa reuse pattern lama.
    - embedding_id adalah id asli MemberFaceEmbedding.
    - face_image dikirim base64 agar langsung bisa ditampilkan.
    """

    data = {
        "id": embedding.id,
        "record_id": embedding.id,
        "embedding_id": embedding.id,
        "created_at": embedding.created_at.isoformat()
        if embedding.created_at
        else None,
        "member_id": embedding.member_id,
        "is_active": embedding.is_active,
        "status": "staging_registration",
        "face_image": image_bytes_to_base64(embedding.face_image),
    }

    if include_encoding:
        data["face_encoding"] = embedding.face_encoding

    return data


def serialize_member_face_embedding(embedding):
    return {
        "id": embedding.id,
        "member_id": embedding.member_id,
        "is_active": embedding.is_active,
        "created_at": embedding.created_at.isoformat()
        if embedding.created_at
        else None,
    }


# ============================================================
# QUERY HELPERS
# ============================================================

def get_registration_queryset():
    """
    Data staging registration.

    Mode registration sekarang TIDAK memakai grouping vector.
    Semua item dikirim sebagai flat list dan frontend melakukan selected action.
    """

    return (
        MemberFaceEmbedding.objects
        .filter(
            member__isnull=True,
            is_active__isnull=True,
            face_image__isnull=False,
            face_encoding__isnull=False,
        )
        .order_by("created_at", "id")
    )


def build_registration_flat_payload(request):
    """
    GET pagination untuk registration staging.

    Query params:
    - page: default 1
    - page_size: default 20, max 20
    - include_encoding: true/false, default false

    Response utama:
    - registration_faces: list flat per page
    - pagination: metadata pagination
    - summary: total pending
    """

    include_encoding = (
        request.GET.get("include_encoding", "false").strip().lower() == "true"
    )

    page = safe_int(
        request.GET.get("page", 1),
        default=1,
        min_value=1,
    )

    page_size = safe_int(
        request.GET.get("page_size", 20),
        default=20,
        min_value=1,
        max_value=20,
    )

    queryset = get_registration_queryset()

    total_pending = queryset.count()

    paginator = Paginator(queryset, page_size)

    try:
        page_obj = paginator.page(page)
    except PageNotAnInteger:
        page_obj = paginator.page(1)
    except EmptyPage:
        if paginator.num_pages >= 1:
            page_obj = paginator.page(paginator.num_pages)
        else:
            page_obj = paginator.page(1)

    embeddings = list(page_obj.object_list)

    registration_faces = [
        serialize_registration_embedding(
            embedding,
            include_encoding=include_encoding,
        )
        for embedding in embeddings
    ]

    oldest_embedding = queryset.first()
    newest_embedding = queryset.order_by("-created_at", "-id").first()

    return {
        "mode": "registration",
        "view_mode": "selected_flat",

        "summary": {
            "total_pending_embeddings": total_pending,
            "page_pending_embeddings": len(registration_faces),
            "total_pages": paginator.num_pages,
            "current_page": page_obj.number,
            "page_size": page_size,

            # Legacy field supaya frontend lama tidak langsung error.
            # Pada mode baru ini nilainya bukan people group.
            "total_people_groups": 0,

            "first_created_at": oldest_embedding.created_at.isoformat()
            if oldest_embedding and oldest_embedding.created_at
            else None,
            "last_created_at": newest_embedding.created_at.isoformat()
            if newest_embedding and newest_embedding.created_at
            else None,
        },

        "pagination": {
            "page": page_obj.number,
            "page_size": page_size,
            "total_items": total_pending,
            "total_pages": paginator.num_pages,
            "has_next": page_obj.has_next(),
            "has_previous": page_obj.has_previous(),
            "next_page": page_obj.next_page_number() if page_obj.has_next() else None,
            "previous_page": page_obj.previous_page_number()
            if page_obj.has_previous()
            else None,
        },

        # Data utama baru untuk frontend.
        "registration_faces": registration_faces,

        # Alias supaya frontend bisa pilih nama yang lebih enak nanti.
        "embeddings": registration_faces,

        # Legacy field. Sengaja kosong karena grouping sudah tidak dipakai.
        "registration_people_groups": [],
    }


def parse_id_list(value, field_name):
    if value is None:
        return [], None

    if not isinstance(value, list):
        return None, f"{field_name} wajib berupa array."

    try:
        clean_ids = [int(item) for item in value]
        clean_ids = list(dict.fromkeys(clean_ids))
        return clean_ids, None
    except Exception:
        return None, f"{field_name} harus berisi angka id MemberFaceEmbedding."


def get_embeddings_by_ids_for_update(embedding_ids):
    """
    Ambil staging embeddings berdasarkan selected id.
    Urutan hasil disusun ulang mengikuti urutan selected id dari frontend.
    """

    embeddings = list(
        MemberFaceEmbedding.objects
        .select_for_update()
        .filter(id__in=embedding_ids)
    )

    embedding_map = {embedding.id: embedding for embedding in embeddings}

    ordered_embeddings = [
        embedding_map[embedding_id]
        for embedding_id in embedding_ids
        if embedding_id in embedding_map
    ]

    found_ids = set(embedding_map.keys())

    missing_ids = [
        embedding_id
        for embedding_id in embedding_ids
        if embedding_id not in found_ids
    ]

    return ordered_embeddings, missing_ids


def validate_embeddings_are_staging(embeddings):
    invalid_embeddings = []

    for embedding in embeddings:
        if embedding.member_id is not None or embedding.is_active is not None:
            invalid_embeddings.append(
                {
                    "id": embedding.id,
                    "member_id": embedding.member_id,
                    "is_active": embedding.is_active,
                }
            )

    if invalid_embeddings:
        return (
            "Ada embedding yang bukan staging registration atau sudah diproses.",
            invalid_embeddings,
        )

    return None, []


def validate_selected_embeddings_have_face_data(embeddings):
    invalid_embeddings = []

    for embedding in embeddings:
        if not embedding.face_image or not is_valid_encoding(embedding.face_encoding):
            invalid_embeddings.append(
                {
                    "id": embedding.id,
                    "has_face_image": bool(embedding.face_image),
                    "has_valid_face_encoding": is_valid_encoding(
                        embedding.face_encoding
                    ),
                }
            )

    if invalid_embeddings:
        return (
            "Ada wajah terpilih yang tidak memiliki face_image atau face_encoding valid.",
            invalid_embeddings,
        )

    return None, []


# ============================================================
# MEMBER HELPERS
# ============================================================

def create_member_from_payload(member_payload):
    full_name = normalize_text(member_payload.get("full_name"))
    gender = normalize_text(member_payload.get("gender")) or "L"

    if not full_name:
        return None, "Nama lengkap jemaat wajib diisi."

    if gender not in ["L", "P"]:
        return None, "Gender harus L atau P."

    birth_date_value = normalize_text(member_payload.get("birth_date"))
    birth_date = None

    if birth_date_value:
        birth_date = parse_date(birth_date_value)

        if not birth_date:
            return None, "birth_date harus format YYYY-MM-DD."

    member = Member.objects.create(
        full_name=full_name,
        nickname=clean_optional_text(member_payload.get("nickname")),
        gender=gender,
        birth_date=birth_date,
        phone=clean_optional_text(member_payload.get("phone")),
        email=clean_optional_text(member_payload.get("email")),
        address=clean_optional_text(member_payload.get("address")),
        member_status="active",
    )

    return member, None


# ============================================================
# GET: REGISTRATION FACES FLAT PAGINATED
# ============================================================

def _registration_validation_faces_response(request):
    try:
        payload = build_registration_flat_payload(request)

        return JsonResponse(
            {
                "success": True,
                **payload,
            },
            status=200,
        )

    except Exception as e:
        return JsonResponse(
            {
                "success": False,
                "message": "Gagal mengambil data validasi registration.",
                "error": str(e),
            },
            status=500,
        )


@require_http_methods(["GET"])
def registration_validation_faces(request):
    """
    GET /api/cv/validation-registration/faces/?page=1&page_size=20

    Endpoint baru untuk mode registration:
    - Tidak grouping.
    - Flat list.
    - Pagination per 20 gambar.
    """

    return _registration_validation_faces_response(request)


@require_http_methods(["GET"])
def registration_validation_groups(request):
    """
    GET /api/cv/validation-registration/groups/

    Backward compatibility untuk frontend lama.
    Walaupun nama endpoint masih groups, response sekarang flat paginated.
    Frontend baru sebaiknya pakai /faces/.
    """

    return _registration_validation_faces_response(request)


# ============================================================
# GET: MEMBER DATA
# ============================================================

@require_http_methods(["GET"])
def registration_member_data(request):
    """
    GET /api/cv/validation-registration/members/?q=nama

    Data member untuk dropdown assign wajah registration.
    """

    try:
        keyword = request.GET.get("q", "").strip()

        members = (
            Member.objects
            .filter(member_status="active")
            .order_by("full_name")
        )

        if keyword:
            members = members.filter(
                Q(full_name__icontains=keyword)
                | Q(nickname__icontains=keyword)
                | Q(phone__icontains=keyword)
                | Q(email__icontains=keyword)
            )

        members_data = [serialize_member(member) for member in members]

        return JsonResponse(
            {
                "success": True,
                "members_count": len(members_data),
                "members": members_data,
            },
            status=200,
        )

    except Exception as e:
        return JsonResponse(
            {
                "success": False,
                "message": "Gagal mengambil data member untuk registration.",
                "error": str(e),
            },
            status=500,
        )


# ============================================================
# POST: ADD SELECTED REGISTRATION FACES TO MEMBER
# ============================================================

@csrf_exempt
@require_http_methods(["POST"])
def registration_assign_member_faces_action(request):
    """
    POST /api/cv/validation-registration/actions/member/add-face/

    Payload existing member:
    {
      "mode": "existing",
      "member_id": 1,
      "selected_embedding_ids": [10, 12, 15]
    }

    Payload new member:
    {
      "mode": "new",
      "selected_embedding_ids": [10, 12, 15],
      "member": {
        "full_name": "Jonathan Sitorus",
        "nickname": "Jo",
        "gender": "L",
        "birth_date": "2000-01-01",
        "phone": "0812xxxx",
        "email": "jonathan@example.com",
        "address": "Jakarta"
      }
    }

    Backward compatibility:
    - Jika frontend lama masih kirim embedding_ids, backend tetap menerima.
    - Tapi backend hanya memproses selected_embedding_ids.
    - Tidak ada lagi penghapusan embedding yang tidak dipilih.

    Rules baru:
    - selected_embedding_ids menjadi face embedding aktif milik member.
    - Tidak membuat Attendance.
    - Tidak membuat TimelineDataRecord.
    - Tidak menghapus wajah lain yang tidak dipilih.
    """

    body = parse_body(request)

    if body is None:
        return fail_response("Body request harus JSON valid.", status=400)

    mode = body.get("mode") or "existing"
    member_id = body.get("member_id")
    member_payload = body.get("member") or {}

    selected_embedding_ids = body.get("selected_embedding_ids")

    # Fallback untuk request lama atau selected all yang memakai embedding_ids.
    if selected_embedding_ids is None:
        selected_embedding_ids = body.get("embedding_ids") or body.get("record_ids") or []

    if mode not in ["existing", "new"]:
        return fail_response("mode harus existing atau new.", status=400)

    if mode == "existing" and not member_id:
        return fail_response("member_id wajib dikirim untuk mode existing.", status=400)

    clean_selected_ids, selected_ids_error = parse_id_list(
        selected_embedding_ids,
        "selected_embedding_ids",
    )

    if selected_ids_error:
        return fail_response(selected_ids_error, status=400)

    if len(clean_selected_ids) == 0:
        return fail_response(
            "selected_embedding_ids wajib berisi minimal 1 wajah yang dipilih.",
            status=400,
        )

    try:
        with transaction.atomic():
            selected_embeddings, missing_ids = get_embeddings_by_ids_for_update(
                clean_selected_ids
            )

            if missing_ids:
                return fail_response(
                    "Ada MemberFaceEmbedding yang tidak ditemukan.",
                    status=404,
                    data={"missing_embedding_ids": missing_ids},
                )

            staging_error, invalid_staging_embeddings = validate_embeddings_are_staging(
                selected_embeddings
            )

            if staging_error:
                return fail_response(
                    staging_error,
                    status=409,
                    data={"embeddings": invalid_staging_embeddings},
                )

            face_data_error, invalid_face_embeddings = (
                validate_selected_embeddings_have_face_data(selected_embeddings)
            )

            if face_data_error:
                return fail_response(
                    face_data_error,
                    status=400,
                    data={"embeddings": invalid_face_embeddings},
                )

            if mode == "existing":
                member = (
                    Member.objects
                    .select_for_update()
                    .filter(id=member_id)
                    .first()
                )

                if not member:
                    return fail_response("Member tidak ditemukan.", status=404)

            else:
                member, member_error = create_member_from_payload(member_payload)

                if member_error:
                    return fail_response(member_error, status=400)

            activated_embeddings = []

            for embedding in selected_embeddings:
                embedding.member = member
                embedding.is_active = True
                embedding.save(update_fields=["member", "is_active"])
                activated_embeddings.append(embedding)

            return ok_response(
                message="Data wajah registration berhasil dijadikan face embedding aktif.",
                data={
                    "mode": "registration",
                    "view_mode": "selected_flat",
                    "member_mode": mode,
                    "member": serialize_member(member),
                    "processed_embedding_ids": [
                        embedding.id for embedding in activated_embeddings
                    ],
                    "activated_embedding_ids": [
                        embedding.id for embedding in activated_embeddings
                    ],
                    "embeddings": [
                        serialize_member_face_embedding(embedding)
                        for embedding in activated_embeddings
                    ],
                },
                status=200,
            )

    except Exception as e:
        return fail_response(
            "Gagal memproses wajah registration.",
            status=500,
            data={"error": str(e)},
        )


# ============================================================
# POST: REJECT SELECTED REGISTRATION FACES
# ============================================================

@csrf_exempt
@require_http_methods(["POST"])
def registration_reject_faces_action(request):
    """
    POST /api/cv/validation-registration/actions/reject/

    Payload baru:
    {
      "selected_embedding_ids": [10, 11, 12]
    }

    Payload lama tetap diterima:
    {
      "embedding_ids": [10, 11, 12]
    }

    Rules baru:
    - Hanya selected embedding yang dihapus.
    - Tidak ada group.
    - Tidak ada data attendance yang dibuat.
    """

    body = parse_body(request)

    if body is None:
        return fail_response("Body request harus JSON valid.", status=400)

    selected_embedding_ids = (
        body.get("selected_embedding_ids")
        or body.get("embedding_ids")
        or body.get("record_ids")
        or []
    )

    clean_selected_ids, selected_ids_error = parse_id_list(
        selected_embedding_ids,
        "selected_embedding_ids",
    )

    if selected_ids_error:
        return fail_response(selected_ids_error, status=400)

    if len(clean_selected_ids) == 0:
        return fail_response(
            "selected_embedding_ids wajib berisi minimal 1 MemberFaceEmbedding.",
            status=400,
        )

    try:
        with transaction.atomic():
            selected_embeddings, missing_ids = get_embeddings_by_ids_for_update(
                clean_selected_ids
            )

            if missing_ids:
                return fail_response(
                    "Ada MemberFaceEmbedding yang tidak ditemukan.",
                    status=404,
                    data={"missing_embedding_ids": missing_ids},
                )

            staging_error, invalid_staging_embeddings = validate_embeddings_are_staging(
                selected_embeddings
            )

            if staging_error:
                return fail_response(
                    staging_error,
                    status=409,
                    data={"embeddings": invalid_staging_embeddings},
                )

            deleted_ids = []

            for embedding in selected_embeddings:
                deleted_ids.append(embedding.id)
                embedding.delete()

            return ok_response(
                message="Data wajah registration terpilih berhasil dihapus.",
                data={
                    "mode": "registration",
                    "view_mode": "selected_flat",
                    "processed_embedding_ids": deleted_ids,
                    "deleted_embedding_ids": deleted_ids,
                },
                status=200,
            )

    except Exception as e:
        return fail_response(
            "Gagal menghapus wajah registration.",
            status=500,
            data={"error": str(e)},
        )