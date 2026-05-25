import json
from collections import defaultdict
from datetime import date, datetime

from django.db.models import Avg, Count, Q
from django.utils import timezone
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
    queryset = (
        Attendance.objects.select_related("member", "guest", "facedetection")
        .all()
        .order_by("-attendance_date", "-check_in_time")
    )
    serializer_class = AttendanceSerializer


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

    @action(detail=False, methods=["post"], url_path="generate-yearly-report")
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

        report_prompt = f"""
Anda adalah analis data kehadiran gereja dan bertugas menghasilkan laporan analisis yang mudah dipahami oleh pengurus gereja, termasuk mereka yang tidak memiliki latar belakang teknis.

## DATA

Periode laporan: {start_date_value} s.d. {end_date_value}

Statistik umum:
- Total anggota aktif saat ini: {total_active_members}
- Total sesi ibadah dalam periode: {len(session_dates)}
- Anggota yang hadir setidaknya sekali: {total_distinct_members_attended} dari {total_active_members} anggota aktif
- Rata-rata tingkat kehadiran: {avg_rate}%

Grafik pertumbuhan anggota baru per bulan:
{growth_section}

Grafik tingkat kehadiran per sesi ibadah:
{rate_section}

Daftar anggota yang perlu follow-up (dibuat dalam periode ini), total {len(followup_data)} anggota:
{followup_csv}

## GAYA PENULISAN
- Gunakan bahasa Indonesia yang sederhana dan profesional.
- Hindari istilah teknis seperti "variansi", "distribusi", "outlier", atau "anomali".
- Jika perlu menjelaskan pola, gunakan ungkapan seperti: "cenderung meningkat", "relatif stabil", "mulai menurun", "jarang hadir", "perlu perhatian".
- Fokus pada makna praktis dari data, bukan istilah statistik.

## STRUKTUR WAJIB OUTPUT

Gunakan tepat empat bagian berikut:

### 1. Ringkasan Umum
Jelaskan kondisi kehadiran dan pertumbuhan anggota secara keseluruhan:
- Apakah kehadiran secara umum tinggi, sedang, atau rendah.
- Apakah rata-rata kehadiran memenuhi harapan gereja.
- Apakah pertumbuhan anggota baru berjalan baik atau stagnan.
- Gambaran singkat partisipasi anggota dalam periode ini.

### 2. Tren & Insight
{wajib_charts}

Kemudian analisis:
- Apakah jumlah kehadiran per sesi cenderung meningkat, menurun, atau stabil.
- Bulan dengan pertumbuhan anggota baru tertinggi dan terendah.
- Sesi ibadah dengan tingkat kehadiran tertinggi dan terendah.
- Pola atau tren lain yang penting bagi pengurus gereja.
- Jika menggunakan angka, sertakan penjelasan sederhana mengenai artinya.

### 3. Daftar Follow-Up & Rekomendasi
Untuk setiap anggota dalam daftar follow-up:
- Sebutkan nama anggota.
- Jelaskan alasan follow-up dengan bahasa sederhana berdasarkan kolom "reason".
- Rekomendasikan tindakan konkret (telepon, kunjungan, doa, dsb.) berdasarkan kolom "type" dan "progress".
- Jelaskan mengapa anggota tersebut layak mendapat perhatian pastoral.

Jika tidak ada anggota yang memerlukan follow-up, tuliskan:
"Tidak ada anggota yang memerlukan follow-up pastoral berdasarkan data yang tersedia."

### 4. Kesimpulan
Ringkas dalam beberapa kalimat:
- Kondisi umum kehadiran dan pertumbuhan anggota.
- Temuan yang paling penting.
- Tindakan yang sebaiknya diprioritaskan oleh pengurus gereja.

## ATURAN KETAT
- Jangan mengajukan pertanyaan.
- Jangan meminta data tambahan atau klarifikasi.
- Jangan menawarkan analisis lanjutan.
- Jangan menambahkan kalimat seperti "Apakah Anda ingin...".
- Jangan menyebut bahwa Anda adalah AI atau chatbot.
- Jangan mengulang data mentah secara lengkap.
- Jangan membuat asumsi di luar data yang tersedia.
- Langsung hasilkan laporan akhir.
""".strip()

        llm = ChatOpenRouter(model="openrouter/auto", temperature=0.3)
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

    @action(detail=False, methods=["get"], url_path="follow-up-recommendations")
    def follow_up_recommendations(self, request):
        qs = (
            FollowupMember.objects
            .select_related("member")
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
        qs = Attendance.objects.all()
        if year_param:
            try:
                year = int(year_param)
                start = date(year, 1, 1)
                end = date(year + 1, 1, 1)
                qs = qs.filter(attendance_date__gte=start, attendance_date__lt=end)
            except (TypeError, ValueError):
                pass

        sessions_qs = (
            qs.values("attendance_date")
            .annotate(
                total=Count("id"),
                member_count=Count("member", filter=Q(member__isnull=False)),
                guest_count=Count("guest", filter=Q(guest__isnull=False)),
            )
            .order_by("-attendance_date")
        )

        data = []
        for row in sessions_qs:
            session_date = row["attendance_date"]
            eligible = Member.objects.filter(
                member_status="active",
                created_at__date__lte=session_date,
            ).count()
            absent = max(0, eligible - row["member_count"])
            data.append({
                "date": session_date,
                "total": row["total"],
                "member_count": row["member_count"],
                "guest_count": row["guest_count"],
                "absent_count": absent,
            })
        serializer = SessionSerializer(data, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="session-attendees")
    def session_attendees(self, request):
        date_param = request.query_params.get("date")
        if not date_param:
            return Response({"error": "date parameter is required"}, status=400)

        try:
            session_date = datetime.strptime(date_param, "%Y-%m-%d").date()
        except ValueError:
            return Response({"error": "Invalid date format. Use YYYY-MM-DD."}, status=400)

        attendances = (
            Attendance.objects.filter(attendance_date=session_date)
            .select_related("member", "guest")
        )

        members = []
        guests = []
        for a in attendances:
            if a.member:
                members.append({
                    "id": a.member.id,
                    "full_name": a.member.full_name,
                    "phone": a.member.phone,
                })
            elif a.guest:
                guests.append({
                    "id": a.guest.id,
                    "full_name": a.guest.full_name,
                    "phone": a.guest.phone,
                    "visit_count": a.guest.visit_count,
                })

        return Response({"members": members, "guests": guests})


class FollowupMemberViewSet(viewsets.ModelViewSet):
    queryset = FollowupMember.objects.select_related("member").order_by("-created_at")
    serializer_class = FollowupMemberDetailSerializer
