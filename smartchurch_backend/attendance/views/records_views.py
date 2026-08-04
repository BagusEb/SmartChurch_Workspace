import base64
import json
import re
import zipfile
from io import BytesIO
from collections import defaultdict
from datetime import date, datetime
from xml.sax.saxutils import escape, quoteattr

from dateutil.relativedelta import relativedelta
from django.http import HttpResponse
from django.db import transaction
from rest_framework import viewsets, status
from django.db.models import Avg, Count, Q
from django.utils import timezone
from attendance.serializers import WorshipSessionSerializer
from langchain_core.messages import HumanMessage
from langchain_openrouter import ChatOpenRouter
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

import pandas as pd

from ..models import (
    Attendance,
    FollowupMember,
    Guest,
    Member,
    SummaryReport,
    TimelineDataRecord,
    WorshipSession,
)
from ..serializers import (
    AttendanceSerializer,
    FollowupMemberDetailSerializer,
    GuestConversionSerializer,
    SessionSerializer,
    SummaryReportListSerializer,
    SummaryReportSerializer,
    TimelineDataRecordSerializer,
)
from chatbot_ai.tools import generate_seaborn_plot
from prompts import build_summary_report_prompt

INVALID_EXCEL_SHEET_CHARS = r"[\[\]\:\*\?\/\\]"


def sanitize_sheet_title(title, existing_titles):
    clean_title = re.sub(INVALID_EXCEL_SHEET_CHARS, " ", title).strip() or "Sheet"
    clean_title = re.sub(r"\s+", " ", clean_title)
    base_title = clean_title[:31]
    candidate = base_title
    index = 2

    while candidate in existing_titles:
        suffix = f" ({index})"
        candidate = f"{base_title[:31 - len(suffix)]}{suffix}"
        index += 1

    existing_titles.add(candidate)
    return candidate


def format_check_in_time(value):
    if not value:
        return ""
    return timezone.localtime(value).strftime("%H:%M")


def xlsx_column_name(index):
    name = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        name = chr(65 + remainder) + name
    return name


def xlsx_cell_xml(row_index, column_index, value):
    style_id = None
    if isinstance(value, tuple):
        value, style_id = value

    cell_ref = f"{xlsx_column_name(column_index)}{row_index}"
    style_attr = f' s="{style_id}"' if style_id is not None else ""
    if isinstance(value, (int, float)):
        return f'<c r="{cell_ref}"{style_attr}><v>{value}</v></c>'
    if isinstance(value, (date, datetime)):
        value = value.isoformat()
    text = escape("" if value is None else str(value))
    return f'<c r="{cell_ref}" t="inlineStr"{style_attr}><is><t>{text}</t></is></c>'


def xlsx_sheet_xml(rows):
    max_columns = max((len(row) for row in rows), default=1)
    cols_xml = "".join(
        f'<col min="{index}" max="{index}" width="22" customWidth="1"/>'
        for index in range(1, max_columns + 1)
    )
    row_xml = []
    for row_index, row in enumerate(rows, start=1):
        cells = "".join(
            xlsx_cell_xml(row_index, column_index, value)
            for column_index, value in enumerate(row, start=1)
        )
        row_xml.append(f'<row r="{row_index}">{cells}</row>')

    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f"<cols>{cols_xml}</cols>"
        f'<sheetData>{"".join(row_xml)}</sheetData>'
        "</worksheet>"
    )


def xlsx_styles_xml():
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<fonts count="3">'
        '<font><sz val="11"/><color rgb="FF334155"/><name val="Calibri"/></font>'
        '<font><b/><sz val="16"/><color rgb="FF0F172A"/><name val="Calibri"/></font>'
        '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>'
        "</fonts>"
        '<fills count="5">'
        '<fill><patternFill patternType="none"/></fill>'
        '<fill><patternFill patternType="gray125"/></fill>'
        '<fill><patternFill patternType="solid"><fgColor rgb="FF7C3AED"/><bgColor indexed="64"/></patternFill></fill>'
        '<fill><patternFill patternType="solid"><fgColor rgb="FFF5F3FF"/><bgColor indexed="64"/></patternFill></fill>'
        '<fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>'
        "</fills>"
        '<borders count="2">'
        "<border><left/><right/><top/><bottom/><diagonal/></border>"
        '<border><left style="thin"><color rgb="FFE2E8F0"/></left>'
        '<right style="thin"><color rgb="FFE2E8F0"/></right>'
        '<top style="thin"><color rgb="FFE2E8F0"/></top>'
        '<bottom style="thin"><color rgb="FFE2E8F0"/></bottom><diagonal/></border>'
        "</borders>"
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        '<cellXfs count="5">'
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
        '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>'
        '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>'
        '<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>'
        "</cellXfs>"
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        "</styleSheet>"
    )


