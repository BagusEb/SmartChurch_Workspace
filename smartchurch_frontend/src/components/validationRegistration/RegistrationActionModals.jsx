//smartchurch_frontend\src\components\validationRegistration\RegistrationActionModals.jsx
import {
  Check,
  Loader2,
  Save,
  Search,
  UserPlus,
  XCircle,
} from "lucide-react";

import RegistrationModalShell, {
  RegistrationModalFooter,
} from "./RegistrationModalShell";

import { formatTime, getInitials } from "./registrationHelpers";

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100";

const labelCls =
  "mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-slate-500";

export function RegistrationMemberModal({
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
  return (
    <RegistrationModalShell
      title="Tambahkan Wajah Registration ke Jemaat"
      subtitle="Pilih jemaat lama atau buat jemaat baru. Tidak membuat attendance."
      icon={<UserPlus size={18} />}
      onClose={onClose}
      maxWidth="max-w-5xl"
    >
      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <RegistrationSelectedPreview
          title="Selected Faces"
          selectedRecords={selectedRecords}
          compact
          onPreviewImage={onPreviewImage}
        />

        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
            <p className="text-sm font-extrabold text-amber-800">
              {selectedRecords?.length || 0} gambar akan dijadikan face embedding aktif
            </p>

            <p className="mt-1 text-xs leading-relaxed text-amber-700">
              Hanya gambar yang dipilih yang akan dihubungkan ke jemaat. Gambar
              lain yang tidak dipilih tetap berada di staging registration.
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
                    ? "bg-white text-amber-700 shadow-sm"
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
                    ? "bg-white text-amber-700 shadow-sm"
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
            <NewMemberForm
              memberForm={memberForm}
              setMemberForm={setMemberForm}
              disabled={isSubmitting}
            />
          )}

          <RegistrationModalFooter
            cancelText="Batal"
            confirmText={isSubmitting ? "Memproses..." : "Simpan Face Embedding"}
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
    </RegistrationModalShell>
  );
}

export function RegistrationRejectModal({
  selectedRecords,
  isSubmitting = false,
  onClose,
  onConfirm,
  onPreviewImage,
}) {
  return (
    <RegistrationModalShell
      title="Tolak Data Registration"
      subtitle="Hanya wajah yang dipilih yang akan dihapus dari staging registration."
      icon={<XCircle size={18} />}
      onClose={onClose}
    >
      <div className="space-y-4">
        <RegistrationSelectedPreview
          title="Faces to Delete"
          selectedRecords={selectedRecords}
          onPreviewImage={onPreviewImage}
        />

        <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
          <p className="text-sm font-extrabold text-rose-800">
            Apakah kamu yakin ingin menghapus wajah registration terpilih?
          </p>

          <p className="mt-1 text-xs leading-relaxed text-rose-700">
            Data yang dihapus tidak akan masuk ke attendance dan tidak akan
            menjadi face embedding jemaat.
          </p>

          <div className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-xs font-bold text-rose-700">
            Total data yang diproses: {selectedRecords?.length || 0}
          </div>
        </div>

        <RegistrationModalFooter
          cancelText="Batal"
          confirmText={isSubmitting ? "Menghapus..." : "Ya, Tolak"}
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
    </RegistrationModalShell>
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
            onChange={(event) => setMemberSearch(event.target.value)}
            className={`${inputCls} pl-9`}
            placeholder="Ketik nama, panggilan, nomor telepon, atau email..."
          />
        </div>
      </div>

      <div className="max-h-72 space-y-2 overflow-y-auto pr-1 gv-scroll">
        {filteredMembers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-4 text-center text-xs font-semibold text-slate-400">
            Tidak ada jemaat yang cocok.
          </div>
        ) : (
          filteredMembers.map((member) => {
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
                    ? "border-amber-300 bg-amber-50 ring-4 ring-amber-50"
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
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-600 text-white">
                    <Check size={15} />
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>

      <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
        <p className="text-xs leading-relaxed text-amber-700">
          Sistem akan mengaktifkan wajah registration yang dipilih sebagai face
          embedding jemaat terdaftar.
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
          disabled={disabled}
          onChange={(event) =>
            setMemberForm((prev) => ({
              ...prev,
              full_name: event.target.value,
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
          onChange={(event) =>
            setMemberForm((prev) => ({
              ...prev,
              nickname: event.target.value,
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
          disabled={disabled}
          onChange={(event) =>
            setMemberForm((prev) => ({
              ...prev,
              gender: event.target.value,
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
          onChange={(event) =>
            setMemberForm((prev) => ({
              ...prev,
              birth_date: event.target.value,
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
          onChange={(event) =>
            setMemberForm((prev) => ({
              ...prev,
              phone: event.target.value,
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
          onChange={(event) =>
            setMemberForm((prev) => ({
              ...prev,
              email: event.target.value,
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
          onChange={(event) =>
            setMemberForm((prev) => ({
              ...prev,
              address: event.target.value,
            }))
          }
          className={`${inputCls} min-h-[78px] resize-none`}
          placeholder="Alamat jemaat"
        />
      </div>
    </div>
  );
}

function RegistrationSelectedPreview({
  title,
  selectedRecords,
  compact = false,
  onPreviewImage,
}) {
  const records = selectedRecords || [];

  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-slate-50 p-4 ${
        compact ? "h-fit" : ""
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold text-slate-800">
            {title || "Selected Registration Faces"}
          </p>

          <p className="text-xs text-slate-500">Selected Mode</p>
        </div>

        <div className="rounded-xl bg-white px-3 py-1.5 text-xs font-extrabold text-slate-600">
          {records.length} image
        </div>
      </div>

      {records.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-xs font-semibold text-slate-400">
          Belum ada gambar yang dipilih.
        </div>
      ) : (
        <div className="gv-scroll flex gap-3 overflow-x-auto pb-1">
          {records.map((record) => {
            const image = record.face_image;

            return (
              <button
                key={record.id}
                type="button"
                onClick={() =>
                  onPreviewImage({
                    src: image,
                    title: `Registration Face #${record.id}`,
                    subtitle: formatTime(record.created_at),
                  })
                }
                className="w-28 shrink-0 text-left"
              >
                <div className="aspect-square overflow-hidden rounded-2xl bg-white">
                  <img
                    src={image}
                    alt={`Selected registration face ${record.id}`}
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
      )}
    </div>
  );
}