import { useState } from 'react';
import { Bot, Plus, Calendar, Eye, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

const AI_PAGE_SIZE = 5;

export default function AIReportsSection({ savedReports, isLoadingReports, openReport, onCreateClick, formatDate }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(savedReports.length / AI_PAGE_SIZE));
  const paged = savedReports.slice((page - 1) * AI_PAGE_SIZE, page * AI_PAGE_SIZE);

  return (
    <div className="bg-white shadow-sm border border-slate-100 rounded-2xl overflow-hidden">
      <div className="flex sm:flex-row flex-col sm:items-center gap-3 px-5 py-4 border-slate-100 border-b">
        <div className="flex items-center gap-2.5">
          <div className="flex justify-center items-center bg-linear-to-br from-indigo-500 to-purple-500 rounded-xl w-8 h-8 shrink-0">
            <Bot size={15} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-slate-700 text-sm">Laporan AI Tahunan</p>
            <p className="text-slate-400 text-xs">Analisis kehadiran per periode yang dibuat oleh AI</p>
          </div>
        </div>
        <button
          onClick={onCreateClick}
          className="flex justify-center items-center gap-2 bg-linear-to-br from-indigo-500 to-purple-500 hover:shadow-indigo-200 hover:shadow-lg px-4 py-2 rounded-xl w-full sm:w-auto font-semibold text-white text-sm transition-all hover:-translate-y-px"
        >
          <Plus size={14} />
          Buat Laporan
        </button>
      </div>

      <div className="overflow-x-auto">
        <div className="divide-y divide-slate-50 min-w-[720px]">
        {isLoadingReports ? (
          <div className="py-12 text-center">
            <Loader2 size={24} className="mx-auto mb-2 text-indigo-400 animate-spin" />
            <p className="text-slate-400 text-sm">Memuat laporan...</p>
          </div>
        ) : savedReports.length === 0 ? (
          <div className="py-12 text-center">
            <div className="flex justify-center items-center bg-slate-100 mx-auto mb-2 rounded-2xl w-12 h-12">
              <Bot size={20} className="text-slate-400" />
            </div>
            <p className="font-medium text-slate-500 text-sm">Belum ada laporan AI</p>
            <p className="mt-0.5 text-slate-400 text-xs">Klik "Buat Laporan" untuk membuat laporan pertama</p>
          </div>
        ) : (
          paged.map((report) => (
            <div
              key={report.id}
              className="flex justify-between items-center gap-4 hover:shadow-indigo-50 hover:shadow-md px-5 py-4 border border-transparent hover:border-indigo-100 transition-all hover:-translate-y-px cursor-pointer"
              onClick={() => openReport(report)}
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="flex justify-center items-center bg-indigo-50 rounded-xl w-10 h-10 shrink-0">
                  <Calendar size={16} className="text-indigo-500" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-700 text-sm">{formatDate(report.report_start_date)} – {formatDate(report.report_end_date)}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-slate-400 text-xs">
                      <span className="font-semibold text-slate-600">{report.total_attendance}</span> hadir total
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="text-slate-400 text-xs">
                      <span className="font-semibold text-indigo-500">{report.total_members}</span> member
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="text-slate-400 text-xs">
                      <span className="font-semibold text-amber-500">{report.total_guests}</span> tamu
                    </span>
                  </div>
                </div>
              </div>
              <button
                className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg font-semibold text-indigo-600 text-xs transition-colors"
                onClick={e => { e.stopPropagation(); openReport(report); }}
              >
                <Eye size={13} />
                Lihat
              </button>
            </div>
          ))
        )}
        </div>
      </div>

      {savedReports.length > AI_PAGE_SIZE && (
        <div className="flex justify-between items-center bg-slate-50/60 px-5 py-3 border-slate-100 border-t">
          <p className="text-slate-400 text-xs">
            <span className="font-semibold text-slate-600">{(page - 1) * AI_PAGE_SIZE + 1}–{Math.min(page * AI_PAGE_SIZE, savedReports.length)}</span>
            {' '}dari{' '}
            <span className="font-semibold text-slate-600">{savedReports.length}</span> laporan
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
