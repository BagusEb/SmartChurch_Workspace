//pages/GuestValidation.jsx

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  AlertTriangle,
  CheckCircle,
  Loader2,
  ShieldCheck,
} from "lucide-react";

import {
  getValidationAiSessions,
  getValidationAiMemberGuestData,
  verifyValidationAiRecord,
  rejectValidationAiRecord,
  findValidationAiGuestByAi,
  confirmValidationAiGuest,
  addValidationAiMemberFace,
} from "../service/apiClient";

import { findMemberName } from "../components/validationAI/validationHelpers";

import SessionCard from "../components/validationAI/SessionCard";
import ValidationRow from "../components/validationAI/ValidationRow";
import FacePreviewModal from "../components/validationAI/FacePreviewModal";
import {
  VerifyModal,
  GuestModal,
  MemberModal,
  RejectModal,
} from "../components/validationAI/ActionModals";

export default function GuestValidation() {
  // ─── Data dari backend ───────────────────────────────────────────
  const [validationSessions, setValidationSessions] = useState([]);
  const [allMembers, setAllMembers] = useState([]);
  const [allGuests, setAllGuests] = useState([]);

  // ─── Loading & Error ─────────────────────────────────────────────
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [sessionError, setSessionError] = useState(null);

  // ─── Session & Row State ──────────────────────────────────────────
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [expandedRows, setExpandedRows] = useState({});
  const [selectedFaces, setSelectedFaces] = useState({});

  // ─── Modal & Toast ────────────────────────────────────────────────
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);

  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  // ─── Guest Modal State ────────────────────────────────────────────
  const [guestSearchName, setGuestSearchName] = useState("");
  const [selectedGuestId, setSelectedGuestId] = useState("");
  const [aiRecommendedGuest, setAiRecommendedGuest] = useState(null);
  const [isFindingGuestByAi, setIsFindingGuestByAi] = useState(false);

  const [showGuestForm, setShowGuestForm] = useState(false);
  const [guestForm, setGuestForm] = useState({
    full_name: "",
    phone: "",
    from_where: "",
  });

  // ─── Member Modal State ───────────────────────────────────────────
  const [memberMode, setMemberMode] = useState("existing");
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [memberForm, setMemberForm] = useState({
    full_name: "",
    nickname: "",
    gender: "L",
    birth_date: "",
    phone: "",
    email: "",
    address: "",
  });

  // ─── Verify Modal State ───────────────────────────────────────────
  const [verifyMode, setVerifyMode] = useState("ai"); // ai | manual
  const [verifyMemberSearch, setVerifyMemberSearch] = useState("");
  const [selectedVerifyMemberId, setSelectedVerifyMemberId] = useState("");
  // ─── Fetch Sessions ───────────────────────────────────────────────
  const fetchSessions = useCallback(async () => {
    setIsLoadingSessions(true);
    setSessionError(null);
    try {
      const data = await getValidationAiSessions();
      if (data?.success && Array.isArray(data.sessions)) {
        setValidationSessions(data.sessions);
      } else {
        setValidationSessions([]);
      }
    } catch (error) {
      console.error("Gagal fetch validation sessions:", error);
      setSessionError("Gagal memuat data sesi. Coba refresh halaman.");
      setValidationSessions([]);
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  // ─── Fetch Members + Guests (untuk search dropdown) ───────────────
  const fetchMembersAndGuests = useCallback(async (q = "") => {
    try {
      const data = await getValidationAiMemberGuestData(q);
      if (data?.success) {
        setAllMembers(data.members || []);
        setAllGuests(data.guests || []);
      }
    } catch (error) {
      console.error("Gagal fetch member/guest data:", error);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    fetchMembersAndGuests(); // load semua data awal (tanpa filter)
  }, [fetchSessions, fetchMembersAndGuests]);

  // ─── Computed ─────────────────────────────────────────────────────
  const totalPending = useMemo(() => {
    return validationSessions.reduce(
      (sum, item) => sum + Number(item.summary?.total_pending || 0),
      0
    );
  }, [validationSessions]);

  const activeSession = useMemo(() => {
    return validationSessions.find(
      (item) => item.session.id === activeSessionId
    );
  }, [validationSessions, activeSessionId]);

  const activeRows = useMemo(() => {
    if (!activeSession) return [];

    const ambiguousRows = (activeSession.ambiguous_records || []).map(
      (record) => ({
        rowKey: `ambiguous-${record.id}`,
        type: "ambiguous",
        label: `Ambiguous #${record.id}`,
        count: 1,
        records: [record],
        recordIds: [record.id],
        confidence: record.confidence,
        matchedMemberId: record.matched_member_id,
        matchedMemberName:
          record.matched_member_name ||
          findMemberName(allMembers, record.matched_member_id) ||
          "Jemaat kandidat",
        aiRecommendation: record.ai_recommendation || {
          member_id: record.matched_member_id,
          full_name:
            record.matched_member_name ||
            findMemberName(allMembers, record.matched_member_id) ||
            "Jemaat kandidat",
          similarity: record.confidence,
          note: "Kandidat paling mendekati dari hasil recognition AI",
        },
      })
    );

    const unknownRows = (activeSession.unknown_people_groups || []).map(
      (group, index) => ({
        rowKey: `unknown-${group.group_id || index}`,
        type: "unknown",
        label: group.label || `People ${index + 1}`,
        helper: `${group.count || group.records?.length || 0} wajah dari orang yang sama`,
        count: group.count || group.records?.length || 0,
        records: group.records || [],
        recordIds:
          group.record_ids || (group.records || []).map((r) => r.id),
        confidence: group.average_confidence,
        representativeImage: group.representative_image,
        aiRecommendation: group.ai_recommendation || null,
      })
    );

    return [...ambiguousRows, ...unknownRows];
  }, [activeSession, allMembers]);

  // ─── Filter member & guest client-side ───────────────────────────
  const filteredMembers = useMemo(() => {
    const keyword = memberSearch.trim().toLowerCase();
    if (!keyword) return allMembers;

    return allMembers.filter((m) => {
      const name = String(m.full_name || "").toLowerCase();
      const nick = String(m.nickname || "").toLowerCase();
      const phone = String(m.phone || "").toLowerCase();
      return name.includes(keyword) || nick.includes(keyword) || phone.includes(keyword);
    });
  }, [allMembers, memberSearch]);

  const filteredVerifyMembers = useMemo(() => {
    const keyword = verifyMemberSearch.trim().toLowerCase();

    if (!keyword) return allMembers;

    return allMembers.filter((m) => {
      const name = String(m.full_name || "").toLowerCase();
      const nick = String(m.nickname || "").toLowerCase();
      const phone = String(m.phone || "").toLowerCase();
      const email = String(m.email || "").toLowerCase();

      return (
        name.includes(keyword) ||
        nick.includes(keyword) ||
        phone.includes(keyword) ||
        email.includes(keyword)
      );
    });
  }, [allMembers, verifyMemberSearch]);

  const filteredGuests = useMemo(() => {
    const keyword = guestSearchName.trim().toLowerCase();
    if (!keyword) return [];

    return allGuests
      .filter((g) => {
        const name = String(g.full_name || "").toLowerCase();
        const phone = String(g.phone || "").toLowerCase();
        const from = String(g.from_where || "").toLowerCase();

        return (
          name.includes(keyword) ||
          phone.includes(keyword) ||
          from.includes(keyword)
        );
      })
      .slice(0, 12);
  }, [allGuests, guestSearchName]);

  // ─── Toast ────────────────────────────────────────────────────────
  const showToast = (message, type = "success") => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 2800);
  };

  // ─── Session Controls ─────────────────────────────────────────────
  const openSession = (sessionId) => {
    setActiveSessionId(sessionId);
    setExpandedRows({});
    setSelectedFaces({});
  };

  const closeSession = () => {
    setActiveSessionId(null);
    setExpandedRows({});
    setSelectedFaces({});
  };

  // ─── Row Controls ─────────────────────────────────────────────────
  const toggleRow = (rowKey) => {
    setExpandedRows((prev) => ({ ...prev, [rowKey]: !prev[rowKey] }));
  };

  const isFaceSelected = (rowKey, recordId) =>
    selectedFaces[rowKey]?.includes(recordId);

  const toggleFaceSelection = (row, record) => {
    const rowKey = row.rowKey;
    setSelectedFaces((prev) => {
      const current = prev[rowKey] || [];
      if (row.type === "ambiguous") return { ...prev, [rowKey]: [record.id] };
      if (current.includes(record.id))
        return { ...prev, [rowKey]: current.filter((id) => id !== record.id) };
      return { ...prev, [rowKey]: [...current, record.id] };
    });
  };

  const getSelectedRecords = (row) => {
    if (!row) return [];
    if (row.type === "ambiguous") return row.records;
    const ids = selectedFaces[row.rowKey] || [];
    return row.records.filter((r) => ids.includes(r.id));
  };

  const ensureAtLeastOneFace = (row, actionName) => {
    if (row.type === "ambiguous") return true;
    const selected = getSelectedRecords(row);
    if (selected.length === 0) {
      showToast(`Pilih minimal satu gambar sebelum ${actionName}.`, "warning");
      return false;
    }
    return true;
  };

  const ensureExactlyOneFaceForGuest = (row) => {
    if (row.type === "ambiguous") return true;
    const selected = getSelectedRecords(row);
    if (selected.length === 0) {
      showToast("Pilih satu gambar untuk dijadikan Tamu.", "warning");
      return false;
    }
    if (selected.length > 1) {
      showToast("Untuk action Tamu, hanya boleh pilih 1 gambar.", "warning");
      return false;
    }
    return true;
  };

  // ─── Remove validated row dari state lokal ─────────────────────────
  const removeValidatedRows = (sessionId, row) => {
    setValidationSessions((prev) => {
      return prev
        .map((sessionItem) => {
          if (sessionItem.session.id !== sessionId) return sessionItem;

          let nextUnknownGroups = sessionItem.unknown_people_groups || [];
          let nextAmbiguousRecords = sessionItem.ambiguous_records || [];

          if (row.type === "ambiguous") {
            nextAmbiguousRecords = nextAmbiguousRecords.filter(
              (r) => r.id !== row.records[0]?.id
            );
          }
          if (row.type === "unknown") {
            nextUnknownGroups = nextUnknownGroups.filter(
              (g) => `unknown-${g.group_id}` !== row.rowKey
            );
          }

          const totalUnknownRecords = nextUnknownGroups.reduce(
            (sum, g) => sum + Number(g.count || g.records?.length || 0),
            0
          );
          const nextTotalPending =
            nextAmbiguousRecords.length + totalUnknownRecords;

          return {
            ...sessionItem,
            summary: {
              ...sessionItem.summary,
              total_pending: nextTotalPending,
              total_unknown_people_groups: nextUnknownGroups.length,
              total_unknown_records: totalUnknownRecords,
              total_ambiguous_records: nextAmbiguousRecords.length,
            },
            unknown_people_groups: nextUnknownGroups,
            ambiguous_records: nextAmbiguousRecords,
          };
        })
        .filter((s) => s.summary.total_pending > 0);
    });

    setModal(null);
    setExpandedRows((prev) => {
      const c = { ...prev };
      delete c[row.rowKey];
      return c;
    });
    setSelectedFaces((prev) => {
      const c = { ...prev };
      delete c[row.rowKey];
      return c;
    });
  };

  // ─── Modal openers ────────────────────────────────────────────────
  const openVerifyModal = (row) => {
    setVerifyMode("ai");
    setVerifyMemberSearch("");
    setSelectedVerifyMemberId("");

    setModal({
      type: "verify",
      row,
      sessionId: activeSessionId,
    });
  };

  const openGuestModal = (row) => {
    if (!ensureExactlyOneFaceForGuest(row)) return;

    setGuestSearchName("");
    setSelectedGuestId("");
    setAiRecommendedGuest(null);
    setShowGuestForm(false);
    setGuestForm({ full_name: "", phone: "", from_where: "" });

    setModal({ type: "guest", row, sessionId: activeSessionId });
  };


  const resetMemberModalState = () => {
    setMemberMode("existing");
    setMemberSearch("");
    setSelectedMemberId("");
    setMemberForm({
      full_name: "",
      nickname: "",
      gender: "L",
      birth_date: "",
      phone: "",
      email: "",
      address: "",
    });
  };

  const openRealAddMemberModal = (row) => {
    resetMemberModalState();
    setModal({ type: "member", row, sessionId: activeSessionId });
  };

  const openAddMemberModal = (row) => {
    if (row.type === "ambiguous") {
      openRealAddMemberModal(row);
      return;
    }

  const selected = getSelectedRecords(row);

  if (selected.length === 0) {
    showToast("Pilih minimal satu gambar sebelum menambahkan ke Jemaat.", "warning");
    return;
  }

  if (selected.length === 1) {
    setModal({
      type: "member-single-face-confirm",
      row,
      sessionId: activeSessionId,
    });
    return;
  }

  openRealAddMemberModal(row);
};
  const openRejectModal = (row) =>
    setModal({ type: "reject", row, sessionId: activeSessionId });

  // ─── Modal confirm handlers ───────────────────────────────────────
  const handleConfirmVerify = async () => {
    if (!modal?.row || isSubmittingAction) return;

    const row = modal.row;
    const recommendation = row.aiRecommendation;

    if (verifyMode === "ai" && !recommendation?.member_id && !row.matchedMemberId) {
      showToast(
        "Rekomendasi AI tidak memiliki member. Pilih jemaat secara manual.",
        "warning"
      );
      return;
    }

    if (verifyMode === "manual" && !selectedVerifyMemberId) {
      showToast("Pilih jemaat tujuan terlebih dahulu.", "warning");
      return;
    }

    const finalMemberId =
      verifyMode === "manual"
        ? selectedVerifyMemberId
        : recommendation?.member_id || row.matchedMemberId;

    const finalMember =
      allMembers.find((member) => String(member.id) === String(finalMemberId)) ||
      null;

    const selectedRecords = getSelectedRecords(row);

    const payload = {
      session_id: modal.sessionId,
      member_id: Number(finalMemberId),
      record_ids: row.recordIds || row.records.map((record) => record.id),
    };

    /*
      Untuk unknown group:
      - Backend bisa otomatis pilih center record dari confidence tertinggi.
      - Kalau user memilih tepat 1 gambar sebelum klik Verify, kita kirim sebagai center_record_id.
      - Kalau user tidak memilih / memilih lebih dari 1, backend fallback pilih confidence tertinggi.
    */
    if (row.type === "unknown" && selectedRecords.length === 1) {
      payload.center_record_id = selectedRecords[0].id;
    }

    setIsSubmittingAction(true);

    try {
      const result = await verifyValidationAiRecord(payload);

      if (!result?.success) {
        showToast(result?.message || "Verifikasi gagal diproses.", "warning");
        return;
      }

      showToast(
        `${row.label} berhasil diverifikasi sebagai ${
          result?.member?.full_name || finalMember?.full_name || "jemaat"
        }.`
      );

      removeValidatedRows(modal.sessionId, row);

      /*
        Optional refresh agar data benar-benar sinkron dengan backend.
        Kalau tidak mau reload list, baris ini boleh dihapus.
      */
      fetchSessions();
    } catch (error) {
      console.error("Gagal verifikasi AI:", error);

      const backendMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        "Gagal memproses verifikasi. Coba lagi.";

      showToast(backendMessage, "warning");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleFindGuestByAi = async () => {
    if (!modal?.row || isFindingGuestByAi || isSubmittingAction) return;

    const selectedRecords = getSelectedRecords(modal.row);

    if (selectedRecords.length !== 1) {
      showToast("Pilih tepat 1 gambar untuk Find by AI.", "warning");
      return;
    }

    const selectedRecord = selectedRecords[0];

    const payload = {
      session_id: modal.sessionId,
      record_id: selectedRecord.id,
    };

    setIsFindingGuestByAi(true);

    try {
      const result = await findValidationAiGuestByAi(payload);

      if (!result?.success) {
        showToast(result?.message || "Find by AI gagal dijalankan.", "warning");
        return;
      }

      const recommendation = result?.recommendation;

      if (!recommendation) {
        setAiRecommendedGuest(null);
        setSelectedGuestId("");
        showToast(result?.message || "AI belum menemukan tamu yang cocok.", "warning");
        return;
      }

      setAiRecommendedGuest(recommendation);
      setSelectedGuestId(recommendation.id);
      setGuestSearchName(recommendation.full_name || "");
      setShowGuestForm(false);

      showToast(
        result?.found
          ? `AI merekomendasikan ${recommendation.full_name}.`
          : `Kandidat ditemukan: ${recommendation.full_name}, tetapi similarity masih rendah.`,
        result?.found ? "success" : "warning"
      );
    } catch (error) {
      console.error("Gagal Find Guest by AI:", error);

      const backendMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        "Gagal menjalankan Find by AI.";

      showToast(backendMessage, "warning");
    } finally {
      setIsFindingGuestByAi(false);
    }
  };

  const handleConfirmGuest = async () => {
    if (!modal?.row || isSubmittingAction) return;

    const row = modal.row;
    const selectedRecords = getSelectedRecords(row);

    if (selectedRecords.length !== 1) {
      showToast("Pilih tepat 1 gambar untuk disimpan sebagai Tamu.", "warning");
      return;
    }

    const selectedRecord = selectedRecords[0];

    let payload = {
      session_id: modal.sessionId,
      record_id: selectedRecord.id,
      record_ids: row.recordIds || row.records.map((record) => record.id),
    };

    if (showGuestForm) {
      if (!guestForm.full_name.trim()) {
        showToast("Nama tamu wajib diisi.", "warning");
        return;
      }

      payload = {
        ...payload,
        mode: "new",
        guest: {
          full_name: guestForm.full_name.trim(),
          phone: guestForm.phone.trim(),
          from_where: guestForm.from_where.trim(),
        },
      };
    } else {
      if (!selectedGuestId) {
        showToast(
          "Pilih tamu lama dari hasil pencarian, gunakan Find by AI, atau isi Tamu Baru.",
          "warning"
        );
        return;
      }

      payload = {
        ...payload,
        mode: "existing",
        source_guest_id: Number(selectedGuestId),
      };
    }

    setIsSubmittingAction(true);

    try {
      const result = await confirmValidationAiGuest(payload);

      if (!result?.success) {
        showToast(result?.message || "Gagal menyimpan data tamu.", "warning");
        return;
      }

      showToast(
        `${row.label} berhasil disimpan sebagai tamu ${
          result?.guest?.full_name ? result.guest.full_name : ""
        }.`.trim()
      );

      /*
        Ambiguous:
        - row hilang karena record sudah guest_confirmed.

        Unknown group:
        - selected record guest_confirmed.
        - record lain rejected oleh backend.
        - jadi satu group ini juga selesai dan hilang dari pending list.
      */
      removeValidatedRows(modal.sessionId, row);

      fetchSessions();
      fetchMembersAndGuests();
    } catch (error) {
      console.error("Gagal confirm guest:", error);

      const backendMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        "Gagal menyimpan data tamu. Coba lagi.";

      showToast(backendMessage, "warning");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleConfirmMember = async () => {
    if (!modal?.row || isSubmittingAction) return;

    const row = modal.row;
    const selectedRecords = getSelectedRecords(row);

    if (row.type === "unknown" && selectedRecords.length === 0) {
      showToast("Pilih minimal satu gambar untuk ditambahkan ke data Jemaat.", "warning");
      return;
    }

    const recordsForEmbedding =
      row.type === "ambiguous" ? row.records : selectedRecords;

    if (recordsForEmbedding.length === 0) {
      showToast("Tidak ada gambar yang bisa diproses.", "warning");
      return;
    }

    if (memberMode === "existing" && !selectedMemberId) {
      showToast("Pilih jemaat terdaftar terlebih dahulu.", "warning");
      return;
    }

    if (memberMode === "new" && !memberForm.full_name.trim()) {
      showToast("Nama lengkap jemaat baru wajib diisi.", "warning");
      return;
    }

    const payload = {
      session_id: modal.sessionId,
      mode: memberMode,
      record_ids: row.recordIds || row.records.map((record) => record.id),
      selected_record_ids: recordsForEmbedding.map((record) => record.id),
    };

    if (memberMode === "existing") {
      payload.member_id = Number(selectedMemberId);
    } else {
      payload.member = {
        full_name: memberForm.full_name.trim(),
        nickname: memberForm.nickname.trim(),
        gender: memberForm.gender || "L",
        birth_date: memberForm.birth_date || "",
        phone: memberForm.phone.trim(),
        email: memberForm.email.trim(),
        address: memberForm.address.trim(),
      };
    }

    setIsSubmittingAction(true);

    try {
      const result = await addValidationAiMemberFace(payload);

      if (!result?.success) {
        showToast(result?.message || "Gagal menambahkan wajah jemaat.", "warning");
        return;
      }

      const totalEmbeddings =
        result?.embedding_ids?.length ||
        result?.embeddings?.length ||
        recordsForEmbedding.length;

      showToast(
        `${row.label} berhasil ditambahkan ke ${
          result?.member?.full_name || "jemaat"
        } dengan ${totalEmbeddings} data wajah.`
      );

      removeValidatedRows(modal.sessionId, row);

      fetchSessions();
      fetchMembersAndGuests();
    } catch (error) {
      console.error("Gagal tambah wajah member:", error);

      const backendMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        "Gagal menambahkan wajah jemaat. Coba lagi.";

      showToast(backendMessage, "warning");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!modal?.row || isSubmittingAction) return;

    const row = modal.row;

    const payload = {
      session_id: modal.sessionId,
      record_ids: row.recordIds || row.records.map((record) => record.id),
    };

    setIsSubmittingAction(true);

    try {
      const result = await rejectValidationAiRecord(payload);

      if (!result?.success) {
        showToast(result?.message || "Reject gagal diproses.", "warning");
        return;
      }

      showToast(`${row.label} berhasil ditolak.`);

      removeValidatedRows(modal.sessionId, row);

      /*
        Optional: refresh dari backend agar list validasi benar-benar sinkron.
        Boleh dihapus kalau kamu mau hanya update local state.
      */
      fetchSessions();
    } catch (error) {
      console.error("Gagal reject validation AI:", error);

      const backendMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        "Gagal memproses reject. Coba lagi.";

      showToast(backendMessage, "warning");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        .gv-root { font-family: 'Plus Jakarta Sans', sans-serif; }
        .gv-enter { animation: gvEnter 0.28s ease both; }
        @keyframes gvEnter {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .gv-modal-backdrop { animation: gvBackdrop 0.18s ease both; }
        @keyframes gvBackdrop { from { opacity: 0; } to { opacity: 1; } }
        .gv-modal { animation: gvModal 0.24s cubic-bezier(0.34,1.45,0.64,1) both; }
        @keyframes gvModal {
          from { opacity: 0; transform: translateY(22px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .gv-scroll::-webkit-scrollbar { height: 7px; width: 7px; }
        .gv-scroll::-webkit-scrollbar-track { background: transparent; }
        .gv-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 999px; }
        .gv-face-card { scroll-snap-align: start; }
        .gv-soft-grid {
          background-image: radial-gradient(circle at 1px 1px, rgba(99,102,241,0.12) 1px, transparent 0);
          background-size: 20px 20px;
        }
      `}</style>

      <div className="gv-root flex flex-col gap-5">
        {/* Header */}
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div
                className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg"
                style={{
                  background:
                    totalPending > 0
                      ? "linear-gradient(135deg,#f59e0b,#d97706)"
                      : "linear-gradient(135deg,#10b981,#059669)",
                }}
              >
                <ShieldCheck size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight text-slate-800">
                  Validasi AI Attendance
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">
                  Pilih worship session, lalu validasi data wajah ambiguous atau
                  unknown group.
                </p>
              </div>
            </div>

            <div
              className={`inline-flex w-fit items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-bold ${
                totalPending > 0
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {isLoadingSessions ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Memuat...
                </>
              ) : totalPending > 0 ? (
                <>
                  <AlertTriangle size={16} />
                  {totalPending} Pending Validation
                </>
              ) : (
                <>
                  <CheckCircle size={16} />
                  Semua Data Tervalidasi
                </>
              )}
            </div>
          </div>
        </section>

        {/* Loading state */}
        {isLoadingSessions && (
          <section className="flex min-h-[260px] items-center justify-center rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col items-center gap-3 text-slate-400">
              <Loader2 size={36} className="animate-spin text-indigo-500" />
              <p className="text-sm font-semibold">Memuat data validasi...</p>
            </div>
          </section>
        )}

        {/* Error state */}
        {!isLoadingSessions && sessionError && (
          <section className="flex min-h-[200px] flex-col items-center justify-center rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center shadow-sm">
            <AlertTriangle size={32} className="mb-3 text-rose-500" />
            <p className="font-extrabold text-rose-800">{sessionError}</p>
            <button
              onClick={fetchSessions}
              className="mt-4 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700"
            >
              Coba Lagi
            </button>
          </section>
        )}

        {/* Empty state */}
        {!isLoadingSessions && !sessionError && validationSessions.length === 0 && (
          <section className="gv-soft-grid flex min-h-[420px] flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-600">
              <CheckCircle size={38} />
            </div>
            <h3 className="text-xl font-extrabold text-slate-800">
              Tidak Ada Data Validasi
            </h3>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
              Saat ini tidak ada worship session yang memiliki timeline record
              pending.
            </p>
            <button
              onClick={fetchSessions}
              className="mt-5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700"
            >
              Refresh
            </button>
          </section>
        )}

        {/* Session list */}
        {!isLoadingSessions && !sessionError && validationSessions.length > 0 && (
          <>
            <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {validationSessions.map((item, index) => (
                <SessionCard
                  key={item.session.id}
                  item={item}
                  index={index}
                  isActive={activeSessionId === item.session.id}
                  onOpen={() => openSession(item.session.id)}
                />
              ))}
            </section>

            {/* Active session detail */}
            {activeSession && (
              <section className="gv-enter rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-slate-100 p-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-extrabold text-slate-800">
                        {activeSession.session.session_name}
                      </h3>
                      <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">
                        Detail Validasi
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      Klik baris data untuk melihat wajah, lalu pilih action.
                    </p>
                  </div>
                  <button
                    onClick={closeSession}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50"
                  >
                    Tutup
                  </button>
                </div>

                <div className="space-y-3 p-4">
                  {activeRows.length === 0 ? (
                    <div className="flex items-center justify-center py-10 text-slate-400">
                      <CheckCircle size={20} className="mr-2 text-emerald-500" />
                      <span className="text-sm font-semibold">
                        Tidak ada data pending di sesi ini.
                      </span>
                    </div>
                  ) : (
                    activeRows.map((row) => (
                      <ValidationRow
                        key={row.rowKey}
                        row={row}
                        expanded={!!expandedRows[row.rowKey]}
                        selectedFaces={selectedFaces[row.rowKey] || []}
                        onToggle={() => toggleRow(row.rowKey)}
                        onToggleFace={(record) => toggleFaceSelection(row, record)}
                        isFaceSelected={(recordId) =>
                          isFaceSelected(row.rowKey, recordId)
                        }
                        onVerify={() => openVerifyModal(row)}
                        onGuest={() => openGuestModal(row)}
                        onAddMember={() => openAddMemberModal(row)}
                        onReject={() => openRejectModal(row)}
                        onPreviewImage={(image) => setPreviewImage(image)}
                      />
                    ))
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed right-5 top-5 z-[70] gv-enter">
          <div
            className={`flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-xl ${
              toast.type === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {toast.type === "warning" ? (
              <AlertTriangle size={18} />
            ) : (
              <CheckCircle size={18} />
            )}
            <p className="text-sm font-bold">{toast.message}</p>
          </div>
        </div>
      )}

      {/* Modals */}
      {modal?.type === "verify" && (
        <VerifyModal
          modal={modal}
          selectedRecords={getSelectedRecords(modal.row)}
          verifyMode={verifyMode}
          setVerifyMode={setVerifyMode}
          verifyMemberSearch={verifyMemberSearch}
          setVerifyMemberSearch={setVerifyMemberSearch}
          selectedVerifyMemberId={selectedVerifyMemberId}
          setSelectedVerifyMemberId={setSelectedVerifyMemberId}
          filteredVerifyMembers={filteredVerifyMembers}
          isSubmitting={isSubmittingAction}
          onClose={() => {
            if (!isSubmittingAction) setModal(null);
          }}
          onConfirm={handleConfirmVerify}
          onPreviewImage={(image) => setPreviewImage(image)}
        />
      )}

      {modal?.type === "guest" && (
        <GuestModal
          modal={modal}
          selectedRecords={getSelectedRecords(modal.row)}
          guestSearchName={guestSearchName}
          setGuestSearchName={setGuestSearchName}
          selectedGuestId={selectedGuestId}
          setSelectedGuestId={setSelectedGuestId}
          aiRecommendedGuest={aiRecommendedGuest}
          filteredGuests={filteredGuests}
          showGuestForm={showGuestForm}
          setShowGuestForm={setShowGuestForm}
          guestForm={guestForm}
          setGuestForm={setGuestForm}
          isFindingGuestByAi={isFindingGuestByAi}
          isSubmitting={isSubmittingAction}
          onFindByAi={handleFindGuestByAi}
          onClose={() => {
            if (!isSubmittingAction && !isFindingGuestByAi) setModal(null);
          }}
          onConfirm={handleConfirmGuest}
          onPreviewImage={(image) => setPreviewImage(image)}
          showToast={showToast}
        />
      )}

      {modal?.type === "member" && (
        <MemberModal
          modal={modal}
          selectedRecords={
            modal.row.type === "ambiguous"
              ? modal.row.records
              : getSelectedRecords(modal.row)
          }
          memberMode={memberMode}
          setMemberMode={setMemberMode}
          memberSearch={memberSearch}
          setMemberSearch={setMemberSearch}
          selectedMemberId={selectedMemberId}
          setSelectedMemberId={setSelectedMemberId}
          filteredMembers={filteredMembers}
          memberForm={memberForm}
          setMemberForm={setMemberForm}
          isSubmitting={isSubmittingAction}
          onClose={() => {
            if (!isSubmittingAction) setModal(null);
          }}
          onConfirm={handleConfirmMember}
          onPreviewImage={(image) => setPreviewImage(image)}
        />
      )}

      {modal?.type === "member-single-face-confirm" && (
        <div className="gv-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="gv-modal w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div
              className="px-5 py-4 text-white"
              style={{
                background: "linear-gradient(135deg,#2563eb,#4f46e5)",
              }}
            >
              <h3 className="text-base font-extrabold">Hanya 1 Gambar Dipilih</h3>
              <p className="mt-1 text-xs leading-relaxed text-blue-100">
                Untuk meningkatkan akurasi pengenalan berikutnya, sebaiknya pilih lebih
                dari satu gambar jika tersedia.
              </p>
            </div>

            <div className="space-y-4 p-5">
              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                <p className="text-sm font-extrabold text-amber-800">
                  Tetap lanjut dengan 1 gambar?
                </p>
                <p className="mt-1 text-xs leading-relaxed text-amber-700">
                  Jika memilih “Tambah Gambar”, popup ini akan ditutup dan kamu bisa
                  memilih gambar tambahan dari group ini.
                </p>
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 transition-all hover:bg-slate-100"
                >
                  Tambah Gambar
                </button>

                <button
                  type="button"
                  onClick={() => openRealAddMemberModal(modal.row)}
                  className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-extrabold text-white shadow-md transition-all hover:bg-indigo-700"
                >
                  Ya, Tetap Lanjut
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modal?.type === "reject" && (
        <RejectModal
          modal={modal}
          selectedRecords={modal.row.records}
          isSubmitting={isSubmittingAction}
          onClose={() => {
            if (!isSubmittingAction) setModal(null);
          }}
          onConfirm={handleConfirmReject}
          onPreviewImage={(image) => setPreviewImage(image)}
        />
      )}

      {previewImage && (
        <FacePreviewModal
          image={previewImage.src}
          title={previewImage.title}
          subtitle={previewImage.subtitle}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </>
  );
}