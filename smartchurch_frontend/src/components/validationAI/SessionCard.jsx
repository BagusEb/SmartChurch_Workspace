//components/validationAI/SessionCard.jsx

import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock,
} from "lucide-react";

import {
  formatDate,
  formatDateTime,
} from "./validationHelpers";

export default function SessionCard({ item, index, isActive, onOpen }) {
  const session = item.session;
  const summary = item.summary || {};

  return (
    <article
      className={`gv-enter rounded-3xl border bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg ${
        isActive ? "border-indigo-300 ring-4 ring-indigo-50" : "border-slate-200"
      }`}
      style={{ animationDelay: `${index * 0.06}s` }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
            <CalendarDays size={13} />
            {formatDate(session.date)}
          </div>

          <h3 className="truncate text-lg font-extrabold text-slate-800">
            {session.session_name}
          </h3>

          <div className="mt-3 grid gap-2 text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <Clock size={15} className="text-slate-400" />
              <span>
                Start:{" "}
                <strong className="font-bold text-slate-700">
                  {formatDateTime(session.start_time)}
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={15} className="text-slate-400" />
              <span>
                End:{" "}
                <strong className="font-bold text-slate-700">
                  {formatDateTime(session.end_time)}
                </strong>
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={onOpen}
          className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-extrabold shadow-sm transition-all ${
            isActive
              ? "bg-slate-900 text-white"
              : "bg-indigo-600 text-white hover:bg-indigo-700"
          }`}
        >
          Action
          {isActive ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
      </div>

      <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-amber-700">
          Total Pending
        </p>
        <div className="mt-1 flex items-end justify-between">
          <p className="text-3xl font-extrabold text-amber-800">
            {summary.total_pending || 0}
          </p>
          <p className="text-xs font-semibold text-amber-700">
            perlu validasi
          </p>
        </div>
      </div>
    </article>
  );
}