import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  Loader2,
  ShieldAlert,
  UserRoundPlus,
} from "lucide-react";

import {
  addRegistrationMemberFaces,
  getRegistrationMemberData,
  getRegistrationValidationGroups,
  rejectRegistrationFaces,
} from "../../service/apiClient";

import RegistrationSessionCard from "./RegistrationSessionCard";
import RegistrationRow from "./RegistrationRow";
import RegistrationFacePreviewModal from "./RegistrationFacePreviewModal";

import {
  RegistrationMemberModal,
  RegistrationRejectModal,
} from "./RegistrationActionModals";

export default function RegistrationValidationPanel({ onAfterChange }) {
  const [registrationData, setRegistrationData] = useState(null);
  const [allMembers, setAllMembers] = useState([]);

  const [isLoading, setIsLoading] = useState(true);
  const [registrationError, setRegistrationError] = useState(null);

  const [isActiveOpen, setIsActiveOpen] = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const [selectedFaces, setSelectedFaces] = useState({});

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

  const fetchRegistrationGroups = useCallback(async () => {
    setIsLoading(true);
    setRegistrationError(null);

    try {
      const data = await getRegistrationValidationGroups();

      if (data?.success) {
        setRegistrationData(data);
      } else {
        setRegistrationData(null);
      }
    } catch (error) {
      console.error("Gagal fetch registration groups:", error);
      setRegistrationError("Gagal memuat data registration. Coba refresh halaman.");
      setRegistrationData(null);
    } finally {
      setIsLoading(false);
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
    fetchRegistrationGroups();
    fetchMembers();
  }, [fetchRegistrationGroups, fetchMembers]);

  const groups = registrationData?.registration_people_groups || [];
  const summary = registrationData?.summary || {};

  const totalPending = Number(summary?.total_pending_embeddings || 0);

  const rows = useMemo(() => {
    return groups.map((group, index) => ({
      rowKey: `registration-${group.group_id || index}`,
      type: "registration",
      label: group.label || `Registration People ${index + 1}`,
      helper: `${group.count || group.records?.length || 0} wajah registration dari orang yang sama`,
      count: group.count || group.records?.length || 0,
      records: group.records || [],
      recordIds:
        group.record_ids || group.embedding_ids || (group.records || []).map((r) => r.id),
      embeddingIds:
        group.embedding_ids || group.record_ids || (group.records || []).map((r) => r.id),
      representativeImage: group.representative_image,
      firstCreatedAt: group.first_created_at,
      lastCreatedAt: group.last_created_at,
    }));
  }, [groups]);

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

  const toggleRow = (rowKey) => {
    setExpandedRows((prev) => ({
      ...prev,
      [rowKey]: !prev[rowKey],
    }));
  };

  const isFaceSelected = (rowKey, recordId) =>
    selectedFaces[rowKey]?.includes(recordId);

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

    const ids = selectedFaces[row.rowKey] || [];
    return row.records.filter((record) => ids.includes(record.id));
  };

  const removeProcessedRow = (row) => {
    const rowKey = row.rowKey;

    setRegistrationData((prev) => {
      if (!prev) return prev;

      const nextGroups = (prev.registration_people_groups || []).filter(
        (group, index) => `registration-${group.group_id || index}` !== rowKey
      );

      const totalPendingEmbeddings = nextGroups.reduce(
        (sum, group) => sum + Number(group.count || group.records?.length || 0),
        0
      );

      return {
        ...prev,
        summary: {
          ...(prev.summary || {}),
          total_pending_embeddings: totalPendingEmbeddings,
          total_people_groups: nextGroups.length,
        },
        registration_people_groups: nextGroups,
      };
    });

    setModal(null);

    setExpandedRows((prev) => {
      const copy = { ...prev };
      delete copy[rowKey];
      return copy;
    });

    setSelectedFaces((prev) => {
      const copy = { ...prev };
      delete copy[rowKey];
      return copy;
    });
  };

  const openRealAddMemberModal = (row) => {
    resetMemberModalState();
    setModal({
      type: "registration-member",
      row,
    });
  };

  const openAddMemberModal = (row) => {
    const selected = getSelectedRecords(row);

    if (selected.length === 0) {
      showToast("Pilih minimal satu gambar sebelum Add Member.", "warning");
      return;
    }

    if (selected.length === 1) {
      setModal({
        type: "registration-single-face-confirm",
        row,
      });
      return;
    }

    openRealAddMemberModal(row);
  };

  const openRejectModal = (row) => {
    setModal({
      type: "registration-reject",
      row,
    });
  };

  const handleConfirmMember = async () => {
    if (!modal?.row || isSubmittingAction) return;

    const row = modal.row;
    const selectedRecords = getSelectedRecords(row);

    if (selectedRecords.length === 0) {
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
      embedding_ids: row.embeddingIds || row.records.map((record) => record.id),
      selected_embedding_ids: selectedRecords.map((record) => record.id),
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
        selectedRecords.length;

      showToast(
        `${row.label} berhasil ditambahkan ke ${
          result?.member?.full_name || "jemaat"
        } dengan ${totalEmbeddings} face embedding aktif.`
      );

      removeProcessedRow(row);
      fetchRegistrationGroups();
      fetchMembers();

      if (onAfterChange) onAfterChange();
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
    if (!modal?.row || isSubmittingAction) return;

    const row = modal.row;

    const payload = {
      embedding_ids: row.embeddingIds || row.records.map((record) => record.id),
    };

    setIsSubmittingAction(true);

    try {
      const result = await rejectRegistrationFaces(payload);

      if (!result?.success) {
        showToast(result?.message || "Reject registration gagal diproses.", "warning");
        return;
      }

      showToast(`${row.label} berhasil ditolak dan dihapus.`);

      removeProcessedRow(row);
      fetchRegistrationGroups();

      if (onAfterChange) onAfterChange();
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
                Attendance validation kosong. Sistem sekarang mengecek data wajah
                registration yang belum dikaitkan ke member.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              fetchRegistrationGroups();
              fetchMembers();
              if (onAfterChange) onAfterChange();
            }}
            className="inline-flex w-fit items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-extrabold text-amber-700 shadow-sm transition-all hover:bg-amber-100"
          >
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
            onClick={fetchRegistrationGroups}
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
              groups={groups}
              isActive={isActiveOpen}
              onOpen={() => {
                setIsActiveOpen((prev) => !prev);
                setExpandedRows({});
                setSelectedFaces({});
              }}
            />
          </section>

          {isActiveOpen && (
            <section className="gv-enter rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 p-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-extrabold text-slate-800">
                      Initial Face Registration
                    </h3>
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                      Detail Registration
                    </span>
                  </div>

                  <p className="mt-1 text-sm text-slate-500">
                    Klik group wajah, pilih gambar, lalu Add Member atau Tolak.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsActiveOpen(false)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50"
                >
                  Tutup
                </button>
              </div>

              <div className="space-y-3 p-4">
                {rows.map((row) => (
                  <RegistrationRow
                    key={row.rowKey}
                    row={row}
                    expanded={!!expandedRows[row.rowKey]}
                    selectedFaces={selectedFaces[row.rowKey] || []}
                    onToggle={() => toggleRow(row.rowKey)}
                    onToggleFace={(record) => toggleFaceSelection(row, record)}
                    isFaceSelected={(recordId) =>
                      isFaceSelected(row.rowKey, recordId)
                    }
                    onAddMember={() => openAddMemberModal(row)}
                    onReject={() => openRejectModal(row)}
                    onPreviewImage={(image) => setPreviewImage(image)}
                  />
                ))}
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
          selectedRecords={getSelectedRecords(modal.row)}
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
                beberapa gambar jika tersedia.
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