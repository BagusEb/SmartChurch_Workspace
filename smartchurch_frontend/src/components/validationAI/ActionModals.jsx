//components/validationAI/ActionModals.jsx

import {
  Check,
  CheckCircle,
  Loader2,
  PlusCircle,
  Save,
  Search,
  Sparkles,
  UserCheck,
  UserPlus,
  XCircle,
} from "lucide-react";

import ModalShell, { ModalFooter } from "./ModalShell";
import {
  formatTime,
  getInitials,
} from "./validationHelpers";

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100";

const labelCls =
  "mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-slate-500";

export function VerifyModal({
  modal,
  selectedRecords,
  verifyMode,
  setVerifyMode,
  verifyMemberSearch,
  setVerifyMemberSearch,
  selectedVerifyMemberId,
  setSelectedVerifyMemberId,
  filteredVerifyMembers,
  isSubmitting = false,
  onClose,
  onConfirm,
  onPreviewImage,
}) {
  const row = modal.row;
  const recommendation = row.aiRecommendation;

  return (
    <ModalShell
      title="Verifikasi Data AI"
      subtitle="Verifikasi rekomendasi AI atau alihkan ke jemaat yang benar."
      icon={<CheckCircle size={18} />}
      onClose={onClose}
      maxWidth="max-w-5xl"
    >
      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <RowPreview
          row={row}
          selectedRecords={selectedRecords}
          compact
          onPreviewImage={onPreviewImage}
        />

        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <p className="text-sm font-bold text-emerald-800">
              Rekomendasi AI paling mendekati:
            </p>

            <div className="mt-3 rounded-2xl bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xl font-extrabold text-slate-900">
                    {recommendation?.full_name ||
                      row.matchedMemberName ||
                      "Member kandidat"}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    {recommendation?.note ||
                      "Kandidat terbaik dari AI recognition."}
                  </p>
                </div>

                <div className="rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-extrabold text-emerald-700">
                  {recommendation?.similarity || row.confidence || 0}%
                </div>
              </div>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-emerald-700">
              Apakah benar wajah ini adalah orang yang direkomendasikan AI?
              Jika tidak, pilih opsi alihkan ke jemaat lain.
            </p>
          </div>

          <div className="rounded-2xl bg-slate-100 p-1">
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  setVerifyMode("ai");
                  setSelectedVerifyMemberId("");
                  setVerifyMemberSearch("");
                }}
                className={`rounded-xl px-4 py-2.5 text-sm font-extrabold transition-all ${
                  verifyMode === "ai"
                    ? "bg-white text-emerald-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Ya, AI Benar
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setVerifyMode("manual")}
                className={`rounded-xl px-4 py-2.5 text-sm font-extrabold transition-all ${
                  verifyMode === "manual"
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Alihkan Orang
              </button>
            </div>
          </div>

          {verifyMode === "ai" ? (
            <div className="rounded-2xl border border-emerald-100 bg-white p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <CheckCircle size={18} />
                </div>

                <div>
                  <p className="text-sm font-extrabold text-slate-800">
                    Verifikasi memakai rekomendasi AI
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Sistem akan memproses wajah ini sebagai{" "}
                    <span className="font-extrabold text-emerald-700">
                      {recommendation?.full_name ||
                        row.matchedMemberName ||
                        "member kandidat"}
                    </span>
                    .
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <VerifyMemberPicker
              verifyMemberSearch={verifyMemberSearch}
              setVerifyMemberSearch={setVerifyMemberSearch}
              filteredVerifyMembers={filteredVerifyMembers}
              selectedVerifyMemberId={selectedVerifyMemberId}
              setSelectedVerifyMemberId={setSelectedVerifyMemberId}
            />
          )}

          <ModalFooter
            cancelText="Batal"
            confirmText={
              isSubmitting
                ? "Memproses..."
                : verifyMode === "manual"
                ? "Verifikasi ke Jemaat Terpilih"
                : "Ya, Verifikasi"
            }
            confirmIcon={
              isSubmitting ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Check size={15} />
              )
            }
            onCancel={onClose}
            onConfirm={onConfirm}
            disabled={isSubmitting}
          />
        </div>
      </div>
    </ModalShell>
  );
}

