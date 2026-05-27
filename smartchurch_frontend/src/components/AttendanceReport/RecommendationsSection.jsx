import { UserCheck, UserPlus, Loader2, Eye, RefreshCw } from 'lucide-react';

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

function FollowUpList({ items, isLoading, onSelect }) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 mt-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-slate-100 rounded-xl w-full h-14 animate-pulse" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-8 text-center">
        <div className="flex justify-center items-center bg-slate-100 mx-auto mb-2 rounded-2xl w-10 h-10">
          <UserCheck size={18} className="text-slate-400" />
        </div>
        <p className="text-slate-400 text-xs">Tidak ada anggota yang perlu di-follow up</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-slate-50 mt-1">
      {items.map(item => (
        <div key={item.id} className="flex justify-between items-center py-3">
          <div className="min-w-0">
            <p className="font-semibold text-slate-700 text-sm truncate">{item.member_name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[item.status_followup] || 'bg-slate-100 text-slate-500'}`}>
                {STATUS_LABELS[item.status_followup] || item.status_followup}
              </span>
              <span className="text-slate-400 text-xs">{item.followup_date}</span>
            </div>
          </div>
          <button
            onClick={() => onSelect(item)}
            className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 ml-3 px-3 py-1.5 rounded-lg font-semibold text-indigo-600 text-xs transition-colors shrink-0"
          >
            <Eye size={12} />
            Lihat
          </button>
        </div>
      ))}
    </div>
  );
}

function GuestConversionList({ items, isLoading, onSelect }) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 mt-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-slate-100 rounded-xl w-full h-14 animate-pulse" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-8 text-center">
        <div className="flex justify-center items-center bg-slate-100 mx-auto mb-2 rounded-2xl w-10 h-10">
          <UserPlus size={18} className="text-slate-400" />
        </div>
        <p className="text-slate-400 text-xs">Tidak ada tamu yang perlu dikonversi</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-slate-50 mt-1">
      {items.map(item => (
        <div key={item.id} className="flex justify-between items-center py-3">
          <div className="min-w-0">
            <p className="font-semibold text-slate-700 text-sm truncate">{item.full_name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="bg-emerald-100 px-2 py-0.5 rounded-full font-medium text-emerald-700 text-xs">
                {item.visit_count}× kunjungan
              </span>
              {item.last_visit && (
                <span className="text-slate-400 text-xs">Terakhir: {item.last_visit}</span>
              )}
            </div>
          </div>
          <button
            onClick={() => onSelect(item)}
            className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 ml-3 px-3 py-1.5 rounded-lg font-semibold text-emerald-600 text-xs transition-colors shrink-0"
          >
            <Eye size={12} />
            Lihat
          </button>
        </div>
      ))}
    </div>
  );
}

export default function RecommendationsSection({
  followUps,
  guestConversions,
  isLoading,
  isSyncingFollowUps = false,
  followUpSyncMessage = '',
  onSyncFollowUps,
  onSelectFollowUp,
  onSelectGuest,
}) {
  return (
    <div className="gap-5 grid grid-cols-1 lg:grid-cols-2">
      {/* Follow-up members */}
      <div className="bg-white shadow-sm border border-slate-100 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4 border-slate-100 border-b">
          <div className="flex justify-center items-center bg-linear-to-br from-amber-400 to-orange-500 rounded-xl w-8 h-8 shrink-0">
            <UserCheck size={15} className="text-white" />
          </div>

          <div className="min-w-0">
            <p className="font-bold text-slate-700 text-sm">Rekomendasi Follow-up Anggota</p>
            <p className="text-slate-400 text-xs">Anggota yang membutuhkan tindak lanjut</p>
          </div>

          <div className="flex items-center gap-2 ml-auto shrink-0">
            <button
              type="button"
              onClick={onSyncFollowUps}
              disabled={isLoading || isSyncingFollowUps}
              title="Generate ulang rekomendasi follow-up"
              className={`flex items-center justify-center rounded-xl w-8 h-8 transition-colors ${
                isLoading || isSyncingFollowUps
                  ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-700'
              }`}
            >
              {isSyncingFollowUps ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <RefreshCw size={15} />
              )}
            </button>

            {!isLoading && (
              <span className="bg-amber-100 px-2 py-0.5 rounded-full font-semibold text-amber-700 text-xs">
                {followUps.length}
              </span>
            )}
          </div>
        </div>
        {followUpSyncMessage && (
          <div className="mx-5 mt-3 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-xs font-medium text-amber-700">
            {followUpSyncMessage}
          </div>
        )}
        <div className="px-5 py-2 max-h-72 overflow-y-auto">
          <FollowUpList items={followUps} isLoading={isLoading} onSelect={onSelectFollowUp} />
        </div>
      </div>

      {/* Guest conversion */}
      <div className="bg-white shadow-sm border border-slate-100 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4 border-slate-100 border-b">
          <div className="flex justify-center items-center bg-linear-to-br from-emerald-400 to-teal-500 rounded-xl w-8 h-8 shrink-0">
            <UserPlus size={15} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-slate-700 text-sm">Rekomendasi Konversi Tamu</p>
            <p className="text-slate-400 text-xs">Tamu dengan 5+ kunjungan, belum jadi anggota</p>
          </div>
          {!isLoading && (
            <span className="ml-auto bg-emerald-100 px-2 py-0.5 rounded-full font-semibold text-emerald-700 text-xs">
              {guestConversions.length}
            </span>
          )}
        </div>
        <div className="px-5 py-2 max-h-72 overflow-y-auto">
          <GuestConversionList items={guestConversions} isLoading={isLoading} onSelect={onSelectGuest} />
        </div>
      </div>
    </div>
  );
}
