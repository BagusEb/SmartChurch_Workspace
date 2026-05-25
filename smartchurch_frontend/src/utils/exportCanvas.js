import html2canvas from 'html2canvas-pro';
import jsPDF from 'jspdf';

export function extractReportTitle(canvas) {
  if (!canvas) return 'Laporan';
  const match = canvas.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : 'Laporan SmartChurch';
}

export function exportCanvasAsMarkdown(canvas, title = 'Laporan SmartChurch') {
  const blob = new Blob([canvas], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportCanvasAsPdf(containerRef, title = 'Laporan SmartChurch') {
  const element = containerRef.current;
  if (!element) return;

  const canvasEl = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: false,
  });

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth - 20;
  const imgHeight = (canvasEl.height * imgWidth) / canvasEl.width;
  const imgData = canvasEl.toDataURL('image/png');

  let heightLeft = imgHeight;
  let position = 10;

  pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  pdf.save(`${title}.pdf`);
}
