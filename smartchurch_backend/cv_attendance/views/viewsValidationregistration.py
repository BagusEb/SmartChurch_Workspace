import base64
import json

import numpy as np
from django.db import transaction
from django.db.models import Q
from django.http import JsonResponse
from django.utils.dateparse import parse_date
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from attendance.models import Member, MemberFaceEmbedding

from ..config import UNKNOWN_SAME_FACE_SIM


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


def safe_float(value):
    if value is None:
        return None

    try:
        return float(value)
    except Exception:
        return None


def is_valid_encoding(encoding):
    if not encoding:
        return False

    if not isinstance(encoding, list):
        return False

    return len(encoding) > 0


def cosine_similarity(encoding_a, encoding_b):
    try:
        vec_a = np.array(encoding_a, dtype=np.float32)
        vec_b = np.array(encoding_b, dtype=np.float32)

        norm_a = np.linalg.norm(vec_a)
        norm_b = np.linalg.norm(vec_b)

        if norm_a == 0 or norm_b == 0:
            return 0.0

        return float(np.dot(vec_a / norm_a, vec_b / norm_b))
    except Exception:
        return 0.0


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
    data = {
        "id": embedding.id,
        "embedding_id": embedding.id,
        "created_at": embedding.created_at.isoformat()
        if embedding.created_at
        else None,
        "member_id": embedding.member_id,
        "is_active": embedding.is_active,
        "face_image": image_bytes_to_base64(embedding.face_image),
    }

    if include_encoding:
        data["face_encoding"] = embedding.face_encoding

    return data


