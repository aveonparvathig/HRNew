// Shared client-side HTML → PDF pipeline (html2pdf is lazy-loaded).
//
// IMPORTANT: the element must be passed DETACHED — html2pdf clones it into
// its own on-screen sandbox. Parking it offscreen ourselves makes
// html2canvas capture empty viewport space (blank PDF).
export async function downloadHtmlAsPdf(html: string, filename: string, opts: {
  /** Full standalone document (extract <style> + <body>) vs a fragment. */
  fullDocument?: boolean;
  /** Extra CSS injected before the content (screen-chrome overrides). */
  extraCss?: string;
} = {}) {
  const html2pdf = (await import('html2pdf.js')).default;
  const container = document.createElement('div');
  let inner = html;
  let styles = '';
  if (opts.fullDocument) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    styles = Array.from(doc.querySelectorAll('style')).map(s => s.outerHTML).join('');
    inner = doc.body.innerHTML;
  }
  container.innerHTML =
    styles + (opts.extraCss ? `<style>${opts.extraCss}</style>` : '') + inner;
  // The container width must equal the printable width (A4 minus margins)
  // and windowWidth must match it in px — any mismatch clips the right edge.
  const margin: [number, number, number, number] = opts.fullDocument ? [0, 0, 0, 0] : [8, 5, 8, 5];
  const contentMm = 210 - margin[1] - margin[3];
  container.style.cssText = `width:${contentMm}mm;background:#fff;`;
  await html2pdf().set({
    margin,
    filename,
    image: { type: 'jpeg', quality: 0.96 },
    html2canvas: {
      scale: 2, useCORS: true, scrollX: 0, scrollY: 0,
      windowWidth: Math.round(contentMm * 96 / 25.4),
    },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'] },
  } as any).from(container).save();
}
