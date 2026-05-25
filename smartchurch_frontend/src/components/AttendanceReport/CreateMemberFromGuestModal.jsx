import { useState } from 'react';
import { X, Loader2, UserPlus } from 'lucide-react';
import { createMember, updateGuest } from '../../service/apiClient';

export default function CreateMemberFromGuestModal({ guest, onClose, onCreated }) {
  const [form, setForm] = useState({
    full_name: guest.full_name || '',
    nickname: '',
    gender: 'L',
    birth_date: '',
    phone: guest.phone || '',
    email: '',
    address: '',
    member_status: 'active',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.gender) {
      setError('Nama lengkap dan jenis kelamin wajib diisi.');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const payload = { ...form };
      if (!payload.birth_date) delete payload.birth_date;
      if (!payload.email) delete payload.email;
      if (!payload.address) delete payload.address;
      if (!payload.nickname) delete payload.nickname;

      const newMember = await createMember(payload);
      await updateGuest(guest.id, { converted_to_member: newMember.id });
      onCreated();
    } catch {
      setError('Gagal membuat anggota. Coba lagi.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="z-60 fixed inset-0 flex justify-center items-center bg-black/50 p-4">
      <div className="bg-white shadow-2xl rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center px-6 py-4 border-slate-100 border-b">
          <div>
            <p className="font-bold text-slate-700 text-sm">Jadikan Anggota</p>
            <p className="text-slate-400 text-xs">Data dari tamu: {guest.full_name}</p>
          </div>
          <button onClick={onClose} className="flex justify-center items-center hover:bg-slate-100 rounded-lg w-7 h-7 text-slate-400 transition-colors">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
          <div>
            <label className="block mb-1 font-semibold text-slate-600 text-xs">Nama Lengkap *</label>
            <input
              value={form.full_name}
              onChange={set('full_name')}
              required
              placeholder="Nama lengkap"
              className="border-slate-200 px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300 w-full text-slate-700 text-sm"
            />
          </div>

          <div className="gap-3 grid grid-cols-2">
            <div>
              <label className="block mb-1 font-semibold text-slate-600 text-xs">Nama Panggilan</label>
              <input
                value={form.nickname}
                onChange={set('nickname')}
                placeholder="Opsional"
                className="border-slate-200 px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300 w-full text-slate-700 text-sm"
              />
            </div>
            <div>
              <label className="block mb-1 font-semibold text-slate-600 text-xs">Jenis Kelamin *</label>
              <select
                value={form.gender}
                onChange={set('gender')}
                required
                className="border-slate-200 px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300 w-full text-slate-700 text-sm"
              >
                <option value="L">Laki-laki</option>
                <option value="P">Perempuan</option>
              </select>
            </div>
          </div>

          <div className="gap-3 grid grid-cols-2">
            <div>
              <label className="block mb-1 font-semibold text-slate-600 text-xs">Tanggal Lahir</label>
              <input
                type="date"
                value={form.birth_date}
                onChange={set('birth_date')}
                className="border-slate-200 px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300 w-full text-slate-700 text-sm"
              />
            </div>
            <div>
              <label className="block mb-1 font-semibold text-slate-600 text-xs">No. HP</label>
              <input
                value={form.phone}
                onChange={set('phone')}
                placeholder="Opsional"
                className="border-slate-200 px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300 w-full text-slate-700 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block mb-1 font-semibold text-slate-600 text-xs">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={set('email')}
              placeholder="Opsional"
              className="border-slate-200 px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300 w-full text-slate-700 text-sm"
            />
          </div>

          <div>
            <label className="block mb-1 font-semibold text-slate-600 text-xs">Alamat</label>
            <textarea
              value={form.address}
              onChange={set('address')}
              rows={2}
              placeholder="Opsional"
              className="border-slate-200 px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300 w-full text-slate-700 text-sm resize-none"
            />
          </div>

          {error && <p className="text-red-500 text-xs">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl font-semibold text-slate-500 text-sm hover:bg-slate-100 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 bg-linear-to-br from-emerald-500 to-teal-500 disabled:opacity-60 px-4 py-2 rounded-xl font-semibold text-white text-sm transition-all"
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              Daftarkan sebagai Anggota
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
