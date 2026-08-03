# cv_attandance/views/viewsValidationai.py

import base64
import math

import numpy as np

from django.db.models import Q
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from attendance.models import (
    Attendance,
    WorshipSession,
    TimelineDataRecord,
    Member,
    Guest,
    MemberFaceEmbedding,
)

from django.core.paginator import EmptyPage, PageNotAnInteger, Paginator

from ..config import (
    UNKNOWN_SAME_FACE_SIM,
    UNKNOWN_GROUPING_SIM,
    AMBIGUOUS_VALIDATION_PAGE_SIZE,
)


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


def bool_query(request, key, default=True):
    raw = request.GET.get(key)

    if raw is None:
        return default

    return str(raw).strip().lower() in ["true", "1", "yes", "on"]

def normalize_text(value):
    return (value or "").strip()

def get_latest_guest_face_record_map(guests):
    """
    Membuat mapping:

    {
        guest_id: TimelineDataRecord
    }

    Evidence diambil dari attendance terbaru Guest.
    """

    guest_ids = [
        guest.id
        for guest in guests
        if guest and guest.id
    ]

    if not guest_ids:
        return {}

    attendances = (
        Attendance.objects
        .filter(
            guest_id__in=guest_ids,
            facedetection__isnull=False,
            facedetection__face_image__isnull=False,
        )
        .select_related("facedetection")
        .order_by(
            "guest_id",
            "-check_in_time",
            "-created_at",
            "-id",
        )
    )

    result = {}

    for attendance in attendances:
        if attendance.guest_id in result:
            continue

        result[attendance.guest_id] = (
            attendance.facedetection
        )

    return result
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
def serialize_guest(
    guest,
    face_record=None,
):
    return {
        "id": guest.id,
        "full_name": guest.full_name,
        "phone": guest.phone,
        "visit_count": guest.visit_count,
        "first_visit": (
            guest.first_visit.isoformat()
            if guest.first_visit
            else None
        ),
        "last_visit": (
            guest.last_visit.isoformat()
            if guest.last_visit
            else None
        ),
        "from_where": guest.from_where,
        "notes": guest.notes,
        "face_image": image_bytes_to_base64(
            face_record.face_image
            if face_record
            else None
        ),
        "face_record_id": (
            face_record.id
            if face_record
            else None
        ),
        "created_at": (
            guest.created_at.isoformat()
            if guest.created_at
            else None
        ),
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
        threshold = UNKNOWN_GROUPING_SIM

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
def build_session_summary_payload(session):
    pending_records = get_pending_records_for_session(session)

    unknown_count = pending_records.filter(detection_status="unknown").count()
    ambiguous_count = pending_records.filter(detection_status="ambiguous").count()
    total_pending = unknown_count + ambiguous_count

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
            "total_pending": total_pending,
            "total_unknown_records": unknown_count,
            "total_unknown_people_groups": None,
            "total_ambiguous_records": ambiguous_count,
        },

        # Penting: halaman awal tidak membawa image base64.
        "unknown_people_groups": [],
        "ambiguous_records": [],
        "ambiguous_pagination": {
            "page": 1,
            "page_size": AMBIGUOUS_VALIDATION_PAGE_SIZE,
            "total_items": ambiguous_count,
            "total_pages": 1,
            "has_next": False,
            "has_previous": False,
            "next_page": None,
            "previous_page": None,
        },
    }

def build_session_validation_payload(
    session,
    include_encoding=False,
    ambiguous_page=1,
    ambiguous_page_size=None,
    include_unknown=True,
    include_ambiguous=True,
):
    if ambiguous_page_size is None:
        ambiguous_page_size = AMBIGUOUS_VALIDATION_PAGE_SIZE

    ambiguous_page = safe_int(
        ambiguous_page,
        default=1,
        min_value=1,
    )

    ambiguous_page_size = safe_int(
        ambiguous_page_size,
        default=AMBIGUOUS_VALIDATION_PAGE_SIZE,
        min_value=1,
        max_value=50,
    )

    pending_records = get_pending_records_for_session(session)

    unknown_qs = pending_records.filter(detection_status="unknown")
    ambiguous_qs = pending_records.filter(detection_status="ambiguous")

    total_unknown_records = unknown_qs.count()
    total_ambiguous_records = ambiguous_qs.count()

    unknown_groups = []

    if include_unknown:
        unknown_records = list(unknown_qs.order_by("capture_time", "id"))

        unknown_groups = group_unknown_records(
            unknown_records,
            threshold=UNKNOWN_GROUPING_SIM,
            include_encoding=include_encoding,
        )

    ambiguous_records = []
    paginator = Paginator(ambiguous_qs.order_by("capture_time", "id"), ambiguous_page_size)

    try:
        page_obj = paginator.page(ambiguous_page)
    except PageNotAnInteger:
        page_obj = paginator.page(1)
    except EmptyPage:
        page_obj = paginator.page(paginator.num_pages if paginator.num_pages else 1)

    if include_ambiguous:
        ambiguous_records = [
            serialize_timeline_record(record, include_encoding)
            for record in page_obj.object_list
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
            "total_pending": total_unknown_records + total_ambiguous_records,
            "total_unknown_records": total_unknown_records,
            "total_unknown_people_groups": len(unknown_groups) if include_unknown else None,
            "total_ambiguous_records": total_ambiguous_records,
        },
        "unknown_people_groups": unknown_groups,
        "ambiguous_records": ambiguous_records,
        "ambiguous_pagination": {
            "page": page_obj.number,
            "page_size": ambiguous_page_size,
            "total_items": total_ambiguous_records,
            "total_pages": paginator.num_pages,
            "has_next": page_obj.has_next(),
            "has_previous": page_obj.has_previous(),
            "next_page": page_obj.next_page_number() if page_obj.has_next() else None,
            "previous_page": page_obj.previous_page_number() if page_obj.has_previous() else None,
        },
    }

