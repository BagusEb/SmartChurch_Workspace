import json
from collections import defaultdict
from datetime import date, datetime

from dateutil.relativedelta import relativedelta
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
            Member.objects
            .filter(
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
        Attendance.objects
        .filter(
            member__created_at__date__lte=a_year_ago,
            attendance_date__gte=a_year_ago,
            attendance_date__lte=three_months_ago,
            member_id__isnull=False,
        )
        .values("member_id", "attendance_date")
        .distinct()
    )

    sessions_1 = (
        Attendance.objects
        .filter(
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
            Attendance.objects
            .filter(
                member__created_at__date__lte=a_year_ago,
                attendance_date__gt=three_months_ago,
                attendance_date__lte=target_date,
                member_id__isnull=False,
            )
            .values("member_id", "attendance_date")
            .distinct()
        )

        sessions_2 = (
            Attendance.objects
            .filter(
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
    queryset = Attendance.objects.all().order_by('-check_in_time')
    serializer_class = AttendanceSerializer


class WorshipSessionViewSet(viewsets.ModelViewSet):
    queryset = WorshipSession.objects.all()
    # Assume you or your friend already created a serializer for this
    # serializer_class = WorshipSessionSerializer 

    serializer_class = WorshipSessionSerializer
    
    # ============================================================
    # 1. GATEWAY: START SESSION (POST /api/worship-sessions/start_session/)
    # ============================================================
    @action(detail=False, methods=['post'])
    def start_session(self, request):
        session_name = request.data.get('session_name')
        
        active_session = WorshipSession.objects.filter(status='active').first()
        if active_session:
            return Response({"error": "Masih ada sesi yang aktif. Akhiri sesi sebelumnya terlebih dahulu."}, status=400)

        if not session_name:
             return Response({"error": "Nama sesi wajib diisi!"}, status=400)

        # 👇 PASTIKAN BAGIAN INI MENYERTAKAN date=timezone.now().date() 👇
        new_session = WorshipSession.objects.create(
            session_name=session_name,
            date=timezone.now().date(),    # INI YANG TADI HILANG
            start_time=timezone.now(),
            status='active'
        )

        serializer = self.get_serializer(new_session)
        return Response(serializer.data, status=201)

    # ============================================================
    # 2. GATEWAY: END SESSION (POST /api/worship-sessions/end_session/)
    # ============================================================
    @action(detail=False, methods=['post'])
    def end_session(self, request):
        """Closes the currently active session and locks the final timestamp."""
        session_id = request.data.get('session_id')

        try:
            # Find the targeted session in the database
            session = WorshipSession.objects.get(id=session_id)
            
            if session.status == 'completed':
                return Response(
                    {"error": "This session has already been closed dynamicly."}, 
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Update the lifecycle metadata
            session.status = 'completed'
            session.end_time = timezone.now()
            session.save()

            return Response({
                "message": "Worship session closed successfully.",
                "session_id": session.id,
                "status": session.status,
                "end_time": session.end_time
            }, status=status.HTTP_200_OK)

        except WorshipSession.DoesNotExist:
            return Response(
                {"error": "Worship session not found."}, 
                status=status.HTTP_404_NOT_FOUND
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
    
    @action(detail=False, methods=["post"], url_path="generate-followup-recommendations")
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
            total=Count("attendances"),
            member_count=Count("attendances", filter=Q(attendances__member__isnull=False)),
            guest_count=Count("attendances", filter=Q(attendances__guest__isnull=False)),
        ).order_by("-date", "-start_time")

        data = []
        for session in sessions_qs:
            session_date = session.date
            eligible = Member.objects.filter(
                member_status="active",
                created_at__date__lte=session_date,
            ).count()
            absent = max(0, eligible - session.member_count)
            data.append({
                "session_id": session.id,
                "session_name": session.session_name,
                "status": session.status,
                "date": session_date,
                "total": session.total,
                "member_count": session.member_count,
                "guest_count": session.guest_count,
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