def styled_row(values, style_id):
    return [(value, style_id) for value in values]


def zebra_row(values, index):
    return styled_row(values, 3 if index % 2 else 4)


def build_xlsx_response_bytes(sheets):
    output = BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        sheet_overrides = "".join(
            f'<Override PartName="/xl/worksheets/sheet{index}.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            for index in range(1, len(sheets) + 1)
        )
        archive.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/styles.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            f"{sheet_overrides}"
            "</Types>",
        )
        archive.writestr(
            "_rels/.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
            'Target="xl/workbook.xml"/>'
            "</Relationships>",
        )
        workbook_sheets = "".join(
            f'<sheet name={quoteattr(title)} sheetId="{index}" r:id="rId{index}"/>'
            for index, (title, _rows) in enumerate(sheets, start=1)
        )
        archive.writestr(
            "xl/workbook.xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            f"<sheets>{workbook_sheets}</sheets>"
            "</workbook>",
        )
        workbook_rels = "".join(
            f'<Relationship Id="rId{index}" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
            f'Target="worksheets/sheet{index}.xml"/>'
            for index in range(1, len(sheets) + 1)
        )
        workbook_rels += (
            f'<Relationship Id="rId{len(sheets) + 1}" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" '
            'Target="styles.xml"/>'
        )
        archive.writestr(
            "xl/_rels/workbook.xml.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            f"{workbook_rels}"
            "</Relationships>",
        )
        archive.writestr("xl/styles.xml", xlsx_styles_xml())
        for index, (_title, rows) in enumerate(sheets, start=1):
            archive.writestr(f"xl/worksheets/sheet{index}.xml", xlsx_sheet_xml(rows))

    output.seek(0)
    return output.getvalue()


def get_year_range(year_param):
    try:
        year = int(year_param) if year_param else None
    except (TypeError, ValueError):
        year = None
    if not year:
        year = timezone.localdate().year
    start = date(year, 1, 1)
    end = date(year + 1, 1, 1)
    return start, end


