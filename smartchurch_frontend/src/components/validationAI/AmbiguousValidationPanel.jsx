// src/components/validationAI/AmbiguousValidationPanel.jsx

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
  UserCheck,
  XCircle,
} from "lucide-react";

import { formatTime } from "./validationHelpers";

function getPaginationItems(currentPage, totalPages) {
  const total = Math.max(Number(totalPages) || 1, 1);
  const current = Math.min(Math.max(Number(currentPage) || 1, 1), total);

  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const items = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  if (start > 2) items.push("left-ellipsis");

  for (let page = start; page <= end; page += 1) {
    items.push(page);
  }

  if (end < total - 1) items.push("right-ellipsis");

  items.push(total);
  return items;
}

export default function AmbiguousValidationPanel({
  records = [],
  pagination = {},
  selectedRecordMap = {},
  selectedRecords = [],
  isPageChanging = false,
  isSubmittingAction = false,
  onChangePage,
  onToggleRecord,
  onSelectAllPage,
  onClearSelected,
  onVerify,
  onGuest,
  onAddMember,
  onReject,
  onRefresh,
  onPreviewImage,
}) {
  const activePage = Number(pagination?.page || 1);
  const totalPages = Number(pagination?.total_pages || 1);
  const totalItems = Number(pagination?.total_items || 0);

  const paginationItems = getPaginationItems(activePage, totalPages);

  const pageSelectedCount = records.filter((record) =>
    Boolean(selectedRecordMap[String(record.id)])
  ).length;

  const isAllPageSelected =
    records.length > 0 &&
    records.every((record) => Boolean(selectedRecordMap[String(record.id)]));

  if (totalItems === 0) {
    return null;
  }

  return (
    <section className="gv-enter overflow-hidden rounded-3xl border border-amber-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-extrabold text-slate-800">
              Ambiguous Validation
            </h3>

            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
              Flat Selected Mode
            </span>

            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
              Page {activePage} / {totalPages}
            </span>
          </div>

          <p className="mt-1 text-sm text-slate-500">
            Ambiguous tidak digrouping. Pilih gambar seperti mode registration,
            lalu jalankan action.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isPageChanging || isSubmittingAction}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-extrabold text-slate-600 transition-all hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPageChanging ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <RefreshCw size={16} />
            )}
            Refresh Page
          </button>

          <button
            type="button"
            onClick={onSelectAllPage}
            disabled={records.length === 0 || isSubmittingAction}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-extrabold transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
              isAllPageSelected
                ? "bg-amber-600 text-white hover:bg-amber-700"
                : "bg-amber-50 text-amber-700 hover:bg-amber-100"
            }`}
          >
            {isAllPageSelected ? <Check size={16} /> : <Square size={16} />}
            {isAllPageSelected ? "Unselect Page" : "Select All Page"}
          </button>

          <button
            type="button"
            onClick={onClearSelected}
            disabled={selectedRecords.length === 0 || isSubmittingAction}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-extrabold text-slate-600 transition-all hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <XCircle size={16} />
            Clear Selected
          </button>
        </div>
      </div>

      <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-slate-600">
              Total Ambiguous: {totalItems}
            </span>

            <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-slate-600">
              Muncul di Page Ini: {records.length}
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
              onClick={() => onChangePage(pagination?.previous_page)}
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

              return (
                <button
                  key={item}
                  type="button"
                  disabled={isPageChanging || isSubmittingAction || isActive}
                  onClick={() => onChangePage(item)}
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold transition-all disabled:cursor-not-allowed ${
                    isActive
                      ? "bg-amber-600 text-white shadow-sm"
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
              onClick={() => onChangePage(pagination?.next_page)}
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

        {records.length === 0 ? (
          <div className="flex min-h-[220px] items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
            <div>
              <CheckCircle size={34} className="mx-auto text-emerald-500" />
              <p className="mt-3 text-sm font-extrabold text-slate-700">
                Tidak ada ambiguous pada page ini.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {records.map((record) => {
              const active = Boolean(selectedRecordMap[String(record.id)]);
              const image = record.face_image;

              return (
                <article
                  key={record.id}
                  className={`group overflow-hidden rounded-3xl border bg-white p-2 transition-all ${
                    active
                      ? "border-amber-400 ring-4 ring-amber-50"
                      : "border-slate-200 hover:border-amber-200 hover:shadow-md"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      onPreviewImage({
                        src: image,
                        title: `Ambiguous Record #${record.id}`,
                        subtitle: formatTime(record.capture_time),
                      })
                    }
                    className="relative aspect-square w-full overflow-hidden rounded-2xl bg-slate-100"
                  >
                    <img
                      src={image}
                      alt={`Ambiguous face ${record.id}`}
                      className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-105"
                    />

                    <div className="absolute right-2 top-2 rounded-xl bg-slate-950/70 p-2 text-white opacity-0 transition-all group-hover:opacity-100">
                      <Eye size={15} />
                    </div>
                  </button>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-extrabold text-slate-800">
                        ID #{record.id}
                      </p>

                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        {formatTime(record.capture_time)}
                      </p>

                      <p className="mt-0.5 truncate text-[11px] font-bold text-amber-700">
                        {record.matched_member_name || "Kandidat AI"} ·{" "}
                        {record.confidence || 0}%
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => onToggleRecord(record)}
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

        <div className="mt-5 grid gap-2 sm:grid-cols-4">
          <button
            type="button"
            onClick={onVerify}
            disabled={selectedRecords.length === 0 || isSubmittingAction}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs font-extrabold text-emerald-700 transition-all hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCircle size={15} />
            Verify
          </button>

          <button
            type="button"
            onClick={onGuest}
            disabled={selectedRecords.length === 0 || isSubmittingAction}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-50 px-3 py-2.5 text-xs font-extrabold text-indigo-700 transition-all hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <UserCheck size={15} />
            Guest
          </button>

          <button
            type="button"
            onClick={onAddMember}
            disabled={selectedRecords.length === 0 || isSubmittingAction}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-xs font-extrabold text-blue-700 transition-all hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ImagePlus size={15} />
            Add Member
          </button>

          <button
            type="button"
            onClick={onReject}
            disabled={selectedRecords.length === 0 || isSubmittingAction}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-xs font-extrabold text-rose-700 transition-all hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 size={15} />
            Reject
          </button>
        </div>

        {selectedRecords.length > 1 && (
          <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 p-3">
            <p className="flex items-start gap-2 text-xs leading-relaxed text-amber-700">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              Untuk Verify dan Guest, sebaiknya pilih 1 gambar. Untuk Add Member
              dan Reject, beberapa gambar bisa diproses sekaligus.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}