def get_registration_queryset():
    """
    Staging registration:
    - member NULL
    - is_active NULL
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


def group_registration_embeddings(embeddings, threshold=None, include_encoding=False):
    if threshold is None:
        threshold = UNKNOWN_SAME_FACE_SIM

    groups = []

    for embedding in embeddings:
        encoding = embedding.face_encoding

        if not is_valid_encoding(encoding):
            groups.append(
                {
                    "group_id": f"reg_people_{len(groups) + 1}",
                    "label": f"Registration People {len(groups) + 1}",
                    "count": 1,
                    "embedding_ids": [embedding.id],
                    "record_ids": [embedding.id],
                    "first_created_at": embedding.created_at.isoformat()
                    if embedding.created_at
                    else None,
                    "last_created_at": embedding.created_at.isoformat()
                    if embedding.created_at
                    else None,
                    "representative_image": image_bytes_to_base64(embedding.face_image),
                    "records": [
                        serialize_registration_embedding(
                            embedding,
                            include_encoding=include_encoding,
                        )
                    ],
                    "_centroid": None,
                    "_encodings": [],
                }
            )
            continue

        matched_group = None

        for group in groups:
            centroid = group.get("_centroid")

            if centroid is None:
                continue

            similarity = cosine_similarity(encoding, centroid)

            if similarity >= threshold:
                matched_group = group
                break

        if matched_group is None:
            groups.append(
                {
                    "group_id": f"reg_people_{len(groups) + 1}",
                    "label": f"Registration People {len(groups) + 1}",
                    "count": 1,
                    "embedding_ids": [embedding.id],
                    "record_ids": [embedding.id],
                    "first_created_at": embedding.created_at.isoformat()
                    if embedding.created_at
                    else None,
                    "last_created_at": embedding.created_at.isoformat()
                    if embedding.created_at
                    else None,
                    "representative_image": image_bytes_to_base64(embedding.face_image),
                    "records": [
                        serialize_registration_embedding(
                            embedding,
                            include_encoding=include_encoding,
                        )
                    ],
                    "_centroid": encoding,
                    "_encodings": [encoding],
                }
            )

        else:
            matched_group["records"].append(
                serialize_registration_embedding(
                    embedding,
                    include_encoding=include_encoding,
                )
            )
            matched_group["embedding_ids"].append(embedding.id)
            matched_group["record_ids"].append(embedding.id)
            matched_group["count"] += 1

            if embedding.created_at:
                matched_group["last_created_at"] = embedding.created_at.isoformat()

            matched_group["_encodings"].append(encoding)

            try:
                enc_array = np.array(matched_group["_encodings"], dtype=np.float32)
                centroid = np.mean(enc_array, axis=0)
                matched_group["_centroid"] = centroid.tolist()
            except Exception:
                pass

            # Representative image: pakai image pertama yang tersedia.
            if not matched_group.get("representative_image") and embedding.face_image:
                matched_group["representative_image"] = image_bytes_to_base64(
                    embedding.face_image
                )

    cleaned_groups = []

    for group in groups:
        group.pop("_centroid", None)
        group.pop("_encodings", None)
        cleaned_groups.append(group)

    return cleaned_groups


def build_registration_payload(include_encoding=False):
    embeddings = list(get_registration_queryset())

    groups = group_registration_embeddings(
        embeddings,
        threshold=UNKNOWN_SAME_FACE_SIM,
        include_encoding=include_encoding,
    )

    return {
        "mode": "registration",
        "summary": {
            "total_pending_embeddings": len(embeddings),
            "total_people_groups": len(groups),
        },
        "registration_people_groups": groups,
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


def serialize_member_face_embedding(embedding):
    return {
        "id": embedding.id,
        "member_id": embedding.member_id,
        "is_active": embedding.is_active,
        "created_at": embedding.created_at.isoformat()
        if embedding.created_at
        else None,
    }


@require_http_methods(["GET"])
def registration_validation_groups(request):
    """
    GET /api/cv/validation-registration/groups/

    Dipakai frontend setelah validation attendance kosong.
    Kalau masih ada MemberFaceEmbedding staging, tampilkan mode registration.
    """
    try:
        include_encoding = request.GET.get("include_encoding", "false").lower() == "true"
        payload = build_registration_payload(include_encoding=include_encoding)

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


@csrf_exempt
@require_http_methods(["POST"])
def registration_assign_member_faces_action(request):
    """
    POST /api/cv/validation-registration/actions/member/add-face/

    Payload existing member:
    {
      "mode": "existing",
      "member_id": 1,
      "embedding_ids": [10, 11, 12],
      "selected_embedding_ids": [10, 12]
    }

    Payload new member:
    {
      "mode": "new",
      "embedding_ids": [10, 11, 12],
      "selected_embedding_ids": [10, 12],
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

    Rules:
    - selected_embedding_ids menjadi face embedding aktif milik member.
    - embedding dalam group yang tidak dipilih akan dihapus.
    - Tidak membuat Attendance.
    - Tidak membuat TimelineDataRecord.
    """
    body = parse_body(request)

    if body is None:
        return fail_response("Body request harus JSON valid.", status=400)

    mode = body.get("mode") or "existing"
    member_id = body.get("member_id")
    member_payload = body.get("member") or {}

    embedding_ids = body.get("embedding_ids") or []
    selected_embedding_ids = body.get("selected_embedding_ids") or []

    if mode not in ["existing", "new"]:
        return fail_response("mode harus existing atau new.", status=400)

    if mode == "existing" and not member_id:
        return fail_response("member_id wajib dikirim untuk mode existing.", status=400)

    clean_embedding_ids, embedding_ids_error = parse_id_list(
        embedding_ids,
        "embedding_ids",
    )

    if embedding_ids_error:
        return fail_response(embedding_ids_error, status=400)

    clean_selected_ids, selected_ids_error = parse_id_list(
        selected_embedding_ids,
        "selected_embedding_ids",
    )

    if selected_ids_error:
        return fail_response(selected_ids_error, status=400)

    if len(clean_embedding_ids) == 0:
        return fail_response(
            "embedding_ids wajib berisi minimal 1 MemberFaceEmbedding.",
            status=400,
        )

    if len(clean_selected_ids) == 0:
        return fail_response(
            "selected_embedding_ids wajib berisi minimal 1 wajah yang dipilih.",
            status=400,
        )

    selected_not_in_group = [
        selected_id
        for selected_id in clean_selected_ids
        if selected_id not in clean_embedding_ids
    ]

    if selected_not_in_group:
        return fail_response(
            "Ada selected_embedding_ids yang tidak ada di embedding_ids.",
            status=400,
            data={"selected_ids_not_in_group": selected_not_in_group},
        )

    try:
        with transaction.atomic():
            embeddings = list(
                MemberFaceEmbedding.objects
                .select_for_update()
                .filter(id__in=clean_embedding_ids)
                .order_by("created_at", "id")
            )

            found_ids = {embedding.id for embedding in embeddings}
            missing_ids = [
                embedding_id
                for embedding_id in clean_embedding_ids
                if embedding_id not in found_ids
            ]

            if missing_ids:
                return fail_response(
                    "Ada MemberFaceEmbedding yang tidak ditemukan.",
                    status=404,
                    data={"missing_embedding_ids": missing_ids},
                )

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
                return fail_response(
                    "Ada embedding yang bukan staging registration atau sudah diproses.",
                    status=409,
                    data={"embeddings": invalid_embeddings},
                )

            selected_embeddings = [
                embedding
                for embedding in embeddings
                if embedding.id in clean_selected_ids
            ]

            invalid_selected_face_data = []

            for embedding in selected_embeddings:
                if not embedding.face_image or not is_valid_encoding(embedding.face_encoding):
                    invalid_selected_face_data.append(
                        {
                            "id": embedding.id,
                            "has_face_image": bool(embedding.face_image),
                            "has_valid_face_encoding": is_valid_encoding(
                                embedding.face_encoding
                            ),
                        }
                    )

            if invalid_selected_face_data:
                return fail_response(
                    "Ada wajah terpilih yang tidak memiliki face_image atau face_encoding valid.",
                    status=400,
                    data={"embeddings": invalid_selected_face_data},
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

            selected_id_set = {embedding.id for embedding in selected_embeddings}
            activated_embeddings = []
            deleted_embedding_ids = []

            for embedding in embeddings:
                if embedding.id in selected_id_set:
                    embedding.member = member
                    embedding.is_active = True
                    embedding.save(update_fields=["member", "is_active"])
                    activated_embeddings.append(embedding)

                else:
                    deleted_embedding_ids.append(embedding.id)
                    embedding.delete()

            return ok_response(
                message="Data wajah registration berhasil dijadikan face embedding aktif.",
                data={
                    "mode": "registration",
                    "member_mode": mode,
                    "member": serialize_member(member),
                    "activated_embedding_ids": [
                        embedding.id for embedding in activated_embeddings
                    ],
                    "deleted_embedding_ids": deleted_embedding_ids,
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


@csrf_exempt
@require_http_methods(["POST"])
def registration_reject_faces_action(request):
    """
    POST /api/cv/validation-registration/actions/reject/

    Payload:
    {
      "embedding_ids": [10, 11, 12]
    }

    Rules:
    - Semua staging embedding yang ditolak akan dihapus.
    """
    body = parse_body(request)

    if body is None:
        return fail_response("Body request harus JSON valid.", status=400)

    embedding_ids = body.get("embedding_ids") or body.get("record_ids") or []

    clean_embedding_ids, embedding_ids_error = parse_id_list(
        embedding_ids,
        "embedding_ids",
    )

    if embedding_ids_error:
        return fail_response(embedding_ids_error, status=400)

    if len(clean_embedding_ids) == 0:
        return fail_response(
            "embedding_ids wajib berisi minimal 1 MemberFaceEmbedding.",
            status=400,
        )

    try:
        with transaction.atomic():
            embeddings = list(
                MemberFaceEmbedding.objects
                .select_for_update()
                .filter(id__in=clean_embedding_ids)
                .order_by("created_at", "id")
            )

            found_ids = {embedding.id for embedding in embeddings}
            missing_ids = [
                embedding_id
                for embedding_id in clean_embedding_ids
                if embedding_id not in found_ids
            ]

            if missing_ids:
                return fail_response(
                    "Ada MemberFaceEmbedding yang tidak ditemukan.",
                    status=404,
                    data={"missing_embedding_ids": missing_ids},
                )

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
                return fail_response(
                    "Ada embedding yang bukan staging registration atau sudah diproses.",
                    status=409,
                    data={"embeddings": invalid_embeddings},
                )

            deleted_ids = []

            for embedding in embeddings:
                deleted_ids.append(embedding.id)
                embedding.delete()

            return ok_response(
                message="Data wajah registration berhasil dihapus.",
                data={
                    "mode": "registration",
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