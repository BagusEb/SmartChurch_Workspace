import React from 'react';

export function extractReportTitle(markdown) {
  if (!markdown) return 'Laporan';

  const match = markdown.match(/^#\s+(.+)$/m);

  return match ? match[1].trim() : 'Laporan SmartChurch';
}

export function downloadMarkdown(markdownContent, title = 'Laporan SmartChurch') {
  if (!markdownContent) return;

  const blob = new Blob([markdownContent], {
    type: 'text/markdown',
  });

  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${title}.md`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

export async function downloadMarkdownAsPdf(
  markdownContent,
  title = 'Laporan SmartChurch'
) {
  if (!markdownContent) return;

  try {
    const [{ pdf }, { MarkdownPDFDocument }] = await Promise.all([
      import('@react-pdf/renderer'),
      import('../components/MarkdownPDFDocument'),
    ]);

    const pdfDocument = React.createElement(MarkdownPDFDocument, {
      content: markdownContent,
    });
    const blob = await pdf(pdfDocument).toBlob();

    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}.pdf`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to export PDF:', error);
  }
}
