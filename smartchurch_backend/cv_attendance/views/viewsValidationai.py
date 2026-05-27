# cv_attandance/views/viewsValidationai.py

import base64
import math

import numpy as np

from django.db.models import Q
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from attendance.models import (
    WorshipSession,
    TimelineDataRecord,
    Member,
    Guest,
    MemberFaceEmbedding,
)

from ..config import UNKNOWN_SAME_FACE_SIM


# ============================================================
# Helper: ubah BinaryField image ke base64 supaya bisa ditampilkan di React
# ============================================================
def image_bytes_to_base64(image_bytes):
    if not image_bytes:
        return None

    try:
        encoded = base64.b64encode(image_bytes).decode("utf-8")
        return f"data:image/jpeg;base64,{encoded}"
    except Exception:
        return None


# ============================================================
# Helper: aman convert Decimal / None ke float
# ============================================================
def safe_float(value):
    if value is None:
        return None

    try:
        return float(value)
    except Exception:
        return None

def normalize_text(value):
    return (value or "").strip()


def normalize_identity_value(value):
    """
    Untuk grouping data guest yang sebenarnya orang yang sama:
    - None dan "" dianggap sama
    - spasi depan belakang dibuang
    - double space dirapikan
    - case-insensitive
    """

    value = normalize_text(value)
    value = " ".join(value.split())
    return value.lower()


def get_guest_dedupe_key(guest):
    """
    Identity guest untuk list frontend:
    full_name + first_visit + from_where

    Jadi kalau nama sama tapi first_visit/from_where beda,
    tetap dianggap orang/identity berbeda.
    """

    first_visit_key = guest.first_visit.isoformat() if guest.first_visit else ""

    return (
        normalize_identity_value(guest.full_name),
        first_visit_key,
        normalize_identity_value(guest.from_where),
    )


def guest_is_better_for_frontend(candidate, current):
    """
    Pilih row guest terbaik untuk ditampilkan ke frontend.

    Prioritas:
    1. visit_count paling tinggi
    2. last_visit paling baru
    3. created_at paling baru
    4. id paling besar
    """

    candidate_visit_count = candidate.visit_count or 0
    current_visit_count = current.visit_count or 0

    if candidate_visit_count != current_visit_count:
        return candidate_visit_count > current_visit_count

    candidate_last_visit = candidate.last_visit
    current_last_visit = current.last_visit

    if candidate_last_visit != current_last_visit:
        if candidate_last_visit is None:
            return False
        if current_last_visit is None:
            return True
        return candidate_last_visit > current_last_visit

    candidate_created_at = candidate.created_at
    current_created_at = current.created_at

    if candidate_created_at != current_created_at:
        if candidate_created_at is None:
            return False
        if current_created_at is None:
            return True
        return candidate_created_at > current_created_at

    return candidate.id > current.id


def get_latest_unique_guests_for_frontend(guests_queryset):
    """
    Dari banyak row Guest, kirim hanya 1 row per identity:
    full_name + first_visit + from_where.

    Yang dipilih adalah visit_count paling tinggi.
    """

    unique_guests = {}

    for guest in guests_queryset:
        key = get_guest_dedupe_key(guest)
        current_guest = unique_guests.get(key)

        if current_guest is None or guest_is_better_for_frontend(guest, current_guest):
            unique_guests[key] = guest

    return sorted(
        unique_guests.values(),
        key=lambda guest: (
            normalize_identity_value(guest.full_name),
            guest.first_visit or timezone.datetime.min.date(),
            normalize_identity_value(guest.from_where),
        ),
    )

# ============================================================
# Helper: serialize Member untuk frontend validation AI
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


# ============================================================
# Helper: serialize Guest untuk frontend validation AI
# ============================================================
def serialize_guest(guest):
    return {
        "id": guest.id,
        "full_name": guest.full_name,
        "phone": guest.phone,
        "visit_count": guest.visit_count,
        "first_visit": guest.first_visit.isoformat() if guest.first_visit else None,
        "last_visit": guest.last_visit.isoformat() if guest.last_visit else None,
        "from_where": guest.from_where,
        "notes": guest.notes,
        "face_image": image_bytes_to_base64(guest.face_image),
        "created_at": guest.created_at.isoformat() if guest.created_at else None,
    }


