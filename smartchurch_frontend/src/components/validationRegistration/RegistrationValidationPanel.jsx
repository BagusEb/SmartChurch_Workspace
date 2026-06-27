//smartchurch_frontend\src\components\validationRegistration\RegistrationValidationPanel.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  ImagePlus,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Square,
  Trash2,
  UserRoundPlus,
  XCircle,
} from "lucide-react";

import {
  addRegistrationMemberFaces,
  getRegistrationMemberData,
  getRegistrationValidationFaces,
  rejectRegistrationFaces,
} from "../../service/apiClient";

import RegistrationSessionCard from "./RegistrationSessionCard";
import RegistrationFacePreviewModal from "./RegistrationFacePreviewModal";

import {
  RegistrationMemberModal,
  RegistrationRejectModal,
} from "./RegistrationActionModals";

import { formatTime } from "./registrationHelpers";

const PAGE_SIZE = 20;

function getPaginationItems(currentPage, totalPages) {
  const total = Math.max(Number(totalPages) || 1, 1);
  const current = Math.min(Math.max(Number(currentPage) || 1, 1), total);

  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const items = [1];

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  if (start > 2) {
    items.push("left-ellipsis");
  }

  for (let page = start; page <= end; page += 1) {
    items.push(page);
  }

  if (end < total - 1) {
    items.push("right-ellipsis");
  }

  items.push(total);

  return items;
}

