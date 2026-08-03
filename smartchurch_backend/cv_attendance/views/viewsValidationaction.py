# cv_attandance/views/viewsValidationaction.py
import base64
import json

import numpy as np
from django.utils.dateparse import parse_date
from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from attendance.models import (
    Attendance,
    Guest,
    Member,
    MemberFaceEmbedding,
    TimelineDataRecord,
    WorshipSession,
)

from ..config import (
    GUEST_SAME_FACE_SIM,
    MAX_GUEST_REFERENCE_EMBEDDINGS_PER_GUEST,
)

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


def safe_float(value):
    if value is None:
        return None

    try:
        return float(value)
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


def is_valid_encoding(encoding):
    if not encoding:
        return False

    if not isinstance(encoding, list):
        return False

    if len(encoding) == 0:
        return False

    return True


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


def get_latest_guest_face_record(guest):
    """
    Mengambil evidence wajah terbaru milik Guest melalui:

    Guest
        -> Attendance
        -> TimelineDataRecord

    Guest tidak lagi menyimpan face_image atau face_encoding.
    """

    attendance = (
        Attendance.objects
        .filter(
            guest=guest,
            facedetection__isnull=False,
            facedetection__face_image__isnull=False,
        )
        .select_related("facedetection")
        .order_by(
            "-check_in_time",
            "-created_at",
            "-id",
        )
        .first()
    )

    if not attendance:
        return None

    return attendance.facedetection


