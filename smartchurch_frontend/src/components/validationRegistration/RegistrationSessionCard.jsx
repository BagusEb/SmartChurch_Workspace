//smartchurch_frontend\src\components\validationRegistration\RegistrationSessionCard.jsx
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock,
  Database,
  Images,
} from "lucide-react";

import { formatDateTime } from "./registrationHelpers";

export default function RegistrationSessionCard({
  summary,
  pagination,
  isActive,
  onOpen,
}) {
  const firstTime = summary?.first_created_at || null;
  const lastTime = summary?.last_created_at || null;

  const totalPending = Number(summary?.total_pending_embeddings || 0);
  const pagePending = Number(summary?.page_pending_embeddings || 0);
  const currentPage = Number(pagination?.page || summary?.current_page || 1);
  const totalPages = Number(pagination?.total_pages || summary?.total_pages || 1);

  return (
    <article
      className={`gv-enter rounded-3xl border bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg ${
        isActive ? "border-amber-300 ring-4 ring-amber-50" : "border-slate-200"
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
            <CalendarDays size={13} />
            Face Registration Mode
          </div>

          <h3 className="truncate text-lg font-extrabold text-slate-800">
            Initial Face Registration
          </h3>

          <p className="mt-1 text-sm leading-relaxed text-slate-500">
            Data ini belum menjadi attendance. Pilih beberapa wajah lalu
            kaitkan ke jemaat.
          </p>

          <div className="mt-3 grid gap-2 text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <Clock size={15} className="text-slate-400" />
              <span>
                First Capture:{" "}
                <strong className="font-bold text-slate-700">
                  {formatDateTime(firstTime)}
                </strong>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Clock size={15} className="text-slate-400" />
              <span>
                Last Capture:{" "}
                <strong className="font-bold text-slate-700">
                  {formatDateTime(lastTime)}
                </strong>
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpen}
          className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-extrabold shadow-sm transition-all ${
            isActive
              ? "bg-slate-900 text-white"
              : "bg-amber-600 text-white hover:bg-amber-700"
          }`}
        >
          Action
          {isActive ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
          <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-amber-700">
            <Database size={13} />
            Total Pending
          </p>

          <p className="mt-1 text-3xl font-extrabold text-amber-800">
            {totalPending}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            <Images size={13} />
            Page Items
          </p>

          <p className="mt-1 text-3xl font-extrabold text-slate-800">
            {pagePending}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Pagination
          </p>

          <p className="mt-1 text-3xl font-extrabold text-slate-800">
            {currentPage}
            <span className="text-base font-bold text-slate-400">
              /{totalPages}
            </span>
          </p>
        </div>
      </div>
    </article>
  );
}