export function GuestModal({
  modal,
  selectedRecords,
  guestSearchName,
  setGuestSearchName,
  selectedGuestId,
  setSelectedGuestId,
  aiRecommendedGuest,
  filteredGuests,
  showGuestForm,
  setShowGuestForm,
  guestForm,
  setGuestForm,
  isFindingGuestByAi = false,
  isSubmitting = false,
  onFindByAi,
  onClose,
  onConfirm,
  onPreviewImage,
  showToast,
}) {
  const row = modal.row;
  const isUnknown = row.type === "unknown";

  const handleSearchChange = (value) => {
    setGuestSearchName(value);
    setSelectedGuestId("");
    setShowGuestForm(false);
  };

  const handleSelectGuest = (guest) => {
    setSelectedGuestId(guest.id);
    setGuestSearchName(guest.full_name || "");
    setShowGuestForm(false);

    if (showToast) {
      showToast(`${guest.full_name} dipilih sebagai tamu lama.`);
    }
  };

  const handleToggleNewGuest = () => {
    setShowGuestForm((prev) => {
      const next = !prev;

      if (next) {
        setSelectedGuestId("");
        setGuestSearchName("");
      }

      return next;
    });
  };

  const selectedGuest = filteredGuests.find(
    (guest) => String(guest.id) === String(selectedGuestId)
  );

  return (
    <ModalShell
      title="Simpan Sebagai Tamu"
      subtitle={
        row.type === "unknown"
          ? "Pilih satu gambar sebagai tamu. Gambar lain dalam group akan ditolak."
          : "Ambiguous memiliki satu gambar dan langsung bisa disimpan sebagai tamu."
      }
      icon={<UserCheck size={18} />}
      onClose={onClose}
      maxWidth="max-w-4xl"
    >
      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <RowPreview
          row={row}
          selectedRecords={selectedRecords}
          compact
          onPreviewImage={onPreviewImage}
        />

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-extrabold text-slate-800">
              Pernah melihat tamu ini?
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Gunakan Find by AI atau cari manual berdasarkan nama tamu lama.
              {isUnknown
                ? " Setelah disimpan, gambar lain dalam group ini akan ditolak otomatis."
                : " Data ambiguous ini akan langsung dikonfirmasi sebagai tamu."}
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-[auto_1fr]">
              <button
                type="button"
                disabled={isFindingGuestByAi || isSubmitting}
                onClick={onFindByAi}
                className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-md transition-all ${
                  isFindingGuestByAi || isSubmitting
                    ? "cursor-not-allowed bg-slate-400"
                    : "bg-indigo-600 hover:bg-indigo-700"
                }`}
              >
                {isFindingGuestByAi ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Sparkles size={15} />
                )}
                {isFindingGuestByAi ? "Mencari..." : "Find by AI"}
              </button>

              <div className="relative">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={guestSearchName}
                  disabled={isSubmitting}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className={`${inputCls} pl-9`}
                  placeholder="Ketik nama tamu yang pernah hadir..."
                />
              </div>
            </div>

            {aiRecommendedGuest && (
              <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-wide text-emerald-700">
                      Rekomendasi AI
                    </p>
                    <p className="mt-1 text-sm font-extrabold text-slate-800">
                      {aiRecommendedGuest.full_name}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {aiRecommendedGuest.phone || "No phone"} ·{" "}
                      {aiRecommendedGuest.visit_count || 0}x kunjungan
                      {aiRecommendedGuest.from_where
                        ? ` · ${aiRecommendedGuest.from_where}`
                        : ""}
                    </p>
                  </div>

                  <div className="rounded-xl bg-white px-3 py-1.5 text-xs font-extrabold text-emerald-700">
                    {aiRecommendedGuest.similarity || 0}%
                  </div>
                </div>
              </div>
            )}

            {selectedGuestId && (
              <div className="mt-3 rounded-2xl border border-indigo-100 bg-white p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">
                  Tamu terpilih
                </p>
                <p className="mt-1 text-sm font-extrabold text-slate-800">
                  {selectedGuest?.full_name || guestSearchName}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Data akan dibuat sebagai kunjungan baru untuk tamu ini.
                </p>
              </div>
            )}

            {guestSearchName.trim() && !showGuestForm && (
              <div className="mt-3 max-h-52 space-y-2 overflow-y-auto pr-1 gv-scroll">
                {filteredGuests.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-center text-xs font-semibold text-slate-400">
                    Tidak ada tamu dengan nama "{guestSearchName}"
                  </div>
                ) : (
                  filteredGuests.map((guest) => {
                    const active = String(selectedGuestId) === String(guest.id);

                    return (
                      <button
                        key={guest.id}
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => handleSelectGuest(guest)}
                        className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left transition-all ${
                          active
                            ? "border-indigo-400 bg-indigo-50 ring-4 ring-indigo-50"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-sm font-extrabold text-indigo-600">
                            {getInitials(guest.full_name)}
                          </div>

                          <div className="min-w-0">
                            <p className="truncate text-sm font-extrabold text-slate-800">
                              {guest.full_name}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              {guest.phone || "No phone"} ·{" "}
                              {guest.visit_count || 0}x kunjungan
                              {guest.from_where ? ` · ${guest.from_where}` : ""}
                            </p>
                          </div>
                        </div>

                        {active ? (
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white">
                            <Check size={15} />
                          </div>
                        ) : (
                          <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                            Pilih
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-dashed border-indigo-200 bg-white p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-extrabold text-slate-800">
                  Tamu Baru?
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Isi nama, nomor telepon, dan asal tamu.
                </p>
              </div>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleToggleNewGuest}
                className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-all ${
                  isSubmitting
                    ? "cursor-not-allowed bg-slate-400"
                    : "bg-slate-900 hover:bg-slate-800"
                }`}
              >
                <PlusCircle size={15} />
                {showGuestForm ? "Tutup Form" : "New Guest"}
              </button>
            </div>

            {showGuestForm && (
              <div className="gv-enter mt-4 grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Nama Tamu</label>
                  <input
                    value={guestForm.full_name}
                    disabled={isSubmitting}
                    onChange={(e) =>
                      setGuestForm((prev) => ({
                        ...prev,
                        full_name: e.target.value,
                      }))
                    }
                    className={inputCls}
                    placeholder="Contoh: Jonathan Sitorus"
                  />
                </div>

                <div>
                  <label className={labelCls}>No Phone</label>
                  <input
                    value={guestForm.phone}
                    disabled={isSubmitting}
                    onChange={(e) =>
                      setGuestForm((prev) => ({
                        ...prev,
                        phone: e.target.value,
                      }))
                    }
                    className={inputCls}
                    placeholder="0812xxxx"
                  />
                </div>

                <div>
                  <label className={labelCls}>From Where</label>
                  <input
                    value={guestForm.from_where}
                    disabled={isSubmitting}
                    onChange={(e) =>
                      setGuestForm((prev) => ({
                        ...prev,
                        from_where: e.target.value,
                      }))
                    }
                    className={inputCls}
                    placeholder="Contoh: Jakarta / teman jemaat"
                  />
                </div>
              </div>
            )}
          </div>

          <ModalFooter
            cancelText="Batal"
            confirmText={isSubmitting ? "Memproses..." : "Add Guest"}
            confirmIcon={
              isSubmitting ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Save size={15} />
              )
            }
            onCancel={onClose}
            onConfirm={onConfirm}
            disabled={isSubmitting || isFindingGuestByAi}
          />
        </div>
      </div>
    </ModalShell>
  );
}

