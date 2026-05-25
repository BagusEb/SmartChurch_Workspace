import { useState } from 'react';
import { X, Users, UserCheck, UserPlus, Loader2 } from 'lucide-react';

export default function SessionAttendeesModal({ session, attendees, isLoading, onClose }) {
  const [tab, setTab] = useState('members');

  const list = attendees ? (tab === 'members' ? attendees.members : attendees.guests) : [];

  return (
    <div className="z-50 fixed inset-0 flex justify-center items-center bg-black/50 p-4">
      <div className="bg-white shadow-2xl rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col">
        <div className="flex items-center gap-2.5 px-6 py-4 border-slate-100 border-b shrink-0">
          <div className="flex justify-center items-center bg-linear-to-br from-blue-500 to-indigo-500 rounded-xl w-8 h-8 shrink-0">
            <Users size={15} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-700 text-sm">Peserta Ibadah</p>
            <p className="text-slate-400 text-xs">{session.date}</p>
          </div>
          <button onClick={onClose} className="flex justify-center items-center hover:bg-slate-100 rounded-lg w-7 h-7 text-slate-400 transition-colors shrink-0">
            <X size={15} />
          </button>
        </div>

        {/* Stats row */}
        <div className="flex border-slate-100 border-b shrink-0">
          <div className="flex-1 py-3 text-center">
            <p className="font-extrabold text-slate-700 text-lg">{session.total}</p>
            <p className="text-slate-400 text-xs">Total Hadir</p>
          </div>
          <div className="flex-1 py-3 border-slate-100 border-x text-center">
            <p className="font-extrabold text-indigo-600 text-lg">{session.member_count}</p>
            <p className="text-slate-400 text-xs">Anggota</p>
          </div>
          <div className="flex-1 py-3 border-slate-100 border-r text-center">
            <p className="font-extrabold text-amber-500 text-lg">{session.guest_count}</p>
            <p className="text-slate-400 text-xs">Tamu</p>
          </div>
          <div className="flex-1 py-3 text-center">
            <p className="font-extrabold text-red-400 text-lg">{session.absent_count ?? 0}</p>
            <p className="text-slate-400 text-xs">Absen</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-slate-100 border-b shrink-0">
          <button
            onClick={() => setTab('members')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors ${tab === 'members' ? 'text-indigo-600 border-b-2 border-indigo-500' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <UserCheck size={13} />
            Anggota ({attendees?.members?.length ?? 0})
          </button>
          <button
            onClick={() => setTab('guests')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors ${tab === 'guests' ? 'text-amber-600 border-b-2 border-amber-500' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <UserPlus size={13} />
            Tamu ({attendees?.guests?.length ?? 0})
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col justify-center items-center py-12 gap-2">
              <Loader2 size={20} className="text-indigo-400 animate-spin" />
              <p className="text-slate-400 text-sm">Memuat peserta...</p>
            </div>
          ) : list.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-slate-400 text-sm">Tidak ada data {tab === 'members' ? 'anggota' : 'tamu'}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50 px-2 py-1">
              {list.map((person, idx) => (
                <div key={person.id ?? idx} className="flex justify-between items-center px-3 py-2.5">
                  <div>
                    <p className="font-semibold text-slate-700 text-sm">{person.full_name}</p>
                    {person.phone && <p className="text-slate-400 text-xs">{person.phone}</p>}
                  </div>
                  {tab === 'guests' && person.visit_count != null && (
                    <span className="bg-amber-100 px-2 py-0.5 rounded-full font-medium text-amber-700 text-xs shrink-0">
                      {person.visit_count}× kunjungan
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end px-6 py-4 border-slate-100 border-t shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl font-semibold text-slate-500 text-sm hover:bg-slate-100 transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
