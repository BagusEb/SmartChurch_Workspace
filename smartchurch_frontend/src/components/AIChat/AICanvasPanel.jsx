import { useRef, useState } from 'react';
import { PanelRight, X, Copy, Check, FileText, FileDown, Trash2 } from 'lucide-react';
import MarkdownRenderer from '../MarkdownRenderer';
import {
  extractReportTitle,
  downloadMarkdown,
  downloadMarkdownAsPdf,
} from '../../utils/MarkdownToPDF';

export default function AICanvasPanel({ canvas, onClose, onClear }) {
  const contentRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const reportTitle = extractReportTitle(canvas);

  const handleCopy = () => {
    navigator.clipboard.writeText(canvas).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleExportMd = () => downloadMarkdown(canvas, reportTitle);
  const handleExportPdf = () => downloadMarkdownAsPdf(canvas, reportTitle);

  return (
    <div className="flex flex-col h-full">
      {/* Indigo accent bar */}
      <div className="bg-indigo-500 h-0.5 shrink-0" />

      {/* Header */}
      <div className="flex justify-between items-center px-4 py-3 border-slate-200 border-b shrink-0">
        <p className="max-w-35 font-semibold text-slate-700 text-sm truncate" title={reportTitle}>
          {reportTitle}
        </p>

        <div className="flex items-center gap-1">
          {canvas && (
            <>
              <button
                onClick={handleCopy}
                title="Salin teks"
                className="p-1.5 rounded text-slate-400 hover:text-slate-600 transition-colors"
              >
                {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              </button>
              <button
                onClick={handleExportMd}
                title="Unduh Markdown"
                className="p-1.5 rounded text-slate-400 hover:text-slate-600 transition-colors"
              >
                <FileText size={14} />
              </button>
              <button
                onClick={handleExportPdf}
                title="Unduh PDF"
                className="p-1.5 rounded text-slate-400 hover:text-slate-600 transition-colors"
              >
                <FileDown size={14} />
              </button>
              <button
                onClick={onClear}
                title="Bersihkan canvas"
                className="p-1.5 rounded text-slate-400 hover:text-red-500 transition-colors"
              >
                <Trash2 size={14} />
              </button>
              <div className="bg-slate-200 mx-1 w-px h-4" />
            </>
          )}
          <button onClick={onClose} className="p-1.5 rounded text-slate-400 hover:text-slate-600 transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>

      <div
        ref={contentRef}
        className="flex-1 [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-track]:bg-transparent px-4 py-4 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar]:w-1 overflow-y-auto"
      >
        {canvas ? (
          <div className="max-w-none prose prose-sm prose-slate">
            <MarkdownRenderer>{canvas}</MarkdownRenderer>
          </div>
        ) : (
          <div className="flex flex-col justify-center items-center gap-2 h-full text-center">
            <PanelRight size={24} className="text-slate-300" />
            <p className="max-w-40 text-slate-400 text-xs">
              Plot dan insight akan muncul di sini saat AI menghasilkan visualisasi.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
