import { useState } from 'react';
import { X, UserCheck, UserPlus, MessageCircle } from 'lucide-react';
import UpdateFollowUpModal from './UpdateFollowUpModal';
import CreateMemberFromGuestModal from './CreateMemberFromGuestModal';

const STATUS_COLORS = {
  new: 'bg-amber-100 text-amber-700',
  need_more: 'bg-orange-100 text-orange-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-slate-100 text-slate-500',
};

const STATUS_LABELS = {
  new: 'Baru',
  need_more: 'Perlu Tindak Lanjut',
  resolved: 'Selesai',
  closed: 'Ditutup',
};

const PROGRESS_LABELS = {
  not_yet: 'Belum Ditindak Lanjuti',
  followed_up: 'Sudah Ditindak Lanjuti',
  need_more: 'Perlu Tindak Lanjut Lagi',
  completed: 'Selesai',
};

const TYPE_LABELS = {
  call: 'Telepon',
  visited: 'Kunjungan',
};

function Row({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex justify-between items-start gap-4 py-2.5 border-slate-50 border-b last:border-0">
      <span className="text-slate-400 text-xs shrink-0">{label}</span>
      <span className="font-medium text-right text-slate-700 text-sm">{value}</span>
    </div>
  );
}

function PhoneRow({ phone }) {
  if (!phone) return <Row label="No. HP" value="—" />;
  const digits = phone.replace(/\D/g, '');
  const waNumber = digits.startsWith('0') ? '62' + digits.slice(1) : digits;
  return (
    <div className="flex justify-between items-center gap-4 py-2.5 border-slate-50 border-b">
      <span className="text-slate-400 text-xs shrink-0">No. HP</span>
      <a
        href={`https://wa.me/${waNumber}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 bg-green-50 hover:bg-green-100 px-2.5 py-1 rounded-lg font-medium text-green-700 text-sm transition-colors"
      >
        <MessageCircle size={13} className="shrink-0" />
        {phone}
      </a>
    </div>
  );
}

function FollowUpDetail({ data }) {
  return (
    <div className="px-6 py-4">
      <Row label="Nama Anggota" value={data.member_name} />
      <PhoneRow phone={data.member_phone} />
      <div className="flex justify-between items-center py-2.5 border-slate-50 border-b">
        <span className="text-slate-400 text-xs">Status</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[data.status_followup] || 'bg-slate-100 text-slate-500'}`}>
          {STATUS_LABELS[data.status_followup] || data.status_followup}
        </span>
      </div>
      <Row label="Tipe Follow-up" value={TYPE_LABELS[data.followup_type] || data.followup_type} />
      <Row label="Tanggal" value={data.followup_date} />
      <Row label="Hasil" value={data.result_followup} />
      <Row label="Progress" value={PROGRESS_LABELS[data.progress_followup] || data.progress_followup} />
    </div>
  );
}

function GuestDetail({ data }) {
  return (
    <div className="px-6 py-4">
      <Row label="Nama Tamu" value={data.full_name} />
      <PhoneRow phone={data.phone} />
      <div className="flex justify-between items-center py-2.5 border-slate-50 border-b">
        <span className="text-slate-400 text-xs">Jumlah Kunjungan</span>
        <span className="bg-emerald-100 px-2 py-0.5 rounded-full font-semibold text-emerald-700 text-xs">{data.visit_count}×</span>
      </div>
      <Row label="Kunjungan Pertama" value={data.first_visit || '—'} />
      <Row label="Kunjungan Terakhir" value={data.last_visit || '—'} />
      {data.notes && <Row label="Catatan" value={data.notes} />}
    </div>
  );
}

export default function RecommendationDetailModal({ type, data, onClose, onUpdated }) {
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showCreateMemberModal, setShowCreateMemberModal] = useState(false);

  const handleSaved = () => {
    setShowUpdateModal(false);
    onUpdated();
    onClose();
  };

  const handleCreated = () => {
    setShowCreateMemberModal(false);
    onUpdated();
    onClose();
  };

  return (
    <>
      <div className="z-50 fixed inset-0 flex justify-center items-center bg-black/50 p-4">
        <div className="bg-white shadow-2xl rounded-2xl w-full max-w-sm">
          <div className="flex items-center gap-2.5 px-6 py-4 border-slate-100 border-b">
            <div className={`flex justify-center items-center rounded-xl w-8 h-8 shrink-0 ${type === 'followup' ? 'bg-linear-to-br from-amber-400 to-orange-500' : 'bg-linear-to-br from-emerald-400 to-teal-500'}`}>
              {type === 'followup' ? <UserCheck size={15} className="text-white" /> : <UserPlus size={15} className="text-white" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-700 text-sm">
                {type === 'followup' ? 'Detail Follow-up Anggota' : 'Detail Tamu'}
              </p>
              <p className="text-slate-400 text-xs truncate">
                {type === 'followup' ? data.member_name : data.full_name}
              </p>
            </div>
            <button onClick={onClose} className="flex justify-center items-center hover:bg-slate-100 rounded-lg w-7 h-7 text-slate-400 transition-colors shrink-0">
              <X size={15} />
            </button>
          </div>

          {type === 'followup' ? <FollowUpDetail data={data} /> : <GuestDetail data={data} />}

          <div className="flex justify-end gap-2 px-6 py-4 border-slate-100 border-t">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl font-semibold text-slate-500 text-sm hover:bg-slate-100 transition-colors"
            >
              Batal
            </button>
            {type === 'followup' ? (
              <button
                onClick={() => setShowUpdateModal(true)}
                className="flex items-center gap-2 bg-linear-to-br from-amber-400 to-orange-500 px-4 py-2 rounded-xl font-semibold text-white text-sm transition-all hover:-translate-y-px"
              >
                Update Status
              </button>
            ) : (
              <button
                onClick={() => setShowCreateMemberModal(true)}
                className="flex items-center gap-2 bg-linear-to-br from-emerald-500 to-teal-500 px-4 py-2 rounded-xl font-semibold text-white text-sm transition-all hover:-translate-y-px"
              >
                <UserPlus size={14} />
                Jadikan Anggota
              </button>
            )}
          </div>
        </div>
      </div>

      {showUpdateModal && (
        <UpdateFollowUpModal
          followUp={data}
          onClose={() => setShowUpdateModal(false)}
          onSaved={handleSaved}
        />
      )}

      {showCreateMemberModal && (
        <CreateMemberFromGuestModal
          guest={data}
          onClose={() => setShowCreateMemberModal(false)}
          onCreated={handleCreated}
        />
      )}
    </>
  );
}
