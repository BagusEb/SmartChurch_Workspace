import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock,
  Database,
} from "lucide-react";

import { formatDateTime } from "./registrationHelpers";

export default function RegistrationSessionCard({
  summary,
  groups,
  isActive,
  onOpen,
}) {
  const firstGroup = groups?.[0] || null;
  const lastGroup = groups?.[groups.length - 1] || null;

  const firstTime = firstGroup?.first_created_at || null;
  const lastTime = lastGroup?.last_created_at || null;

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
            Data ini belum menjadi attendance. Pilih wajah lalu kaitkan ke jemaat.
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

      <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-amber-700">
          Pending Registration
        </p>

        <div className="mt-1 flex items-end justify-between">
          <p className="text-3xl font-extrabold text-amber-800">
            {summary?.total_pending_embeddings || 0}
          </p>
          <p className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
            <Database size={13} />
            {summary?.total_people_groups || 0} people group
          </p>
        </div>
      </div>
    </article>
  );
}