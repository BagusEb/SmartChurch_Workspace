from django.db import models
from django.contrib.auth.models import User
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver


# ================= TABEL ROLE USER =================
class UserProfile(models.Model):
    # Sesuai dengan spesifikasi dokumen Capstone Form 2
    ROLE_CHOICES = (
        ("admin", "Admin / Church Committee"),
        ("leader", "Church Leader (Pastor)"),
    )
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="admin")

    class Meta:
        db_table = "t_user_role"

    def __str__(self):
        return f"{self.user.username} - {self.role}"


# Otomatis membuatkan Profile kosong tiap kali kamu bikin akun User baru
@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.create(user=instance)


@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    instance.profile.save()


# ==========================================
# 1. PROFIL & MASTER DATA
# ==========================================


class Member(models.Model):
    GENDER_CHOICES = (
        ("L", "Laki-laki"),
        ("P", "Perempuan"),
    )
    STATUS_CHOICES = (
        ("active", "Active"),
        ("inactive", "Inactive"),
        ("moved", "Moved"),
    )
    full_name = models.CharField(max_length=100)
    nickname = models.CharField(max_length=100, blank=True, null=True)
    gender = models.CharField(max_length=10, choices=GENDER_CHOICES)
    birth_date = models.DateField(blank=True, null=True)
    phone = models.CharField(max_length=20, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    address = models.TextField(blank=True, null=True)
    member_status = models.CharField(
        max_length=50, choices=STATUS_CHOICES, default="active"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tm_member"  # Memaksa nama tabel sesuai ERD

    def __str__(self):
        return self.full_name

class WorshipSession(models.Model):
    session_name = models.CharField(max_length=255)
    date = models.DateField()
    start_time = models.DateTimeField(null=True, blank=True)
    end_time = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=50, default='active')

    class Meta:
        db_table = 't_attendance_session'

    def __str__(self):
        return self.session_name

class FollowupMember(models.Model):
    STATUS_CHOICES = [
        ("new", "New"),
        ("resolved", "Resolved"),
        ("closed", "Closed"),
    ]
    FOLLOWUP_TYPE_CHOICES = [
        ("call", "Call"),
        ("visited", "Visited"),
    ]
    PROGRESS_CHOICES = [
        ("not_yet", "Not Yet"),
        ("followed_up", "Followed up"),
        ("need_more", "Need More Follow Up"),
        ("completed", "Completed"),
    ]

    member = models.ForeignKey(
        Member, on_delete=models.CASCADE, related_name="followups"
    )
    status_followup = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="new"
    )
    followup_type = models.CharField(
        max_length=20, choices=FOLLOWUP_TYPE_CHOICES, null=True
    )
    followup_date = models.DateField()
    result_followup = models.CharField(max_length=255, null=True)
    explain_followup = models.TextField(null=True, blank=True)
    progress_followup = models.CharField(
        max_length=20, choices=PROGRESS_CHOICES, default="not_yet"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tm_followup_members"
        ordering = ["-followup_date"]

    def __str__(self):
        return f"{self.member.full_name} - {self.followup_date}"


class Guest(models.Model):
    full_name = models.CharField(max_length=100)
    phone = models.CharField(max_length=20, blank=True, null=True)
    visit_count = models.IntegerField(default=0)
    first_visit = models.DateField(blank=True, null=True)
    last_visit = models.DateField(blank=True, null=True)
    converted_to_member = models.ForeignKey(
        Member, on_delete=models.SET_NULL, null=True, blank=True
    )
    # Tambah face_image byte
    face_image = models.BinaryField(blank=True, null=True)
    face_encoding = models.JSONField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "t_guest"

    def __str__(self):
        return self.full_name


class MemberFaceEmbedding(models.Model):
    member = models.ForeignKey(Member, on_delete=models.CASCADE)
    face_encoding = (
        models.JSONField()
    )  # textfild kita ubah ke json fild, karena isinya langsung vector
    face_image = models.BinaryField(
        blank=True, null=True
    )  # ganti ke bollean karena kita langsung store ke database
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "t_member_face_embedding"


# ==========================================
# 2. TRANSIT & VALIDASI (TIMELINE RECORD)
# ==========================================


class TimelineDataRecord(models.Model):
    DETECTION_STATUS = (
        ("know", "Know"),
        ("ambiguous", "Ambiguous"),
        ("unknown", "Unknown"),
        # ('impossible', 'Impossible'), #ini ga ada ya
    )
    VALIDATION_STATUS = (
        ("pending", "Pending"),
        ("verified", "Verified"),
        ("rejected", "Rejected"),
        ("guest_confirmed", "Guest Confirmed"),
    )
    capture_time = models.DateTimeField()
    face_image = models.BinaryField(
        blank=True, null=True
    )  # langsung image karena sepakat store ke database ganti nama face_image
    face_encoding = models.JSONField(blank=True, null=True)
    detection_status = models.CharField(max_length=50, choices=DETECTION_STATUS)
    confidence = models.DecimalField(
        max_digits=5, decimal_places=2, blank=True, null=True
    )
    matched_member = models.ForeignKey(
        Member,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ai_matches",
    )
    validation_status = models.CharField(
        max_length=50, choices=VALIDATION_STATUS, default="pending"
    )
    validated_at = models.DateTimeField(blank=True, null=True)
    final_member = models.ForeignKey(
        Member,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="final_validations",
    )
    final_guest = models.ForeignKey(
        Guest, on_delete=models.SET_NULL, null=True, blank=True
    )
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "t_timlinedata_record"


# ==========================================
# 3. FINAL ABSENSI
# ==========================================
class Attendance(models.Model):
    member = models.ForeignKey(Member, on_delete=models.SET_NULL, null=True, blank=True)
    guest = models.ForeignKey(Guest, on_delete=models.SET_NULL, null=True, blank=True)
    facedetection = models.OneToOneField(
        TimelineDataRecord,  # Relasi sudah dirubah ke model yang baru
        on_delete=models.CASCADE,
    )
    
    session = models.ForeignKey(
        WorshipSession, 
        on_delete=models.CASCADE, 
        related_name='attendances', 
        null=True, 
        blank=True
    )

    attendance_date = models.DateField()
    check_in_time = models.DateTimeField()
    confidence = models.DecimalField(max_digits=5, decimal_places=2)
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "t_attendance"


# ==========================================
# 4. USER & AI CONVERSATION
# ==========================================
class AIConversation(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    langfuse_threadid = models.CharField(max_length=100, blank=True, null=True)
    conversation_title = models.CharField(max_length=200, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_activity_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = "t_aiconversation"


# ==========================================
# 5. SUMMARY REPORT
# ==========================================


class SummaryReport(models.Model):
    report_start_date = models.DateField()
    report_end_date = models.DateField()
    total_members = models.IntegerField(default=0)
    total_guests = models.IntegerField(default=0)
    total_attendance = models.IntegerField(default=0)
    report_summary = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "t_summary_report"
        ordering = ["-created_at"]
        unique_together = [("report_start_date", "report_end_date")]

    def __str__(self):
        return f"Summary for {self.report_start_date} to {self.report_end_date}"
