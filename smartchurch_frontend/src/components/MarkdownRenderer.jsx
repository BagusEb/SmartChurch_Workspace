import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Maximize2, X } from 'lucide-react';
import { useState, useEffect } from 'react';

const normalizeHtmlToMarkdown = (value) => {
  if (typeof value !== 'string') return value;

  const normalized = value
    .replace(/<\s*div[^>]*>/gi, '\n')
    .replace(/<\s*\/\s*div\s*>/gi, '\n')
    .replace(/<\s*p\s*>/gi, '\n\n')
    .replace(/<\s*\/\s*p\s*>/gi, '')
    .replace(/<\s*ul\s*>/gi, '\n')
    .replace(/<\s*\/\s*ul\s*>/gi, '\n')
    .replace(/<\s*ol\s*>/gi, '\n')
    .replace(/<\s*\/\s*ol\s*>/gi, '\n')
    .replace(/<\s*li\s*>/gi, '\n- ')
    .replace(/<\s*\/\s*li\s*>/gi, '');

  return normalized.replace(/\n{3,}/g, '\n\n').trim();
};

const parsePipedCells = (line, stripLeadingDash = false) => {
  if (!line || typeof line !== 'string') return [];

  let normalized = line.trim();
  if (stripLeadingDash) normalized = normalized.replace(/^[-*]\s+/, '');
  if (normalized.startsWith('|')) normalized = normalized.slice(1);
  if (normalized.endsWith('|')) normalized = normalized.slice(0, -1);

  return normalized
    .split('|')
    .map(cell => cell.trim())
    .filter(cell => cell.length > 0);
};

const toMarkdownTableIfNeeded = (value) => {
  if (typeof value !== 'string') return value;

  const lines = value.split('\n');
  const transformed = [];

  for (let i = 0; i < lines.length; i += 1) {
    const current = lines[i];
    const headerCells = parsePipedCells(current);

    if (headerCells.length < 2) {
      transformed.push(current);
      continue;
    }

    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') j += 1;

    if (j >= lines.length || !/^[-*]\s+.+\|.+/.test(lines[j].trim())) {
      transformed.push(current);
      continue;
    }

    const rowLines = [];
    while (j < lines.length) {
      const row = lines[j].trim();
      if (!/^[-*]\s+.+\|.+/.test(row)) break;
      rowLines.push(row);
      j += 1;
    }

    const rows = rowLines
      .map(row => parsePipedCells(row, true))
      .filter(cells => cells.length === headerCells.length);

    if (rows.length === 0) {
      transformed.push(current);
      continue;
    }

    transformed.push(`| ${headerCells.join(' | ')} |`);
    transformed.push(`| ${headerCells.map(() => '---').join(' | ')} |`);
    rows.forEach(cells => transformed.push(`| ${cells.join(' | ')} |`));

    i = j - 1;
  }

  return transformed.join('\n');
};

const normalizeAssistantMarkdown = (value) => {
  const normalizedHtml = normalizeHtmlToMarkdown(value);
  return toMarkdownTableIfNeeded(normalizedHtml);
};

const MarkdownImage = ({ src, alt }) => {
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);

  useEffect(() => {
    if (!isOverlayOpen) return;
    const onKeyDown = (e) => { if (e.key === 'Escape') setIsOverlayOpen(false); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOverlayOpen]);

  if (!src) return null;

  return (
    <>
      <div className="group inline-block relative my-2 max-w-full">
        <img
          src={src}
          alt={alt || 'Image'}
          loading="lazy"
          className="border border-slate-200 rounded-xl max-w-full max-h-72 object-contain"
        />
        <button
          type="button"
          onClick={() => setIsOverlayOpen(true)}
          aria-label="Perbesar gambar"
          title="Perbesar gambar"
          className="right-2 bottom-2 absolute flex items-center gap-1 bg-slate-900/85 hover:bg-slate-900 px-2.5 py-1.5 rounded-lg text-white text-xs transition-all"
        >
          <Maximize2 size={14} />
          Zoom
        </button>
      </div>

      {isOverlayOpen && (
        <div
          className="z-120 fixed inset-0 flex justify-center items-center bg-slate-950/80 p-4"
          onClick={() => setIsOverlayOpen(false)}
        >
          <button
            type="button"
            onClick={() => setIsOverlayOpen(false)}
            aria-label="Tutup gambar"
            title="Tutup"
            className="top-4 right-4 absolute flex items-center gap-1 bg-white/95 hover:bg-white px-3 py-2 rounded-lg text-slate-700 text-sm"
          >
            <X size={16} />
            Tutup
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
      img: ({ src, alt }) => <MarkdownImage src={src} alt={alt} />,
    }}
  >
    {normalizeAssistantMarkdown(children)}
  </ReactMarkdown>
), (prevProps, nextProps) => prevProps.children === nextProps.children);

export default MarkdownRenderer;