def generate_need_followup_members_report(date_value=None):
    """
    Generate data FollowupMember berdasarkan 2 kriteria:

    1. Member active tidak hadir pada 3 pertemuan terakhir.
    2. Attendance rate turun minimal 20% pada 3 bulan terakhir
       dibanding periode sebelumnya dalam 12 bulan terakhir.

    Function ini aman dipanggil berkali-kali karena akan skip:
    - member yang masih punya follow-up status new
    - member yang follow-up resolved/closed dalam 3 bulan terakhir
    """

    if not date_value:
        target_date = timezone.localdate()
    else:
        try:
            target_date = datetime.strptime(date_value, "%Y-%m-%d").date()
        except ValueError:
            raise ValueError("Invalid date format. Please use YYYY-MM-DD.")

    reasons = {}

    # ============================================================
    # Criterion 1: Active member absent from last 3 meetings
    # ============================================================
    last_3_meetings = list(
        Attendance.objects.filter(
            attendance_date__lte=target_date,
            member_id__isnull=False,
        )
        .order_by("-attendance_date")
        .values_list("attendance_date", flat=True)
        .distinct()[:3]
    )

    if len(last_3_meetings) >= 3:
        oldest_meeting_date = last_3_meetings[-1]

        absent_ids = (
            Member.objects.filter(
                member_status="active",
                created_at__date__lte=oldest_meeting_date,
            )
            .exclude(
                attendance__attendance_date__in=last_3_meetings,
            )
            .values_list("id", flat=True)
            .distinct()
        )

        for member_id in absent_ids:
            reasons.setdefault(member_id, []).append(
                "Anggota aktif tidak hadir dalam 3 pertemuan terakhir."
            )

    # ============================================================
    # Criterion 2: Attendance rate dropped >= 20% in last 3 months
    # ============================================================
    a_year_ago = target_date - relativedelta(months=12)
    three_months_ago = target_date - relativedelta(months=3)

    period1_qs = (
        Attendance.objects.filter(
            member__created_at__date__lte=a_year_ago,
            attendance_date__gte=a_year_ago,
            attendance_date__lte=three_months_ago,
            member_id__isnull=False,
        )
        .values("member_id", "attendance_date")
        .distinct()
    )

    sessions_1 = (
        Attendance.objects.filter(
            attendance_date__gte=a_year_ago,
            attendance_date__lte=three_months_ago,
            member_id__isnull=False,
        )
        .values("attendance_date")
        .distinct()
        .count()
    )

    if sessions_1 > 0:
        attendance_count_1 = {}

        for row in period1_qs:
            member_id = row["member_id"]
            attendance_count_1[member_id] = attendance_count_1.get(member_id, 0) + 1

        attendance_percent_1 = {
            member_id: count / sessions_1
            for member_id, count in attendance_count_1.items()
        }

        period2_qs = (
            Attendance.objects.filter(
                member__created_at__date__lte=a_year_ago,
                attendance_date__gt=three_months_ago,
                attendance_date__lte=target_date,
                member_id__isnull=False,
            )
            .values("member_id", "attendance_date")
            .distinct()
        )

        sessions_2 = (
            Attendance.objects.filter(
                attendance_date__gt=three_months_ago,
                attendance_date__lte=target_date,
                member_id__isnull=False,
            )
            .values("attendance_date")
            .distinct()
            .count()
        )

        if sessions_2 > 0:
            attendance_count_2 = {}

            for row in period2_qs:
                member_id = row["member_id"]
                attendance_count_2[member_id] = attendance_count_2.get(member_id, 0) + 1

            attendance_percent_2 = {
                member_id: count / sessions_2
                for member_id, count in attendance_count_2.items()
            }

            for member_id, percent_1 in attendance_percent_1.items():
                percent_2 = attendance_percent_2.get(member_id, 0)

                if percent_1 > 0 and percent_2 < percent_1 * 0.8:
                    drop = percent_1 - percent_2
                    reasons.setdefault(member_id, []).append(
                        f"Tingkat kehadiran menurun sebesar {drop:.0%} dalam 3 bulan terakhir."
                    )

    if not reasons:
        return {
            "target_date": target_date.isoformat(),
            "candidate_count": 0,
            "created_count": 0,
            "skipped_count": 0,
            "created_member_ids": [],
            "skipped_member_ids": [],
            "message": "Tidak ada anggota baru yang perlu follow-up.",
        }

    # ============================================================
    # Skip members with open follow-up or recently resolved/closed
    # ============================================================
    skip_member_ids = set(
        FollowupMember.objects.filter(
            member_id__in=list(reasons.keys()),
        )
        .filter(
            Q(status_followup="new")
            | Q(
                status_followup__in=["resolved", "closed"],
                followup_date__gte=three_months_ago,
            )
        )
        .values_list("member_id", flat=True)
    )

    to_create = []

    for member_id, member_reasons in reasons.items():
        if member_id in skip_member_ids:
            continue

        to_create.append(
            FollowupMember(
                member_id=member_id,
                followup_date=target_date,
                explain_followup="; ".join(member_reasons),
                status_followup="new",
                progress_followup="not_yet",
            )
        )

    created_followups = []

    if to_create:
        created_followups = FollowupMember.objects.bulk_create(to_create)

    created_member_ids = [item.member_id for item in created_followups]
    skipped_member_ids = list(skip_member_ids)

    return {
        "target_date": target_date.isoformat(),
        "candidate_count": len(reasons),
        "created_count": len(created_followups),
        "skipped_count": len(skipped_member_ids),
        "created_member_ids": created_member_ids,
        "skipped_member_ids": skipped_member_ids,
        "message": (
            f"Berhasil membuat {len(created_followups)} rekomendasi follow-up baru."
            if created_followups
            else "Tidak ada follow-up baru yang dibuat karena semua kandidat sudah memiliki follow-up aktif atau baru selesai ditindaklanjuti."
        ),
    }


class TimelineDataRecordViewSet(viewsets.ModelViewSet):
    queryset = (
        TimelineDataRecord.objects.select_related(
            "matched_member", "final_member", "final_guest"
        )
        .all()
        .order_by("-capture_time")
    )
    serializer_class = TimelineDataRecordSerializer


