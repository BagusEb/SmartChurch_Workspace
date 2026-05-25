import { Bot, X, Loader2 } from 'lucide-react';

const inputCls = 'bg-slate-50 border border-slate-200 rounded-xl text-sm transition-all focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100';

export default function GenerateModal({ show, startDate, endDate, isGenerating, generateError, onClose, onGenerate, setStartDate, setEndDate }) {
  if (!show) return null;
  return (
    <div
      className="z-50 fixed inset-0 flex justify-center items-center bg-slate-900/45 backdrop-blur-sm p-4 animate-overlay-in"
      onClick={() => !isGenerating && onClose()}
    >
      <div
        className="bg-white shadow-2xl p-6 rounded-2xl w-full max-w-md animate-panel-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-5">
          <div className="flex items-center gap-3">
            <div className="flex justify-center items-center bg-linear-to-br from-indigo-500 to-purple-500 rounded-xl w-10 h-10">
              <Bot size={18} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-800">Buat Laporan AI</p>
              <p className="mt-0.5 text-slate-400 text-xs">AI akan menganalisis rentang waktu yang dipilih</p>
            </div>
          </div>
          {!isGenerating && (
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X size={18} />
            </button>
          )}
        </div>

        <label className="block mb-3">
          <span className="block mb-1.5 font-semibold text-slate-600 text-sm">Tanggal Mulai</span>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            disabled={isGenerating}
            className={`${inputCls} w-full px-3 py-2.5 disabled:opacity-60`}
          />
        </label>

        <label className="block mb-4">
          <span className="block mb-1.5 font-semibold text-slate-600 text-sm">Tanggal Akhir</span>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            disabled={isGenerating}
            min={startDate || undefined}
            className={`${inputCls} w-full px-3 py-2.5 disabled:opacity-60`}
          />
        </label>

        <div className="flex gap-2 bg-indigo-50 mb-4 p-3 rounded-xl">
          <Bot size={15} className="mt-0.5 text-indigo-500 shrink-0" />
          <p className="text-indigo-600 text-xs leading-relaxed">
            AI akan menganalisis data kehadiran pada rentang tanggal yang dipilih dan menghasilkan laporan lengkap. Proses ini membutuhkan waktu 20–60 detik.
          </p>
        </div>

        {generateError && (
          <p className="mb-3 text-rose-600 text-sm">{generateError}</p>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="flex-1 hover:bg-slate-50 disabled:opacity-50 py-2.5 border border-slate-200 rounded-xl font-semibold text-slate-600 text-sm transition-colors"
          >
            Batal
          </button>
          <button
            onClick={onGenerate}
            disabled={!startDate || !endDate || isGenerating}
            className="flex flex-1 justify-center items-center gap-2 bg-linear-to-br from-indigo-500 to-purple-500 hover:opacity-90 disabled:opacity-50 py-2.5 rounded-xl font-semibold text-white text-sm transition-opacity"
          >
            {isGenerating ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Membuat Laporan...
              </>
            ) : (
              <>
                <Bot size={15} />
                Generate
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
