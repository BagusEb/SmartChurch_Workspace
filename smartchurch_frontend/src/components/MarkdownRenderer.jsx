import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Download, Maximize2, X } from 'lucide-react';
import { downloadFile } from '../service/apiClient';
import { useState, useEffect } from 'react';


const MarkdownImage = ({ src, alt }) => {
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);

  const handleDownload = () => {
    if (!src) return;
    const fallbackName = alt ? `${alt}.png` : 'image.png';
    downloadFile(src, fallbackName);
  };

  useEffect(() => {
    if (!isOverlayOpen) return;
    const onKeyDown = (e) => { if (e.key === 'Escape') setIsOverlayOpen(false); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOverlayOpen]);

  if (!src) return null;

  return (
    <>
      <div className="group relative flex justify-center my-2 max-w-full">
        <img
          src={src}
          alt={alt || 'Image'}
          loading="lazy"
          className="border border-slate-200 rounded-xl max-w-full max-h-72 object-contain"
        />
        <div className="right-2 bottom-2 absolute flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownload}
            aria-label="Unduh gambar"
            title="Unduh gambar"
            data-html2canvas-ignore="true"
            className="flex items-center gap-1 bg-slate-900/85 hover:bg-slate-900 px-2.5 py-1.5 rounded-lg text-white text-xs transition-all"
          >
            <Download size={14} />
          </button>
          <button
            type="button"
            onClick={() => setIsOverlayOpen(true)}
            aria-label="Perbesar gambar"
            title="Perbesar gambar"
            data-html2canvas-ignore="true"
            className="flex items-center gap-1 bg-slate-900/85 hover:bg-slate-900 px-2.5 py-1.5 rounded-lg text-white text-xs transition-all"
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </div>

      {isOverlayOpen && (
        <div
          className="z-120 fixed inset-0 flex justify-center items-center bg-slate-950/80 p-4"
          onClick={() => setIsOverlayOpen(false)}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleDownload();
            }}
            aria-label="Unduh gambar"
            title="Unduh gambar"
            className="top-4 right-24 absolute flex items-center gap-1 bg-white/95 hover:bg-white px-3 py-2 rounded-lg text-slate-700 text-sm"
          >
            <Download size={16} />
          </button>
          <button
            type="button"
            onClick={() => setIsOverlayOpen(false)}
            aria-label="Tutup gambar"
            title="Tutup"
            className="top-4 right-10 absolute flex items-center gap-1 bg-white/95 hover:bg-white px-3 py-2 rounded-lg text-slate-700 text-sm"
          >
            <X size={16} />
          </button>
          <img
            src={src}
            alt={alt || 'Preview gambar'}
            className="border border-white/20 rounded-xl max-w-[92vw] max-h-[92vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
};

const MarkdownRenderer = memo(({ children, proseClass = "prose lg:prose-xl", ...markdownProps }) => (
  <ReactMarkdown
    {...markdownProps}
    className={`max-w-full text-inherit ${proseClass}`}
    remarkPlugins={[remarkGfm]}
    components={{
      // ✅ Table kept intentional — prose default lacks overflow scroll
      table: ({ children: tableChildren, ...tableProps }) => (
        <div className="max-w-full overflow-x-auto">
          <table {...tableProps} className="border border-slate-200 w-full border-collapse">
            {tableChildren}
          </table>
        </div>
      ),
      th: ({ children: thChildren, ...thProps }) => (
        <th {...thProps} className="px-3 py-2 border border-slate-200 text-left">
          {thChildren}
        </th>
      ),
      td: ({ children: tdChildren, ...tdProps }) => (
        <td {...tdProps} className="px-3 py-2 border border-slate-200">
          {tdChildren}
        </td>
      ),
      // Avoid <div> inside <p> — render image-only paragraphs as a fragment
      p: ({ children, node }) => {
        const hasOnlyImages = node.children.every(
          (n) => n.type === 'element' && n.tagName === 'img'
        );
        if (hasOnlyImages) return <>{children}</>;
        return <p>{children}</p>;
      },
      img: ({ src, alt }) => <MarkdownImage src={src} alt={alt} />,
    }}
  >
    {children}
  </ReactMarkdown>
), (prevProps, nextProps) => prevProps.children === nextProps.children);

export default MarkdownRenderer;