// src/pages/GuestValidation.jsx

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  AlertTriangle,
  CheckCircle,
  Loader2,
  ShieldCheck,
} from "lucide-react";

import {
  getValidationAiSessions,
  getValidationAiSessionDetail,
  getValidationAiMemberGuestData,
  verifyValidationAiRecord,
  rejectValidationAiRecord,
  findValidationAiGuestByAi,
  confirmValidationAiGuest,
  addValidationAiMemberFace,
  getRegistrationValidationFaces,
} from "../service/apiClient";

import { findMemberName } from "../components/validationAI/validationHelpers";

import AmbiguousValidationPanel from "../components/validationAI/AmbiguousValidationPanel";
import SessionCard from "../components/validationAI/SessionCard";
import ValidationRow from "../components/validationAI/ValidationRow";
import FacePreviewModal from "../components/validationAI/FacePreviewModal";

import {
  VerifyModal,
  GuestModal,
  MemberModal,
  RejectModal,
} from "../components/validationAI/ActionModals";

import RegistrationValidationPanel from "../components/validationRegistration/RegistrationValidationPanel";

const AMBIGUOUS_PAGE_SIZE = 50;

export default function GuestValidation() {
  // ─── Data dari backend ───────────────────────────────────────────
  const [validationSessions, setValidationSessions] = useState([]);
  const [sessionDetailsById, setSessionDetailsById] = useState({});

  const [allMembers, setAllMembers] = useState([]);
  const [allGuests, setAllGuests] = useState([]);

  const [registrationSummary, setRegistrationSummary] = useState({
    total_pending_embeddings: 0,
    total_people_groups: 0,
  });

  // ─── Loading & Error ─────────────────────────────────────────────
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [sessionError, setSessionError] = useState(null);

  const [isLoadingSessionDetail, setIsLoadingSessionDetail] = useState(false);
  const [isPageChangingDetail, setIsPageChangingDetail] = useState(false);
  const [sessionDetailError, setSessionDetailError] = useState(null);

  // ─── Mode & Session State ─────────────────────────────────────────
  const [activeValidationMode, setActiveValidationMode] = useState("attendance");
  const [hasManualModeChange, setHasManualModeChange] = useState(false);

  const [activeSessionId, setActiveSessionId] = useState(null);
  const [ambiguousPage, setAmbiguousPage] = useState(1);

  const [expandedRows, setExpandedRows] = useState({});
  const [selectedFaces, setSelectedFaces] = useState({});
  const [selectedAmbiguousMap, setSelectedAmbiguousMap] = useState({});

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
  const [verifyMode, setVerifyMode] = useState("ai");
  const [verifyMemberSearch, setVerifyMemberSearch] = useState("");
  const [selectedVerifyMemberId, setSelectedVerifyMemberId] = useState("");

  // ─── Toast ────────────────────────────────────────────────────────
  const showToast = (message, type = "success") => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 2800);
  };

  // ─── Fetch Members + Guests ───────────────────────────────────────
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

  const ensureMembersAndGuestsLoaded = useCallback(async () => {
    if (allMembers.length > 0 && allGuests.length > 0) return;

    await fetchMembersAndGuests();
  }, [allMembers.length, allGuests.length, fetchMembersAndGuests]);

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

  const fetchRegistrationSummary = useCallback(async () => {
    try {
      const data = await getRegistrationValidationFaces({
        page: 1,
        pageSize: 20,
      });

      if (data?.success) {
        setRegistrationSummary(
          data.summary || {
            total_pending_embeddings: 0,
            total_people_groups: 0,
          }
        );
      } else {
        setRegistrationSummary({
          total_pending_embeddings: 0,
          total_people_groups: 0,
        });
      }
    } catch (error) {
      console.error("Gagal fetch registration summary:", error);
      setRegistrationSummary({
        total_pending_embeddings: 0,
        total_people_groups: 0,
      });
    }
  }, []);

  const refreshAllValidationData = useCallback(() => {
    fetchSessions();
    fetchRegistrationSummary();
  }, [fetchSessions, fetchRegistrationSummary]);

  useEffect(() => {
    refreshAllValidationData();
  }, [refreshAllValidationData]);

  // ─── Load Session Detail ──────────────────────────────────────────
  const loadSessionDetail = useCallback(
    async (sessionId, page = 1, options = {}) => {
      const { force = false, silent = false, includeUnknown = true } = options;

      if (!sessionId) return;

      const currentDetail = sessionDetailsById[sessionId];
      const cachedPage = currentDetail?.ambiguousPages?.[String(page)];

      if (!force && cachedPage) {
        setAmbiguousPage(page);
        return;
      }

      if (silent) {
        setIsPageChangingDetail(true);
      } else {
        setIsLoadingSessionDetail(true);
      }

      setSessionDetailError(null);

      try {
        const data = await getValidationAiSessionDetail(sessionId, {
          ambiguousPage: page,
          ambiguousPageSize: AMBIGUOUS_PAGE_SIZE,
          includeUnknown,
          includeAmbiguous: true,
        });

        if (!data?.success) {
          setSessionDetailError(data?.message || "Gagal memuat detail session.");
          return;
        }

        setSessionDetailsById((prev) => {
          const oldDetail = prev[sessionId] || {};
          const oldPages = oldDetail.ambiguousPages || {};

          const nextDetail = {
            ...oldDetail,
            ...data,
            unknown_people_groups: includeUnknown
              ? data.unknown_people_groups || []
              : oldDetail.unknown_people_groups || [],
            ambiguousPages: {
              ...oldPages,
              [String(page)]: data.ambiguous_records || [],
            },
            ambiguous_records: data.ambiguous_records || [],
            ambiguous_pagination: data.ambiguous_pagination,
            summary: data.summary,
            session: data.session,
          };

          return {
            ...prev,
            [sessionId]: nextDetail,
          };
        });

        setAmbiguousPage(Number(data?.ambiguous_pagination?.page || page));
      } catch (error) {
        console.error("Gagal load session detail:", error);
        setSessionDetailError("Gagal memuat detail validasi session.");
      } finally {
        setIsLoadingSessionDetail(false);
        setIsPageChangingDetail(false);
      }
    },
    [sessionDetailsById]
  );

  // ─── Computed Summary ─────────────────────────────────────────────
  const attendancePending = useMemo(() => {
    return validationSessions.reduce(
      (sum, item) => sum + Number(item.summary?.total_pending || 0),
      0
    );
  }, [validationSessions]);

  const registrationPending = Number(
    registrationSummary?.total_pending_embeddings || 0
  );

  const totalPending = attendancePending + registrationPending;

  useEffect(() => {
    if (isLoadingSessions || sessionError) return;

    const hasAttendancePending = validationSessions.length > 0;
    const hasRegistrationPending = registrationPending > 0;

    if (!hasManualModeChange) {
      if (hasAttendancePending) {
        setActiveValidationMode("attendance");
        return;
      }

      if (hasRegistrationPending) {
        setActiveValidationMode("registration");
        return;
      }
    }

    if (
      activeValidationMode === "registration" &&
      !hasRegistrationPending &&
      hasAttendancePending
    ) {
      setActiveValidationMode("attendance");
    }
  }, [
    isLoadingSessions,
    sessionError,
    validationSessions.length,
    registrationPending,
    hasManualModeChange,
    activeValidationMode,
  ]);

  const activeSession = useMemo(() => {
    if (!activeSessionId) return null;

    const summaryItem = validationSessions.find(
      (item) => item.session.id === activeSessionId
    );

    const detail = sessionDetailsById[activeSessionId];

    if (!summaryItem && !detail) return null;

    const currentAmbiguousRecords =
      detail?.ambiguousPages?.[String(ambiguousPage)] ||
      detail?.ambiguous_records ||
      [];

    return {
      ...(summaryItem || {}),
      ...(detail || {}),
      session: detail?.session || summaryItem?.session,
      summary: detail?.summary || summaryItem?.summary,
      unknown_people_groups: detail?.unknown_people_groups || [],
      ambiguous_records: currentAmbiguousRecords,
      ambiguous_pagination: detail?.ambiguous_pagination || {
        page: 1,
        page_size: AMBIGUOUS_PAGE_SIZE,
        total_items: summaryItem?.summary?.total_ambiguous_records || 0,
        total_pages: 1,
        has_next: false,
        has_previous: false,
        next_page: null,
        previous_page: null,
      },
    };
  }, [activeSessionId, validationSessions, sessionDetailsById, ambiguousPage]);

  // Penting:
  // activeRows sekarang hanya untuk UNKNOWN GROUP.
  // Ambiguous tidak lagi masuk ValidationRow, tapi masuk AmbiguousValidationPanel.
  const activeRows = useMemo(() => {
    if (!activeSession) return [];

    return (activeSession.unknown_people_groups || []).map((group, index) => ({
      rowKey: `unknown-${group.group_id || index}`,
      type: "unknown",
      label: group.label || `People ${index + 1}`,
      helper: `${
        group.count || group.records?.length || 0
      } wajah dari orang yang sama`,
      count: group.count || group.records?.length || 0,
      records: group.records || [],
      recordIds:
        group.record_ids || (group.records || []).map((record) => record.id),
      confidence: group.average_confidence,
      representativeImage: group.representative_image,
      aiRecommendation: group.ai_recommendation || null,
    }));
  }, [activeSession]);

  const ambiguousRecords = useMemo(() => {
    return activeSession?.ambiguous_records || [];
  }, [activeSession]);

  const ambiguousPagination = useMemo(() => {
    return activeSession?.ambiguous_pagination || {};
  }, [activeSession]);

  const selectedAmbiguousRecords = useMemo(() => {
    return Object.values(selectedAmbiguousMap);
  }, [selectedAmbiguousMap]);

  const activeAmbiguousTotal = Number(ambiguousPagination?.total_items || 0);

  // ─── Filter member & guest client-side ───────────────────────────
  const filteredMembers = useMemo(() => {
    const keyword = memberSearch.trim().toLowerCase();

    if (!keyword) return allMembers;

    return allMembers.filter((member) => {
      const name = String(member.full_name || "").toLowerCase();
      const nick = String(member.nickname || "").toLowerCase();
      const phone = String(member.phone || "").toLowerCase();
      const email = String(member.email || "").toLowerCase();

      return (
        name.includes(keyword) ||
        nick.includes(keyword) ||
        phone.includes(keyword) ||
        email.includes(keyword)
      );
    });
  }, [allMembers, memberSearch]);

  const filteredVerifyMembers = useMemo(() => {
    const keyword = verifyMemberSearch.trim().toLowerCase();

    if (!keyword) return allMembers;

    return allMembers.filter((member) => {
      const name = String(member.full_name || "").toLowerCase();
      const nick = String(member.nickname || "").toLowerCase();
      const phone = String(member.phone || "").toLowerCase();
      const email = String(member.email || "").toLowerCase();

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
      .filter((guest) => {
        const name = String(guest.full_name || "").toLowerCase();
        const phone = String(guest.phone || "").toLowerCase();
        const from = String(guest.from_where || "").toLowerCase();

        return (
          name.includes(keyword) ||
          phone.includes(keyword) ||
          from.includes(keyword)
        );
      })
      .slice(0, 12);
  }, [allGuests, guestSearchName]);

  // ─── Session Controls ─────────────────────────────────────────────
  const openSession = async (sessionId) => {
    setActiveSessionId(sessionId);
    setExpandedRows({});
    setSelectedFaces({});
    setSelectedAmbiguousMap({});
    setAmbiguousPage(1);

    await loadSessionDetail(sessionId, 1, {
      force: false,
      silent: false,
      includeUnknown: true,
    });
  };

  const closeSession = () => {
    setActiveSessionId(null);
    setExpandedRows({});
    setSelectedFaces({});
    setSelectedAmbiguousMap({});
    setAmbiguousPage(1);
    setSessionDetailError(null);
  };

  const switchValidationMode = (mode) => {
    setHasManualModeChange(true);
    setActiveValidationMode(mode);

    setActiveSessionId(null);
    setExpandedRows({});
    setSelectedFaces({});
    setSelectedAmbiguousMap({});
    setAmbiguousPage(1);
  };

  // ─── Row Controls: Unknown Group ──────────────────────────────────
  const toggleRow = (rowKey) => {
    setExpandedRows((prev) => ({
      ...prev,
      [rowKey]: !prev[rowKey],
    }));
  };

  const isFaceSelected = (rowKey, recordId) => {
    return selectedFaces[rowKey]?.includes(recordId);
  };

  const toggleFaceSelection = (row, record) => {
    const rowKey = row.rowKey;

    setSelectedFaces((prev) => {
      const current = prev[rowKey] || [];

      if (current.includes(record.id)) {
        return {
          ...prev,
          [rowKey]: current.filter((id) => id !== record.id),
        };
      }

      return {
        ...prev,
        [rowKey]: [...current, record.id],
      };
    });
  };

  const getSelectedRecords = (row) => {
    if (!row) return [];

    if (row.type === "ambiguous") return row.records;

    const ids = selectedFaces[row.rowKey] || [];
    return row.records.filter((record) => ids.includes(record.id));
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

  // ─── Ambiguous Selected Mode ──────────────────────────────────────
  const toggleAmbiguousSelection = (record) => {
    setSelectedAmbiguousMap((prev) => {
      const key = String(record.id);
      const next = { ...prev };

      if (next[key]) {
        delete next[key];
      } else {
        next[key] = record;
      }

      return next;
    });
  };

  const toggleSelectAllAmbiguousPage = () => {
    if (ambiguousRecords.length === 0) return;

    setSelectedAmbiguousMap((prev) => {
      const next = { ...prev };

      const isAllSelected = ambiguousRecords.every((record) =>
        Boolean(next[String(record.id)])
      );

      if (isAllSelected) {
        ambiguousRecords.forEach((record) => {
          delete next[String(record.id)];
        });

        return next;
      }

      ambiguousRecords.forEach((record) => {
        next[String(record.id)] = record;
      });

      return next;
    });
  };

  const clearSelectedAmbiguous = () => {
    setSelectedAmbiguousMap({});
  };

  const changeAmbiguousPage = async (page) => {
    const targetPage = Number(page);

    if (!activeSessionId) return;
    if (!targetPage) return;
    if (targetPage === ambiguousPage) return;
    if (isPageChangingDetail || isSubmittingAction) return;

    await loadSessionDetail(activeSessionId, targetPage, {
      force: false,
      silent: true,
      includeUnknown: false,
    });
  };

  const refreshAmbiguousPage = async () => {
    if (!activeSessionId) return;

    await loadSessionDetail(activeSessionId, ambiguousPage, {
      force: true,
      silent: true,
      includeUnknown: false,
    });
  };

  const buildAmbiguousSelectedRow = (records) => {
    const safeRecords = records || [];
    const firstRecord = safeRecords[0];

    return {
      rowKey: "ambiguous-selected-flat",
      type: "ambiguous",
      label:
        safeRecords.length === 1
          ? `Ambiguous #${firstRecord.id}`
          : `Selected Ambiguous (${safeRecords.length})`,
      helper: `${safeRecords.length} ambiguous record dipilih`,
      count: safeRecords.length,
      records: safeRecords,
      recordIds: safeRecords.map((record) => record.id),
      confidence: firstRecord?.confidence,
      matchedMemberId: firstRecord?.matched_member_id,
      matchedMemberName:
        firstRecord?.matched_member_name ||
        findMemberName(allMembers, firstRecord?.matched_member_id) ||
        "Jemaat kandidat",
      aiRecommendation:
        safeRecords.length === 1
          ? firstRecord?.ai_recommendation || {
              member_id: firstRecord?.matched_member_id,
              full_name:
                firstRecord?.matched_member_name ||
                findMemberName(allMembers, firstRecord?.matched_member_id) ||
                "Jemaat kandidat",
              similarity: firstRecord?.confidence,
              note: "Kandidat paling mendekati dari hasil recognition AI",
            }
          : null,
      representativeImage: firstRecord?.face_image || null,
    };
  };

  // ─── Modal State Reset ────────────────────────────────────────────
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

  const resetGuestModalState = () => {
    setGuestSearchName("");
    setSelectedGuestId("");
    setAiRecommendedGuest(null);
    setShowGuestForm(false);
    setGuestForm({
      full_name: "",
      phone: "",
      from_where: "",
    });
  };

  const resetVerifyModalState = () => {
    setVerifyMode("ai");
    setVerifyMemberSearch("");
    setSelectedVerifyMemberId("");
  };

  // ─── Modal Openers: Unknown Group ─────────────────────────────────
  const openVerifyModal = async (row) => {
    await ensureMembersAndGuestsLoaded();

    resetVerifyModalState();

    setModal({
      type: "verify",
      row,
      sessionId: activeSessionId,
    });
  };

  const openGuestModal = async (row) => {
    if (!ensureExactlyOneFaceForGuest(row)) return;

    await ensureMembersAndGuestsLoaded();

    resetGuestModalState();

    setModal({
      type: "guest",
      row,
      sessionId: activeSessionId,
    });
  };

  const openRealAddMemberModal = async (row) => {
    await ensureMembersAndGuestsLoaded();

    resetMemberModalState();

    setModal({
      type: "member",
      row,
      sessionId: activeSessionId,
    });
  };

  const openAddMemberModal = async (row) => {
    const selected = getSelectedRecords(row);

    if (selected.length === 0) {
      showToast(
        "Pilih minimal satu gambar sebelum menambahkan ke Jemaat.",
        "warning"
      );
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

    await openRealAddMemberModal(row);
  };

  const openRejectModal = (row) => {
    setModal({
      type: "reject",
      row,
      sessionId: activeSessionId,
    });
  };

  // ─── Modal Openers: Ambiguous Flat ────────────────────────────────
  const openAmbiguousVerifyModal = async () => {
    if (selectedAmbiguousRecords.length === 0) {
      showToast("Pilih minimal satu gambar ambiguous.", "warning");
      return;
    }

    if (selectedAmbiguousRecords.length > 1) {
      showToast(
        "Untuk Verify ambiguous, pilih 1 gambar saja agar tidak salah verifikasi member.",
        "warning"
      );
      return;
    }

    await ensureMembersAndGuestsLoaded();

    resetVerifyModalState();

    setModal({
      type: "verify",
      row: buildAmbiguousSelectedRow(selectedAmbiguousRecords),
      sessionId: activeSessionId,
    });
  };

  const openAmbiguousGuestModal = async () => {
    if (selectedAmbiguousRecords.length !== 1) {
      showToast("Untuk Guest ambiguous, pilih tepat 1 gambar.", "warning");
      return;
    }

    await ensureMembersAndGuestsLoaded();

    resetGuestModalState();

    setModal({
      type: "guest",
      row: buildAmbiguousSelectedRow(selectedAmbiguousRecords),
      sessionId: activeSessionId,
    });
  };

  const openAmbiguousAddMemberModal = async () => {
    if (selectedAmbiguousRecords.length === 0) {
      showToast("Pilih minimal satu gambar ambiguous.", "warning");
      return;
    }

    await ensureMembersAndGuestsLoaded();

    resetMemberModalState();

    setModal({
      type: "member",
      row: buildAmbiguousSelectedRow(selectedAmbiguousRecords),
      sessionId: activeSessionId,
    });
  };

  const openAmbiguousRejectModal = () => {
    if (selectedAmbiguousRecords.length === 0) {
      showToast("Pilih minimal satu gambar ambiguous.", "warning");
      return;
    }

    setModal({
      type: "reject",
      row: buildAmbiguousSelectedRow(selectedAmbiguousRecords),
      sessionId: activeSessionId,
    });
  };

  // ─── Remove Processed Records from Local State ─────────────────────
  const removeProcessedValidationRecords = (sessionId, row, processedIds = []) => {
    const ids = processedIds.length
      ? processedIds.map((id) => Number(id))
      : (row.recordIds || row.records.map((record) => record.id)).map((id) =>
          Number(id)
        );

    const idSet = new Set(ids.map(String));

    setSessionDetailsById((prev) => {
      const detail = prev[sessionId];

      if (!detail) return prev;

      const nextAmbiguousPages = {};

      Object.entries(detail.ambiguousPages || {}).forEach(([page, records]) => {
        nextAmbiguousPages[page] = records.filter(
          (record) => !idSet.has(String(record.id))
        );
      });

      const nextUnknownGroups = (detail.unknown_people_groups || [])
        .map((group) => {
          const nextRecords = (group.records || []).filter(
            (record) => !idSet.has(String(record.id))
          );

          if (nextRecords.length === 0) return null;

          return {
            ...group,
            records: nextRecords,
            record_ids: nextRecords.map((record) => record.id),
            count: nextRecords.length,
          };
        })
        .filter(Boolean);

      const removedUnknownCount = (row.records || []).filter(
        (record) => record.detection_status === "unknown"
      ).length;

      const removedAmbiguousCount = (row.records || []).filter(
        (record) => record.detection_status === "ambiguous"
      ).length;

      const currentSummary = detail.summary || {};

      const nextSummary = {
        ...currentSummary,
        total_pending: Math.max(
          Number(currentSummary.total_pending || 0) - ids.length,
          0
        ),
        total_unknown_records: Math.max(
          Number(currentSummary.total_unknown_records || 0) -
            removedUnknownCount,
          0
        ),
        total_unknown_people_groups: nextUnknownGroups.length,
        total_ambiguous_records: Math.max(
          Number(currentSummary.total_ambiguous_records || 0) -
            removedAmbiguousCount,
          0
        ),
      };

      return {
        ...prev,
        [sessionId]: {
          ...detail,
          summary: nextSummary,
          unknown_people_groups: nextUnknownGroups,
          ambiguousPages: nextAmbiguousPages,
          ambiguous_records:
            nextAmbiguousPages[String(ambiguousPage)] ||
            detail.ambiguous_records ||
            [],
          ambiguous_pagination: {
            ...(detail.ambiguous_pagination || {}),
            total_items: nextSummary.total_ambiguous_records,
          },
        },
      };
    });

    setValidationSessions((prev) => {
      return prev
        .map((sessionItem) => {
          if (sessionItem.session.id !== sessionId) return sessionItem;

          const currentSummary = sessionItem.summary || {};
          const nextTotalPending = Math.max(
            Number(currentSummary.total_pending || 0) - ids.length,
            0
          );

          const nextTotalAmbiguous =
            row.type === "ambiguous"
              ? Math.max(
                  Number(currentSummary.total_ambiguous_records || 0) -
                    ids.length,
                  0
                )
              : currentSummary.total_ambiguous_records;

          const nextTotalUnknown =
            row.type === "unknown"
              ? Math.max(
                  Number(currentSummary.total_unknown_records || 0) -
                    ids.length,
                  0
                )
              : currentSummary.total_unknown_records;

          return {
            ...sessionItem,
            summary: {
              ...currentSummary,
              total_pending: nextTotalPending,
              total_ambiguous_records: nextTotalAmbiguous,
              total_unknown_records: nextTotalUnknown,
            },
          };
        })
        .filter(
          (sessionItem) => Number(sessionItem.summary?.total_pending || 0) > 0
        );
    });

    setSelectedAmbiguousMap((prev) => {
      const next = { ...prev };

      ids.forEach((id) => {
        delete next[String(id)];
      });

      return next;
    });

    setExpandedRows((prev) => {
      const copy = { ...prev };
      delete copy[row.rowKey];
      return copy;
    });

    setSelectedFaces((prev) => {
      const copy = { ...prev };
      delete copy[row.rowKey];
      return copy;
    });

    setModal(null);
  };

  // ─── Confirm: Verify ──────────────────────────────────────────────
  const handleConfirmVerify = async () => {
    if (!modal?.row || isSubmittingAction) return;

    const row = modal.row;
    const recommendation = row.aiRecommendation;

    if (
      verifyMode === "ai" &&
      !recommendation?.member_id &&
      !row.matchedMemberId
    ) {
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

    if (row.type === "unknown" && selectedRecords.length >= 1) {
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

      removeProcessedValidationRecords(
        modal.sessionId,
        row,
        result?.processed_record_ids ||
          row.recordIds ||
          row.records.map((record) => record.id)
      );

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

  // ─── Confirm: Guest Find by AI ────────────────────────────────────
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
        showToast(
          result?.message || "AI belum menemukan tamu yang cocok.",
          "warning"
        );
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

  // ─── Confirm: Guest ───────────────────────────────────────────────
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

      removeProcessedValidationRecords(
        modal.sessionId,
        row,
        result?.processed_record_ids ||
          row.recordIds ||
          row.records.map((record) => record.id)
      );

      fetchSessions();
      fetchRegistrationSummary();
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

  // ─── Confirm: Add Member ──────────────────────────────────────────
  const handleConfirmMember = async () => {
    if (!modal?.row || isSubmittingAction) return;

    const row = modal.row;
    const selectedRecords = getSelectedRecords(row);

    if (row.type === "unknown" && selectedRecords.length === 0) {
      showToast(
        "Pilih minimal satu gambar untuk ditambahkan ke data Jemaat.",
        "warning"
      );
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

      removeProcessedValidationRecords(
        modal.sessionId,
        row,
        result?.processed_record_ids ||
          row.recordIds ||
          row.records.map((record) => record.id)
      );

      fetchSessions();
      fetchRegistrationSummary();
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

  // ─── Confirm: Reject ──────────────────────────────────────────────
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

      removeProcessedValidationRecords(
        modal.sessionId,
        row,
        result?.processed_record_ids ||
          row.recordIds ||
          row.records.map((record) => record.id)
      );

      fetchSessions();
      fetchRegistrationSummary();
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
                  Validasi data attendance terlebih dahulu. Jika kosong, sistem
                  akan menampilkan data face registration yang belum dikaitkan ke
                  jemaat.
                </p>

                {!isLoadingSessions && totalPending > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => switchValidationMode("attendance")}
                      className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${
                        activeValidationMode === "attendance"
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                      }`}
                    >
                      Attendance: {attendancePending}
                    </button>

                    <button
                      type="button"
                      onClick={() => switchValidationMode("registration")}
                      className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${
                        activeValidationMode === "registration"
                          ? "bg-amber-600 text-white shadow-sm"
                          : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                      }`}
                    >
                      Registration: {registrationPending}
                    </button>
                  </div>
                )}
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
              type="button"
              onClick={refreshAllValidationData}
              className="mt-4 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700"
            >
              Coba Lagi
            </button>
          </section>
        )}

        {/* Registration validation panel */}
        {!isLoadingSessions &&
          !sessionError &&
          activeValidationMode === "registration" && (
            <RegistrationValidationPanel
              onAfterChange={(payload = {}) => {
                const processedCount = Number(payload.processedCount || 0);

                if (processedCount > 0) {
                  setRegistrationSummary((prev) => ({
                    ...prev,
                    total_pending_embeddings: Math.max(
                      Number(prev.total_pending_embeddings || 0) - processedCount,
                      0
                    ),
                  }));
                }
              }}
            />
          )}

        {/* Attendance empty state */}
        {!isLoadingSessions &&
          !sessionError &&
          activeValidationMode === "attendance" &&
          validationSessions.length === 0 && (
            <section className="gv-soft-grid flex min-h-[320px] flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-600">
                <CheckCircle size={32} />
              </div>

              <h3 className="text-xl font-extrabold text-slate-800">
                Tidak Ada Pending Attendance
              </h3>

              <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
                Data attendance sudah bersih. Jika masih ada pending registration,
                klik tombol Registration di card atas.
              </p>
            </section>
          )}

        {/* Session list attendance validation */}
        {!isLoadingSessions &&
          !sessionError &&
          activeValidationMode === "attendance" &&
          validationSessions.length > 0 && (
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
                        Ambiguous dipilih secara flat. Unknown tetap tampil
                        sebagai group wajah.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={closeSession}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50"
                    >
                      Tutup
                    </button>
                  </div>

                  {sessionDetailError && (
                    <div className="p-4">
                      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
                        {sessionDetailError}
                      </div>
                    </div>
                  )}

                  {isLoadingSessionDetail && (
                    <div className="flex min-h-[240px] items-center justify-center p-6">
                      <div className="flex flex-col items-center gap-3 text-slate-400">
                        <Loader2
                          size={34}
                          className="animate-spin text-indigo-500"
                        />
                        <p className="text-sm font-semibold">
                          Memuat detail session...
                        </p>
                      </div>
                    </div>
                  )}

                  {!isLoadingSessionDetail && !sessionDetailError && (
                    <div className="space-y-5 p-4">
                      <AmbiguousValidationPanel
                        records={ambiguousRecords}
                        pagination={ambiguousPagination}
                        selectedRecordMap={selectedAmbiguousMap}
                        selectedRecords={selectedAmbiguousRecords}
                        isPageChanging={isPageChangingDetail}
                        isSubmittingAction={isSubmittingAction}
                        onChangePage={changeAmbiguousPage}
                        onToggleRecord={toggleAmbiguousSelection}
                        onSelectAllPage={toggleSelectAllAmbiguousPage}
                        onClearSelected={clearSelectedAmbiguous}
                        onVerify={openAmbiguousVerifyModal}
                        onGuest={openAmbiguousGuestModal}
                        onAddMember={openAmbiguousAddMemberModal}
                        onReject={openAmbiguousRejectModal}
                        onRefresh={refreshAmbiguousPage}
                        onPreviewImage={(image) => setPreviewImage(image)}
                      />

                      {activeRows.length === 0 && activeAmbiguousTotal === 0 ? (
                        <div className="flex items-center justify-center py-10 text-slate-400">
                          <CheckCircle
                            size={20}
                            className="mr-2 text-emerald-500"
                          />
                          <span className="text-sm font-semibold">
                            Tidak ada data pending di sesi ini.
                          </span>
                        </div>
                      ) : (
                        activeRows.length > 0 && (
                          <div className="space-y-3">
                            {activeRows.map((row) => (
                              <ValidationRow
                                key={row.rowKey}
                                row={row}
                                expanded={!!expandedRows[row.rowKey]}
                                selectedFaces={selectedFaces[row.rowKey] || []}
                                onToggle={() => toggleRow(row.rowKey)}
                                onToggleFace={(record) =>
                                  toggleFaceSelection(row, record)
                                }
                                isFaceSelected={(recordId) =>
                                  isFaceSelected(row.rowKey, recordId)
                                }
                                onVerify={() => openVerifyModal(row)}
                                onGuest={() => openGuestModal(row)}
                                onAddMember={() => openAddMemberModal(row)}
                                onReject={() => openRejectModal(row)}
                                onPreviewImage={(image) =>
                                  setPreviewImage(image)
                                }
                              />
                            ))}
                          </div>
                        )
                      )}
                    </div>
                  )}
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

      {/* Verify Modal */}
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

      {/* Guest Modal */}
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

      {/* Member Modal */}
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

      {/* Member single face confirmation */}
      {modal?.type === "member-single-face-confirm" && (
        <div className="gv-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="gv-modal w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div
              className="px-5 py-4 text-white"
              style={{
                background: "linear-gradient(135deg,#2563eb,#4f46e5)",
              }}
            >
              <h3 className="text-base font-extrabold">
                Hanya 1 Gambar Dipilih
              </h3>

              <p className="mt-1 text-xs leading-relaxed text-blue-100">
                Untuk meningkatkan akurasi pengenalan berikutnya, sebaiknya
                pilih lebih dari satu gambar jika tersedia.
              </p>
            </div>

            <div className="space-y-4 p-5">
              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                <p className="text-sm font-extrabold text-amber-800">
                  Tetap lanjut dengan 1 gambar?
                </p>

                <p className="mt-1 text-xs leading-relaxed text-amber-700">
                  Jika memilih “Tambah Gambar”, popup ini akan ditutup dan kamu
                  bisa memilih gambar tambahan dari group ini.
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

      {/* Reject Modal */}
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

      {/* Preview Modal */}
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