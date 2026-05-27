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


def serialize_guest_for_validation(guest, similarity=None):
    data = {
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

    if similarity is not None:
        data["similarity"] = round(similarity * 100, 2)

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


def find_duplicate_guest_attendance(session, full_name, first_visit, from_where):
    """
    Cek apakah dalam worship session yang sama sudah ada attendance guest
    dengan identity yang sama.

    Identity yang dicek:
    - guest.full_name
    - guest.first_visit
    - guest.from_where

    Catatan:
    Karena Guest dibuat 1 row per kunjungan, pengecekan duplicate harus
    dilakukan dari Attendance -> Guest pada session yang sama.
    """

    target_name = normalize_identity_value(full_name)
    target_from_where = normalize_identity_value(from_where)

    attendances = (
        Attendance.objects
        .select_for_update()
        .select_related("guest")
        .filter(
            session=session,
            guest__isnull=False,
            guest__first_visit=first_visit,
        )
    )

    for attendance in attendances:
        guest = attendance.guest

        if not guest:
            continue

        guest_name = normalize_identity_value(guest.full_name)
        guest_from_where = normalize_identity_value(guest.from_where)

        if guest_name == target_name and guest_from_where == target_from_where:
            return attendance

    return None


def get_guest_identity_queryset(full_name, phone):
    """
    Karena desain Guest menyimpan satu row per kunjungan,
    orang yang sama dicari berdasarkan nama + phone.
    Kalau phone kosong, fallback berdasarkan nama saja.
    """

    qs = Guest.objects.select_for_update().filter(
        full_name__iexact=normalize_text(full_name)
    )

    phone = normalize_text(phone)

    if phone:
        qs = qs.filter(phone=phone)

    return qs.order_by("first_visit", "created_at", "id")


def get_next_guest_visit_count(full_name, phone):
    previous_guests = get_guest_identity_queryset(full_name, phone)
    max_visit_count = 0

    for guest in previous_guests:
        if guest.visit_count and guest.visit_count > max_visit_count:
            max_visit_count = guest.visit_count

    return max_visit_count + 1


def get_first_visit_for_existing_guest(source_guest):
    """
    Ambil first_visit paling awal dari semua row Guest dengan nama + phone yang sama.
    Kalau tidak ada, fallback dari source guest.
    """

    related_guests = get_guest_identity_queryset(
        source_guest.full_name,
        source_guest.phone,
    )

    first_guest = related_guests.exclude(first_visit__isnull=True).first()

    if first_guest and first_guest.first_visit:
        return first_guest.first_visit

    return source_guest.first_visit


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


def create_guest_attendance(session, guest, record):
    facedetection_error = ensure_facedetection_not_used(record)

    if facedetection_error:
        return None, facedetection_error

    attendance_date = get_record_visit_date(record, session)
    check_in_time = get_record_check_in_time(record)

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

        return attendance, None
    except IntegrityError:
        return None, "Gagal membuat attendance karena face detection sudah digunakan."

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
    Rule duplicate:
    - Kalau member sudah punya Attendance di session ini dan facedetection sudah terisi:
      gagal.
    - Kalau member sudah punya Attendance di session ini tapi facedetection masih null:
      update row tersebut.
    - Kalau belum ada:
      create baru.
    """

    existing_attendance = (
        Attendance.objects
        .select_for_update()
        .filter(session=session, member=member)
        .first()
    )

    if existing_attendance and existing_attendance.facedetection_id:
        return None, "Member ini sudah memiliki attendance valid pada session ini."

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

    Rules:
    - Ambiguous: 1 record menjadi rejected.
    - Unknown group: semua record dalam group menjadi rejected.
    - face_image dan face_encoding dihapus.
    - row tetap ada.
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
                if len(records) != 1:
                    return fail_response(
                        "Reject ambiguous hanya boleh memproses 1 record.",
                        status=400,
                    )

                mode = "ambiguous"

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

    Flow:
    - Ambil selected TimelineDataRecord.
    - Bandingkan face_encoding record dengan semua Guest.face_encoding.
    - Return guest paling mirip.
    """

    body = parse_body(request)

    if body is None:
        return fail_response("Body request harus JSON valid.", status=400)

    session_id = body.get("session_id")
    record_id = body.get("record_id")

    if not session_id:
        return fail_response("session_id wajib dikirim.", status=400)

    if not record_id:
        return fail_response("record_id wajib dikirim.", status=400)

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

            record = (
                TimelineDataRecord.objects
                .select_for_update()
                .filter(id=record_id)
                .first()
            )

            if not record:
                return fail_response("TimelineDataRecord tidak ditemukan.", status=404)

            if not record_is_inside_session(record, session):
                return fail_response(
                    "Record tidak masuk dalam range waktu worship session ini.",
                    status=400,
                )

            if record.validation_status != "pending":
                return fail_response(
                    "Record ini sudah pernah diproses.",
                    status=409,
                    data={
                        "record_id": record.id,
                        "validation_status": record.validation_status,
                    },
                )

            if record.detection_status not in ["unknown", "ambiguous"]:
                return fail_response(
                    "Find guest by AI hanya untuk detection_status unknown atau ambiguous.",
                    status=400,
                    data={"detection_status": record.detection_status},
                )

            if not is_valid_encoding(record.face_encoding):
                return fail_response(
                    "Record ini tidak memiliki face_encoding yang valid.",
                    status=400,
                )

            guests = (
                Guest.objects
                .filter(face_encoding__isnull=False)
                .order_by("-created_at", "-id")
            )

            best_guest = None
            best_similarity = -1.0

            for guest in guests:
                if not is_valid_encoding(guest.face_encoding):
                    continue

                similarity = cosine_similarity(
                    record.face_encoding,
                    guest.face_encoding,
                )

                if similarity > best_similarity:
                    best_similarity = similarity
                    best_guest = guest

            if not best_guest:
                return ok_response(
                    message="Belum ada data tamu dengan face encoding yang bisa dibandingkan.",
                    data={
                        "found": False,
                        "threshold": round(UNKNOWN_SAME_FACE_SIM * 100, 2),
                        "recommendation": None,
                    },
                    status=200,
                )

            is_match = best_similarity >= UNKNOWN_SAME_FACE_SIM

            return ok_response(
                message=(
                    "Rekomendasi tamu ditemukan."
                    if is_match
                    else "Kandidat tamu ditemukan, tetapi similarity belum melewati threshold."
                ),
                data={
                    "found": is_match,
                    "threshold": round(UNKNOWN_SAME_FACE_SIM * 100, 2),
                    "recommendation": serialize_guest_for_validation(
                        best_guest,
                        similarity=best_similarity,
                    ),
                },
                status=200,
            )

    except Exception as e:
        return fail_response(
            "Gagal menjalankan find guest by AI.",
            status=500,
            data={"error": str(e)},
        )
    
@csrf_exempt
@require_http_methods(["POST"])
def validation_ai_confirm_guest_action(request):
    """
    POST /api/cv/validation-ai/actions/guest/confirm/

    Payload ambiguous:
    {
      "session_id": 6,
      "record_id": 50,
      "mode": "existing",
      "source_guest_id": 10
    }

    Payload unknown group:
    {
      "session_id": 6,
      "record_id": 61,
      "record_ids": [61, 62, 63],
      "mode": "existing",
      "source_guest_id": 10
    }

    Payload guest baru:
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
    - Ambiguous:
      selected record menjadi guest_confirmed.
    - Unknown group:
      selected record menjadi guest_confirmed.
      record lain dalam group menjadi rejected dan data wajahnya dibersihkan.
    - Selalu membuat row Guest baru.
    - Attendance guest dibuat dari selected record.
    """

    body = parse_body(request)

    if body is None:
        return fail_response("Body request harus JSON valid.", status=400)

    session_id = body.get("session_id")
    record_id = body.get("record_id")
    record_ids = body.get("record_ids") or []
    mode = body.get("mode") or "existing"
    source_guest_id = body.get("source_guest_id")
    guest_payload = body.get("guest") or {}

    if not session_id:
        return fail_response("session_id wajib dikirim.", status=400)

    if not record_id:
        return fail_response("record_id wajib dikirim.", status=400)

    if mode not in ["existing", "new"]:
        return fail_response("mode harus existing atau new.", status=400)

    if mode == "existing" and not source_guest_id:
        return fail_response("source_guest_id wajib dikirim untuk mode existing.", status=400)

    if mode == "new" and not normalize_text(guest_payload.get("full_name")):
        return fail_response("Nama tamu wajib diisi untuk mode new.", status=400)

    try:
        selected_record_id = int(record_id)
    except Exception:
        return fail_response("record_id harus berupa angka id TimelineDataRecord.", status=400)

    try:
        clean_record_ids = [int(item) for item in record_ids]
        clean_record_ids = list(dict.fromkeys(clean_record_ids))
    except Exception:
        return fail_response("record_ids harus berisi angka id TimelineDataRecord.", status=400)

    # Supaya ambiguous tetap bisa jalan walaupun frontend tidak kirim record_ids.
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
                return fail_response("Worship session tidak ditemukan.", status=404)

            records = list(
                TimelineDataRecord.objects
                .select_for_update()
                .filter(id__in=clean_record_ids)
                .order_by("capture_time", "id")
            )

            found_record_ids = {record.id for record in records}
            missing_record_ids = [
                item
                for item in clean_record_ids
                if item not in found_record_ids
            ]

            if missing_record_ids:
                return fail_response(
                    "Ada TimelineDataRecord yang tidak ditemukan.",
                    status=404,
                    data={"missing_record_ids": missing_record_ids},
                )

            record = None
            for item in records:
                if item.id == selected_record_id:
                    record = item
                    break

            if not record:
                return fail_response("Selected TimelineDataRecord tidak ditemukan.", status=404)

            invalid_session_record_ids = [
                item.id
                for item in records
                if not record_is_inside_session(item, session)
            ]

            if invalid_session_record_ids:
                return fail_response(
                    "Ada record yang tidak masuk dalam range waktu worship session ini.",
                    status=400,
                    data={"invalid_record_ids": invalid_session_record_ids},
                )

            not_pending_records = [
                {
                    "id": item.id,
                    "validation_status": item.validation_status,
                }
                for item in records
                if item.validation_status != "pending"
            ]

            if not_pending_records:
                return fail_response(
                    "Ada record yang sudah pernah diproses.",
                    status=409,
                    data={"records": not_pending_records},
                )

            detection_statuses = {item.detection_status for item in records}

            if detection_statuses == {"ambiguous"}:
                if len(records) != 1:
                    return fail_response(
                        "Confirm guest untuk ambiguous hanya boleh 1 record.",
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
                    "record_ids tidak boleh mencampur status ambiguous dan unknown.",
                    status=400,
                    data={"detection_statuses": list(detection_statuses)},
                )

            if record.detection_status not in ["unknown", "ambiguous"]:
                return fail_response(
                    "Confirm guest hanya untuk detection_status unknown atau ambiguous.",
                    status=400,
                    data={"detection_status": record.detection_status},
                )

            if not record.face_image:
                return fail_response(
                    "Record ini tidak memiliki face_image.",
                    status=400,
                )

            visit_date = get_record_visit_date(record, session)

            if mode == "existing":
                source_guest = (
                    Guest.objects
                    .select_for_update()
                    .filter(id=source_guest_id)
                    .first()
                )

                if not source_guest:
                    return fail_response("Source guest tidak ditemukan.", status=404)

                full_name = normalize_text(source_guest.full_name)
                phone = normalize_text(source_guest.phone)
                from_where = source_guest.from_where
                first_visit = get_first_visit_for_existing_guest(source_guest) or visit_date
                visit_count = get_next_guest_visit_count(full_name, phone)

            else:
                full_name = normalize_text(guest_payload.get("full_name"))
                phone = normalize_text(guest_payload.get("phone"))
                from_where = normalize_text(guest_payload.get("from_where"))
                first_visit = visit_date
                visit_count = 1

            duplicate_attendance = find_duplicate_guest_attendance(
                session=session,
                full_name=full_name,
                first_visit=first_visit,
                from_where=from_where,
            )

            if duplicate_attendance:
                duplicate_guest = duplicate_attendance.guest

                return fail_response(
                    "Tamu ini sudah tercatat hadir pada worship session yang sama.",
                    status=409,
                    data={
                        "duplicate": True,
                        "session_id": session.id,
                        "attendance_id": duplicate_attendance.id,
                        "guest": serialize_guest_for_validation(duplicate_guest),
                        "rule": {
                            "full_name": full_name,
                            "first_visit": first_visit.isoformat() if first_visit else None,
                            "from_where": from_where,
                        },
                    },
                )

            new_guest = Guest.objects.create(
                full_name=full_name,
                phone=phone or None,
                visit_count=visit_count,
                first_visit=first_visit,
                last_visit=visit_date,
                converted_to_member=None,
                face_image=record.face_image,
                face_encoding=record.face_encoding,
                notes="",
                from_where=from_where or None,
            )

            attendance, attendance_error = create_guest_attendance(
                session=session,
                guest=new_guest,
                record=record,
            )

            if attendance_error:
                return fail_response(
                    attendance_error,
                    status=409,
                    data={
                        "session_id": session.id,
                        "record_id": record.id,
                        "guest_id": new_guest.id,
                    },
                )

            validated_at = timezone.now()

            record.validation_status = "guest_confirmed"
            record.final_member = None
            record.final_guest = new_guest
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
                clean_rejected_record(rejected_record, validated_at=validated_at)
                rejected_record_ids.append(rejected_record.id)

            return ok_response(
                message="Data berhasil dikonfirmasi sebagai tamu dan masuk ke attendance.",
                data={
                    "process_mode": process_mode,
                    "guest_mode": mode,
                    "session": {
                        "id": session.id,
                        "session_name": session.session_name,
                        "date": session.date.isoformat() if session.date else None,
                    },
                    "guest": serialize_guest_for_validation(new_guest),
                    "timeline_record": {
                        "id": record.id,
                        "validation_status": record.validation_status,
                        "final_guest_id": record.final_guest_id,
                    },
                    "attendance": serialize_attendance(attendance),
                    "guest_confirmed_record_id": record.id,
                    "rejected_record_ids": rejected_record_ids,
                    "processed_record_ids": [item.id for item in records],
                },
                status=200,
            )

    except Exception as e:
        return fail_response(
            "Gagal memproses confirm guest.",
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

    Rules:
    - Ambiguous:
      hanya 1 record, otomatis boleh selected 1.
    - Unknown group:
      selected_record_ids minimal 1.
      selected_record_ids[0] menjadi facedetection attendance.
    - Semua selected record dibuatkan MemberFaceEmbedding.
    - Semua selected record menjadi verified + final_member.
    - Record lain dalam group menjadi rejected dan face data dibersihkan.
    - Attendance dibuat/update untuk member memakai selected record pertama.
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
                if len(records) != 1:
                    return fail_response(
                        "Tambah wajah untuk ambiguous hanya boleh 1 record.",
                        status=400,
                    )

                process_mode = "ambiguous"

                # Ambiguous tidak perlu pilih gambar dari frontend.
                # Kalau frontend kosong, backend otomatis pakai record satu-satunya.
                if len(clean_selected_record_ids) == 0:
                    clean_selected_record_ids = [records[0].id]

                if clean_selected_record_ids != [records[0].id]:
                    return fail_response(
                        "selected_record_ids untuk ambiguous harus berisi record ambiguous tersebut.",
                        status=400,
                    )

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

            # Record pertama sesuai urutan selected_record_ids dari frontend
            # yang akan masuk ke Attendance.facedetection.
            attendance_record = selected_records[0]

            # Simpan semua selected image ke MemberFaceEmbedding dulu.
            embeddings = create_member_face_embeddings(
                member=member,
                selected_records=selected_records,
            )

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