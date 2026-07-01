// ============================================================
//  ManageAttendance.jsx  —  Parent / Page Component
// ============================================================
import { createElement, useState, useEffect } from 'react';
import { getSessions, getSessionAttendees, markMemberPresent } from '../service/apiClient';
import { ClipboardList, Filter, Users, UserCheck, UserX, CalendarDays } from 'lucide-react';
import SessionsListSection from '../components/ManageAttendanceSession/SessionsListSection';
import SessionDetailPanel  from '../components/ManageAttendanceSession/SessionDetailPanel';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS  = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);
const ATTENDEE_LIST_KEYS = ['members', 'guests', 'absent'];

const uniqueById = (items = []) => {
  const seen = new Set();
  return items.filter((item, idx) => {
    const key = item?.id ?? `idx-${idx}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const normalizeAttendees = (data = {}) =>
  ATTENDEE_LIST_KEYS.reduce((acc, key) => {
    acc[key] = uniqueById(data[key]);
    return acc;
  }, {});

export default function ManageAttendance() {
  const [selectedYear,       setSelectedYear]       = useState(String(CURRENT_YEAR));
  const [sessions,           setSessions]           = useState([]);
  const [isLoadingSessions,  setIsLoadingSessions]  = useState(true);
  const [selectedSession,    setSelectedSession]    = useState(null);
  const [sessionAttendees,   setSessionAttendees]   = useState(null);
  const [isLoadingAttendees, setIsLoadingAttendees] = useState(false);

  // ── Fetch sessions whenever year changes ─────────────────
  useEffect(() => {
    const fetchSessions = async () => {
      setIsLoadingSessions(true);
      setSelectedSession(null);
      setSessionAttendees(null);
      try {
        const data = await getSessions(selectedYear);
        setSessions(data);
      } catch (e) {
        console.error('Failed to fetch sessions:', e);
      } finally {
        setIsLoadingSessions(false);
      }
    };
    fetchSessions();
  }, [selectedYear]);

  // ── Select a session → load its attendees ────────────────
  const handleSessionClick = async (session) => {
    setSelectedSession(session);
    setSessionAttendees(null);
    setIsLoadingAttendees(true);
    try {
      const data = await getSessionAttendees(session.session_id);
      setSessionAttendees(normalizeAttendees(data));
    } catch {
      setSessionAttendees({ members: [], guests: [], absent: [] });
    } finally {
      setIsLoadingAttendees(false);
    }
  };

  // ── Mark a member as present ─────────────────────────────
  const handleMarkPresent = async (memberId) => {
    if (!selectedSession) return;
    try {
      await markMemberPresent(selectedSession.session_id, memberId);
      const [attendeesData, sessionsData] = await Promise.all([
        getSessionAttendees(selectedSession.session_id),
        getSessions(selectedYear),
      ]);
      setSessionAttendees(normalizeAttendees(attendeesData));
      setSessions(sessionsData);
      const updated = sessionsData.find(s => s.session_id === selectedSession.session_id);
      if (updated) setSelectedSession(updated);
    } catch (error) {
      console.error('Failed to mark present:', error);
      alert(error.response?.data?.error || 'Gagal menandai kehadiran. Silakan coba lagi.');
    }
  };

  // ── Summary stats computed from sessions list ────────────
  const totalSessions = sessions.length;
  const sessionMemberIds = sessions.flatMap(x => x.member_ids ?? []);
  const totalHadir    = sessionMemberIds.length > 0
    ? new Set(sessionMemberIds).size
    : sessions.reduce((s, x) => s + (x.member_count  ?? 0), 0);
  const sessionGuestIds = sessions.flatMap(x => x.guest_ids ?? []);
  const totalTamu     = sessionGuestIds.length > 0
    ? new Set(sessionGuestIds).size
    : sessions.reduce((s, x) => s + (x.guest_count   ?? 0), 0);
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        .manage-root { font-family: 'Plus Jakarta Sans', sans-serif; }
        .fade-in-up  { animation: fuIn .35s ease both; }
        @keyframes fuIn {
          from { opacity:0; transform:translateY(10px); }
          to   { opacity:1; transform:translateY(0);    }
        }
        .year-select { appearance: none; -webkit-appearance: none; cursor:pointer; }
      `}</style>

      <div className="manage-root flex flex-col gap-6 h-full">

        {/* ── PAGE HEADER ─────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 fade-in-up">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl shadow-sm">
              <ClipboardList size={26} strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight">Daftar Sesi Ibadah</h2>
              <p className="text-sm text-slate-500 mt-0.5">Kelola dan tinjau riwayat sesi ibadah beserta data jemaat yang hadir</p>
            </div>
          </div>

          {/* Year Filter */}
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl px-4 py-2.5 shadow-sm">
            <Filter size={15} className="text-slate-400 flex-shrink-0" />
            <span className="text-sm font-semibold text-slate-500">Tahun:</span>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(e.target.value)}
              className="year-select bg-transparent text-sm font-bold text-slate-700 focus:outline-none pr-1"
            >
              {YEAR_OPTIONS.map(y => <option key={y} value={String(y)}>{y}</option>)}
            </select>
          </div>
        </div>

        {/* ── STAT SUMMARY ────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 fade-in-up" style={{ animationDelay: '.05s' }}>
          <StatCard icon={CalendarDays} label="Total Sesi"  value={totalSessions} gradient="from-indigo-500 to-violet-600" shadow="shadow-indigo-200" sub="Tahun ini" />
          <StatCard icon={Users}        label="Total Hadir" value={totalHadir}    gradient="from-emerald-500 to-teal-600"  shadow="shadow-emerald-200" sub="Jemaat tetap" />
          <StatCard icon={UserCheck}    label="Total Tamu"  value={totalTamu}     gradient="from-amber-500 to-orange-500"  shadow="shadow-amber-200"   sub="Tamu gereja" />
        </div>

        {/* ── SPLIT PANEL ─────────────────────────────── */}
        <div className="flex flex-col lg:flex-row gap-6 items-start flex-1 fade-in-up" style={{ animationDelay: '.10s' }}>
          <div className="w-full lg:w-3/5 xl:w-2/3">
            <SessionsListSection
              sessions={sessions}
              isLoading={isLoadingSessions}
              onSessionClick={handleSessionClick}
              selectedSession={selectedSession}
            />
          </div>
          <div className="w-full lg:w-2/5 xl:w-1/3 sticky top-6">
            <SessionDetailPanel
              session={selectedSession}
              attendees={sessionAttendees}
              isLoading={isLoadingAttendees}
              onMarkPresent={handleMarkPresent}
            />
          </div>
        </div>
      </div>
    </>
  );
}

// ── Mini stat card ──────────────────────────────────────────
function StatCard({ icon: Icon, label, value, gradient, shadow, sub }) {
  return (
    <div className={`bg-gradient-to-br ${gradient} rounded-2xl p-4 text-white shadow-lg ${shadow}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-white/70 text-xs font-semibold uppercase tracking-wide">{label}</p>
          <p className="text-3xl font-extrabold mt-1">{value}</p>
          <p className="text-white/60 text-xs mt-1">{sub}</p>
        </div>
        <div className="bg-white/20 rounded-xl p-2 mt-0.5">
          {createElement(Icon, { size: 18, className: 'text-white' })}
        </div>
      </div>
    </div>
  );
}
