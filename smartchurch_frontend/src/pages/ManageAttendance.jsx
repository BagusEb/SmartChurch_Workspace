// ============================================================
//  ManageAttendance.jsx
// ============================================================

import { useState, useEffect, useMemo } from 'react';
import {
  Search, Edit, Trash2, Clock, Calendar,
  CheckCircle2, AlertCircle, Users,
  RefreshCw, X, Eye, ClipboardList
} from 'lucide-react';
import { getAttendances } from '../service/apiClient';

// ============================================================
//  HELPERS
// ============================================================

const getInitials = (name = '') =>
  name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();

const avatarColors = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-cyan-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-indigo-500 to-blue-600',
];
const getAvatarColor = (name = '') =>
  avatarColors[(name.charCodeAt(0) || 0) % avatarColors.length];

const getConfidenceBadgeClass = (confidence) => {
  if (confidence >= 90) return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  if (confidence >= 70) return 'bg-amber-50 text-amber-700 border border-amber-200';
  return 'bg-red-50 text-red-600 border border-red-200';
};

// ============================================================
//  MAIN COMPONENT
// ============================================================
export default function ManageAttendance() {

  const [attendances, setAttendances]           = useState([]);
  const [isLoading, setIsLoading]               = useState(true);
  const [searchQuery, setSearchQuery]           = useState('');
  const [activeTab, setActiveTab]               = useState('all');
  const [isViewModalOpen, setIsViewModalOpen]   = useState(false);
  const [selectedAttendance, setSelectedAttendance] = useState(null);

  // ── API ──────────────────────────────────────────────────
  const fetchAttendances = async () => {
    try {
      setIsLoading(true);
      const data = await getAttendances();
      setAttendances(data);
    } catch (error) {
      console.error('Failed to fetch attendances:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchAttendances(); }, []);

  // ── Derived ──────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:   attendances.length,
    members: attendances.filter(a => a.status_type === 'Member').length,
    guests:  attendances.filter(a => a.status_type === 'Guest').length,
  }), [attendances]);

  const filteredData = useMemo(() =>
    attendances.filter(item => {
      const matchSearch = item.display_name?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchTab    = activeTab === 'all' || item.status_type === activeTab;
      return matchSearch && matchTab;
    }),
    [attendances, searchQuery, activeTab]
  );

  const openViewModal = (row) => {
    setSelectedAttendance(row);
    setIsViewModalOpen(true);
  };

  // ── Render ───────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

        .attendance-root { font-family: 'Plus Jakarta Sans', sans-serif; }

        .fade-in { animation: fadeIn 0.3s ease; }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .row-hover:hover { background: linear-gradient(90deg, #f8f7ff 0%, #ffffff 100%); }

        .modal-backdrop { animation: backdropIn 0.2s ease; }
        @keyframes backdropIn { from { opacity: 0; } to { opacity: 1; } }

        .modal-card { animation: modalIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); }
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.92) translateY(20px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }

        .view-btn:hover   { box-shadow: 0 0 0 3px rgba(99,102,241,0.15); }
        .edit-btn:hover   { box-shadow: 0 0 0 3px rgba(234,179,8,0.15); }
        .delete-btn:hover { box-shadow: 0 0 0 3px rgba(239,68,68,0.15); }
      `}</style>

      <div className="attendance-root">

        {/* ── PAGE HEADER ───────────────────────────────── */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
              <ClipboardList size={26} strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight">Manajemen Absensi</h2>
              <p className="text-sm text-slate-500 mt-0.5">Kelola dan tinjau data kehadiran jemaat & tamu secara realtime</p>
            </div>
          </div>
          <button
            onClick={fetchAttendances}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all"
          >
            <RefreshCw size={15} />
            Refresh Data
          </button>
        </div>

        {/* ── STAT CARDS ────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">

          <div className="bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl p-4 text-white shadow-lg shadow-indigo-200">
            <p className="text-indigo-200 text-xs font-semibold uppercase tracking-wide">Total Absensi</p>
            <p className="text-3xl font-extrabold mt-1">{stats.total}</p>
            <div className="mt-2 flex items-center gap-1.5">
              <Users size={13} className="text-indigo-300" />
              <span className="text-indigo-200 text-xs">Semua sesi</span>
            </div>
          </div>

          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-4 text-white shadow-lg shadow-emerald-200">
            <p className="text-emerald-200 text-xs font-semibold uppercase tracking-wide">Jemaat Tetap</p>
            <p className="text-3xl font-extrabold mt-1">{stats.members}</p>
            <div className="mt-2 w-full bg-emerald-400/40 rounded-full h-1.5">
              <div
                className="bg-white rounded-full h-1.5 transition-all"
                style={{ width: stats.total ? `${(stats.members / stats.total) * 100}%` : '0%' }}
              />
            </div>
          </div>

          <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-4 text-white shadow-lg shadow-amber-200">
            <p className="text-amber-100 text-xs font-semibold uppercase tracking-wide">Tamu</p>
            <p className="text-3xl font-extrabold mt-1">{stats.guests}</p>
            <div className="mt-2 w-full bg-amber-400/40 rounded-full h-1.5">
              <div
                className="bg-white rounded-full h-1.5 transition-all"
                style={{ width: stats.total ? `${(stats.guests / stats.total) * 100}%` : '0%' }}
              />
            </div>
          </div>
        </div>

        {/* ── MAIN TABLE CARD ───────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">

          {/* Toolbar */}
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
              {[
                { key: 'all',    label: 'Semua'  },
                { key: 'Member', label: 'Jemaat' },
                { key: 'Guest',  label: 'Tamu'   },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeTab === tab.key
                      ? 'bg-white text-indigo-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative flex-1 max-w-xs">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cari nama jemaat atau tamu..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all placeholder:text-slate-400"
              />
            </div>

            <span className="text-xs text-slate-400 ml-auto">{filteredData.length} data ditemukan</span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="px-5 py-3.5">Profil Kehadiran</th>
                  <th className="px-5 py-3.5">Sesi Ibadah</th>
                  <th className="px-5 py-3.5">Waktu Kedatangan</th>
                  <th className="px-5 py-3.5">Akurasi AI</th>
                  <th className="px-5 py-3.5 text-center">Aksi</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-50">
                {isLoading ? (
                  <tr>
                    <td colSpan="5" className="py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                        <span className="text-sm text-slate-400">Memuat data absensi...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredData.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-16 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                          <ClipboardList size={22} className="text-slate-400" />
                        </div>
                        <p className="text-sm font-medium text-slate-500">Tidak ada data absensi ditemukan</p>
                        <p className="text-xs text-slate-400">Coba sesuaikan kata kunci atau pilih tab lain.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredData.map(row => (
                    <tr key={row.id} className="row-hover transition-colors fade-in">

                      {/* Profil */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${getAvatarColor(row.display_name)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm`}>
                            {getInitials(row.display_name)}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800 text-sm">{row.display_name}</p>
                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 mt-1 rounded-lg ${
                              row.status_type === 'Member'
                                ? 'bg-indigo-50 text-indigo-600'
                                : 'bg-amber-50 text-amber-600'
                            }`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-current" />
                              {row.status_type === 'Member' ? 'Jemaat' : 'Tamu'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Sesi */}
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg bg-violet-50 text-violet-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                          {row.session_name || 'Sesi Reguler'}
                        </span>
                      </td>

                      {/* Waktu */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                          <Calendar size={13} className="text-indigo-400 flex-shrink-0" />
                          {new Date(row.attendance_date).toLocaleDateString('id-ID', {
                            day: 'numeric', month: 'long', year: 'numeric'
                          })}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
                          <Clock size={12} className="text-slate-300 flex-shrink-0" />
                          {new Date(row.check_in_time).toLocaleTimeString('id-ID', {
                            hour: '2-digit', minute: '2-digit'
                          })} WIB
                        </div>
                      </td>

                      {/* Akurasi */}
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg ${getConfidenceBadgeClass(row.confidence)}`}>
                          {row.confidence >= 90
                            ? <CheckCircle2 size={12} />
                            : <AlertCircle size={12} />}
                          {row.confidence}%
                        </span>
                      </td>

                      {/* Aksi */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-center gap-1.5">
                          <button onClick={() => openViewModal(row)} className="view-btn p-2 bg-indigo-50 text-indigo-500 hover:bg-indigo-100 rounded-lg transition-all" title="Lihat Detail">
                            <Eye size={15} />
                          </button>
                          <button className="edit-btn p-2 bg-amber-50 text-amber-500 hover:bg-amber-100 rounded-lg transition-all" title="Edit Data">
                            <Edit size={15} />
                          </button>
                          <button className="delete-btn p-2 bg-red-50 text-red-500 hover:bg-red-100 rounded-lg transition-all" title="Hapus Data">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>

                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          {!isLoading && filteredData.length > 0 && (
            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Menampilkan <span className="font-semibold text-slate-600">{filteredData.length}</span> dari{' '}
                <span className="font-semibold text-slate-600">{attendances.length}</span> data absensi
              </span>
              <span className="text-xs text-slate-400">
                Diperbarui: {new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
              </span>
            </div>
          )}
        </div>

        {/* ── VIEW DETAIL MODAL ─────────────────────────── */}
        {isViewModalOpen && selectedAttendance && (
          <div className="modal-backdrop fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="modal-card bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

              <div className="relative bg-gradient-to-br from-indigo-500 via-violet-600 to-purple-700 p-8 text-white">
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="absolute top-4 right-4 p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                >
                  <X size={18} />
                </button>

                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${getAvatarColor(selectedAttendance.display_name)} shadow-xl flex items-center justify-center text-white text-2xl font-extrabold mb-4 border-2 border-white/30`}>
                  {getInitials(selectedAttendance.display_name)}
                </div>

                <h3 className="text-xl font-extrabold leading-tight">{selectedAttendance.display_name}</h3>
                <p className="text-indigo-200 text-sm mt-1">
                  {selectedAttendance.status_type === 'Member' ? 'Jemaat Tetap' : 'Tamu'}
                </p>

                <span className={`mt-3 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${
                  selectedAttendance.confidence >= 90
                    ? 'bg-emerald-400/20 text-emerald-200'
                    : selectedAttendance.confidence >= 70
                    ? 'bg-amber-400/20 text-amber-200'
                    : 'bg-red-400/20 text-red-200'
                }`}>
                  {selectedAttendance.confidence >= 90
                    ? <CheckCircle2 size={12} />
                    : <AlertCircle size={12} />}
                  Akurasi AI: {selectedAttendance.confidence}%
                </span>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 rounded-xl p-4">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Tanggal Hadir</p>
                    <p className="text-sm font-semibold text-slate-700">
                      {new Date(selectedAttendance.attendance_date).toLocaleDateString('id-ID', {
                        day: 'numeric', month: 'long', year: 'numeric'
                      })}
                    </p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Waktu Masuk</p>
                    <p className="text-sm font-semibold text-slate-700">
                      {new Date(selectedAttendance.check_in_time).toLocaleTimeString('id-ID', {
                        hour: '2-digit', minute: '2-digit'
                      })} WIB
                    </p>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Sesi Ibadah</p>
                  <p className="text-sm font-semibold text-slate-700">{selectedAttendance.session_name || 'Sesi Reguler'}</p>
                </div>

                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Status Kehadiran</p>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg ${
                    selectedAttendance.status_type === 'Member'
                      ? 'bg-indigo-50 text-indigo-600'
                      : 'bg-amber-50 text-amber-600'
                  }`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    {selectedAttendance.status_type === 'Member' ? 'Jemaat Tetap' : 'Tamu'}
                  </span>
                </div>
              </div>

              <div className="px-6 pb-6">
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all"
                >
                  Tutup
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </>
  );
}