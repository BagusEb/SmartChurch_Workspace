import { useRef, useState } from 'react';
import { PanelRight, X, Copy, Check, FileText, FileDown, Trash2 } from 'lucide-react';
import MarkdownRenderer from '../MarkdownRenderer';
import {
  extractReportTitle,
  exportCanvasAsMarkdown,
  exportCanvasAsPdf,
} from '../../utils/exportCanvas';

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

  const handleExportMd = () => exportCanvasAsMarkdown(canvas, reportTitle);
  const handleExportPdf = () => exportCanvasAsPdf(contentRef, reportTitle);

  return (
    <div className="flex flex-col h-full">
      {/* Indigo accent bar */}
      <div className="h-0.5 bg-indigo-500 shrink-0" />

      {/* Header */}
      <div className="flex justify-between items-center px-4 py-3 border-b border-slate-200 shrink-0">
        <p className="font-semibold text-slate-700 text-sm truncate max-w-35" title={reportTitle}>
          {reportTitle}
        </p>

        <div className="flex items-center gap-1">
          {canvas && (
            <>
              <button
                onClick={handleCopy}
                title="Salin teks"
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded transition-colors"
              >
                {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              </button>
              <button
                onClick={handleExportMd}
                title="Unduh Markdown"
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded transition-colors"
              >
                <FileText size={14} />
              </button>
              <button
                onClick={handleExportPdf}
                title="Unduh PDF"
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded transition-colors"
              >
                <FileDown size={14} />
              </button>
              <button
                onClick={onClear}
                title="Bersihkan canvas"
                className="p-1.5 text-slate-400 hover:text-red-500 rounded transition-colors"
              >
                <Trash2 size={14} />
              </button>
              <div className="w-px h-4 bg-slate-200 mx-1" />
            </>
          )}
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>

      <div
        ref={contentRef}
        className="flex-1 px-4 py-4 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent"
      >
        {canvas ? (
          <div className="prose prose-sm prose-slate max-w-none">
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