# ============================================================
# Helper: cari 1 member paling mirip berdasarkan face encoding
# Dipakai untuk unknown group agar frontend punya rekomendasi AI
# ============================================================
def get_best_member_recommendation(face_encoding):
    if not is_valid_encoding(face_encoding):
        return None

    best_match = None
    best_similarity = -1.0

    embeddings = (
        MemberFaceEmbedding.objects
        .filter(is_active=True, face_encoding__isnull=False)
        .select_related("member")
    )

    for embedding in embeddings:
        similarity = cosine_similarity(face_encoding, embedding.face_encoding)

        if similarity > best_similarity:
            best_similarity = similarity
            best_match = embedding.member

    if not best_match:
        return None

    return {
        "member_id": best_match.id,
        "full_name": best_match.full_name,
        "similarity": round(best_similarity * 100, 2),
        "note": "Rekomendasi AI paling mendekati dari data face embedding jemaat",
    }


# ============================================================
# Helper: validasi face encoding
# ============================================================
def is_valid_encoding(encoding):
    if not encoding:
        return False

    if not isinstance(encoding, list):
        return False

    if len(encoding) == 0:
        return False

    return True


# ============================================================
# Helper: cosine similarity antar face embedding
# ============================================================
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


# ============================================================
# Helper: serialize TimelineDataRecord
# ============================================================
# ============================================================
# Helper: serialize TimelineDataRecord
# ============================================================
def serialize_timeline_record(record, include_encoding=False):
    matched_member_name = None

    if record.matched_member:
        matched_member_name = record.matched_member.full_name

    data = {
        "id": record.id,
        "capture_time": record.capture_time.isoformat() if record.capture_time else None,
        "detection_status": record.detection_status,
        "validation_status": record.validation_status,
        "confidence": safe_float(record.confidence),
        "matched_member_id": record.matched_member_id,
        "matched_member_name": matched_member_name,
        "final_member_id": record.final_member_id,
        "final_guest_id": record.final_guest_id,
        "face_image": image_bytes_to_base64(record.face_image),
        "notes": record.notes,
    }

    if record.detection_status == "ambiguous" and record.matched_member:
        data["ai_recommendation"] = {
            "member_id": record.matched_member.id,
            "full_name": record.matched_member.full_name,
            "similarity": safe_float(record.confidence),
            "note": "Kandidat paling mendekati dari hasil recognition AI",
        }

    if include_encoding:
        data["face_encoding"] = record.face_encoding

    return data

# ============================================================
# Helper: grouping unknown berdasarkan face embedding
# ============================================================
def group_unknown_records(records, threshold=None, include_encoding=False):
    """
    records: QuerySet/list TimelineDataRecord dengan detection_status='unknown'

    Output:
    [
        {
            "group_id": "people_1",
            "label": "People 1",
            "count": 3,
            "record_ids": [1, 2, 3],
            "first_capture_time": "...",
            "last_capture_time": "...",
            "representative_image": "data:image/jpeg;base64,...",
            "average_confidence": 40.12,
            "records": [...]
        }
    ]

    Logic:
    - Ambil record unknown pending.
    - Bandingkan face_encoding dengan centroid tiap group.
    - Kalau similarity >= threshold, masuk group tersebut.
    - Kalau tidak cocok dengan group manapun, buat People baru.
    """

    if threshold is None:
        threshold = UNKNOWN_SAME_FACE_SIM

    groups = []

    for record in records:
        encoding = record.face_encoding

        # Kalau encoding rusak/kosong, tetap tampil sebagai group sendiri
        if not is_valid_encoding(encoding):
            groups.append(
                {
                    "group_id": f"people_{len(groups) + 1}",
                    "label": f"People {len(groups) + 1}",
                    "count": 1,
                    "record_ids": [record.id],
                    "first_capture_time": record.capture_time.isoformat() if record.capture_time else None,
                    "last_capture_time": record.capture_time.isoformat() if record.capture_time else None,
                    "representative_image": image_bytes_to_base64(record.face_image),
                    "average_confidence": safe_float(record.confidence),
                    "records": [serialize_timeline_record(record, include_encoding)],
                    "_centroid": None,
                    "_confidences": [safe_float(record.confidence) or 0],
                }
            )
            continue

        matched_group = None
        best_similarity = -1.0

        for group in groups:
            centroid = group.get("_centroid")
            if centroid is None:
                continue

            similarity = cosine_similarity(encoding, centroid)

            if similarity > best_similarity:
                best_similarity = similarity

            if similarity >= threshold:
                matched_group = group
                break

        if matched_group is None:
            # Buat group baru
            groups.append(
                {
                    "group_id": f"people_{len(groups) + 1}",
                    "label": f"People {len(groups) + 1}",
                    "count": 1,
                    "record_ids": [record.id],
                    "first_capture_time": record.capture_time.isoformat() if record.capture_time else None,
                    "last_capture_time": record.capture_time.isoformat() if record.capture_time else None,
                    "representative_image": image_bytes_to_base64(record.face_image),
                    "average_confidence": safe_float(record.confidence),
                    "records": [serialize_timeline_record(record, include_encoding)],
                    "_centroid": encoding,
                    "_encodings": [encoding],
                    "_confidences": [safe_float(record.confidence) or 0],
                }
            )
        else:
            # Masukkan ke group yang sudah ada
            matched_group["records"].append(
                serialize_timeline_record(record, include_encoding)
            )
            matched_group["record_ids"].append(record.id)
            matched_group["count"] += 1

            if record.capture_time:
                matched_group["last_capture_time"] = record.capture_time.isoformat()

            matched_group["_encodings"].append(encoding)
            matched_group["_confidences"].append(safe_float(record.confidence) or 0)

            # Update centroid group
            try:
                enc_array = np.array(matched_group["_encodings"], dtype=np.float32)
                centroid = np.mean(enc_array, axis=0)
                matched_group["_centroid"] = centroid.tolist()
            except Exception:
                pass

            # Update rata-rata confidence
            confs = matched_group.get("_confidences", [])
            if confs:
                matched_group["average_confidence"] = round(sum(confs) / len(confs), 2)

            # Pakai image dengan confidence tertinggi sebagai representative image
            current_conf = safe_float(record.confidence) or 0
            old_avg = matched_group.get("average_confidence") or 0
            if current_conf >= old_avg:
                matched_group["representative_image"] = image_bytes_to_base64(record.face_image)

    # Bersihkan field internal sebelum dikirim ke frontend
    cleaned_groups = []
    for group in groups:
        centroid = group.get("_centroid")

        if centroid is not None:
            group["ai_recommendation"] = get_best_member_recommendation(centroid)
        else:
            first_record = group["records"][0] if group.get("records") else None
            if first_record and include_encoding:
                group["ai_recommendation"] = get_best_member_recommendation(
                    first_record.get("face_encoding")
                )
            else:
                group["ai_recommendation"] = None

        group.pop("_centroid", None)
        group.pop("_encodings", None)
        group.pop("_confidences", None)
        cleaned_groups.append(group)

    return cleaned_groups


