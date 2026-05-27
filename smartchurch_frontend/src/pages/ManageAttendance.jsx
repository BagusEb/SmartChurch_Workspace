import { useState, useEffect } from 'react';
import { Search, Edit, Trash2, UserCheck, User, Clock, Calendar, CheckCircle2, AlertCircle } from 'lucide-react';

export default function ManageAttendance() {
  const [attendances, setAttendances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchAttendances = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://127.0.0.1:8000/api/attendances/');
      if (response.ok) {
        const data = await response.json();
        setAttendances(data);
      } else {
        console.error("Gagal mengambil data absensi");
      }
    } catch (error) {
      console.error("Error fetching attendances:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendances();
  }, []);

  const filteredData = attendances.filter(item => 
    item.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getConfidenceColor = (confidence) => {
    if (confidence >= 90) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (confidence >= 70) return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-rose-100 text-rose-700 border-rose-200';
  };

  return (
    <div className="font-sans max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Manajemen Absensi</h1>
          <p className="text-sm text-slate-500 mt-1">Kelola dan tinjau data kehadiran jemaat & tamu secara realtime.</p>
        </div>
        
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Cari nama jemaat atau tamu..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-sm"
          />
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-4 font-semibold text-slate-600">Profil Kehadiran</th>
                <th className="px-6 py-4 font-semibold text-slate-600">Sesi Ibadah</th>
                <th className="px-6 py-4 font-semibold text-slate-600">Waktu Kedatangan</th>
                <th className="px-6 py-4 font-semibold text-slate-600">Tingkat Akurasi (AI)</th>
                <th className="px-6 py-4 font-semibold text-slate-600 text-right">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                // Skeleton Loading
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="px-6 py-4">
                      <div className="h-4 bg-slate-200 rounded w-32 mb-2"></div>
                      <div className="h-3 bg-slate-100 rounded w-16"></div>
                    </td>
                    <td className="px-6 py-4"><div className="h-4 bg-slate-200 rounded w-24"></div></td>
                    <td className="px-6 py-4">
                      <div className="h-4 bg-slate-200 rounded w-28 mb-2"></div>
                      <div className="h-3 bg-slate-100 rounded w-20"></div>
                    </td>
                    <td className="px-6 py-4"><div className="h-6 bg-slate-200 rounded-full w-16"></div></td>
                    <td className="px-6 py-4 text-right"><div className="h-8 bg-slate-200 rounded w-16 ml-auto"></div></td>
                  </tr>
                ))
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center space-y-3 text-slate-400">
                      <AlertCircle size={40} className="text-slate-300" />
                      <p className="text-base font-medium text-slate-500">Tidak ada data absensi ditemukan.</p>
                      <p className="text-sm">Coba sesuaikan kata kunci pencarian Anda.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredData.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-800">{row.display_name}</div>
                      <div className={`inline-flex items-center gap-1 px-2.5 py-0.5 mt-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                        row.status_type === 'Member' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : 'bg-orange-50 text-orange-700 border-orange-100'
                      }`}>
                        {row.status_type === 'Member' ? <UserCheck size={12} /> : <User size={12} />}
                        {row.status_type}
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <span className="font-medium text-slate-700 bg-slate-100 px-3 py-1 rounded-lg">
                        {row.session_name || "Sesi Reguler"}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-slate-700 font-medium mb-1">
                        <Calendar size={14} className="text-indigo-400" />
                        {new Date(row.attendance_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-500 text-xs font-medium">
                        <Clock size={14} className="text-indigo-300" />
                        {new Date(row.check_in_time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${getConfidenceColor(row.confidence)}`}>
                        {row.confidence >= 90 ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                        {row.confidence}%
                      </div>
                    </td>

                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all shadow-sm border border-transparent hover:border-indigo-100">
                          <Edit size={16} />
                        </button>
                        <button className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all shadow-sm border border-transparent hover:border-rose-100">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}