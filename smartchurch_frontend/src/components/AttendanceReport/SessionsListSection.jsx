import { useState } from 'react';
import { CalendarDays, Search, Eye, ChevronLeft, ChevronRight, CheckCircle2, XCircle, UserRound } from 'lucide-react';

const PAGE_SIZE = 5;

function formatSessionDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export default function SessionsListSection({ sessions, isLoading, onSessionClick }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const filtered = sessions.filter(s => {
    const searchLower = search.toLowerCase();
    const dateMatch = formatSessionDate(s.date).toLowerCase().includes(searchLower);
    const nameMatch = s.session_name?.toLowerCase().includes(searchLower) ?? false;
    return dateMatch || nameMatch;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSearch = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  return (
    <div className="bg-white shadow-sm border border-slate-100 rounded-2xl overflow-hidden">
      <div className="flex sm:flex-row flex-col sm:items-center gap-3 px-5 py-4 border-slate-100 border-b">
        <div className="flex items-center gap-2.5">
          <div className="flex justify-center items-center bg-linear-to-br from-blue-500 to-indigo-500 rounded-xl w-8 h-8 shrink-0">
            <CalendarDays size={15} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-slate-700 text-sm">Daftar Sesi Ibadah</p>
            <p className="text-slate-400 text-xs">Semua sesi yang pernah dilakukan</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:ml-auto w-full sm:w-auto">
          <div className="relative w-full sm:w-auto">
            <Search size={13} className="top-1/2 left-3 absolute text-slate-400 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={handleSearch}
              placeholder="Cari tanggal atau nama ibadah..."
              className="bg-slate-50 hover:bg-white focus:bg-white py-2 pr-4 pl-8 border border-slate-200 focus:border-indigo-300 rounded-xl outline-none focus:ring-2 focus:ring-indigo-100 w-full sm:w-64 text-sm transition-all"
            />
          </div>
          {!isLoading && (
            <span className="bg-blue-100 px-2.5 py-1 rounded-full font-semibold text-blue-700 text-xs whitespace-nowrap">
              {filtered.length} sesi
            </span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-slate-100 border-b">
              <th className="px-5 py-3 font-semibold text-slate-400 text-xs text-left uppercase tracking-wider">Sesi Ibadah</th>
              <th className="px-5 py-3 font-semibold text-slate-400 text-xs text-left uppercase tracking-wider">Kehadiran</th>
              <th className="px-5 py-3 font-semibold text-slate-400 text-xs text-left uppercase tracking-wider">Tingkat Hadir</th>
              <th className="px-5 py-3 font-semibold text-slate-400 text-xs text-right uppercase tracking-wider">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {[1, 2, 3, 4].map(j => (
                    <td key={j} className="px-5 py-4">
                      <div className="bg-slate-100 rounded-lg w-full h-4 animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-12 text-center">
                  <div className="flex justify-center items-center bg-slate-100 mx-auto mb-2 rounded-2xl w-10 h-10">
                    <CalendarDays size={18} className="text-slate-400" />
                  </div>
                  <p className="text-slate-400 text-sm">
                    {search ? 'Sesi tidak ditemukan' : 'Belum ada data sesi ibadah'}
                  </p>
                </td>
              </tr>
            ) : (
              paged.map(session => {
                const eligible = session.member_count + (session.absent_count ?? 0);
                const memberPct = eligible > 0 ? Math.round((session.member_count / eligible) * 100) : 0;
                return (
                  <tr key={session.session_id || session.date} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-slate-700 text-sm">{formatSessionDate(session.date)}</p>
                      <p className="mt-0.5 text-slate-400 text-xs">{session.session_name || 'Ibadah Jemaat'}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                          <span className="font-semibold text-emerald-600 text-xs">{session.member_count} Anggota</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <UserRound size={13} className="text-amber-500 shrink-0" />
                          <span className="font-semibold text-amber-500 text-xs">{session.guest_count} Tamu</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <XCircle size={13} className="text-red-400 shrink-0" />
                          <span className="font-semibold text-red-400 text-xs">{session.absent_count ?? 0} Absen</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="bg-slate-100 rounded-full w-24 h-1.5 overflow-hidden">
                          <div
                            className="bg-linear-to-r from-indigo-400 to-indigo-600 rounded-full h-full transition-all"
                            style={{ width: `${memberPct}%` }}
                          />
                        </div>
                        <span className="font-semibold tabular-nums text-slate-500 text-xs">{memberPct}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end items-center">
                        <button
                          onClick={() => onSessionClick(session)}
                          className="flex justify-center items-center hover:bg-indigo-50 rounded-lg w-7 h-7 text-indigo-400 hover:text-indigo-600 transition-colors"
                          title="Lihat peserta"
                        >
                          <Eye size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > PAGE_SIZE && (
        <div className="flex justify-between items-center bg-slate-50/60 px-5 py-3 border-slate-100 border-t">
          <p className="text-slate-400 text-xs">
            <span className="font-semibold text-slate-600">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)}</span>
            {' '}dari{' '}
            <span className="font-semibold text-slate-600">{filtered.length}</span> sesi
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage(p => p - 1)}
              disabled={page <= 1}
              className="flex justify-center items-center hover:bg-slate-100 disabled:opacity-40 rounded-lg w-7 h-7 text-slate-500 transition-colors disabled:cursor-not-allowed"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="tabular-nums text-slate-500 text-xs">{page} / {totalPages}</span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page >= totalPages}
              className="flex justify-center items-center hover:bg-slate-100 disabled:opacity-40 rounded-lg w-7 h-7 text-slate-500 transition-colors disabled:cursor-not-allowed"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