# ============================================================
# Helper: ambil pending record berdasarkan waktu session
# ============================================================
def get_pending_records_for_session(session):
    """
    Karena TimelineDataRecord belum punya FK langsung ke WorshipSession,
    maka matching dilakukan berdasarkan capture_time di antara start_time dan end_time.

    Jika end_time masih NULL, berarti session masih berjalan,
    maka batas akhirnya pakai timezone.now().
    """

    if not session.start_time:
        return TimelineDataRecord.objects.none()

    start_time = session.start_time
    end_time = session.end_time or timezone.now()

    return (
        TimelineDataRecord.objects
        .filter(
            capture_time__gte=start_time,
            capture_time__lte=end_time,
            validation_status="pending",
            detection_status__in=["unknown", "ambiguous"],
        )
        .order_by("capture_time")
    )


# ============================================================
# Helper: serialize session + data validasi
# ============================================================
def build_session_validation_payload(session, include_encoding=False):
    pending_records = get_pending_records_for_session(session)

    unknown_records = [
        record for record in pending_records
        if record.detection_status == "unknown"
    ]

    ambiguous_records = [
        record for record in pending_records
        if record.detection_status == "ambiguous"
    ]

    unknown_groups = group_unknown_records(
        unknown_records,
        threshold=UNKNOWN_SAME_FACE_SIM,
        include_encoding=include_encoding,
    )

    ambiguous_items = [
        serialize_timeline_record(record, include_encoding)
        for record in ambiguous_records
    ]

    return {
        "session": {
            "id": session.id,
            "session_name": session.session_name,
            "date": session.date.isoformat() if session.date else None,
            "start_time": session.start_time.isoformat() if session.start_time else None,
            "end_time": session.end_time.isoformat() if session.end_time else None,
            "status": session.status,
        },
        "summary": {
            "total_pending": len(unknown_records) + len(ambiguous_records),
            "total_unknown_records": len(unknown_records),
            "total_unknown_people_groups": len(unknown_groups),
            "total_ambiguous_records": len(ambiguous_records),
        },
        "unknown_people_groups": unknown_groups,
        "ambiguous_records": ambiguous_items,
    }