def serialize_guest_for_validation(
    guest,
    similarity=None,
    face_record=None,
):
    """
    Serialize Guest untuk halaman Validation AI.

    Face image tidak dibaca dari t_guest, tetapi dari
    TimelineDataRecord yang menjadi evidence attendance Guest.
    """

    if face_record is None or not face_record.face_image:
        face_record = get_latest_guest_face_record(guest)

    data = {
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

    if similarity is not None:
        data["similarity"] = round(
            float(similarity) * 100,
            2,
        )

    return data


def get_record_visit_date(record, session):
    if record.capture_time:
        return record.capture_time.date()

    if session.date:
        return session.date

    return timezone.localdate()


def get_record_check_in_time(record):
    return record.capture_time or timezone.now()


def normalize_text(value):
    return (value or "").strip()

def normalize_identity_value(value):
    """
    Untuk membandingkan identity tamu:
    - None dan "" dianggap sama
    - spasi depan belakang dibuang
    - case-insensitive
    - double space dirapikan
    """

    value = normalize_text(value)
    value = " ".join(value.split())
    return value.lower()


def ensure_facedetection_not_used(record):
    used = (
        Attendance.objects
        .select_for_update()
        .filter(facedetection=record)
        .first()
    )

    if used:
        return "Face detection record ini sudah dipakai oleh attendance lain."

    return None

def get_existing_guest_attendance(session, guest):
    """
    Mengambil attendance Guest pada worship session yang sama.

    UniqueConstraint pada Attendance memastikan satu Guest hanya
    memiliki satu attendance dalam satu worship session.
    """

    return (
        Attendance.objects
        .select_for_update()
        .filter(
            session=session,
            guest=guest,
        )
        .first()
    )


def update_guest_visit_for_new_attendance(guest, visit_date):
    """
    Update statistik Guest ketika attendance baru benar-benar dibuat.

    Function ini tidak boleh dipanggil untuk:
    - duplicate attendance dalam session yang sama;
    - attendance manual/legacy yang hanya dilengkapi evidence;
    - proses idempotent.
    """

    guest.visit_count = int(guest.visit_count or 0) + 1

    if (
        guest.first_visit is None
        or visit_date < guest.first_visit
    ):
        guest.first_visit = visit_date

    if (
        guest.last_visit is None
        or visit_date > guest.last_visit
    ):
        guest.last_visit = visit_date

    guest.save(
        update_fields=[
            "visit_count",
            "first_visit",
            "last_visit",
        ]
    )

    return guest


def create_or_update_guest_attendance(
    session,
    guest,
    record,
):
    """
    Membuat atau melengkapi Attendance Guest.

    Return:
        attendance
        error
        attendance_created

    Rules:
    - Belum ada attendance:
      buat attendance baru dan return attendance_created=True.

    - Sudah ada attendance tanpa facedetection:
      lengkapi evidence attendance lama dan return False.

    - Sudah ada attendance dengan facedetection:
      caller harus menangani sebagai idempotent/already attended.
    """

    existing_attendance = get_existing_guest_attendance(
        session=session,
        guest=guest,
    )

    if (
        existing_attendance
        and existing_attendance.facedetection_id
    ):
        return existing_attendance, None, False

    used_queryset = (
        Attendance.objects
        .select_for_update()
        .filter(facedetection=record)
    )

    if existing_attendance:
        used_queryset = used_queryset.exclude(
            id=existing_attendance.id
        )

    facedetection_used = used_queryset.first()

    if facedetection_used:
        return (
            None,
            "Face detection record ini sudah dipakai oleh attendance lain.",
            False,
        )

    attendance_date = get_record_visit_date(
        record,
        session,
    )

    check_in_time = get_record_check_in_time(record)

    if existing_attendance:
        existing_attendance.member = None
        existing_attendance.guest = guest
        existing_attendance.facedetection = record
        existing_attendance.session = session
        existing_attendance.attendance_date = attendance_date
        existing_attendance.check_in_time = check_in_time
        existing_attendance.confidence = record.confidence
        existing_attendance.notes = (
            existing_attendance.notes or ""
        )

        existing_attendance.save(
            update_fields=[
                "member",
                "guest",
                "facedetection",
                "session",
                "attendance_date",
                "check_in_time",
                "confidence",
                "notes",
            ]
        )

        return existing_attendance, None, False

    try:
        attendance = Attendance.objects.create(
            member=None,
            guest=guest,
            facedetection=record,
            session=session,
            attendance_date=attendance_date,
            check_in_time=check_in_time,
            confidence=record.confidence,
            notes="",
        )

        return attendance, None, True

    except IntegrityError:
        return (
            None,
            (
                "Gagal membuat attendance karena Guest atau "
                "face detection sudah digunakan pada session ini."
            ),
            False,
        )
    
def clean_rejected_record(record, validated_at=None):
    """
    Untuk record yang ditolak:
    - row tetap ada
    - validation_status menjadi rejected
    - face_image dihapus
    - face_encoding dihapus
    - final_member/final_guest dikosongkan
    """

    record.validation_status = "rejected"
    record.final_member = None
    record.final_guest = None
    record.validated_at = validated_at or timezone.now()
    record.notes = ""
    record.face_image = None
    record.face_encoding = None

    record.save(
        update_fields=[
            "validation_status",
            "final_member",
            "final_guest",
            "validated_at",
            "notes",
            "face_image",
            "face_encoding",
        ]
    )

    return record

def record_is_inside_session(record, session):
    if not record.capture_time or not session.start_time:
        return False

    session_end_time = session.end_time or timezone.now()
    return session.start_time <= record.capture_time <= session_end_time


def pick_center_record(records, center_record_id=None):
    """
    Untuk unknown group:
    - Kalau frontend kirim center_record_id, pakai itu.
    - Kalau tidak dikirim, fallback pakai confidence tertinggi.
    """

    if center_record_id:
        for record in records:
            if str(record.id) == str(center_record_id):
                return record

        return None

    return sorted(
        records,
        key=lambda record: safe_float(record.confidence) or 0,
        reverse=True,
    )[0]


def serialize_attendance(attendance):
    return {
        "id": attendance.id,
        "member_id": attendance.member_id,
        "guest_id": attendance.guest_id,
        "facedetection_id": attendance.facedetection_id,
        "session_id": attendance.session_id,
        "attendance_date": attendance.attendance_date.isoformat()
        if attendance.attendance_date
        else None,
        "check_in_time": attendance.check_in_time.isoformat()
        if attendance.check_in_time
        else None,
        "confidence": safe_float(attendance.confidence),
        "notes": attendance.notes,
    }

def serialize_member_for_validation(member):
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


def clean_optional_text(value):
    value = normalize_text(value)
    return value or None


def parse_record_id_list(value, field_name):
    if value is None:
        return [], None

    if not isinstance(value, list):
        return None, f"{field_name} wajib berupa array."

    try:
        clean_ids = [int(item) for item in value]
        clean_ids = list(dict.fromkeys(clean_ids))
        return clean_ids, None
    except Exception:
        return None, f"{field_name} harus berisi angka id TimelineDataRecord."


def get_records_by_ids_for_update(record_ids):
    records = list(
        TimelineDataRecord.objects
        .select_for_update()
        .filter(id__in=record_ids)
        .order_by("capture_time", "id")
    )

    found_ids = {record.id for record in records}
    missing_ids = [
        record_id
        for record_id in record_ids
        if record_id not in found_ids
    ]

    return records, missing_ids


def get_ordered_selected_records(records, selected_record_ids):
    record_map = {record.id: record for record in records}
    return [
        record_map[record_id]
        for record_id in selected_record_ids
        if record_id in record_map
    ]

def get_existing_member_attendance(session, member):
    """
    Mengambil attendance member pada worship session yang sama.

    select_for_update dipakai karena helper ini dipanggil di dalam
    transaction.atomic(), sehingga request validasi untuk member yang sama
    tidak saling menimpa.
    """

    return (
        Attendance.objects
        .select_for_update()
        .filter(
            session=session,
            member=member,
        )
        .first()
    )


def delete_validation_timeline_records(records):
    """
    Menghapus TimelineDataRecord yang sudah tidak diperlukan setelah
    action duplicate/already-attended selesai.

    Pengamanan penting:
    Attendance.facedetection memakai on_delete=CASCADE.
    Karena itu TimelineDataRecord yang sudah direferensikan Attendance
    tidak boleh langsung dihapus.
    """

    record_ids = list(
        dict.fromkeys(
            record.id
            for record in records
            if record and record.id
        )
    )

    if not record_ids:
        return [], None

    referenced_record_ids = list(
        Attendance.objects
        .select_for_update()
        .filter(facedetection_id__in=record_ids)
        .values_list("facedetection_id", flat=True)
    )

    referenced_record_ids = sorted(
        set(referenced_record_ids)
    )

    if referenced_record_ids:
        return None, (
            "TimelineDataRecord tidak dapat dihapus karena sudah digunakan "
            "oleh attendance. Referenced record ids: "
            f"{referenced_record_ids}"
        )

    TimelineDataRecord.objects.filter(
        id__in=record_ids
    ).delete()

    return record_ids, None

def validate_selected_records_have_face_data(selected_records):
    invalid_records = []

    for record in selected_records:
        if not record.face_image or not is_valid_encoding(record.face_encoding):
            invalid_records.append(
                {
                    "id": record.id,
                    "has_face_image": bool(record.face_image),
                    "has_valid_face_encoding": is_valid_encoding(record.face_encoding),
                }
            )

    if invalid_records:
        return (
            "Ada record terpilih yang tidak memiliki face_image atau face_encoding valid.",
            invalid_records,
        )

    return None, []


def create_member_from_validation_payload(member_payload):
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


def create_member_face_embeddings(member, selected_records):
    embeddings = []

    for record in selected_records:
        embedding = MemberFaceEmbedding.objects.create(
            member=member,
            face_encoding=record.face_encoding,
            face_image=record.face_image,
            is_active=True,
        )
        embeddings.append(embedding)

    return embeddings


def mark_record_verified_for_member(record, member, validated_at=None):
    record.validation_status = "verified"
    record.final_member = member
    record.final_guest = None
    record.validated_at = validated_at or timezone.now()
    record.notes = ""

    record.save(
        update_fields=[
            "validation_status",
            "final_member",
            "final_guest",
            "validated_at",
            "notes",
        ]
    )

    return record


def serialize_member_face_embedding(embedding):
    return {
        "id": embedding.id,
        "member_id": embedding.member_id,
        "is_active": embedding.is_active,
        "created_at": embedding.created_at.isoformat() if embedding.created_at else None,
    }

def create_or_update_member_attendance(session, member, center_record):
    """
    Membuat attendance untuk member yang benar-benar hadir.

    Flow utama:
    - Jika belum ada Attendance member pada session ini:
      buat row Attendance baru.
    - Jika sudah ada Attendance dengan facedetection:
      tolak sebagai duplicate.
    - Jika sudah ada Attendance tanpa facedetection:
      row tersebut dianggap manual/legacy attendance dan dilengkapi
      dengan evidence dari center_record.

    Function ini tidak bergantung pada pre-population.
    """

    existing_attendance = (
        Attendance.objects
        .select_for_update()
        .filter(session=session, member=member)
        .first()
    )

    if existing_attendance and existing_attendance.facedetection_id:
        return None,( 
            "Member ini sudah memiliki attendance valid "
            "pada session ini."
        )

    facedetection_used = (
        Attendance.objects
        .select_for_update()
        .filter(facedetection=center_record)
        .exclude(id=existing_attendance.id if existing_attendance else None)
        .first()
    )

    if facedetection_used:
        return None, "Face detection record ini sudah dipakai oleh attendance lain."

    attendance_date = (
        center_record.capture_time.date()
        if center_record.capture_time
        else session.date
    )

    check_in_time = center_record.capture_time or timezone.now()

    if existing_attendance:
        existing_attendance.member = member
        existing_attendance.guest = None
        existing_attendance.facedetection = center_record
        existing_attendance.session = session
        existing_attendance.attendance_date = attendance_date
        existing_attendance.check_in_time = check_in_time
        existing_attendance.confidence = center_record.confidence
        existing_attendance.notes = ""
        existing_attendance.save()

        return existing_attendance, None

    try:
        attendance = Attendance.objects.create(
            member=member,
            guest=None,
            facedetection=center_record,
            session=session,
            attendance_date=attendance_date,
            check_in_time=check_in_time,
            confidence=center_record.confidence,
            notes="",
        )

        return attendance, None
    except IntegrityError:
        return None, "Gagal membuat attendance karena face detection sudah digunakan."


@csrf_exempt
@require_http_methods(["POST"])
def validation_ai_verify_action(request):
    """
    POST /api/cv/validation-ai/actions/verify/

    Payload ambiguous:
    {
      "session_id": 6,
      "member_id": 1,
      "record_ids": [50]
    }

    Payload unknown group:
    {
      "session_id": 6,
      "member_id": 1,
      "record_ids": [61, 62, 63],
      "center_record_id": 62
    }

    center_record_id optional.
    Kalau tidak dikirim, backend memilih record dengan confidence tertinggi.
    """

    body = parse_body(request)

    if body is None:
        return fail_response("Body request harus JSON valid.", status=400)

    session_id = body.get("session_id")
    member_id = body.get("member_id")
    record_ids = body.get("record_ids") or []
    center_record_id = body.get("center_record_id")

    if not session_id:
        return fail_response("session_id wajib dikirim.", status=400)

    if not member_id:
        return fail_response("member_id wajib dikirim.", status=400)

    if not isinstance(record_ids, list) or len(record_ids) == 0:
        return fail_response(
            "record_ids wajib berupa array dan minimal berisi 1 record.",
            status=400,
        )

    try:
        clean_record_ids = [int(record_id) for record_id in record_ids]
        clean_record_ids = list(dict.fromkeys(clean_record_ids))
    except Exception:
        return fail_response("record_ids harus berisi angka id TimelineDataRecord.", status=400)

    try:
        with transaction.atomic():
            session = (
                WorshipSession.objects
                .select_for_update()
                .filter(id=session_id)
                .first()
            )

            if not session:
                return fail_response("Worship session tidak ditemukan.", status=404)

            member = Member.objects.filter(id=member_id).first()

            if not member:
                return fail_response("Member tidak ditemukan.", status=404)

            records = list(
                TimelineDataRecord.objects
                .select_for_update()
                .filter(id__in=clean_record_ids)
                .order_by("capture_time", "id")
            )

            found_record_ids = {record.id for record in records}
            missing_record_ids = [
                record_id
                for record_id in clean_record_ids
                if record_id not in found_record_ids
            ]

            if missing_record_ids:
                return fail_response(
                    "Ada TimelineDataRecord yang tidak ditemukan.",
                    status=404,
                    data={"missing_record_ids": missing_record_ids},
                )

            invalid_session_record_ids = [
                record.id
                for record in records
                if not record_is_inside_session(record, session)
            ]

            if invalid_session_record_ids:
                return fail_response(
                    "Ada record yang tidak masuk dalam range waktu worship session ini.",
                    status=400,
                    data={"invalid_record_ids": invalid_session_record_ids},
                )

            not_pending_records = [
                {
                    "id": record.id,
                    "validation_status": record.validation_status,
                }
                for record in records
                if record.validation_status != "pending"
            ]

            if not_pending_records:
                return fail_response(
                    "Ada record yang sudah pernah diproses.",
                    status=409,
                    data={"records": not_pending_records},
                )

            detection_statuses = {record.detection_status for record in records}

            if detection_statuses == {"ambiguous"}:
                if len(records) != 1:
                    return fail_response(
                        "Action verified untuk ambiguous hanya boleh 1 record.",
                        status=400,
                    )

                mode = "ambiguous"
                center_record = records[0]
                rejected_records = []

            elif detection_statuses == {"unknown"}:
                mode = "unknown_group"
                center_record = pick_center_record(
                    records=records,
                    center_record_id=center_record_id,
                )

                if not center_record:
                    return fail_response(
                        "center_record_id tidak ditemukan di record_ids.",
                        status=400,
                    )

                rejected_records = [
                    record
                    for record in records
                    if record.id != center_record.id
                ]

            else:
                return fail_response(
                    "record_ids tidak boleh mencampur status ambiguous dan unknown.",
                    status=400,
                    data={"detection_statuses": list(detection_statuses)},
                )

            # ======================================================
            # IDEMPOTENT VERIFY
            # Jika member sudah hadir pada session ini:
            # - request tetap success;
            # - attendance lama tidak diubah;
            # - tidak membuat attendance baru;
            # - semua pending timeline yang sedang diproses dihapus.
            # ======================================================
            existing_attendance = get_existing_member_attendance(
                session=session,
                member=member,
            )

            if existing_attendance:
                deleted_record_ids, delete_error = (
                    delete_validation_timeline_records(records)
                )

                if delete_error:
                    return fail_response(
                        delete_error,
                        status=409,
                        data={
                            "session_id": session.id,
                            "member_id": member.id,
                            "processed_record_ids": [
                                record.id
                                for record in records
                            ],
                        },
                    )

                return ok_response(
                    message=(
                        f"{member.full_name} sudah tercatat hadir pada "
                        "session ini. Attendance tidak diubah."
                    ),
                    data={
                        "mode": mode,
                        "already_attended": True,
                        "attendance_skipped": True,
                        "attendance_action": "skipped_existing",
                        "session": {
                            "id": session.id,
                            "session_name": session.session_name,
                            "date": (
                                session.date.isoformat()
                                if session.date
                                else None
                            ),
                        },
                        "member": {
                            "id": member.id,
                            "full_name": member.full_name,
                        },
                        "attendance": serialize_attendance(
                            existing_attendance
                        ),
                        "verified_record_id": None,
                        "rejected_record_ids": [],
                        "deleted_record_ids": deleted_record_ids,
                        "processed_record_ids": deleted_record_ids,
                    },
                    status=200,
                )

            attendance, attendance_error = create_or_update_member_attendance(
                session=session,
                member=member,
                center_record=center_record,
            )

            if attendance_error:
                return fail_response(
                    attendance_error,
                    status=409,
                    data={
                        "session_id": session.id,
                        "member_id": member.id,
                    },
                )

            validated_at = timezone.now()

            center_record.validation_status = "verified"
            center_record.final_member = member
            center_record.final_guest = None
            center_record.validated_at = validated_at
            center_record.notes = ""
            center_record.save()

            rejected_record_ids = []
            for record in rejected_records:
                clean_rejected_record(record, validated_at=validated_at)
                rejected_record_ids.append(record.id)

            return ok_response(
                message="Data berhasil diverifikasi dan masuk ke attendance.",
                data={
                    "mode": mode,
                    "already_attended": False,
                    "attendance_skipped": False,
                    "attendance_action": "created_or_updated",
                    "session": {
                        "id": session.id,
                        "session_name": session.session_name,
                        "date": session.date.isoformat() if session.date else None,
                    },
                    "member": {
                        "id": member.id,
                        "full_name": member.full_name,
                    },
                    "attendance": serialize_attendance(attendance),
                    "verified_record_id": center_record.id,
                    "rejected_record_ids": rejected_record_ids,
                    "deleted_record_ids": [],
                    "processed_record_ids": [record.id for record in records],
                },
                status=200,
            )

    except Exception as e:
        return fail_response(
            "Gagal memproses action verified.",
            status=500,
            data={"error": str(e)},
        )
    
@csrf_exempt
@require_http_methods(["POST"])
def validation_ai_reject_action(request):
    """
    POST /api/cv/validation-ai/actions/reject/

    Payload ambiguous:
    {
      "session_id": 6,
      "record_ids": [50]
    }

    Payload unknown group:
    {
      "session_id": 6,
      "record_ids": [61, 62, 63]
    }
    """

    body = parse_body(request)

    if body is None:
        return fail_response("Body request harus JSON valid.", status=400)

    session_id = body.get("session_id")
    record_ids = body.get("record_ids") or []

    if not session_id:
        return fail_response("session_id wajib dikirim.", status=400)

    if not isinstance(record_ids, list) or len(record_ids) == 0:
        return fail_response(
            "record_ids wajib berupa array dan minimal berisi 1 record.",
            status=400,
        )

    try:
        clean_record_ids = [int(record_id) for record_id in record_ids]
        clean_record_ids = list(dict.fromkeys(clean_record_ids))
    except Exception:
        return fail_response(
            "record_ids harus berisi angka id TimelineDataRecord.",
            status=400,
        )

    try:
        with transaction.atomic():
            session = (
                WorshipSession.objects
                .select_for_update()
                .filter(id=session_id)
                .first()
            )

            if not session:
                return fail_response("Worship session tidak ditemukan.", status=404)

            records = list(
                TimelineDataRecord.objects
                .select_for_update()
                .filter(id__in=clean_record_ids)
                .order_by("capture_time", "id")
            )

            found_record_ids = {record.id for record in records}
            missing_record_ids = [
                record_id
                for record_id in clean_record_ids
                if record_id not in found_record_ids
            ]

            if missing_record_ids:
                return fail_response(
                    "Ada TimelineDataRecord yang tidak ditemukan.",
                    status=404,
                    data={"missing_record_ids": missing_record_ids},
                )

            invalid_session_record_ids = [
                record.id
                for record in records
                if not record_is_inside_session(record, session)
            ]

            if invalid_session_record_ids:
                return fail_response(
                    "Ada record yang tidak masuk dalam range waktu worship session ini.",
                    status=400,
                    data={"invalid_record_ids": invalid_session_record_ids},
                )

            not_pending_records = [
                {
                    "id": record.id,
                    "validation_status": record.validation_status,
                }
                for record in records
                if record.validation_status != "pending"
            ]

            if not_pending_records:
                return fail_response(
                    "Ada record yang sudah pernah diproses.",
                    status=409,
                    data={"records": not_pending_records},
                )

            detection_statuses = {record.detection_status for record in records}

            if detection_statuses == {"ambiguous"}:
                mode = "ambiguous_flat" if len(records) > 1 else "ambiguous"

            elif detection_statuses == {"unknown"}:
                mode = "unknown_group"

            else:
                return fail_response(
                    "record_ids tidak boleh mencampur status ambiguous dan unknown.",
                    status=400,
                    data={"detection_statuses": list(detection_statuses)},
                )

            validated_at = timezone.now()
            rejected_record_ids = []

            for record in records:
                clean_rejected_record(record, validated_at=validated_at)
                rejected_record_ids.append(record.id)

            return ok_response(
                message="Data berhasil ditolak dan data wajah sudah dibersihkan.",
                data={
                    "mode": mode,
                    "session": {
                        "id": session.id,
                        "session_name": session.session_name,
                        "date": session.date.isoformat() if session.date else None,
                    },
                    "rejected_record_ids": rejected_record_ids,
                    "processed_record_ids": [record.id for record in records],
                },
                status=200,
            )

    except Exception as e:
        return fail_response(
            "Gagal memproses action reject.",
            status=500,
            data={"error": str(e)},
        )

@csrf_exempt
@require_http_methods(["POST"])
def validation_ai_find_guest_by_ai_action(request):
    """
    POST /api/cv/validation-ai/actions/guest/find-by-ai/

    Payload:
    {
      "session_id": 6,
      "record_id": 61
    }

    Sumber reference Guest:

    Guest
        -> Attendance
        -> TimelineDataRecord.face_encoding

    Guest tidak lagi menyimpan face_encoding secara langsung.
    """

    body = parse_body(request)

    if body is None:
        return fail_response(
            "Body request harus JSON valid.",
            status=400,
        )

    session_id = body.get("session_id")
    record_id = body.get("record_id")

    if not session_id:
        return fail_response(
            "session_id wajib dikirim.",
            status=400,
        )

    if not record_id:
        return fail_response(
            "record_id wajib dikirim.",
            status=400,
        )

    try:
        with transaction.atomic():
            session = (
                WorshipSession.objects
                .select_for_update()
                .filter(id=session_id)
                .first()
            )

            if not session:
                return fail_response(
                    "Worship session tidak ditemukan.",
                    status=404,
                )

            record = (
                TimelineDataRecord.objects
                .select_for_update()
                .filter(id=record_id)
                .first()
            )

            if not record:
                return fail_response(
                    "TimelineDataRecord tidak ditemukan.",
                    status=404,
                )

            if not record_is_inside_session(record, session):
                return fail_response(
                    (
                        "Record tidak masuk dalam range waktu "
                        "worship session ini."
                    ),
                    status=400,
                )

            if record.validation_status != "pending":
                return fail_response(
                    "Record ini sudah pernah diproses.",
                    status=409,
                    data={
                        "record_id": record.id,
                        "validation_status": (
                            record.validation_status
                        ),
                    },
                )

            if record.detection_status not in [
                "unknown",
                "ambiguous",
            ]:
                return fail_response(
                    (
                        "Find Guest by AI hanya untuk "
                        "detection_status unknown atau ambiguous."
                    ),
                    status=400,
                    data={
                        "detection_status": (
                            record.detection_status
                        )
                    },
                )

            if not is_valid_encoding(record.face_encoding):
                return fail_response(
                    (
                        "Record ini tidak memiliki "
                        "face_encoding yang valid."
                    ),
                    status=400,
                )

            # ======================================================
            # GUEST FACE REFERENCES
            #
            # Sumber:
            # Attendance.guest
            # Attendance.facedetection.face_encoding
            #
            # Guest converted_to_member tidak lagi dianggap Guest.
            # ======================================================
            guest_attendances = (
                Attendance.objects
                .filter(
                    guest__isnull=False,
                    guest__converted_to_member__isnull=True,
                    facedetection__isnull=False,
                    facedetection__face_encoding__isnull=False,
                )
                .select_related(
                    "guest",
                    "facedetection",
                )
                .order_by(
                    "guest_id",
                    "-check_in_time",
                    "-id",
                )
            )

            guest_reference_counts = {}

            best_guest = None
            best_reference_record = None
            best_reference_attendance = None
            best_similarity = -1.0
            total_references_checked = 0

            for attendance in guest_attendances:
                guest = attendance.guest
                reference_record = attendance.facedetection

                if not guest or not reference_record:
                    continue

                face_encoding = reference_record.face_encoding

                if not is_valid_encoding(face_encoding):
                    continue

                current_count = guest_reference_counts.get(
                    guest.id,
                    0,
                )

                if (
                    current_count
                    >= MAX_GUEST_REFERENCE_EMBEDDINGS_PER_GUEST
                ):
                    continue

                guest_reference_counts[guest.id] = (
                    current_count + 1
                )

                total_references_checked += 1

                similarity = cosine_similarity(
                    record.face_encoding,
                    face_encoding,
                )

                if similarity > best_similarity:
                    best_similarity = similarity
                    best_guest = guest
                    best_reference_record = reference_record
                    best_reference_attendance = attendance

            if not best_guest:
                return ok_response(
                    message=(
                        "Belum ada attendance Guest dengan "
                        "face encoding yang dapat dibandingkan."
                    ),
                    data={
                        "found": False,
                        "threshold": round(
                            GUEST_SAME_FACE_SIM * 100,
                            2,
                        ),
                        "references_checked": 0,
                        "recommendation": None,
                    },
                    status=200,
                )

            is_match = (
                best_similarity >= GUEST_SAME_FACE_SIM
            )

            recommendation = serialize_guest_for_validation(
                best_guest,
                similarity=best_similarity,
                face_record=best_reference_record,
            )

            recommendation["reference"] = {
                "attendance_id": (
                    best_reference_attendance.id
                    if best_reference_attendance
                    else None
                ),
                "timeline_record_id": (
                    best_reference_record.id
                    if best_reference_record
                    else None
                ),
                "capture_time": (
                    best_reference_record.capture_time.isoformat()
                    if (
                        best_reference_record
                        and best_reference_record.capture_time
                    )
                    else None
                ),
            }

            return ok_response(
                message=(
                    "Rekomendasi tamu ditemukan."
                    if is_match
                    else (
                        "Kandidat tamu ditemukan, tetapi "
                        "similarity belum melewati threshold."
                    )
                ),
                data={
                    "found": is_match,
                    "threshold": round(
                        GUEST_SAME_FACE_SIM * 100,
                        2,
                    ),
                    "references_checked": (
                        total_references_checked
                    ),
                    "recommendation": recommendation,
                },
                status=200,
            )

    except Exception as e:
        return fail_response(
            "Gagal menjalankan Find Guest by AI.",
            status=500,
            data={"error": str(e)},
        )

@csrf_exempt
@require_http_methods(["POST"])
def validation_ai_confirm_guest_action(request):
    """
    POST /api/cv/validation-ai/actions/guest/confirm/

    Existing Guest:
    {
      "session_id": 6,
      "record_id": 61,
      "record_ids": [61, 62, 63],
      "mode": "existing",
      "source_guest_id": 10
    }

    New Guest:
    {
      "session_id": 6,
      "record_id": 61,
      "record_ids": [61, 62, 63],
      "mode": "new",
      "guest": {
        "full_name": "Jonathan Sitorus",
        "phone": "0812xxxx",
        "from_where": "Jakarta"
      }
    }

    Rules:
    - Existing Guest menggunakan row t_guest yang sama.
    - Tidak membuat row Guest baru untuk kunjungan berikutnya.
    - Attendance baru menambah visit_count dan meng-update last_visit.
    - Jika Guest sudah hadir di session yang sama:
      action tetap success, tidak menambah attendance/visit_count.
    - New Guest membuat satu row Guest baru.
    - Evidence wajah tetap disimpan di TimelineDataRecord.
    """

    body = parse_body(request)

    if body is None:
        return fail_response(
            "Body request harus JSON valid.",
            status=400,
        )

    session_id = body.get("session_id")
    record_id = body.get("record_id")
    record_ids = body.get("record_ids") or []
    mode = body.get("mode") or "existing"
    source_guest_id = body.get("source_guest_id")
    guest_payload = body.get("guest") or {}

    if not session_id:
        return fail_response(
            "session_id wajib dikirim.",
            status=400,
        )

    if not record_id:
        return fail_response(
            "record_id wajib dikirim.",
            status=400,
        )

    if mode not in ["existing", "new"]:
        return fail_response(
            "mode harus existing atau new.",
            status=400,
        )

    if mode == "existing" and not source_guest_id:
        return fail_response(
            "source_guest_id wajib dikirim untuk mode existing.",
            status=400,
        )

    if (
        mode == "new"
        and not normalize_text(
            guest_payload.get("full_name")
        )
    ):
        return fail_response(
            "Nama tamu wajib diisi untuk mode new.",
            status=400,
        )

    try:
        selected_record_id = int(record_id)
    except Exception:
        return fail_response(
            (
                "record_id harus berupa angka id "
                "TimelineDataRecord."
            ),
            status=400,
        )

    try:
        clean_record_ids = [
            int(item)
            for item in record_ids
        ]
        clean_record_ids = list(
            dict.fromkeys(clean_record_ids)
        )
    except Exception:
        return fail_response(
            (
                "record_ids harus berisi angka id "
                "TimelineDataRecord."
            ),
            status=400,
        )

    # Ambiguous tetap dapat berjalan walaupun frontend
    # tidak mengirim record_ids.
    if selected_record_id not in clean_record_ids:
        clean_record_ids.append(selected_record_id)

    try:
        with transaction.atomic():
            session = (
                WorshipSession.objects
                .select_for_update()
                .filter(id=session_id)
                .first()
            )

            if not session:
                return fail_response(
                    "Worship session tidak ditemukan.",
                    status=404,
                )

            records = list(
                TimelineDataRecord.objects
                .select_for_update()
                .filter(id__in=clean_record_ids)
                .order_by(
                    "capture_time",
                    "id",
                )
            )

            found_record_ids = {
                item.id
                for item in records
            }

            missing_record_ids = [
                item
                for item in clean_record_ids
                if item not in found_record_ids
            ]

            if missing_record_ids:
                return fail_response(
                    (
                        "Ada TimelineDataRecord "
                        "yang tidak ditemukan."
                    ),
                    status=404,
                    data={
                        "missing_record_ids": (
                            missing_record_ids
                        )
                    },
                )

            record = next(
                (
                    item
                    for item in records
                    if item.id == selected_record_id
                ),
                None,
            )

            if not record:
                return fail_response(
                    (
                        "Selected TimelineDataRecord "
                        "tidak ditemukan."
                    ),
                    status=404,
                )

            invalid_session_record_ids = [
                item.id
                for item in records
                if not record_is_inside_session(
                    item,
                    session,
                )
            ]

            if invalid_session_record_ids:
                return fail_response(
                    (
                        "Ada record yang tidak masuk dalam "
                        "range waktu worship session ini."
                    ),
                    status=400,
                    data={
                        "invalid_record_ids": (
                            invalid_session_record_ids
                        )
                    },
                )

            not_pending_records = [
                {
                    "id": item.id,
                    "validation_status": (
                        item.validation_status
                    ),
                }
                for item in records
                if item.validation_status != "pending"
            ]

            if not_pending_records:
                return fail_response(
                    "Ada record yang sudah pernah diproses.",
                    status=409,
                    data={
                        "records": not_pending_records
                    },
                )

            detection_statuses = {
                item.detection_status
                for item in records
            }

            if detection_statuses == {"ambiguous"}:
                if len(records) != 1:
                    return fail_response(
                        (
                            "Confirm Guest untuk ambiguous "
                            "hanya boleh 1 record."
                        ),
                        status=400,
                    )

                process_mode = "ambiguous"
                rejected_records = []

            elif detection_statuses == {"unknown"}:
                process_mode = "unknown_group"

                rejected_records = [
                    item
                    for item in records
                    if item.id != record.id
                ]

            else:
                return fail_response(
                    (
                        "record_ids tidak boleh mencampur "
                        "status ambiguous dan unknown."
                    ),
                    status=400,
                    data={
                        "detection_statuses": list(
                            detection_statuses
                        )
                    },
                )

            if not record.face_image:
                return fail_response(
                    (
                        "Record ini tidak memiliki "
                        "face_image."
                    ),
                    status=400,
                )

            if not is_valid_encoding(record.face_encoding):
                return fail_response(
                    (
                        "Record ini tidak memiliki "
                        "face_encoding yang valid."
                    ),
                    status=400,
                )

            visit_date = get_record_visit_date(
                record,
                session,
            )

            # ======================================================
            # RESOLVE GUEST
            # ======================================================
            if mode == "existing":
                guest = (
                    Guest.objects
                    .select_for_update()
                    .filter(id=source_guest_id)
                    .first()
                )

                if not guest:
                    return fail_response(
                        "Guest tidak ditemukan.",
                        status=404,
                    )

                if guest.converted_to_member_id is not None:
                    return fail_response(
                        (
                            "Guest ini sudah dikonversi menjadi "
                            "member dan tidak dapat diproses "
                            "kembali sebagai Guest."
                        ),
                        status=409,
                        data={
                            "guest_id": guest.id,
                            "converted_to_member_id": (
                                guest.converted_to_member_id
                            ),
                        },
                    )

            else:
                guest = Guest.objects.create(
                    full_name=normalize_text(
                        guest_payload.get("full_name")
                    ),
                    phone=clean_optional_text(
                        guest_payload.get("phone")
                    ),
                    visit_count=0,
                    first_visit=None,
                    last_visit=None,
                    converted_to_member=None,
                    notes="",
                    from_where=clean_optional_text(
                        guest_payload.get("from_where")
                    ),
                )

            # ======================================================
            # IDEMPOTENT GUEST
            #
            # Guest sudah hadir pada session yang sama:
            # - tidak error;
            # - attendance lama tidak diubah;
            # - visit_count tidak bertambah;
            # - last_visit tidak berubah;
            # - pending timeline action ini dihapus.
            # ======================================================
            existing_attendance = (
                get_existing_guest_attendance(
                    session=session,
                    guest=guest,
                )
            )

            if (
                existing_attendance
                and existing_attendance.facedetection_id
            ):
                deleted_record_ids, delete_error = (
                    delete_validation_timeline_records(
                        records
                    )
                )

                if delete_error:
                    return fail_response(
                        delete_error,
                        status=409,
                        data={
                            "session_id": session.id,
                            "guest_id": guest.id,
                            "processed_record_ids": [
                                item.id
                                for item in records
                            ],
                        },
                    )

                return ok_response(
                    message=(
                        f"{guest.full_name} sudah tercatat "
                        "sebagai Guest pada session ini. "
                        "Attendance dan visit count tidak diubah."
                    ),
                    data={
                        "process_mode": process_mode,
                        "guest_mode": mode,
                        "already_attended": True,
                        "attendance_skipped": True,
                        "attendance_action": (
                            "skipped_existing"
                        ),
                        "visit_incremented": False,
                        "session": {
                            "id": session.id,
                            "session_name": (
                                session.session_name
                            ),
                            "date": (
                                session.date.isoformat()
                                if session.date
                                else None
                            ),
                        },
                        "guest": (
                            serialize_guest_for_validation(
                                guest
                            )
                        ),
                        "attendance": (
                            serialize_attendance(
                                existing_attendance
                            )
                        ),
                        "guest_confirmed_record_id": None,
                        "rejected_record_ids": [],
                        "deleted_record_ids": (
                            deleted_record_ids
                        ),
                        "processed_record_ids": (
                            deleted_record_ids
                        ),
                    },
                    status=200,
                )

            # ======================================================
            # CREATE / COMPLETE ATTENDANCE
            # ======================================================
            (
                attendance,
                attendance_error,
                attendance_created,
            ) = create_or_update_guest_attendance(
                session=session,
                guest=guest,
                record=record,
            )

            if attendance_error:
                return fail_response(
                    attendance_error,
                    status=409,
                    data={
                        "session_id": session.id,
                        "record_id": record.id,
                        "guest_id": guest.id,
                    },
                )

            # Hanya attendance yang benar-benar baru yang
            # menambah visit count.
            if attendance_created:
                update_guest_visit_for_new_attendance(
                    guest=guest,
                    visit_date=visit_date,
                )

            validated_at = timezone.now()

            record.validation_status = "guest_confirmed"
            record.final_member = None
            record.final_guest = guest
            record.validated_at = validated_at
            record.notes = ""

            record.save(
                update_fields=[
                    "validation_status",
                    "final_member",
                    "final_guest",
                    "validated_at",
                    "notes",
                ]
            )

            rejected_record_ids = []

            for rejected_record in rejected_records:
                clean_rejected_record(
                    rejected_record,
                    validated_at=validated_at,
                )

                rejected_record_ids.append(
                    rejected_record.id
                )

            return ok_response(
                message=(
                    "Data berhasil dikonfirmasi sebagai "
                    "Guest dan masuk ke attendance."
                ),
                data={
                    "process_mode": process_mode,
                    "guest_mode": mode,
                    "guest_action": (
                        "created"
                        if mode == "new"
                        else "updated_existing"
                    ),
                    "already_attended": False,
                    "attendance_skipped": False,
                    "attendance_action": (
                        "created"
                        if attendance_created
                        else "completed_existing"
                    ),
                    "visit_incremented": (
                        attendance_created
                    ),
                    "session": {
                        "id": session.id,
                        "session_name": (
                            session.session_name
                        ),
                        "date": (
                            session.date.isoformat()
                            if session.date
                            else None
                        ),
                    },
                    "guest": (
                        serialize_guest_for_validation(
                            guest,
                            face_record=record,
                        )
                    ),
                    "timeline_record": {
                        "id": record.id,
                        "validation_status": (
                            record.validation_status
                        ),
                        "final_guest_id": (
                            record.final_guest_id
                        ),
                    },
                    "attendance": (
                        serialize_attendance(attendance)
                    ),
                    "guest_confirmed_record_id": (
                        record.id
                    ),
                    "rejected_record_ids": (
                        rejected_record_ids
                    ),
                    "deleted_record_ids": [],
                    "processed_record_ids": [
                        item.id
                        for item in records
                    ],
                },
                status=200,
            )

    except Exception as e:
        return fail_response(
            "Gagal memproses confirm Guest.",
            status=500,
            data={"error": str(e)},
        )

@csrf_exempt
@require_http_methods(["POST"])
def validation_ai_add_member_face_action(request):
    """
    POST /api/cv/validation-ai/actions/member/add-face/

    Payload existing member, ambiguous:
    {
      "session_id": 6,
      "mode": "existing",
      "member_id": 1,
      "record_ids": [50],
      "selected_record_ids": [50]
    }

    Payload existing member, unknown group:
    {
      "session_id": 6,
      "mode": "existing",
      "member_id": 1,
      "record_ids": [61, 62, 63],
      "selected_record_ids": [61, 63]
    }

    Payload new member:
    {
      "session_id": 6,
      "mode": "new",
      "record_ids": [61, 62, 63],
      "selected_record_ids": [61, 63],
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
    """

    body = parse_body(request)

    if body is None:
        return fail_response("Body request harus JSON valid.", status=400)

    session_id = body.get("session_id")
    mode = body.get("mode") or "existing"
    member_id = body.get("member_id")
    member_payload = body.get("member") or {}

    record_ids = body.get("record_ids") or []
    selected_record_ids = body.get("selected_record_ids") or []

    if not session_id:
        return fail_response("session_id wajib dikirim.", status=400)

    if mode not in ["existing", "new"]:
        return fail_response("mode harus existing atau new.", status=400)

    if mode == "existing" and not member_id:
        return fail_response("member_id wajib dikirim untuk mode existing.", status=400)

    clean_record_ids, record_ids_error = parse_record_id_list(
        record_ids,
        "record_ids",
    )

    if record_ids_error:
        return fail_response(record_ids_error, status=400)

    clean_selected_record_ids, selected_ids_error = parse_record_id_list(
        selected_record_ids,
        "selected_record_ids",
    )

    if selected_ids_error:
        return fail_response(selected_ids_error, status=400)

    if len(clean_record_ids) == 0:
        return fail_response(
            "record_ids wajib berisi minimal 1 TimelineDataRecord.",
            status=400,
        )

    try:
        with transaction.atomic():
            session = (
                WorshipSession.objects
                .select_for_update()
                .filter(id=session_id)
                .first()
            )

            if not session:
                return fail_response("Worship session tidak ditemukan.", status=404)

            records, missing_record_ids = get_records_by_ids_for_update(clean_record_ids)

            if missing_record_ids:
                return fail_response(
                    "Ada TimelineDataRecord yang tidak ditemukan.",
                    status=404,
                    data={"missing_record_ids": missing_record_ids},
                )

            invalid_session_record_ids = [
                record.id
                for record in records
                if not record_is_inside_session(record, session)
            ]

            if invalid_session_record_ids:
                return fail_response(
                    "Ada record yang tidak masuk dalam range waktu worship session ini.",
                    status=400,
                    data={"invalid_record_ids": invalid_session_record_ids},
                )

            not_pending_records = [
                {
                    "id": record.id,
                    "validation_status": record.validation_status,
                }
                for record in records
                if record.validation_status != "pending"
            ]

            if not_pending_records:
                return fail_response(
                    "Ada record yang sudah pernah diproses.",
                    status=409,
                    data={"records": not_pending_records},
                )

            detection_statuses = {record.detection_status for record in records}

            if detection_statuses == {"ambiguous"}:
                process_mode = "ambiguous_flat" if len(records) > 1 else "ambiguous"

                # Untuk ambiguous flat selected-mode:
                # frontend mengirim record_ids = selected ids.
                # Jika selected_record_ids kosong, backend pakai semua record_ids.
                if len(clean_selected_record_ids) == 0:
                    clean_selected_record_ids = [record.id for record in records]

            elif detection_statuses == {"unknown"}:
                process_mode = "unknown_group"

                if len(clean_selected_record_ids) == 0:
                    return fail_response(
                        "selected_record_ids wajib berisi minimal 1 record untuk unknown group.",
                        status=400,
                    )

            else:
                return fail_response(
                    "record_ids tidak boleh mencampur status ambiguous dan unknown.",
                    status=400,
                    data={"detection_statuses": list(detection_statuses)},
                )

            record_id_set = {record.id for record in records}
            selected_ids_not_in_group = [
                record_id
                for record_id in clean_selected_record_ids
                if record_id not in record_id_set
            ]

            if selected_ids_not_in_group:
                return fail_response(
                    "Ada selected_record_ids yang tidak ada di record_ids.",
                    status=400,
                    data={"selected_ids_not_in_group": selected_ids_not_in_group},
                )

            selected_records = get_ordered_selected_records(
                records=records,
                selected_record_ids=clean_selected_record_ids,
            )

            selected_face_error, invalid_face_records = validate_selected_records_have_face_data(
                selected_records
            )

            if selected_face_error:
                return fail_response(
                    selected_face_error,
                    status=400,
                    data={"records": invalid_face_records},
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
                member, member_error = create_member_from_validation_payload(
                    member_payload
                )

                if member_error:
                    return fail_response(member_error, status=400)

            # ======================================================
            # ADD MEMBER FACE UNTUK MEMBER YANG SUDAH HADIR
            #
            # Jika attendance member sudah tersedia:
            # - simpan semua selected face ke MemberFaceEmbedding;
            # - jangan mengubah atau membuat attendance;
            # - hapus seluruh TimelineDataRecord dalam action/group.
            #
            # Embedding dibuat sebelum timeline dihapus karena source image
            # dan encoding berasal dari TimelineDataRecord.
            # Seluruh proses masih berada dalam transaction.atomic().
            # ======================================================
            existing_attendance = get_existing_member_attendance(
                session=session,
                member=member,
            )

            if existing_attendance:
                embeddings = create_member_face_embeddings(
                    member=member,
                    selected_records=selected_records,
                )

                deleted_record_ids, delete_error = (
                    delete_validation_timeline_records(records)
                )

                if delete_error:
                    return fail_response(
                        delete_error,
                        status=409,
                        data={
                            "session_id": session.id,
                            "member_id": member.id,
                            "processed_record_ids": [
                                record.id
                                for record in records
                            ],
                        },
                    )

                return ok_response(
                    message=(
                        f"{len(embeddings)} data wajah berhasil ditambahkan "
                        f"ke {member.full_name}. Member ini sudah hadir, "
                        "sehingga attendance tidak diubah."
                    ),
                    data={
                        "process_mode": process_mode,
                        "member_mode": mode,
                        "already_attended": True,
                        "attendance_skipped": True,
                        "attendance_action": "skipped_existing",
                        "session": {
                            "id": session.id,
                            "session_name": session.session_name,
                            "date": (
                                session.date.isoformat()
                                if session.date
                                else None
                            ),
                        },
                        "member": serialize_member_for_validation(member),
                        "attendance": serialize_attendance(
                            existing_attendance
                        ),
                        "attendance_record_id": None,
                        "verified_record_ids": [],
                        "rejected_record_ids": [],
                        "deleted_record_ids": deleted_record_ids,
                        "processed_record_ids": deleted_record_ids,
                        "embedding_ids": [
                            embedding.id
                            for embedding in embeddings
                        ],
                        "embeddings": [
                            serialize_member_face_embedding(embedding)
                            for embedding in embeddings
                        ],
                    },
                    status=200,
                )

            # Record pertama sesuai urutan selected_record_ids dari frontend
            # yang akan masuk ke Attendance.facedetection.
            attendance_record = selected_records[0]

            attendance, attendance_error = create_or_update_member_attendance(
                session=session,
                member=member,
                center_record=attendance_record,
            )

            if attendance_error:
                return fail_response(
                    attendance_error,
                    status=409,
                    data={
                        "session_id": session.id,
                        "member_id": member.id,
                        "attendance_record_id": attendance_record.id,
                    },
                )
            
            # Simpan semua selected image ke MemberFaceEmbedding dulu.
            embeddings = create_member_face_embeddings(
                member=member,
                selected_records=selected_records,
            )


            validated_at = timezone.now()

            selected_record_id_set = {record.id for record in selected_records}
            verified_record_ids = []
            rejected_record_ids = []

            for record in records:
                if record.id in selected_record_id_set:
                    mark_record_verified_for_member(
                        record=record,
                        member=member,
                        validated_at=validated_at,
                    )
                    verified_record_ids.append(record.id)
                else:
                    clean_rejected_record(record, validated_at=validated_at)
                    rejected_record_ids.append(record.id)

            return ok_response(
                message="Data wajah berhasil ditambahkan ke member dan masuk ke attendance.",
                data={
                    "process_mode": process_mode,
                    "member_mode": mode,
                    "already_attended": False,
                    "attendance_skipped": False,
                    "attendance_action": "created_or_updated",
                    "session": {
                        "id": session.id,
                        "session_name": session.session_name,
                        "date": session.date.isoformat() if session.date else None,
                    },
                    "member": serialize_member_for_validation(member),
                    "attendance": serialize_attendance(attendance),
                    "attendance_record_id": attendance_record.id,
                    "verified_record_ids": verified_record_ids,
                    "rejected_record_ids": rejected_record_ids,
                    "deleted_record_ids": [],
                    "processed_record_ids": [record.id for record in records],
                    "embedding_ids": [embedding.id for embedding in embeddings],
                    "embeddings": [
                        serialize_member_face_embedding(embedding)
                        for embedding in embeddings
                    ],
                },
                status=200,
            )

    except Exception as e:
        return fail_response(
            "Gagal memproses tambah wajah member.",
            status=500,
            data={"error": str(e)},
        )