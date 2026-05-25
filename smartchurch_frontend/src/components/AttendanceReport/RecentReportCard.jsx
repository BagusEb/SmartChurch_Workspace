import { useEffect, useState } from 'react';
import MarkdownRenderer from '../MarkdownRenderer';
import { getReportDetail } from '../../service/apiClient';
import { FileText, Bot, Loader2 } from 'lucide-react';

export default function RecentReportCard({ savedReports, isLoadingReports, formatDate }) {
  const latest = savedReports[0] ?? null;
  const [content, setContent] = useState(null);
  const [isLoadingContent, setIsLoadingContent] = useState(false);

  useEffect(() => {
    if (!latest) return;
    let cancelled = false;
    setIsLoadingContent(true);
    setContent(null);
    getReportDetail(latest.id)
      .then(detail => { if (!cancelled) setContent(detail.report_summary ?? ''); })
      .catch(() => { if (!cancelled) setContent('Gagal memuat isi laporan.'); })
      .finally(() => { if (!cancelled) setIsLoadingContent(false); });
    return () => { cancelled = true; };
  }, [latest?.id]);

  return (
    <div className="bg-white shadow-sm border border-slate-100 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-slate-100 border-b">
        <div className="flex justify-center items-center bg-linear-to-br from-emerald-500 to-emerald-600 rounded-xl w-8 h-8">
          <FileText size={15} className="text-white" />
        </div>
        <div>
          <p className="font-bold text-slate-700 text-sm">Laporan Terbaru</p>
          {latest && (
            <p className="text-slate-400 text-xs">{formatDate(latest.report_start_date)} – {formatDate(latest.report_end_date)}</p>
          )}
        </div>
      </div>

      <div className="px-5 py-5">
        {isLoadingReports || isLoadingContent ? (
          <div className="flex items-center gap-3 py-6">
            <Loader2 size={18} className="text-emerald-400 animate-spin shrink-0" />
            <p className="text-slate-400 text-sm">Memuat laporan terbaru...</p>
          </div>
        ) : !latest ? (
          <div className="flex flex-col items-center gap-2 py-6">
            <div className="flex justify-center items-center bg-slate-100 rounded-2xl w-12 h-12">
              <Bot size={20} className="text-slate-400" />
            </div>
            <p className="font-medium text-slate-500 text-sm">Belum ada laporan</p>
            <p className="text-slate-400 text-xs">Buat laporan AI pertama Anda di bawah</p>
          </div>
        ) : (
          <div className="max-h-96 [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar]:w-1.5 overflow-y-auto">
            <MarkdownRenderer proseClass="prose prose-sm max-w-none prose-slate">
              {content ?? ''}
            </MarkdownRenderer>
          </div>
        )}
      </div>
    </div>
  );
}