# ============================================================
# GET /api/cv/validation-ai/sessions/
# Menampilkan semua WorshipSession yang masih punya pending validation
# ============================================================
@require_http_methods(["GET"])
def validation_ai_sessions(request):
    """
    Dipakai saat halaman Validasi AI pertama kali dibuka.

    Response:
    {
        "success": true,
        "count": 2,
        "sessions": [
            {
                "session": {...},
                "summary": {...},
                "unknown_people_groups": [...],
                "ambiguous_records": [...]
            }
        ]
    }
    """

    try:
        include_encoding = request.GET.get("include_encoding", "false").lower() == "true"

        sessions = (
            WorshipSession.objects
            .filter(start_time__isnull=False)
            .order_by("-start_time")
        )

        result = []

        for session in sessions:
            pending_records = get_pending_records_for_session(session)

            if not pending_records.exists():
                continue

            payload = build_session_validation_payload(
                session,
                include_encoding=include_encoding,
            )
            result.append(payload)

        return JsonResponse(
            {
                "success": True,
                "count": len(result),
                "sessions": result,
            },
            status=200,
        )

    except Exception as e:
        return JsonResponse(
            {
                "success": False,
                "message": "Gagal mengambil data validasi AI",
                "error": str(e),
            },
            status=500,
        )


# ============================================================
# GET /api/cv/validation-ai/sessions/<session_id>/
# Menampilkan detail validasi untuk 1 WorshipSession
# ============================================================
@require_http_methods(["GET"])
def validation_ai_session_detail(request, session_id):
    """
    Dipakai kalau frontend mau buka detail satu session saja.
    """

    try:
        include_encoding = request.GET.get("include_encoding", "false").lower() == "true"

        try:
            session = WorshipSession.objects.get(id=session_id)
        except WorshipSession.DoesNotExist:
            return JsonResponse(
                {
                    "success": False,
                    "message": "Worship session tidak ditemukan",
                },
                status=404,
            )

        pending_records = get_pending_records_for_session(session)

        if not pending_records.exists():
            return JsonResponse(
                {
                    "success": True,
                    "message": "Tidak ada data yang perlu divalidasi pada session ini",
                    "session": {
                        "id": session.id,
                        "session_name": session.session_name,
                        "date": session.date.isoformat() if session.date else None,
                        "start_time": session.start_time.isoformat() if session.start_time else None,
                        "end_time": session.end_time.isoformat() if session.end_time else None,
                        "status": session.status,
                    },
                    "summary": {
                        "total_pending": 0,
                        "total_unknown_records": 0,
                        "total_unknown_people_groups": 0,
                        "total_ambiguous_records": 0,
                    },
                    "unknown_people_groups": [],
                    "ambiguous_records": [],
                },
                status=200,
            )

        payload = build_session_validation_payload(
            session,
            include_encoding=include_encoding,
        )

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
                "message": "Gagal mengambil detail validasi AI",
                "error": str(e),
            },
            status=500,
        )
    
# ============================================================
# GET /api/cv/validation-ai/data-member-guest/
# Data pendukung untuk pencarian member dan guest di frontend
# ============================================================
@require_http_methods(["GET"])
def validation_ai_member_guest_data(request):
    """
    Dipakai frontend validation AI untuk:
    - dropdown / search jemaat lama
    - pencarian tamu lama

    Query optional:
    ?q=nama

    Untuk guests:
    - Guest table menyimpan 1 row per kunjungan.
    - Frontend tidak perlu melihat duplicate orang yang sama.
    - Maka guest dikirim unique berdasarkan:
      full_name + first_visit + from_where.
    - Jika ada beberapa row dengan identity sama,
      yang dikirim adalah visit_count paling tinggi.
    """

    try:
        keyword = request.GET.get("q", "").strip()

        members = (
            Member.objects
            .filter(member_status="active")
            .order_by("full_name")
        )

        guests = (
            Guest.objects
            .all()
            .order_by(
                "full_name",
                "first_visit",
                "from_where",
                "-visit_count",
                "-last_visit",
                "-created_at",
                "-id",
            )
        )

        if keyword:
            members = members.filter(
                Q(full_name__icontains=keyword)
                | Q(nickname__icontains=keyword)
                | Q(phone__icontains=keyword)
                | Q(email__icontains=keyword)
            )

            guests = guests.filter(
                Q(full_name__icontains=keyword)
                | Q(phone__icontains=keyword)
                | Q(from_where__icontains=keyword)
            )

        unique_guests = get_latest_unique_guests_for_frontend(guests)

        members_data = [serialize_member(member) for member in members]
        guests_data = [serialize_guest(guest) for guest in unique_guests]

        return JsonResponse(
            {
                "success": True,
                "members_count": len(members_data),
                "guests_count": len(guests_data),
                "members": members_data,
                "guests": guests_data,
            },
            status=200,
        )

    except Exception as e:
        return JsonResponse(
            {
                "success": False,
                "message": "Gagal mengambil data member dan guest untuk validasi AI",
                "error": str(e),
            },
            status=500,
        )