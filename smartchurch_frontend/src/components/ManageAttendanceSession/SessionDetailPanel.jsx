// ============================================================
//  SessionDetailPanel.jsx
//  Right panel: tabbed detail view for a selected session.
//  Tabs: Jemaat Hadir · Tamu · Absen (+ confirm-popup mark present)
// ============================================================
import { createElement, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Users, UserCheck, UserX, CheckCircle2,
  Clock, Calendar, MousePointerClick, Inbox, ShieldAlert, Eye, X,
  LogIn, LogOut
} from 'lucide-react';
import { getAttendanceFaceImage } from '../../service/apiClient';

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
  const [faceModal,     setFaceModal]     = useState(null);        // { name, facedetectionId } — image modal

  // Reset when session changes
  useEffect(() => {
    setActiveTab('members');
    setMarkedIds(new Set());
    setConfirmMember(null);
    setFaceModal(null);
  }, [session?.session_id]);

  // ── Fetch face image from t_timlinedata_record ────────────
  const handleViewFace = async (person) => {
    if (!person?.facedetection_id) return;
    setFaceModal({ name: person.full_name || person.name || '—', facedetectionId: person.facedetection_id, loading: true, error: null });
    try {
      const data = await getAttendanceFaceImage(person.facedetection_id);
      setFaceModal(prev => prev && { ...prev, image: data.face_image, loading: false });
    } catch (e) {
      setFaceModal(prev => prev && {
        ...prev,
        loading: false,
        error: e.response?.data?.error || 'Gagal memuat gambar wajah.',
      });
    }
  };

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
      <div className="flex flex-col justify-center items-center bg-white shadow-sm px-6 py-20 border border-slate-100 rounded-2xl text-center">
        <div className="flex justify-center items-center bg-indigo-50 mb-4 rounded-2xl w-16 h-16">
          <MousePointerClick size={28} className="text-indigo-300" />
        </div>
        <p className="mb-1 font-bold text-slate-500 text-sm">Pilih sesi untuk melihat detail</p>
        <p className="text-slate-400 text-xs">Klik salah satu sesi di panel kiri untuk menampilkan data kehadiran.</p>
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

      {/* ── Face image popup ────────────────────────────────── */}
      {faceModal && createPortal(
        <FaceImageModal
          name={faceModal.name}
          image={faceModal.image}
          loading={faceModal.loading}
          error={faceModal.error}
          onClose={() => setFaceModal(null)}
        />,
        document.body
      )}

      <div className="flex flex-col bg-white shadow-sm border border-slate-100 rounded-2xl overflow-hidden">

        {/* ── Session hero header ────────────────────────── */}
        <div className="relative bg-gradient-to-br from-indigo-500 via-violet-600 to-purple-700 p-6 overflow-hidden text-white">
          <div className="-top-6 -right-6 absolute bg-white/10 rounded-full w-24 h-24" />
          <div className="-bottom-4 -left-4 absolute bg-white/5 rounded-full w-16 h-16" />

          <p className="mb-1 font-semibold text-indigo-200 text-xs uppercase tracking-widest">Sesi Ibadah</p>
          <h3 className="z-10 relative mb-3 font-extrabold text-xl leading-tight">
            {session.session_name || 'Sesi Ibadah'}
          </h3>

          <div className="z-10 relative flex flex-wrap gap-3">
            <InfoChip icon={Calendar} label={fmtDate(session.date)} />
            {session.start_time && <InfoChip icon={Clock} label={`Mulai: ${fmtTime(session.start_time)}`} />}
            {session.end_time && <InfoChip icon={Clock} label={`Selesai: ${fmtTime(session.end_time)}`} />}
          </div>

          {/* Attendance rate bar */}
          {!isLoading && attendees && (
            <div className="z-10 relative mt-4">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-indigo-200 text-xs">Tingkat Kehadiran</span>
                <span className="font-extrabold text-white text-xs">{rate}%</span>
              </div>
              <div className="bg-white/20 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-white rounded-full h-full transition-all duration-700"
                  style={{ width: `${rate}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Mini stat row ──────────────────────────────── */}
        {!isLoading && attendees && (
          <div className="grid grid-cols-3 border-slate-100 border-b divide-x divide-slate-100">
            <MiniStat value={memberCount} label="Jemaat" color="text-indigo-600" />
            <MiniStat value={guestCount}  label="Tamu"   color="text-amber-500"  />
            <MiniStat value={absentCount} label="Absen"  color="text-rose-500"   />
          </div>
        )}

        {/* ── Tab bar ────────────────────────────────────── */}
        <div className="flex gap-1.5 px-4 pt-4 pb-2 border-slate-100 border-b">
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
        <div className="flex-1 max-h-80 overflow-y-auto">
          {isLoading ? (
            <SkeletonAttendees />
          ) : list.length === 0 ? (
            <EmptyTab msg={TABS.find(t => t.key === activeTab)?.emptyMsg} />
          ) : (
            <ul className="px-4 py-2 divide-y divide-slate-50">
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
                      <p className="font-semibold text-slate-800 text-sm truncate">{name}</p>
                      {person.phone && (
                        <p className="text-slate-400 text-xs truncate">{person.phone}</p>
                      )}
                      {person.check_in_time && !isAbsent && (
                        <p className="flex items-center gap-2.5 mt-0.5 font-medium text-[10px]">
                          <span className="flex items-center gap-1 text-emerald-500" title="Jam masuk">
                            <LogIn size={10} /> {fmtTime(person.check_in_time)}
                          </span>
                          {person.check_out_time && (
                            <span className="flex items-center gap-1 text-amber-500" title="Jam keluar">
                              <LogOut size={10} /> {fmtTime(person.check_out_time)}
                            </span>
                          )}
                        </p>
                      )}
                    </div>

                    {/* Mark present — opens confirm popup */}
                    {isAbsent && !alreadyMarked && (
                      <button
                        onClick={() => setConfirmMember({ id: person.id, name })}
                        disabled={isMarking}
                        className="flex flex-shrink-0 items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-60 px-2.5 py-1.5 rounded-xl font-bold text-[11px] text-indigo-600 transition-all"
                      >
                        {isMarking ? (
                          <span className="border border-indigo-400 border-t-indigo-700 rounded-full w-3 h-3 animate-spin" />
                        ) : (
                          <CheckCircle2 size={12} />
                        )}
                        {isMarking ? 'Menyimpan…' : 'Hadir'}
                      </button>
                    )}
                    {isAbsent && alreadyMarked && (
                      <span className="flex flex-shrink-0 items-center gap-1 bg-emerald-50 px-2.5 py-1.5 rounded-xl font-bold text-[11px] text-emerald-500">
                        <CheckCircle2 size={12} /> Hadir
                      </span>
                    )}

                    {/* Face image — shown when attendance has a face detection record */}
                    {person.facedetection_id && (
                      <button
                        onClick={() => handleViewFace(person)}
                        title="Lihat gambar wajah saat absensi"
                        className="flex-shrink-0 hover:bg-indigo-50 p-2 rounded-xl text-slate-400 hover:text-indigo-600 transition-all"
                      >
                        <Eye size={16} />
                      </button>
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
      className="z-[9999] fixed inset-0 flex justify-center items-center bg-slate-900/50 backdrop-blur-sm p-4"
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

      <div className="bg-white shadow-2xl rounded-2xl w-full max-w-sm overflow-hidden confirm-card">

        {/* Icon header */}
        <div className="flex flex-col items-center px-6 pt-8 pb-5 text-center">
          <div className="flex justify-center items-center bg-indigo-50 mb-4 rounded-2xl w-14 h-14">
            <ShieldAlert size={28} className="text-indigo-500" />
          </div>
          <h3 className="mb-2 font-extrabold text-slate-800 text-base">
            Konfirmasi Kehadiran
          </h3>
          <p className="text-slate-500 text-sm leading-relaxed">
            Apakah kamu yakin ingin mengubah status{' '}
            <span className="font-bold text-slate-700">{name}</span>{' '}
            menjadi <span className="font-bold text-emerald-600">Hadir</span>?
          </p>
        </div>

        {/* Divider */}
        <div className="mx-6 border-slate-100 border-t" />

        {/* Action buttons */}
        <div className="flex gap-3 p-4">
          {/* Cancel */}
          <button
            onClick={onCancel}
            className="flex-1 hover:bg-slate-50 py-2.5 border border-slate-200 rounded-xl font-semibold text-slate-600 text-sm transition-all"
          >
            Batal
          </button>

          {/* Confirm */}
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl font-bold text-white text-sm transition-all"
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

// ── Face Image Modal ──────────────────────────────────────────
function FaceImageModal({ name, image, loading, error, onClose }) {
  return (
    <div
      className="z-[9999] fixed inset-0 flex justify-center items-center bg-slate-900/50 backdrop-blur-sm p-4"
      style={{ animation: 'backdropIn .2s ease' }}
    >
      <style>{`
        @keyframes backdropIn { from { opacity:0; } to { opacity:1; } }
        @keyframes modalIn {
          from { opacity:0; transform:scale(0.92) translateY(16px); }
          to   { opacity:1; transform:scale(1)    translateY(0);    }
        }
        .face-modal-card { animation: modalIn .25s cubic-bezier(0.34,1.56,0.64,1); }
      `}</style>

      <div className="bg-white shadow-2xl rounded-2xl w-full max-w-sm overflow-hidden face-modal-card">
        {/* Header */}
        <div className="flex justify-between items-center px-5 py-4 border-slate-100 border-b">
          <div className="min-w-0">
            <h3 className="font-extrabold text-slate-800 text-sm truncate">{name}</h3>
            <p className="font-medium text-[11px] text-slate-400">Gambar wajah saat absensi</p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 hover:bg-slate-100 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {loading ? (
            <div className="flex flex-col justify-center items-center gap-2 bg-slate-100 rounded-xl w-full aspect-square animate-pulse">
              <span className="border-2 border-indigo-300 border-t-indigo-600 rounded-full w-6 h-6 animate-spin" />
              <span className="font-medium text-slate-400 text-xs">Memuat gambar…</span>
            </div>
          ) : error ? (
            <div className="flex flex-col justify-center items-center gap-2 bg-rose-50 px-6 rounded-xl w-full aspect-square text-center">
              <ShieldAlert size={24} className="text-rose-300" />
              <p className="font-medium text-rose-400 text-xs">{error}</p>
            </div>
          ) : (
            <img
              src={image}
              alt={`Wajah ${name}`}
              className="shadow-sm rounded-xl w-full object-cover aspect-square"
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

function InfoChip({ icon: Icon, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-white/15 px-3 py-1 rounded-full font-medium text-white/90 text-xs">
      {createElement(Icon, { size: 12, className: 'text-white/70' })}{label}
    </span>
  );
}

function MiniStat({ value, label, color }) {
  return (
    <div className="flex flex-col items-center py-3">
      <span className={`text-xl font-extrabold ${color}`}>{value}</span>
      <span className="font-semibold text-[10px] text-slate-400 uppercase tracking-wide">{label}</span>
    </div>
  );
}

function SkeletonAttendees() {
  return (
    <div className="space-y-3 px-4 py-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 animate-pulse">
          <div className="flex-shrink-0 bg-slate-200 rounded-xl w-9 h-9" />
          <div className="flex-1 space-y-1.5">
            <div className="bg-slate-200 rounded w-2/3 h-3" />
            <div className="bg-slate-100 rounded w-1/3 h-2.5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyTab({ msg }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="flex justify-center items-center bg-slate-100 rounded-xl w-10 h-10">
        <Inbox size={18} className="text-slate-300" />
      </div>
      <p className="font-medium text-slate-400 text-xs">{msg}</p>
    </div>
  );
}
