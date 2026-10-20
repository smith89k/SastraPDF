// Sastra PDF — PDF helpers shared by the main window (index.html) and the Explorer-menu task window
// (task.html), so both make the same files with the same names. Classic script: window.SastraOps.
(() => {
  const vendorUrl = p => new URL('vendor/' + p, location.href).href;
  // absolute URLs: the pdf.js worker would resolve relative ones against its own folder
  const PDFJS_OPTS = { cMapUrl: vendorUrl('pdfjs/cmaps/'), standardFontDataUrl: vendorUrl('pdfjs/standard_fonts/'), wasmUrl: vendorUrl('pdfjs/wasm/') };
  let libP = null;
  const pdfjs = () => libP ??= import('./vendor/pdf.min.mjs').then(m => { m.GlobalWorkerOptions.workerSrc = vendorUrl('pdf.worker.min.mjs'); return m; });

  // Frees an open pdf.js document (and its copy in the worker). pdf.js 6: PDFDocumentProxy has no destroy();
  // it lives on the loading task — calling pdf.destroy() threw silently and kept every old copy in memory.
  const closePdf = pdf => { try { return pdf?.loadingTask?.destroy(); } catch {} };

  const baseName = n => n.replace(/\.pdf$/i, '');
  function rangeLabel(idx) {   // [0,1,2,4] → "1-3_5"
    const out = []; let s = idx[0], p = idx[0];
    for (let k = 1; k <= idx.length; k++) { const v = idx[k]; if (v === p + 1) { p = v; continue; } out.push(s === p ? `${s + 1}` : `${s + 1}-${p + 1}`); s = p = v; }
    return out.join('_');
  }
  const imageName = (base, i, n, ext) => `${base}_page-${String(i + 1).padStart(String(n).length, '0')}.${ext}`;

  const MAX_SIDE = 16384, MAX_PIXELS = 64e6;   // beyond this a canvas fails or eats gigabytes
  // Page i (0-based) on white at `dpi`, lowered when the picture would be too big. → { blob, dpi used }
  async function renderPage(pdf, i, dpi, mime, quality = 0.92) {
    const page = await pdf.getPage(i + 1);
    const one = page.getViewport({ scale: 1 });
    const use = Math.max(1, Math.min(dpi, Math.floor(72 * MAX_SIDE / Math.max(one.width, one.height)), Math.floor(72 * Math.sqrt(MAX_PIXELS / (one.width * one.height)))));
    const vp = page.getViewport({ scale: use / 72 });
    const c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const blob = await new Promise(r => c.toBlob(r, mime, quality));
    c.width = c.height = 0; page.cleanup();
    if (!blob) throw new Error(`page ${i + 1} is too large to draw`);
    return { blob, dpi: use };
  }

  // 512 B, 980 KB, 12.4 MB
  const fmtBytes = b => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1048576).toFixed(1) + ' MB';

  window.SastraOps = { PDFJS_OPTS, pdfjs, closePdf, baseName, rangeLabel, imageName, renderPage, fmtBytes };
})();