export function MemberModal({
  modal,
  selectedRecords,
  memberMode,
  setMemberMode,
  memberSearch,
  setMemberSearch,
  selectedMemberId,
  setSelectedMemberId,
  filteredMembers,
  memberForm,
  setMemberForm,
  isSubmitting = false,
  onClose,
  onConfirm,
  onPreviewImage,
}) {
  const row = modal.row;
  

  return (
    <ModalShell
      title="Tambah Data Jemaat & Wajah"
      subtitle={
        row.type === "unknown"
          ? "Gambar terpilih akan ditambahkan sebagai face embedding jemaat."
          : "Record ambiguous ini akan ditambahkan sebagai face embedding jemaat."
      }
      icon={<UserPlus size={18} />}
      onClose={onClose}
      maxWidth="max-w-5xl"
    >
      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <RowPreview
          row={row}
          selectedRecords={selectedRecords}
          compact
          onPreviewImage={onPreviewImage}
        />

        <div className="space-y-4">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-sm font-extrabold text-blue-800">
              {selectedRecords?.length || 0} gambar akan ditambahkan
            </p>
            <p className="mt-1 text-xs leading-relaxed text-blue-700">
              Semua gambar terpilih akan dibuat sebagai data aktif di Member Face Embedding.
              Gambar pertama dari pilihan akan dipakai sebagai data attendance sesi ini.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-100 p-1">
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setMemberMode("existing")}
                className={`rounded-xl px-4 py-2.5 text-sm font-extrabold transition-all ${
                  memberMode === "existing"
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Pilih Jemaat Terdaftar
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setMemberMode("new")}
                className={`rounded-xl px-4 py-2.5 text-sm font-extrabold transition-all ${
                  memberMode === "new"
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Buat Jemaat Baru
              </button>
            </div>
          </div>

          {memberMode === "existing" ? (
            <ExistingMemberPicker
              memberSearch={memberSearch}
              setMemberSearch={setMemberSearch}
              filteredMembers={filteredMembers}
              selectedMemberId={selectedMemberId}
              setSelectedMemberId={setSelectedMemberId}
              disabled={isSubmitting}
            />
          ) : (
            <NewMemberForm memberForm={memberForm} setMemberForm={setMemberForm} disabled={isSubmitting}/>
          )}

          <ModalFooter
            cancelText="Batal"
            confirmText={isSubmitting ? "Memproses..." : "Simpan Data & Wajah"}
            confirmIcon={
              isSubmitting ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Save size={15} />
              )
            }
            onCancel={onClose}
            onConfirm={onConfirm}
            disabled={isSubmitting}
          />
        </div>
      </div>
    </ModalShell>
  );
}

