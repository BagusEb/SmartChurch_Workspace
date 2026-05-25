import { useRef, useState } from 'react';
import MarkdownRenderer from '../MarkdownRenderer';
import { Bot, X, Download, Loader2 } from 'lucide-react';

export default function ViewReportModal({ report, isLoading, content, onClose, formatDate }) {
  const contentRef = useRef(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadPDF = async () => {
    if (!contentRef.current) return;
    setIsDownloading(true);
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas-pro'),
        import('jspdf'),
      ]);
      const canvas = await html2canvas(contentRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 12;
      const contentW = pageW - margin * 2;
      const imgH = (canvas.height * contentW) / canvas.width;

      let y = margin;
      let remaining = imgH;
      let srcY = 0;
      while (remaining > 0) {
        const sliceH = Math.min(remaining, pageH - margin * 2);
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = (sliceH * canvas.width) / contentW;
        const ctx = sliceCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, srcY * (canvas.width / contentW), canvas.width, sliceCanvas.height, 0, 0, sliceCanvas.width, sliceCanvas.height);
        pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', margin, y, contentW, sliceH);
        remaining -= sliceH;
        srcY += sliceH;
        if (remaining > 0) { pdf.addPage(); y = margin; }
      }
      pdf.save(`Laporan_AI_${report.report_start_date}_${report.report_end_date}.pdf`);
    } finally {
      setIsDownloading(false);
    }
  };

  if (!report) return null;
  return (
    <div
      className="z-50 fixed inset-0 flex justify-center items-center bg-slate-900/45 backdrop-blur-sm p-4 animate-overlay-in"
      onClick={onClose}
    >
      <div
        className="flex flex-col bg-white shadow-2xl rounded-2xl w-full max-w-2xl max-h-[90vh] animate-panel-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-6 py-4 border-slate-100 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex justify-center items-center bg-linear-to-br from-indigo-500 to-purple-500 rounded-xl w-9 h-9">
              <Bot size={16} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-800 text-sm">
                Laporan AI — {formatDate(report.report_start_date)} – {formatDate(report.report_end_date)}
              </p>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-slate-400 text-xs">{report.total_attendance} hadir</span>
                <span className="text-slate-300 text-xs">•</span>
                <span className="font-medium text-indigo-500 text-xs">{report.total_members} member</span>
                <span className="text-slate-300 text-xs">•</span>
                <span className="font-medium text-amber-500 text-xs">{report.total_guests} tamu</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 px-6 py-5 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col justify-center items-center gap-3 py-16">
              <Loader2 size={28} className="text-indigo-400 animate-spin" />
              <p className="text-slate-400 text-sm">Memuat isi laporan...</p>
            </div>
          ) : (
            <div ref={contentRef}>
              <MarkdownRenderer proseClass="prose prose-sm max-w-none prose-slate">
                {content ?? ''}
              </MarkdownRenderer>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center px-6 py-4 border-slate-100 border-t shrink-0">
          <button
            onClick={handleDownloadPDF}
            disabled={isLoading || !content || isDownloading}
            className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-40 px-4 py-2 rounded-xl font-semibold text-indigo-600 text-sm transition-colors disabled:cursor-not-allowed"
          >
            {isDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {isDownloading ? 'Menyiapkan...' : 'Download PDF'}
          </button>
          <button
            onClick={onClose}
            className="hover:bg-slate-50 px-4 py-2 border border-slate-200 rounded-xl font-semibold text-slate-600 text-sm transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
