import { useState } from 'react';
import { X, Loader2, Save } from 'lucide-react';
import { updateFollowUpStatus } from '../../service/apiClient';

const STATUS_OPTIONS = [
  { value: 'new', label: 'Baru' },
  { value: 'resolved', label: 'Selesai' },
  { value: 'closed', label: 'Ditutup' },
];

const PROGRESS_OPTIONS = [
  { value: 'not_yet', label: 'Belum Ditindak Lanjuti' },
  { value: 'followed_up', label: 'Sudah Ditindak Lanjuti' },
  { value: 'need_more', label: 'Perlu Tindak Lanjut Lagi' },
  { value: 'completed', label: 'Selesai' },
];

const TYPE_OPTIONS = [
  { value: '', label: '— Pilih Tipe —' },
  { value: 'call', label: 'Telepon' },
  { value: 'visited', label: 'Kunjungan' },
];

export default function UpdateFollowUpModal({ followUp, onClose, onSaved }) {
  const [form, setForm] = useState({
    status_followup: followUp.status_followup || 'new',
    followup_type: followUp.followup_type || '',
    progress_followup: followUp.progress_followup || 'not_yet',
    result_followup: followUp.result_followup || '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');
    try {
      await updateFollowUpStatus(followUp.id, form);
      onSaved();
    } catch {
      setError('Gagal menyimpan. Coba lagi.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="z-60 fixed inset-0 flex justify-center items-center bg-black/50 p-4">
      <div className="bg-white shadow-2xl rounded-2xl w-full max-w-md">
        <div className="flex justify-between items-center px-6 py-4 border-slate-100 border-b">
          <div>
            <p className="font-bold text-slate-700 text-sm">Update Status Follow-up</p>
            <p className="text-slate-400 text-xs">{followUp.member_name}</p>
          </div>
          <button onClick={onClose} className="flex justify-center items-center hover:bg-slate-100 rounded-lg w-7 h-7 text-slate-400 transition-colors">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
          <div>
            <label className="block mb-1 font-semibold text-slate-600 text-xs">Status</label>
            <select
              value={form.status_followup}
              onChange={e => setForm(f => ({ ...f, status_followup: e.target.value }))}
              className="border-slate-200 px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 w-full text-slate-700 text-sm"
            >
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block mb-1 font-semibold text-slate-600 text-xs">Tipe Follow-up</label>
            <select
              value={form.followup_type}
              onChange={e => setForm(f => ({ ...f, followup_type: e.target.value }))}
              className="border-slate-200 px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 w-full text-slate-700 text-sm"
            >
              {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block mb-1 font-semibold text-slate-600 text-xs">Progress</label>
            <select
              value={form.progress_followup}
              onChange={e => setForm(f => ({ ...f, progress_followup: e.target.value }))}
              className="border-slate-200 px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 w-full text-slate-700 text-sm"
            >
              {PROGRESS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block mb-1 font-semibold text-slate-600 text-xs">Hasil Follow-up</label>
            <textarea
              value={form.result_followup}
              onChange={e => setForm(f => ({ ...f, result_followup: e.target.value }))}
              rows={3}
              placeholder="Catatan hasil follow-up..."
              className="border-slate-200 px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 w-full text-slate-700 text-sm resize-none"
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
              className="flex items-center gap-2 bg-linear-to-br from-indigo-500 to-purple-500 disabled:opacity-60 px-4 py-2 rounded-xl font-semibold text-white text-sm transition-all"
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Simpan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
