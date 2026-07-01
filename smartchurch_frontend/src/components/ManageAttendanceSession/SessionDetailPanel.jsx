// ============================================================
//  SessionDetailPanel.jsx
//  Right panel: tabbed detail view for a selected session.
//  Tabs: Jemaat Hadir · Tamu · Absen (+ confirm-popup mark present)
// ============================================================
import { createElement, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Users, UserCheck, UserX, CheckCircle2,
  Clock, Calendar, MousePointerClick, Inbox, ShieldAlert
} from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────
const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
const fmtTime = (iso) => {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
};
const getInitials = (name = '') =>
  name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
const avatarColors = [
  'from-violet-500 to-purple-600','from-blue-500 to-cyan-600',
  'from-emerald-500 to-teal-600', 'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600', 'from-indigo-500 to-blue-600',
];
const getAvatarColor = (name = '') =>
  avatarColors[(name?.charCodeAt(0) || 0) % avatarColors.length];

// ── TABS config ──────────────────────────────────────────────
const TABS = [
  { key: 'members', label: 'Jemaat', icon: Users,     emptyMsg: 'Belum ada jemaat yang hadir.',  color: 'indigo' },
  { key: 'guests',  label: 'Tamu',   icon: UserCheck, emptyMsg: 'Belum ada tamu yang hadir.',    color: 'amber'  },
  { key: 'absent',  label: 'Absen',  icon: UserX,     emptyMsg: 'Semua jemaat hadir! 🎉',        color: 'rose'   },
];
const TAB_COLORS = {
  indigo: { active: 'bg-indigo-600 text-white shadow-sm shadow-indigo-200', dot: 'bg-indigo-100 text-indigo-700' },
  amber:  { active: 'bg-amber-500  text-white shadow-sm shadow-amber-200',  dot: 'bg-amber-100  text-amber-700'  },
  rose:   { active: 'bg-rose-500   text-white shadow-sm shadow-rose-200',   dot: 'bg-rose-100   text-rose-700'   },
};