# ============================================================
# GET /api/cv/validation-ai/sessions/
# Menampilkan semua WorshipSession yang masih punya pending validation
# ============================================================
@require_http_methods(["GET"])
def validation_ai_sessions(request):
    """
    GET /api/cv/validation-ai/sessions/

    Default:
    - hanya summary
    - tidak kirim face image
    - ringan untuk page awal

    Optional:
    ?detail=true
    untuk backward compatibility jika butuh response lama.
    """

    try:
        include_encoding = request.GET.get("include_encoding", "false").lower() == "true"
        load_detail = request.GET.get("detail", "false").lower() == "true"

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

            if load_detail:
                payload = build_session_validation_payload(
                    session,
                    include_encoding=include_encoding,
                    ambiguous_page=1,
                    ambiguous_page_size=AMBIGUOUS_VALIDATION_PAGE_SIZE,
                    include_unknown=True,
                    include_ambiguous=True,
                )
            else:
                payload = build_session_summary_payload(session)

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
    GET /api/cv/validation-ai/sessions/<session_id>/

    Query:
    ?ambiguous_page=1
    ?ambiguous_page_size=50
    ?include_unknown=true
    ?include_ambiguous=true

    Dipanggil hanya saat card session dibuka.
    """

    try:
        include_encoding = request.GET.get("include_encoding", "false").lower() == "true"

        ambiguous_page = safe_int(
            request.GET.get("ambiguous_page", 1),
            default=1,
            min_value=1,
        )

        ambiguous_page_size = safe_int(
            request.GET.get("ambiguous_page_size", AMBIGUOUS_VALIDATION_PAGE_SIZE),
            default=AMBIGUOUS_VALIDATION_PAGE_SIZE,
            min_value=1,
            max_value=50,
        )

        include_unknown = bool_query(request, "include_unknown", True)
        include_ambiguous = bool_query(request, "include_ambiguous", True)

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
                    "ambiguous_pagination": {
                        "page": 1,
                        "page_size": ambiguous_page_size,
                        "total_items": 0,
                        "total_pages": 1,
                        "has_next": False,
                        "has_previous": False,
                        "next_page": None,
                        "previous_page": None,
                    },
                },
                status=200,
            )

        payload = build_session_validation_payload(
            session,
            include_encoding=include_encoding,
            ambiguous_page=ambiguous_page,
            ambiguous_page_size=ambiguous_page_size,
            include_unknown=include_unknown,
            include_ambiguous=include_ambiguous,
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
    Data pendukung Validation AI:

    - Member aktif.
    - Guest yang belum dikonversi menjadi Member.

    Satu Guest hanya mempunyai satu row di t_guest.
    Face image Guest diambil dari attendance evidence terbaru.
    """

    try:
        keyword = request.GET.get(
            "q",
            "",
        ).strip()

        members = (
            Member.objects
            .filter(member_status="active")
            .order_by("full_name")
        )

        guests = (
            Guest.objects
            .filter(
                converted_to_member__isnull=True
            )
            .order_by(
                "full_name",
                "id",
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

        member_list = list(members)
        guest_list = list(guests)

        guest_face_record_map = (
            get_latest_guest_face_record_map(
                guest_list
            )
        )

        members_data = [
            serialize_member(member)
            for member in member_list
        ]

        guests_data = [
            serialize_guest(
                guest,
                face_record=guest_face_record_map.get(
                    guest.id
                ),
            )
            for guest in guest_list
        ]

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
                "message": (
                    "Gagal mengambil data member dan "
                    "Guest untuk validasi AI"
                ),
                "error": str(e),
            },
            status=500,
        )