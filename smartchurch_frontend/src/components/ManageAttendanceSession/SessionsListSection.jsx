// ============================================================
//  SessionsListSection.jsx
//  Left panel: searchable, filterable list of worship sessions.
// ============================================================
import { useState, useMemo } from 'react';
import {
  Search, Calendar, Users, UserCheck, UserX,
  ChevronRight, Inbox, Loader2
} from 'lucide-react';

// ── Month name helper ────────────────────────────────────────
const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
const fmtMonth = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

// ── Attendance rate color ────────────────────────────────────
const rateColor = (rate) => {
  if (rate >= 80) return { bar: 'bg-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-50' };
  if (rate >= 50) return { bar: 'bg-amber-500',   text: 'text-amber-600',   bg: 'bg-amber-50'   };
  return              { bar: 'bg-rose-500',    text: 'text-rose-600',    bg: 'bg-rose-50'    };
};

export default function SessionsListSection({ sessions, isLoading, onSessionClick, selectedSession }) {
  const [search, setSearch] = useState('');

  // Group sessions by month
  const grouped = useMemo(() => {
    const filtered = sessions.filter(s =>
      (s.session_name || '').toLowerCase().includes(search.toLowerCase()) ||
      fmtDate(s.date).toLowerCase().includes(search.toLowerCase())
    );
    return filtered.reduce((acc, s) => {
      const key = fmtMonth(s.date);
      if (!acc[key]) acc[key] = [];
      acc[key].push(s);
      return acc;
    }, {});
  }, [sessions, search]);

  const total = sessions.filter(s =>
    (s.session_name || '').toLowerCase().includes(search.toLowerCase()) ||
    fmtDate(s.date).toLowerCase().includes(search.toLowerCase())
  ).length;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">

      {/* ── Toolbar ─────────────────────────────────────── */}
      <div className="p-4 border-b border-slate-100 flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cari sesi ibadah..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all placeholder:text-slate-400"
          />
        </div>
        <span className="text-xs text-slate-400 whitespace-nowrap flex-shrink-0">
          {total} sesi
        </span>
      </div>

      {/* ── Body ────────────────────────────────────────── */}
      <div className="overflow-y-auto max-h-[70vh]">
        {isLoading ? (
          <SkeletonList />
        ) : total === 0 ? (
          <EmptyState />
        ) : (
          Object.entries(grouped).map(([month, items]) => (
            <div key={month}>
              {/* Month separator */}
              <div className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-5 py-2 flex items-center gap-2 border-b border-slate-100">
                <Calendar size={13} className="text-indigo-400" />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{month}</span>
                <span className="ml-auto text-[10px] font-bold bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">
                  {items.length} sesi
                </span>
              </div>

              {/* Session rows */}
              {items.map(s => {
                const total      = (s.member_count ?? 0) + (s.guest_count ?? 0) + (s.absent_count ?? 0);
                const hadir      = (s.member_count ?? 0) + (s.guest_count ?? 0);
                const rate       = total > 0 ? Math.round((hadir / total) * 100) : 0;
                const colors     = rateColor(rate);
                const isSelected = selectedSession?.session_id === s.session_id;

                return (
                  <button
                    key={s.session_id}
                    onClick={() => onSessionClick(s)}
                    className={`w-full text-left px-5 py-4 border-b border-slate-50 transition-all group ${
                      isSelected
                        ? 'bg-indigo-50 border-l-4 border-l-indigo-500'
                        : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/* Left: info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className={`font-bold text-sm truncate ${isSelected ? 'text-indigo-700' : 'text-slate-800'}`}>
                            {s.session_name || 'Sesi Ibadah'}
                          </p>
                        </div>
                        <p className="text-xs text-slate-400 mb-3 flex items-center gap-1">
                          <Calendar size={11} className="text-slate-300" />
                          {fmtDate(s.date)}
                        </p>

                        {/* Attendance counts */}
                        <div className="flex items-center gap-3 flex-wrap">
                          <CountPill icon={Users}     color="text-indigo-500" bg="bg-indigo-50" label={`${s.member_count ?? 0} Jemaat`}  />
                          <CountPill icon={UserCheck} color="text-amber-500"  bg="bg-amber-50"  label={`${s.guest_count  ?? 0} Tamu`}     />
                          <CountPill icon={UserX}     color="text-rose-400"   bg="bg-rose-50"   label={`${s.absent_count ?? 0} Absen`}    />
                        </div>

                        {/* Attendance bar */}
                        {total > 0 && (
                          <div className="mt-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] text-slate-400">Tingkat kehadiran</span>
                              <span className={`text-[10px] font-bold ${colors.text}`}>{rate}%</span>
                            </div>
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${colors.bar} rounded-full transition-all duration-700`}
                                style={{ width: `${rate}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Right: chevron */}
                      <ChevronRight
                        size={16}
                        className={`flex-shrink-0 mt-1 transition-transform ${
                          isSelected ? 'text-indigo-400 translate-x-0.5' : 'text-slate-200 group-hover:text-slate-400'
                        }`}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

function CountPill({ icon: Icon, color, bg, label }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-lg ${bg} ${color}`}>
      <Icon size={10} />
      {label}
    </span>
  );
}

function SkeletonList() {
  return (
    <div className="p-4 space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="animate-pulse space-y-2 p-4 rounded-xl bg-slate-50">
          <div className="h-3.5 bg-slate-200 rounded w-2/3" />
          <div className="h-2.5 bg-slate-100 rounded w-1/3" />
          <div className="flex gap-2 mt-2">
            <div className="h-5 bg-slate-200 rounded-lg w-16" />
            <div className="h-5 bg-slate-100 rounded-lg w-12" />
            <div className="h-5 bg-slate-100 rounded-lg w-14" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-20 flex flex-col items-center gap-3 text-center px-6">
      <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
        <Inbox size={24} className="text-slate-300" />
      </div>
      <p className="text-sm font-semibold text-slate-500">Belum ada sesi ditemukan</p>
      <p className="text-xs text-slate-400">Coba ubah tahun atau kata kunci pencarian.</p>
    </div>
  );
}