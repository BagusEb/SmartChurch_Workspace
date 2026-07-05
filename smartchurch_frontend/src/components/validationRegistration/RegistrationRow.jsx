//smartchurch_frontend\src\components\validationRegistration\RegistrationRow.jsx

import {
  Check,
  ChevronDown,
  ChevronRight,
  ImagePlus,
  UserRoundPlus,
  Users,
  XCircle,
} from "lucide-react";

import { formatTime } from "./registrationHelpers";

export default function RegistrationRow({
  row,
  expanded,
  selectedFaces,
  onToggle,
  onToggleFace,
  isFaceSelected,
  onAddMember,
  onReject,
  onPreviewImage,
}) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-slate-50/70 p-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white p-4 text-left shadow-sm transition-all hover:bg-slate-50"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
            <Users size={20} />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-extrabold text-slate-800">{row.label}</h4>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-extrabold uppercase text-amber-700">
                Registration Group
              </span>
            </div>

            <p className="mt-1 text-xs text-slate-500">{row.helper}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-extrabold text-slate-600 sm:block">
            {row.count} image
          </div>

          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="gv-enter mt-3 rounded-2xl bg-white p-4">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-extrabold text-slate-800">
                Registration Face Captures
              </p>
              <p className="text-xs text-slate-500">
                Pilih satu atau beberapa gambar, lalu hubungkan ke jemaat lama
                atau buat jemaat baru.
              </p>
            </div>

            <div className="rounded-xl bg-amber-50 px-3 py-1.5 text-xs font-extrabold text-amber-700">
              {selectedFaces.length} gambar dipilih
            </div>
          </div>

          <div className="gv-scroll flex snap-x gap-3 overflow-x-auto pb-3">
            {row.records.map((record) => {
              const active = isFaceSelected(record.id);
              const image = record.face_image || row.representativeImage;

              return (
                <div
                  key={record.id}
                  className={`gv-face-card w-[168px] shrink-0 rounded-2xl border p-2 transition-all ${
                    active
                      ? "border-amber-400 bg-amber-50 ring-4 ring-amber-50"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      onPreviewImage({
                        src: image,
                        title: `${row.label} · Embedding #${record.id}`,
                        subtitle: formatTime(record.created_at),
                      })
                    }
                    className="aspect-square w-full overflow-hidden rounded-xl bg-slate-100"
                    title="Klik untuk preview gambar"
                  >
                    <img
                      src={image}
                      alt={`Registration face ${record.id}`}
                      className="h-full w-full object-contain transition-transform hover:scale-105"
                    />
                  </button>

                  <div className="mt-2 flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-extrabold text-slate-800">
                        ID #{record.id}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {formatTime(record.created_at)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => onToggleFace(record)}
                      className={`flex h-6 w-6 items-center justify-center rounded-md border transition-all ${
                        active
                          ? "border-amber-600 bg-amber-600 text-white"
                          : "border-slate-300 bg-white text-transparent hover:border-amber-300"
                      }`}
                      title="Pilih gambar"
                    >
                      <Check size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={onAddMember}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-xs font-extrabold text-blue-700 transition-all hover:bg-blue-100"
            >
              <ImagePlus size={15} />
              Add Member
            </button>

            <button
              type="button"
              onClick={onReject}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-xs font-extrabold text-rose-700 transition-all hover:bg-rose-100"
            >
              <XCircle size={15} />
              Tolak
            </button>
          </div>

          <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 p-3">
            <p className="flex items-start gap-2 text-xs leading-relaxed text-amber-700">
              <UserRoundPlus size={14} className="mt-0.5 shrink-0" />
              Mode registration hanya menyimpan face embedding. Data ini tidak
              masuk ke attendance sampai wajah dikaitkan ke jemaat.
            </p>
          </div>
        </div>
      )}
    </article>
  );
}