export function RejectModal({
  modal,
  selectedRecords,
  isSubmitting = false,
  onClose,
  onConfirm,
  onPreviewImage,
}) {
  const row = modal.row;
  const isUnknown = row.type === "unknown";

  return (
    <ModalShell
      title="Tolak Data Validasi"
      subtitle="Data akan ditandai rejected dan data wajah akan dibersihkan."
      icon={<XCircle size={18} />}
      onClose={onClose}
    >
      <div className="space-y-4">
        <RowPreview
          row={row}
          selectedRecords={selectedRecords}
          onPreviewImage={onPreviewImage}
        />

        <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
          <p className="text-sm font-extrabold text-rose-800">
            Apakah kamu yakin ingin reject data ini?
          </p>

          <p className="mt-1 text-xs leading-relaxed text-rose-700">
            {isUnknown
              ? "Semua record dalam unknown group ini akan ditandai rejected. Face image dan face encoding pada semua record juga akan dihapus."
              : "Record ambiguous ini akan ditandai rejected. Face image dan face encoding pada record ini juga akan dihapus."}
          </p>

          <div className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-xs font-bold text-rose-700">
            Total record yang diproses: {row.recordIds?.length || row.records?.length || 0}
          </div>
        </div>

        <ModalFooter
          cancelText="Batal"
          confirmText={isSubmitting ? "Memproses..." : "Ya, Reject"}
          danger
          confirmIcon={
            isSubmitting ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <XCircle size={15} />
            )
          }
          onCancel={onClose}
          onConfirm={onConfirm}
          disabled={isSubmitting}
        />
      </div>
    </ModalShell>
  );
}