class AttendanceViewSet(viewsets.ModelViewSet):
    queryset = Attendance.objects.all().order_by("-check_in_time")
    serializer_class = AttendanceSerializer

    @action(detail=False, methods=["get"], url_path="face-image")
    def face_image(self, request):
        """Return the face image captured during attendance from t_timlinedata_record."""
        attendance_id = request.query_params.get("attendance_id")
        facedetection_id = request.query_params.get("facedetection_id")

        try:
            if attendance_id:
                attendance = Attendance.objects.select_related("facedetection").get(
                    id=attendance_id
                )
            elif facedetection_id:
                attendance = (
                    Attendance.objects.select_related("facedetection")
                    .filter(facedetection_id=facedetection_id)
                    .first()
                )
            else:
                return Response(
                    {
                        "error": "attendance_id or facedetection_id parameter is required"
                    },
                    status=400,
                )
        except Attendance.DoesNotExist:
            return Response({"error": "Attendance not found."}, status=404)

        if not attendance:
            return Response(
                {"error": "No attendance linked to that face detection."}, status=404
            )

        record = attendance.facedetection
        if not record or not record.face_image:
            return Response(
                {"error": "No face image recorded for this attendance."}, status=404
            )

        try:
            encoded = base64.b64encode(record.face_image).decode("utf-8")
        except Exception:
            return Response({"error": "Failed to encode face image."}, status=500)

        return Response({"face_image": f"data:image/jpeg;base64,{encoded}"})