export default function RegistrationValidationPanel({ onAfterChange }) {
  const [registrationData, setRegistrationData] = useState(null);
  const [allMembers, setAllMembers] = useState([]);

  const pageCacheRef = useRef({});

  const [isLoading, setIsLoading] = useState(true);
  const [isPageChanging, setIsPageChanging] = useState(false);
  const [registrationError, setRegistrationError] = useState(null);

  const [isActiveOpen, setIsActiveOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedFaceMap, setSelectedFaceMap] = useState({});

  const [modal, setModal] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [toast, setToast] = useState(null);

  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

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

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 2800);
  };

  const fetchRegistrationFaces = useCallback(async (page = 1, options = {}) => {
    const { silent = false, force = false } = options;
    const cacheKey = String(page);

    if (!force && pageCacheRef.current[cacheKey]) {
      setRegistrationData(pageCacheRef.current[cacheKey]);
      setRegistrationError(null);
      setIsLoading(false);
      setIsPageChanging(false);
      return;
    }

    if (silent) {
      setIsPageChanging(true);
    } else {
      setIsLoading(true);
    }

    setRegistrationError(null);

    try {
      const data = await getRegistrationValidationFaces({
        page,
        pageSize: PAGE_SIZE,
      });

      if (data?.success) {
        const resolvedPage = Number(data?.pagination?.page || page);
        const resolvedCacheKey = String(resolvedPage);

        pageCacheRef.current[resolvedCacheKey] = data;

        setRegistrationData(data);

        setCurrentPage((prev) => {
          if (prev === resolvedPage) return prev;
          return resolvedPage;
        });
      } else {
        setRegistrationData(null);
      }
    } catch (error) {
      console.error("Gagal fetch registration faces:", error);
      setRegistrationError("Gagal memuat data registration. Coba refresh halaman.");
      setRegistrationData(null);
    } finally {
      setIsLoading(false);
      setIsPageChanging(false);
    }
  }, []);

  const fetchMembers = useCallback(async (q = "") => {
    try {
      const data = await getRegistrationMemberData(q);

      if (data?.success) {
        setAllMembers(data.members || []);
      }
    } catch (error) {
      console.error("Gagal fetch registration members:", error);
    }
  }, []);

  useEffect(() => {
    fetchRegistrationFaces(currentPage, {
      silent: currentPage !== 1,
    });
  }, [currentPage, fetchRegistrationFaces]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const summary = registrationData?.summary || {};
  const pagination = registrationData?.pagination || {};

  const activePage = Number(pagination?.page || currentPage || 1);
  const totalPages = Number(pagination?.total_pages || summary?.total_pages || 1);

  const paginationItems = useMemo(() => {
    return getPaginationItems(activePage, totalPages);
  }, [activePage, totalPages]);

  const faces = useMemo(() => {
    return registrationData?.registration_faces || registrationData?.embeddings || [];
  }, [registrationData]);

  const totalPending = Number(summary?.total_pending_embeddings || 0);

  const pageFaceIds = useMemo(() => {
    return faces.map((face) => face.id);
  }, [faces]);

  const selectedFaceIds = useMemo(() => {
    return Object.keys(selectedFaceMap).map((id) => Number(id));
  }, [selectedFaceMap]);

  const selectedRecords = useMemo(() => {
    return Object.values(selectedFaceMap);
  }, [selectedFaceMap]);

  const pageSelectedCount = useMemo(() => {
    return faces.filter((face) => selectedFaceMap[String(face.id)]).length;
  }, [faces, selectedFaceMap]);

  const isAllPageSelected = useMemo(() => {
    if (faces.length === 0) return false;

    return pageFaceIds.every((id) => Boolean(selectedFaceMap[String(id)]));
  }, [faces.length, pageFaceIds, selectedFaceMap]);


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

  const buildSelectedRow = (records = selectedRecords) => {
    return {
      rowKey: "registration-selected-faces",
      type: "registration",
      label: "Selected Registration Faces",
      helper: `${records.length} gambar registration dipilih`,
      count: records.length,
      records,
      embeddingIds: records.map((record) => record.id),
      recordIds: records.map((record) => record.id),
      representativeImage: records[0]?.face_image || null,
    };
  };

  const toggleFaceSelection = (face) => {
    setSelectedFaceMap((prev) => {
      const key = String(face.id);
      const next = { ...prev };

      if (next[key]) {
        delete next[key];
      } else {
        next[key] = face;
      }

      return next;
    });
  };

  const toggleSelectAllPage = () => {
    if (faces.length === 0) return;

    setSelectedFaceMap((prev) => {
      const next = { ...prev };

      if (isAllPageSelected) {
        pageFaceIds.forEach((id) => {
          delete next[String(id)];
        });

        return next;
      }

      faces.forEach((face) => {
        next[String(face.id)] = face;
      });

      return next;
    });
  };

  const clearAllSelected = () => {
    setSelectedFaceMap({});
  };

  const refreshCurrentPage = async () => {
    pageCacheRef.current = {};

    await fetchRegistrationFaces(currentPage, {
      silent: true,
      force: true,
    });

    fetchMembers();

    if (onAfterChange) onAfterChange();
  };

  const goToPage = (targetPage) => {
    const page = Number(targetPage);

    if (!page) return;
    if (page < 1) return;
    if (page > totalPages) return;
    if (page === activePage) return;
    if (isPageChanging || isSubmittingAction) return;

    setCurrentPage(page);
  };

  const openRealAddMemberModal = () => {
    if (selectedRecords.length === 0) {
      showToast("Pilih minimal satu gambar sebelum Add Member.", "warning");
      return;
    }

    resetMemberModalState();

    setModal({
      type: "registration-member",
      row: buildSelectedRow(selectedRecords),
      selectedRecords,
    });
  };

  const openAddMemberModal = () => {
    if (selectedRecords.length === 0) {
      showToast("Pilih minimal satu gambar sebelum Add Member.", "warning");
      return;
    }

    if (selectedRecords.length === 1) {
      setModal({
        type: "registration-single-face-confirm",
        row: buildSelectedRow(selectedRecords),
        selectedRecords,
      });
      return;
    }

    openRealAddMemberModal();
  };

  const openRejectModal = () => {
    if (selectedRecords.length === 0) {
      showToast("Pilih minimal satu gambar sebelum Tolak/Hapus.", "warning");
      return;
    }

    setModal({
      type: "registration-reject",
      row: buildSelectedRow(selectedRecords),
      selectedRecords,
    });
  };

  const handleConfirmMember = async () => {
    if (!modal?.selectedRecords || isSubmittingAction) return;

    const recordsToProcess = modal.selectedRecords || [];

    if (recordsToProcess.length === 0) {
      showToast("Pilih minimal satu gambar untuk dijadikan face embedding.", "warning");
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
      mode: memberMode,
      selected_embedding_ids: recordsToProcess.map((record) => record.id),
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
      const result = await addRegistrationMemberFaces(payload);

      if (!result?.success) {
        showToast(result?.message || "Gagal menyimpan wajah registration.", "warning");
        return;
      }

      const totalEmbeddings =
        result?.activated_embedding_ids?.length ||
        result?.embeddings?.length ||
        recordsToProcess.length;

      showToast(
        `${totalEmbeddings} wajah berhasil ditambahkan ke ${
          result?.member?.full_name || "jemaat"
        }.`
      );

      setModal(null);
      setSelectedFaceMap({});

      await refreshCurrentPage();
    } catch (error) {
      console.error("Gagal add registration member faces:", error);

      const backendMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        "Gagal memproses wajah registration.";

      showToast(backendMessage, "warning");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!modal?.selectedRecords || isSubmittingAction) return;

    const recordsToProcess = modal.selectedRecords || [];

    if (recordsToProcess.length === 0) {
      showToast("Pilih minimal satu gambar untuk ditolak.", "warning");
      return;
    }

    const payload = {
      selected_embedding_ids: recordsToProcess.map((record) => record.id),
    };

    setIsSubmittingAction(true);

    try {
      const result = await rejectRegistrationFaces(payload);

      if (!result?.success) {
        showToast(result?.message || "Reject registration gagal diproses.", "warning");
        return;
      }

      const totalDeleted =
        result?.deleted_embedding_ids?.length ||
        result?.processed_embedding_ids?.length ||
        recordsToProcess.length;

      showToast(`${totalDeleted} wajah registration berhasil ditolak dan dihapus.`);

      setModal(null);
      setSelectedFaceMap({});

      await refreshCurrentPage();
    } catch (error) {
      console.error("Gagal reject registration:", error);

      const backendMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        "Gagal reject registration.";

      showToast(backendMessage, "warning");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  return (
    <>
      <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-600 text-white shadow-lg">
              <UserRoundPlus size={24} />
            </div>

            <div>
              <h3 className="text-xl font-extrabold tracking-tight text-slate-800">
                Validasi Face Registration
              </h3>

              <p className="mt-1 text-sm leading-relaxed text-amber-800">
                Data registration ditampilkan flat per 20 gambar. Pilih gambar
                yang memang milik orang yang sama, lalu Add Member atau Tolak.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={refreshCurrentPage}
            disabled={isLoading || isPageChanging}
            className="inline-flex w-fit items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-extrabold text-amber-700 shadow-sm transition-all hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPageChanging ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <RefreshCw size={16} />
            )}
            Refresh
          </button>
        </div>
      </section>

      {isLoading && (
        <section className="mt-5 flex min-h-[260px] items-center justify-center rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <Loader2 size={36} className="animate-spin text-amber-500" />
            <p className="text-sm font-semibold">Memuat data registration...</p>
          </div>
        </section>
      )}

      {!isLoading && registrationError && (
        <section className="mt-5 flex min-h-[200px] flex-col items-center justify-center rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center shadow-sm">
          <AlertTriangle size={32} className="mb-3 text-rose-500" />

          <p className="font-extrabold text-rose-800">{registrationError}</p>

          <button
            type="button"
            onClick={() => fetchRegistrationFaces(currentPage)}
            className="mt-4 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700"
          >
            Coba Lagi
          </button>
        </section>
      )}

      {!isLoading && !registrationError && totalPending === 0 && (
        <section className="gv-soft-grid mt-5 flex min-h-[420px] flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-600">
            <CheckCircle size={38} />
          </div>

          <h3 className="text-xl font-extrabold text-slate-800">
            Tidak Ada Data Validasi
          </h3>

          <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
            Saat ini tidak ada pending attendance validation maupun pending face
            registration.
          </p>
        </section>
      )}

      {!isLoading && !registrationError && totalPending > 0 && (
        <div className="mt-5 space-y-5">
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <RegistrationSessionCard
              summary={summary}
              pagination={pagination}
              isActive={isActiveOpen}
              onOpen={() => {
                setIsActiveOpen((prev) => !prev);
              }}
            />
          </section>

          {isActiveOpen && (
            <section className="gv-enter overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-4 border-b border-slate-100 p-5 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-extrabold text-slate-800">
                      Initial Face Registration
                    </h3>

                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                      Flat Selected Mode
                    </span>

                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                      Page {pagination?.page || currentPage} /{" "}
                      {pagination?.total_pages || 1}
                    </span>
                  </div>

                  <p className="mt-1 text-sm text-slate-500">
                    Pilih gambar pada page ini. Klik gambar untuk preview besar.
                  </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={toggleSelectAllPage}
                    disabled={faces.length === 0 || isSubmittingAction}
                    className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-extrabold transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                      isAllPageSelected
                        ? "bg-amber-600 text-white hover:bg-amber-700"
                        : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                    }`}
                  >
                    {isAllPageSelected ? <Check size={16} /> : <Square size={16} />}
                    {isAllPageSelected ? "Unselect All" : "Select All Page"}
                  </button>

                  <button
                    type="button"
                    onClick={clearAllSelected}
                    disabled={selectedRecords.length === 0 || isSubmittingAction}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-extrabold text-slate-600 transition-all hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <XCircle size={16} />
                    Clear All Selected
                  </button>

                  <button
                    type="button"
                    onClick={openAddMemberModal}
                    disabled={selectedRecords.length === 0 || isSubmittingAction}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-extrabold text-white shadow-sm transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <ImagePlus size={16} />
                    Add Member
                  </button>

                  <button
                    type="button"
                    onClick={openRejectModal}
                    disabled={selectedRecords.length === 0 || isSubmittingAction}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-extrabold text-white shadow-sm transition-all hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <Trash2 size={16} />
                    Tolak / Hapus
                  </button>
                </div>
              </div>

              <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-slate-600">
                      Total Pending: {summary?.total_pending_embeddings || 0}
                    </span>

                    <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-slate-600">
                      Muncul di Page Ini: {faces.length}
                    </span>

                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-700">
                      Dipilih Total: {selectedRecords.length}
                    </span>

                    <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-slate-600">
                      Dipilih di Page Ini: {pageSelectedCount}
                    </span>
                  </div>

                  <div className="gv-scroll flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl bg-white p-1">
                    <button
                      type="button"
                      disabled={!pagination?.has_previous || isPageChanging || isSubmittingAction}
                      onClick={() => goToPage(pagination?.previous_page)}
                      className="inline-flex shrink-0 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-600 transition-all hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronLeft size={15} />
                      Previous
                    </button>

                    {paginationItems.map((item) => {
                      if (typeof item === "string") {
                        return (
                          <span
                            key={item}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400"
                          >
                            <MoreHorizontal size={16} />
                          </span>
                        );
                      }

                      const isActive = item === activePage;
                      const isCached = Boolean(pageCacheRef.current[String(item)]);

                      return (
                        <button
                          key={item}
                          type="button"
                          disabled={isPageChanging || isSubmittingAction || isActive}
                          onClick={() => goToPage(item)}
                          title={isCached ? "Page ini sudah tersimpan di cache" : "Request page ini"}
                          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold transition-all disabled:cursor-not-allowed ${
                            isActive
                              ? "bg-amber-600 text-white shadow-sm"
                              : isCached
                              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          {item}
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      disabled={!pagination?.has_next || isPageChanging || isSubmittingAction}
                      onClick={() => goToPage(pagination?.next_page)}
                      className="inline-flex shrink-0 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-600 transition-all hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="relative p-5">
                {isPageChanging && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center rounded-b-3xl bg-white/70 backdrop-blur-[1px]">
                    <div className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-extrabold text-amber-700 shadow-lg">
                      <Loader2 size={18} className="animate-spin" />
                      Memuat page...
                    </div>
                  </div>
                )}

                {faces.length === 0 ? (
                  <div className="flex min-h-[220px] items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                    <div>
                      <CheckCircle size={34} className="mx-auto text-emerald-500" />
                      <p className="mt-3 text-sm font-extrabold text-slate-700">
                        Tidak ada gambar pada page ini.
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Tekan refresh atau kembali ke page sebelumnya.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
                    {faces.map((face) => {
                      const active = Boolean(selectedFaceMap[String(face.id)]);
                      const image = face.face_image;

                      return (
                        <article
                          key={face.id}
                          className={`group overflow-hidden rounded-3xl border bg-white p-2 transition-all ${
                            active
                              ? "border-amber-400 ring-4 ring-amber-50"
                              : "border-slate-200 hover:border-amber-200 hover:shadow-md"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewImage({
                                src: image,
                                title: `Registration Face #${face.id}`,
                                subtitle: formatTime(face.created_at),
                              })
                            }
                            className="relative aspect-square w-full overflow-hidden rounded-2xl bg-slate-100"
                            title="Klik untuk preview gambar"
                          >
                            <img
                              src={image}
                              alt={`Registration face ${face.id}`}
                              className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-105"
                            />

                            <div className="absolute right-2 top-2 rounded-xl bg-slate-950/70 p-2 text-white opacity-0 transition-all group-hover:opacity-100">
                              <Eye size={15} />
                            </div>
                          </button>

                          <div className="mt-2 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-extrabold text-slate-800">
                                ID #{face.id}
                              </p>
                              <p className="mt-0.5 truncate text-[11px] text-slate-500">
                                {formatTime(face.created_at)}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => toggleFaceSelection(face)}
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-all ${
                                active
                                  ? "border-amber-600 bg-amber-600 text-white"
                                  : "border-slate-300 bg-white text-transparent hover:border-amber-300"
                              }`}
                              title="Pilih gambar"
                            >
                              <Check size={16} />
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      )}

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

      {modal?.type === "registration-member" && (
        <RegistrationMemberModal
          modal={modal}
          selectedRecords={modal.selectedRecords || []}
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

      {modal?.type === "registration-single-face-confirm" && (
        <div className="gv-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="gv-modal w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div
              className="px-5 py-4 text-white"
              style={{
                background: "linear-gradient(135deg,#f59e0b,#d97706)",
              }}
            >
              <h3 className="text-base font-extrabold">
                Hanya 1 Gambar Dipilih
              </h3>

              <p className="mt-1 text-xs leading-relaxed text-amber-100">
                Untuk face recognition yang lebih stabil, sebaiknya pilih
                beberapa gambar dari tampak berbeda jika tersedia.
              </p>
            </div>

            <div className="space-y-4 p-5">
              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                <p className="text-sm font-extrabold text-amber-800">
                  Tetap lanjut dengan 1 gambar?
                </p>

                <p className="mt-1 text-xs leading-relaxed text-amber-700">
                  Jika memilih “Tambah Gambar”, popup ini akan ditutup dan kamu
                  bisa memilih gambar lain pada page ini.
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
                  onClick={openRealAddMemberModal}
                  className="rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-extrabold text-white shadow-md transition-all hover:bg-amber-700"
                >
                  Ya, Tetap Lanjut
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modal?.type === "registration-reject" && (
        <RegistrationRejectModal
          modal={modal}
          selectedRecords={modal.selectedRecords || []}
          isSubmitting={isSubmittingAction}
          onClose={() => {
            if (!isSubmittingAction) setModal(null);
          }}
          onConfirm={handleConfirmReject}
          onPreviewImage={(image) => setPreviewImage(image)}
        />
      )}

      {previewImage && (
        <RegistrationFacePreviewModal
          image={previewImage.src}
          title={previewImage.title}
          subtitle={previewImage.subtitle}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </>
  );
}