function VerifyMemberPicker({
  verifyMemberSearch,
  setVerifyMemberSearch,
  filteredVerifyMembers,
  selectedVerifyMemberId,
  setSelectedVerifyMemberId,
}) {
  return (
    <div className="gv-enter space-y-4 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
      <div>
        <label className={labelCls}>Alihkan ke Jemaat</label>

        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={verifyMemberSearch}
            onChange={(e) => setVerifyMemberSearch(e.target.value)}
            className={`${inputCls} bg-white pl-9`}
            placeholder="Ketik nama, panggilan, nomor telepon, atau email..."
          />
        </div>
      </div>

      <div className="max-h-72 space-y-2 overflow-y-auto pr-1 gv-scroll">
        {filteredVerifyMembers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-indigo-200 bg-white px-4 py-4 text-center text-xs font-semibold text-slate-400">
            Tidak ada jemaat yang cocok.
          </div>
        ) : (
          filteredVerifyMembers.map((member) => {
            const active = String(selectedVerifyMemberId) === String(member.id);

            return (
              <button
                key={member.id}
                type="button"
                onClick={() => setSelectedVerifyMemberId(member.id)}
                className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left transition-all ${
                  active
                    ? "border-indigo-400 bg-white ring-4 ring-indigo-100"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-extrabold text-slate-600">
                    {getInitials(member.full_name)}
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-slate-800">
                      {member.full_name}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {member.nickname || "-"} · {member.phone || "No phone"}
                      {member.email ? ` · ${member.email}` : ""}
                    </p>
                  </div>
                </div>

                {active && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white">
                    <Check size={15} />
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>

      <div className="rounded-2xl border border-indigo-100 bg-white p-4">
        <p className="text-xs leading-relaxed text-indigo-700">
          Jika rekomendasi AI salah, pilih jemaat yang benar di sini. Saat tombol
          verifikasi ditekan, data akan dianggap milik jemaat terpilih.
        </p>
      </div>
    </div>
  );
}

function ExistingMemberPicker({
  memberSearch,
  setMemberSearch,
  filteredMembers,
  selectedMemberId,
  setSelectedMemberId,
  disabled = false,
}) {
  return (
    <div className="gv-enter space-y-4">
      <div>
        <label className={labelCls}>Cari Jemaat</label>
        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={memberSearch}
            disabled={disabled}
            onChange={(e) => setMemberSearch(e.target.value)}
            className={`${inputCls} pl-9`}
            placeholder="Ketik nama, panggilan, atau nomor telepon..."
          />
        </div>
      </div>

      <div className="max-h-72 space-y-2 overflow-y-auto pr-1 gv-scroll">
        {filteredMembers.map((member) => {
          const active = String(selectedMemberId) === String(member.id);

          return (
              <button
                key={member.id}
                type="button"
                disabled={disabled}
                onClick={() => setSelectedMemberId(member.id)}
                className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left transition-all ${
                  disabled
                    ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-70"
                    : active
                    ? "border-indigo-300 bg-indigo-50"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-sm font-extrabold text-slate-600">
                  {getInitials(member.full_name)}
                </div>
                <div>
                  <p className="text-sm font-extrabold text-slate-800">
                    {member.full_name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {member.nickname || "-"} · {member.phone || "No phone"}
                  </p>
                </div>
              </div>

              {active && (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-white">
                  <Check size={15} />
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
        <p className="text-xs leading-relaxed text-indigo-700">
          Sistem akan menghubungkan gambar wajah yang dipilih ke member terdaftar.
        </p>
      </div>
    </div>
  );
}

function NewMemberForm({ memberForm, setMemberForm, disabled = false }) {
  return (
    <div className="gv-enter grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className={labelCls}>Nama Lengkap *</label>
        <input
          value={memberForm.full_name}
          onChange={(e) =>
            setMemberForm((prev) => ({
              ...prev,
              full_name: e.target.value,
            }))
          }
          className={inputCls}
          placeholder="Nama lengkap jemaat"
        />
      </div>

      <div>
        <label className={labelCls}>Nickname</label>
        <input
          value={memberForm.nickname}
           disabled={disabled}
          onChange={(e) =>
            setMemberForm((prev) => ({
              ...prev,
              nickname: e.target.value,
            }))
          }
          className={inputCls}
          placeholder="Nama panggilan"
        />
      </div>

      <div>
        <label className={labelCls}>Gender</label>
        <select
          value={memberForm.gender}
          onChange={(e) =>
            setMemberForm((prev) => ({
              ...prev,
              gender: e.target.value,
            }))
          }
          className={inputCls}
        >
          <option value="L">Laki-laki</option>
          <option value="P">Perempuan</option>
        </select>
      </div>

      <div>
        <label className={labelCls}>Birth Date</label>
        <input
          type="date"
          value={memberForm.birth_date}
          disabled={disabled}
          onChange={(e) =>
            setMemberForm((prev) => ({
              ...prev,
              birth_date: e.target.value,
            }))
          }
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls}>Phone</label>
        <input
          value={memberForm.phone}
          disabled={disabled}
          onChange={(e) =>
            setMemberForm((prev) => ({
              ...prev,
              phone: e.target.value,
            }))
          }
          className={inputCls}
          placeholder="0812xxxx"
        />
      </div>

      <div className="sm:col-span-2">
        <label className={labelCls}>Email</label>
        <input
          value={memberForm.email}
          disabled={disabled}
          onChange={(e) =>
            setMemberForm((prev) => ({
              ...prev,
              email: e.target.value,
            }))
          }
          className={inputCls}
          placeholder="email@example.com"
        />
      </div>

      <div className="sm:col-span-2">
        <label className={labelCls}>Address</label>
        <textarea
          value={memberForm.address}
          disabled={disabled}
          onChange={(e) =>
            setMemberForm((prev) => ({
              ...prev,
              address: e.target.value,
            }))
          }
          className={`${inputCls} min-h-[78px] resize-none`}
          placeholder="Alamat jemaat"
        />
      </div>
    </div>
  );
}

function RowPreview({ row, selectedRecords, compact = false, onPreviewImage }) {
  const records =
    selectedRecords && selectedRecords.length > 0 ? selectedRecords : row.records;

  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-slate-50 p-4 ${
        compact ? "h-fit" : ""
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold text-slate-800">{row.label}</p>
          <p className="text-xs text-slate-500">
            {row.type === "unknown" ? "Unknown Group" : "Ambiguous Record"}
          </p>
        </div>

        <div className="rounded-xl bg-white px-3 py-1.5 text-xs font-extrabold text-slate-600">
          {records.length} image
        </div>
      </div>

      <div className="gv-scroll flex gap-3 overflow-x-auto pb-1">
        {records.map((record) => {
          const image = record.face_image || row.representativeImage;

          return (
            <button
              key={record.id}
              type="button"
              onClick={() =>
                onPreviewImage({
                  src: image,
                  title: `${row.label} · Record #${record.id}`,
                  subtitle: formatTime(record.capture_time),
                })
              }
              className="w-28 shrink-0 text-left"
            >
              <div className="aspect-square overflow-hidden rounded-2xl bg-white">
                <img
                  src={image}
                  alt={`Selected face ${record.id}`}
                  className="h-full w-full object-contain transition-transform hover:scale-105"
                />
              </div>
              <p className="mt-1 truncate text-center text-[11px] font-bold text-slate-500">
                #{record.id}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}