// ── MAIN COMPONENT ───────────────────────────────────────────
export default function SessionDetailPanel({ session, attendees, isLoading, onMarkPresent }) {
  const [activeTab,     setActiveTab]     = useState('members');
  const [markingId,     setMarkingId]     = useState(null);        // member currently being saved
  const [markedIds,     setMarkedIds]     = useState(new Set());   // optimistic "done" set
  const [confirmMember, setConfirmMember] = useState(null);        // { id, name } — pending confirm

  // Reset when session changes
  useEffect(() => {
    setActiveTab('members');
    setMarkedIds(new Set());
    setConfirmMember(null);
  }, [session?.session_id]);

  // ── Called after user confirms in popup ──────────────────
  const executeMark = async () => {
    if (!confirmMember) return;
    const { id } = confirmMember;
    setConfirmMember(null);     // close popup immediately
    setMarkingId(id);
    try {
      await onMarkPresent(id);
      setMarkedIds(prev => new Set(prev).add(id));
    } finally {
      setMarkingId(null);
    }
  };

  // ── Placeholder when no session selected ─────────────────
  if (!session) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center py-20 px-6 text-center">
        <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
          <MousePointerClick size={28} className="text-indigo-300" />
        </div>
        <p className="text-sm font-bold text-slate-500 mb-1">Pilih sesi untuk melihat detail</p>
        <p className="text-xs text-slate-400">Klik salah satu sesi di panel kiri untuk menampilkan data kehadiran.</p>
      </div>
    );
  }

  const list        = attendees?.[activeTab] ?? [];
  const memberCount = attendees?.members?.length ?? 0;
  const guestCount  = attendees?.guests?.length  ?? 0;
  const absentCount = attendees?.absent?.length  ?? 0;
  const total       = memberCount + guestCount + absentCount;
  const rate        = total > 0 ? Math.round(((memberCount + guestCount) / total) * 100) : 0;

  return (
    <>
      {/* ── Confirmation popup ──────────────────────────────── */}
      {confirmMember && createPortal(
        <ConfirmModal
          name={confirmMember.name}
          onConfirm={executeMark}
          onCancel={() => setConfirmMember(null)}
        />,
        document.body
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">

        {/* ── Session hero header ────────────────────────── */}
        <div className="relative bg-gradient-to-br from-indigo-500 via-violet-600 to-purple-700 p-6 text-white overflow-hidden">
          <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/10 rounded-full" />
          <div className="absolute -bottom-4 -left-4 w-16 h-16 bg-white/5  rounded-full" />

          <p className="text-indigo-200 text-xs font-semibold uppercase tracking-widest mb-1">Sesi Ibadah</p>
          <h3 className="text-xl font-extrabold leading-tight mb-3 relative z-10">
            {session.session_name || 'Sesi Ibadah'}
          </h3>

          <div className="flex flex-wrap gap-3 relative z-10">
            <InfoChip icon={Calendar} label={fmtDate(session.date)} />
            {session.start_time && <InfoChip icon={Clock} label={`Mulai: ${fmtTime(session.start_time)}`} />}
            {session.end_time && <InfoChip icon={Clock} label={`Selesai: ${fmtTime(session.end_time)}`} />}
          </div>

          {/* Attendance rate bar */}
          {!isLoading && attendees && (
            <div className="mt-4 relative z-10">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-indigo-200 text-xs">Tingkat Kehadiran</span>
                <span className="text-white text-xs font-extrabold">{rate}%</span>
              </div>
              <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all duration-700"
                  style={{ width: `${rate}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Mini stat row ──────────────────────────────── */}
        {!isLoading && attendees && (
          <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
            <MiniStat value={memberCount} label="Jemaat" color="text-indigo-600" />
            <MiniStat value={guestCount}  label="Tamu"   color="text-amber-500"  />
            <MiniStat value={absentCount} label="Absen"  color="text-rose-500"   />
          </div>
        )}

        {/* ── Tab bar ────────────────────────────────────── */}
        <div className="flex gap-1.5 px-4 pt-4 pb-2 border-b border-slate-100">
          {TABS.map(tab => {
            const count   = tab.key === 'members' ? memberCount : tab.key === 'guests' ? guestCount : absentCount;
            const isActive = activeTab === tab.key;
            const c        = TAB_COLORS[tab.color];
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  isActive ? c.active : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                }`}
              >
                <tab.icon size={12} />
                {tab.label}
                {!isLoading && attendees && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-white/25 text-white' : c.dot
                  }`}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── List body ──────────────────────────────────── */}
        <div className="overflow-y-auto max-h-80 flex-1">
          {isLoading ? (
            <SkeletonAttendees />
          ) : list.length === 0 ? (
            <EmptyTab msg={TABS.find(t => t.key === activeTab)?.emptyMsg} />
          ) : (
            <ul className="divide-y divide-slate-50 px-4 py-2">
              {list.map((person, idx) => {
                const name         = person.full_name || person.name || '—';
                const isAbsent     = activeTab === 'absent';
                const alreadyMarked = markedIds.has(person.id);
                const isMarking     = markingId === person.id;

                return (
                  <li
                    key={person.id ?? idx}
                    className={`flex items-center gap-3 py-3 transition-all ${alreadyMarked ? 'opacity-50' : ''}`}
                  >
                    {/* Avatar */}
                    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${getAvatarColor(name)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm`}>
                      {getInitials(name)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{name}</p>
                      {person.phone && (
                        <p className="text-xs text-slate-400 truncate">{person.phone}</p>
                      )}
                      {person.check_in_time && !isAbsent && (
                        <p className="text-[10px] text-emerald-500 font-medium mt-0.5 flex items-center gap-1">
                          <CheckCircle2 size={10} /> {fmtTime(person.check_in_time)}
                        </p>
                      )}
                    </div>

                    {/* Mark present — opens confirm popup */}
                    {isAbsent && !alreadyMarked && (
                      <button
                        onClick={() => setConfirmMember({ id: person.id, name })}
                        disabled={isMarking}
                        className="flex-shrink-0 flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl transition-all disabled:opacity-60"
                      >
                        {isMarking ? (
                          <span className="w-3 h-3 border border-indigo-400 border-t-indigo-700 rounded-full animate-spin" />
                        ) : (
                          <CheckCircle2 size={12} />
                        )}
                        {isMarking ? 'Menyimpan…' : 'Hadir'}
                      </button>
                    )}
                    {isAbsent && alreadyMarked && (
                      <span className="flex-shrink-0 flex items-center gap-1 text-[11px] font-bold text-emerald-500 bg-emerald-50 px-2.5 py-1.5 rounded-xl">
                        <CheckCircle2 size={12} /> Hadir
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

// ── Confirmation Modal ───────────────────────────────────────
function ConfirmModal({ name, onConfirm, onCancel }) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
      style={{ animation: 'backdropIn .2s ease' }}
    >
      <style>{`
        @keyframes backdropIn { from { opacity:0; } to { opacity:1; } }
        @keyframes modalIn {
          from { opacity:0; transform:scale(0.92) translateY(16px); }
          to   { opacity:1; transform:scale(1)    translateY(0);    }
        }
        .confirm-card { animation: modalIn .25s cubic-bezier(0.34,1.56,0.64,1); }
      `}</style>

      <div className="confirm-card bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

        {/* Icon header */}
        <div className="flex flex-col items-center pt-8 pb-5 px-6 text-center">
          <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
            <ShieldAlert size={28} className="text-indigo-500" />
          </div>
          <h3 className="text-base font-extrabold text-slate-800 mb-2">
            Konfirmasi Kehadiran
          </h3>
          <p className="text-sm text-slate-500 leading-relaxed">
            Apakah kamu yakin ingin mengubah status{' '}
            <span className="font-bold text-slate-700">{name}</span>{' '}
            menjadi <span className="font-bold text-emerald-600">Hadir</span>?
          </p>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-100 mx-6" />

        {/* Action buttons */}
        <div className="flex gap-3 p-4">
          {/* Cancel */}
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all"
          >
            Batal
          </button>

          {/* Confirm */}
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
            style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 15px rgba(99,102,241,0.4)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
          >
            Ya, Tandai Hadir
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

function InfoChip({ icon: Icon, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-white/15 px-3 py-1 rounded-full text-white/90">
      {createElement(Icon, { size: 12, className: 'text-white/70' })}{label}
    </span>
  );
}

function MiniStat({ value, label, color }) {
  return (
    <div className="flex flex-col items-center py-3">
      <span className={`text-xl font-extrabold ${color}`}>{value}</span>
      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
    </div>
  );
}

function SkeletonAttendees() {
  return (
    <div className="px-4 py-3 space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 animate-pulse">
          <div className="w-9 h-9 bg-slate-200 rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 bg-slate-200 rounded w-2/3" />
            <div className="h-2.5 bg-slate-100 rounded w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyTab({ msg }) {
  return (
    <div className="py-12 flex flex-col items-center gap-2 text-center px-6">
      <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
        <Inbox size={18} className="text-slate-300" />
      </div>
      <p className="text-xs font-medium text-slate-400">{msg}</p>
    </div>
  );
}