class WorshipSessionViewSet(viewsets.ModelViewSet):
    queryset = WorshipSession.objects.all()
    # Assume you or your friend already created a serializer for this
    # serializer_class = WorshipSessionSerializer

    serializer_class = WorshipSessionSerializer

    # ============================================================
    # 1. GATEWAY: START SESSION (POST /api/worship-sessions/start_session/)
    # ============================================================
    @action(detail=False, methods=["post"])
    def start_session(self, request):
        session_name = request.data.get("session_name")

        active_session = WorshipSession.objects.filter(status="active").first()
        if active_session:
            return Response(
                {
                    "error": "Masih ada sesi yang aktif. Akhiri sesi sebelumnya terlebih dahulu."
                },
                status=400,
            )

        if not session_name:
            return Response({"error": "Nama sesi wajib diisi!"}, status=400)

        # 👇 PASTIKAN BAGIAN INI MENYERTAKAN date=timezone.now().date() 👇
        new_session = WorshipSession.objects.create(
            session_name=session_name,
            date=timezone.now().date(),  # INI YANG TADI HILANG
            start_time=timezone.now(),
            status="active",
        )

        serializer = self.get_serializer(new_session)
        return Response(serializer.data, status=201)

    # ============================================================
    # 2. GATEWAY: END SESSION (POST /api/worship-sessions/end_session/)
    # ============================================================
    @action(detail=False, methods=["post"])
    def end_session(self, request):
        """Closes the currently active session and locks the final timestamp."""
        session_id = request.data.get("session_id")

        try:
            # Find the targeted session in the database
            session = WorshipSession.objects.get(id=session_id)

            if session.status == "completed":
                return Response(
                    {"error": "This session has already been closed dynamicly."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Update the lifecycle metadata
            session.status = "completed"
            session.end_time = timezone.now()
            session.save()

            return Response(
                {
                    "message": "Worship session closed successfully.",
                    "session_id": session.id,
                    "status": session.status,
                    "end_time": session.end_time,
                },
                status=status.HTTP_200_OK,
            )

        except WorshipSession.DoesNotExist:
            return Response(
                {"error": "Worship session not found."},
                status=status.HTTP_404_NOT_FOUND,
            )


class SummaryReportViewSet(viewsets.ModelViewSet):
    queryset = SummaryReport.objects.all().order_by("-created_at")
    serializer_class = SummaryReportSerializer

    def get_serializer_class(self):
        if self.action == "list":
            return SummaryReportListSerializer
        return SummaryReportSerializer

    @action(detail=False, methods=["get"], url_path="yearly-overview")
    def yearly_overview(self, request):
        year_param = request.query_params.get("year")
        start_date, end_date = get_year_range(year_param)

        attendance_qs = Attendance.objects.filter(
            attendance_date__gte=start_date,
            attendance_date__lt=end_date,
        )

        total_hadir_guests = (
            attendance_qs.filter(guest_id__isnull=False)
            .values("guest_id")
            .distinct()
            .count()
        )
        total_hadir_members = (
            attendance_qs.filter(member_id__isnull=False)
            .values("member_id")
            .distinct()
            .count()
        )

        avg_per_ibadah = (
            attendance_qs.values("attendance_date")
            .annotate(cnt=Count("id"))
            .aggregate(avg=Avg("cnt"))["avg"]
            or 0
        )

        tamu_baru_count = Guest.objects.filter(
            first_visit__gte=start_date,
            first_visit__lt=end_date,
        ).count()

        return Response(
            {
                "total_hadir_orang_tahun_ini": total_hadir_guests + total_hadir_members,
                "rata_rata_orang_per_ibadah": round(float(avg_per_ibadah), 2),
                "tamu_baru_count": tamu_baru_count,
            }
        )

    @action(detail=False, methods=["post"], url_path="generate-report")
    def generate_report(self, request):
        start_date_value = request.data.get("start_date")
        end_date_value = request.data.get("end_date")
        if not start_date_value or not end_date_value:
            return Response(
                {"error": "start_date and end_date are required"}, status=400
            )

        try:
            start_date = datetime.strptime(start_date_value, "%Y-%m-%d").date()
            end_date = datetime.strptime(end_date_value, "%Y-%m-%d").date()
        except ValueError:
            return Response(
                {"error": "Invalid date format. Please use YYYY-MM-DD."},
                status=400,
            )

        if start_date >= end_date:
            return Response({"error": "start_date must be before end_date"}, status=400)

        # -------------------------------------------------------------------
        # 1. Follow-up members in range
        # -------------------------------------------------------------------
        followup_qs = (
            FollowupMember.objects.filter(
                created_at__date__gte=start_date,
                created_at__date__lte=end_date,
            )
            .select_related("member")
            .order_by("created_at")
        )
        followup_data = [
            {
                "member_name": f.member.full_name,
                "followup_date": str(f.followup_date),
                "status": f.status_followup,
                "progress": f.progress_followup,
                "reason": f.explain_followup or "",
                "type": f.followup_type,
            }
            for f in followup_qs
        ]
        followup_csv = (
            pd.DataFrame(followup_data).to_csv(index=False)
            if followup_data
            else "Tidak ada anggota yang memerlukan follow-up dalam periode ini."
        )

        # -------------------------------------------------------------------
        # 2. Member growth chart — new members per month
        # -------------------------------------------------------------------
        growth_by_month = defaultdict(int)
        for dt in (
            Member.objects.filter(
                created_at__date__gte=start_date,
                created_at__date__lte=end_date,
            )
            .values_list("created_at", flat=True)
            .order_by("created_at")
        ):
            growth_by_month[dt.strftime("%Y-%m")] += 1

        growth_data = [
            {"month": month, "new_members": count}
            for month, count in sorted(growth_by_month.items())
        ]

        if growth_data:
            growth_chart_result = generate_seaborn_plot.invoke(
                {
                    "data_json": json.dumps(growth_data),
                    "chart_type": "bar",
                    "x_col": "month",
                    "y_col": "new_members",
                    "title": "Pertumbuhan Anggota Baru per Bulan",
                    "x_label": "Bulan",
                    "y_label": "Jumlah Anggota Baru",
                    "highlight_mode": "max",
                }
            )
            growth_chart_url = growth_chart_result.get("image_url", "")
            growth_csv = pd.DataFrame(growth_data).to_csv(index=False)
        else:
            growth_chart_url = ""
            growth_csv = ""

        # -------------------------------------------------------------------
        # 3. Attendance rate per session — % active members present
        # -------------------------------------------------------------------
        session_dates = list(
            Attendance.objects.filter(
                attendance_date__gte=start_date,
                attendance_date__lte=end_date,
            )
            .values_list("attendance_date", flat=True)
            .distinct()
            .order_by("attendance_date")
        )

        member_attended_by_date = defaultdict(set)
        for rec in (
            Attendance.objects.filter(
                attendance_date__gte=start_date,
                attendance_date__lte=end_date,
                member_id__isnull=False,
            )
            .values("attendance_date", "member_id")
            .distinct()
        ):
            member_attended_by_date[rec["attendance_date"]].add(rec["member_id"])

        rate_data = []
        for session_date in session_dates:
            active_count = Member.objects.filter(
                member_status="active",
                created_at__date__lte=session_date,
            ).count()
            if not active_count:
                continue
            attended = len(member_attended_by_date.get(session_date, set()))
            rate_data.append(
                {
                    "date": str(session_date),
                    "attendance_rate": round((attended / active_count) * 100, 1),
                }
            )

        if rate_data:
            rate_chart_result = generate_seaborn_plot.invoke(
                {
                    "data_json": json.dumps(rate_data),
                    "chart_type": "line",
                    "x_col": "date",
                    "y_col": "attendance_rate",
                    "title": "Tingkat Kehadiran per Sesi Ibadah",
                    "x_label": "Tanggal",
                    "y_label": "Tingkat Kehadiran (%)",
                }
            )
            rate_chart_url = rate_chart_result.get("image_url", "")
            rate_csv = pd.DataFrame(rate_data).to_csv(index=False)
        else:
            rate_chart_url = ""
            rate_csv = ""

        # -------------------------------------------------------------------
        # 4. Build LLM prompt and generate report
        # -------------------------------------------------------------------
        total_active_members = Member.objects.filter(member_status="active").count()

        all_attending_member_ids = set()
        for members in member_attended_by_date.values():
            all_attending_member_ids.update(members)
        total_distinct_members_attended = len(all_attending_member_ids)

        total_guests = (
            Attendance.objects.filter(
                attendance_date__gte=start_date,
                attendance_date__lte=end_date,
                guest_id__isnull=False,
            )
            .values("guest_id")
            .distinct()
            .count()
        )

        avg_rate = (
            round(sum(r["attendance_rate"] for r in rate_data) / len(rate_data), 1)
            if rate_data
            else 0
        )

        growth_section = (
            f"![Pertumbuhan Anggota]({growth_chart_url})\n{growth_csv}"
            if growth_chart_url
            else "Tidak ada anggota baru yang bergabung dalam periode ini."
        )
        rate_section = (
            f"![Tingkat Kehadiran]({rate_chart_url})\n{rate_csv}"
            if rate_chart_url
            else "Tidak ada data kehadiran dalam periode ini."
        )

        chart_embeds = "\n".join(
            line
            for line in [
                (
                    f"![Pertumbuhan Anggota]({growth_chart_url})"
                    if growth_chart_url
                    else ""
                ),
                f"![Tingkat Kehadiran]({rate_chart_url})" if rate_chart_url else "",
            ]
            if line
        )
        wajib_charts = (
            f"WAJIB tampilkan gambar berikut dengan format Markdown tepat seperti ini (salin URL-nya persis):\n{chart_embeds}"
            if chart_embeds
            else "Tidak ada grafik yang tersedia untuk periode ini."
        )
        report_prompt = build_summary_report_prompt(
            start_date_value=start_date_value,
            end_date_value=end_date_value,
            total_active_members=total_active_members,
            session_count=len(session_dates),
            total_distinct_members_attended=total_distinct_members_attended,
            avg_rate=avg_rate,
            growth_section=growth_section,
            rate_section=rate_section,
            followup_count=len(followup_data),
            followup_csv=followup_csv,
            wajib_charts=wajib_charts,
        )
        llm = ChatOpenRouter(model="moonshotai/kimi-k2.6:nitro", temperature=0.3)
        response = llm.invoke([HumanMessage(content=report_prompt)])
        report = response.content

        # -------------------------------------------------------------------
        # 5. Save to SummaryReport
        # -------------------------------------------------------------------
        summary_report, _ = SummaryReport.objects.update_or_create(
            report_start_date=start_date,
            report_end_date=end_date,
            defaults={
                "total_members": total_distinct_members_attended,
                "total_guests": total_guests,
                "total_attendance": total_distinct_members_attended + total_guests,
                "report_summary": report,
            },
        )

        return Response(
            {
                "message": "Report generated successfully",
                "report_id": summary_report.id,
                "report_summary": report,
            }
        )

    @action(detail=False, methods=["get"], url_path="attendance-recap")
    def attendance_recap(self, request):
        start_date_value = request.query_params.get("start_date")
        end_date_value = request.query_params.get("end_date")
        if not start_date_value or not end_date_value:
            return Response(
                {"error": "start_date and end_date are required"}, status=400
            )

        try:
            start_date = datetime.strptime(start_date_value, "%Y-%m-%d").date()
            end_date = datetime.strptime(end_date_value, "%Y-%m-%d").date()
        except ValueError:
            return Response(
                {"error": "Invalid date format. Please use YYYY-MM-DD."},
                status=400,
            )

        if start_date > end_date:
            return Response(
                {"error": "start_date must be before or equal to end_date"}, status=400
            )

        sessions = list(
            WorshipSession.objects.filter(
                date__gte=start_date, date__lte=end_date
            ).order_by("date", "start_time", "id")
        )
        session_ids = [session.id for session in sessions]

        attendances_by_session = defaultdict(list)
        attendance_rows = (
            Attendance.objects.filter(session_id__in=session_ids)
            .filter(Q(member__isnull=False) | Q(guest__isnull=False))
            .select_related("member", "guest", "session")
            .order_by("check_in_time", "id")
        )
        for attendance in attendance_rows:
            attendances_by_session[attendance.session_id].append(attendance)

        summary_rows = [
            [(f"Attendance summary {start_date_value} - {end_date_value}", 1)],
            [],
            styled_row(
                [
                    "Date",
                    "Session Name",
                    "Member Present",
                    "Guest Present",
                    "Total Present",
                    "Eligible Active Members",
                    "Member attendance Percentage",
                ],
                2,
            ),
        ]

        used_sheet_titles = {"Summary"}
        sheets = []

        for session in sessions:
            earliest_by_key = {}
            for attendance in attendances_by_session.get(session.id, []):
                if attendance.member_id:
                    key = ("member", attendance.member_id)
                    name = attendance.member.full_name
                    attendee_type = "member"
                elif attendance.guest_id:
                    key = ("guest", attendance.guest_id)
                    name = attendance.guest.full_name
                    attendee_type = "guest"
                else:
                    continue

                if key not in earliest_by_key:
                    earliest_by_key[key] = {
                        "name": name,
                        "check_in_time": attendance.check_in_time,
                        "type": attendee_type,
                    }

            attendees = sorted(
                earliest_by_key.values(),
                key=lambda item: (
                    0 if item["type"] == "member" else 1,
                    item["name"].lower(),
                ),
            )
            member_present = sum(1 for item in attendees if item["type"] == "member")
            guest_present = sum(1 for item in attendees if item["type"] == "guest")
            eligible_members = Member.objects.filter(
                member_status="active",
                created_at__date__lte=session.date,
            ).count()
            percentage = (
                round((member_present / eligible_members) * 100, 2)
                if eligible_members
                else 0
            )

            summary_rows.append(
                zebra_row(
                    [
                        session.date,
                        session.session_name,
                        member_present,
                        guest_present,
                        member_present + guest_present,
                        eligible_members,
                        percentage,
                    ],
                    len(summary_rows) - 2,
                )
            )

            sheet_title = sanitize_sheet_title(
                f"Worship {session.date} - {session.session_name}",
                used_sheet_titles,
            )
            sheet_rows = [styled_row(["No.", "Name", "check_in_time", "type"], 2)]
            for index, attendee in enumerate(attendees, start=1):
                sheet_rows.append(
                    zebra_row(
                        [
                            index,
                            attendee["name"],
                            format_check_in_time(attendee["check_in_time"]),
                            attendee["type"],
                        ],
                        index,
                    )
                )
            sheets.append((sheet_title, sheet_rows))

        sheets.insert(0, ("Summary", summary_rows))
        xlsx_bytes = build_xlsx_response_bytes(sheets)

        filename = f"rekap_absen_{start_date_value}_{end_date_value}.xlsx"
        response = HttpResponse(
            xlsx_bytes,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    @action(
        detail=False, methods=["post"], url_path="generate-followup-recommendations"
    )
    def generate_followup_recommendations(self, request):
        """
        POST /api/reports/generate-followup-recommendations/

        Payload optional:
        {
            "date": "2026-05-24"
        }

        Jika date tidak dikirim, backend pakai tanggal hari ini.
        """

        date_value = request.data.get("date") or timezone.localdate().isoformat()

        try:
            with transaction.atomic():
                result = generate_need_followup_members_report(date_value)
        except ValueError as e:
            return Response(
                {
                    "success": False,
                    "error": str(e),
                },
                status=400,
            )
        except Exception as e:
            return Response(
                {
                    "success": False,
                    "error": "Gagal generate rekomendasi follow-up.",
                    "detail": str(e),
                },
                status=500,
            )

        return Response(
            {
                "success": True,
                **result,
            }
        )

    @action(detail=False, methods=["get"], url_path="follow-up-recommendations")
    def follow_up_recommendations(self, request):
        qs = (
            FollowupMember.objects.select_related("member")
            .filter(status_followup="new")
            .order_by("-created_at")
        )
        serializer = FollowupMemberDetailSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="guest-conversion-recommendations")
    def guest_conversion_recommendations(self, request):
        qs = Guest.objects.filter(
            visit_count__gte=5,
            converted_to_member__isnull=True,
        ).order_by("-visit_count")
        serializer = GuestConversionSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="sessions")
    def sessions(self, request):
        year_param = request.query_params.get("year")
        qs = WorshipSession.objects.all()
        if year_param:
            try:
                year = int(year_param)
                start = date(year, 1, 1)
                end = date(year + 1, 1, 1)
                qs = qs.filter(date__gte=start, date__lt=end)
            except (TypeError, ValueError):
                pass

        sessions_qs = qs.annotate(
            member_count=Count(
                "attendances__member",
                filter=Q(attendances__member__isnull=False),
                distinct=True,
            ),
            guest_count=Count(
                "attendances__guest",
                filter=Q(attendances__guest__isnull=False),
                distinct=True,
            ),
        ).order_by("-date", "-start_time")

        attended_member_ids_by_session = defaultdict(set)
        attended_guest_ids_by_session = defaultdict(set)
        attendance_rows = (
            Attendance.objects.filter(session__in=sessions_qs)
            .filter(Q(member__isnull=False) | Q(guest__isnull=False))
            .values_list("session_id", "member_id", "guest_id")
            .distinct()
        )
        for session_id, member_id, guest_id in attendance_rows:
            if member_id is not None:
                attended_member_ids_by_session[session_id].add(member_id)
            if guest_id is not None:
                attended_guest_ids_by_session[session_id].add(guest_id)

        data = []
        for session in sessions_qs:
            session_date = session.date
            member_ids = sorted(attended_member_ids_by_session.get(session.id, set()))
            guest_ids = sorted(attended_guest_ids_by_session.get(session.id, set()))
            eligible = Member.objects.filter(
                member_status="active",
                created_at__date__lte=session_date,
            ).count()
            absent = max(0, eligible - len(member_ids))
            data.append(
                {
                    "session_id": session.id,
                    "session_name": session.session_name,
                    "status": session.status,
                    "date": session_date,
                    "start_time": session.start_time,
                    "end_time": session.end_time,
                    "total": len(member_ids) + len(guest_ids),
                    "member_count": len(member_ids),
                    "member_ids": member_ids,
                    "guest_count": len(guest_ids),
                    "guest_ids": guest_ids,
                    "absent_count": absent,
                }
            )
        serializer = SessionSerializer(data, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="session-attendees")
    def session_attendees(self, request):
        session_id = request.query_params.get("session_id")
        if not session_id:
            return Response({"error": "session_id parameter is required"}, status=400)

        try:
            session = WorshipSession.objects.get(id=session_id)
        except WorshipSession.DoesNotExist:
            return Response({"error": "Session not found."}, status=404)

        session_date = session.date

        attendances = Attendance.objects.filter(session_id=session_id).select_related(
            "member", "guest"
        )

        members_by_id = {}
        guests_by_id = {}
        attended_member_ids = set()

        for a in attendances.order_by("check_in_time", "id"):
            if a.member:
                if a.member.id in members_by_id:
                    continue
                members_by_id[a.member.id] = {
                    "id": a.member.id,
                    "full_name": a.member.full_name,
                    "phone": a.member.phone,
                    "check_in_time": a.check_in_time,
                    "facedetection_id": a.facedetection_id,
                }
                attended_member_ids.add(a.member.id)
            elif a.guest:
                if a.guest.id in guests_by_id:
                    continue
                guests_by_id[a.guest.id] = {
                    "id": a.guest.id,
                    "full_name": a.guest.full_name,
                    "phone": a.guest.phone,
                    "visit_count": a.guest.visit_count,
                    "check_in_time": a.check_in_time,
                    "facedetection_id": a.facedetection_id,
                }

        # Calculate absent members
        eligible_members = Member.objects.filter(
            member_status="active",
            created_at__date__lte=session_date,
        )

        absent_members = []
        for m in eligible_members:
            if m.id not in attended_member_ids:
                absent_members.append(
                    {
                        "id": m.id,
                        "full_name": m.full_name,
                        "phone": m.phone,
                    }
                )

        return Response(
            {
                "members": list(members_by_id.values()),
                "guests": list(guests_by_id.values()),
                "absent": absent_members,
            }
        )

    @action(detail=False, methods=["post"], url_path="mark-member-present")
    def mark_member_present(self, request):
        session_id = request.data.get("session_id")
        member_id = request.data.get("member_id")

        if not session_id or not member_id:
            return Response(
                {"error": "session_id and member_id are required"}, status=400
            )

        try:
            session = WorshipSession.objects.get(id=session_id)
            member = Member.objects.get(id=member_id)
        except (WorshipSession.DoesNotExist, Member.DoesNotExist):
            return Response({"error": "Session or Member not found."}, status=404)

        if Attendance.objects.filter(
            session_id=session_id, member_id=member_id
        ).exists():
            return Response(
                {"error": "Member is already present in this session."}, status=400
            )

        Attendance.objects.create(
            session=session,
            member=member,
            attendance_date=session.date,
            check_in_time=timezone.now(),
        )

        return Response({"success": True, "message": "Member marked as present."})


class FollowupMemberViewSet(viewsets.ModelViewSet):
    queryset = FollowupMember.objects.select_related("member").order_by("-created_at")
    serializer_class = FollowupMemberDetailSerializer
