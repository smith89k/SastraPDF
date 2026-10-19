// Sastra PDF — pictures → PDF pages, for "Make PDF" / "Combine" from the File Explorer menu and for pictures dropped
// into the Pages panel. Classic script: window.SastraImages (needs pdf-lib). JPEG goes in as it is and PNG without
// loss; BMP, GIF (first frame) and WebP are decoded by Chromium and stored as PNG. Each page is the picture's own
// size: pixels × 72 / dpi, the dpi from the file, else 96. Phone photos are turned the way their EXIF orientation says.
(() => {
  const { pushGraphicsState, popGraphicsState, concatTransformationMatrix, drawObject } = PDFLib;
  const DEFAULT_DPI = 96, MAX_PT = 14400;   // 200 in: the largest page most PDF readers accept
  const MAX_SIDE = 16384, MAX_PIXELS = 64e6;   // past this a canvas fails or eats gigabytes (as SastraOps.renderPage)
  const usable = d => d >= 10 && d <= 10000 ? Math.round(d * 100) / 100 : null;   // missing, 0 or silly → null
  const ascii = (b, i, s) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));
  const view = b => new DataView(b.buffer, b.byteOffset, b.byteLength);

  // What the bytes are, whatever the file is called: 'pdf' | 'jpeg' | 'png' | 'gif' | 'bmp' | 'webp' | null
  function kind(b) {
    if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpeg';
    if (ascii(b, 0, '\x89PNG\r\n\x1A\n')) return 'png';
    if (ascii(b, 0, 'GIF8')) return 'gif';
    if (ascii(b, 0, 'BM')) return 'bmp';
    if (ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP')) return 'webp';
    for (let i = 0; i <= Math.min(1024, b.length - 5); i++) if (ascii(b, i, '%PDF-')) return 'pdf';   // as Acrobat: within the first 1 KB
    return null;
  }

  // The EXIF block's TIFF part → { orientation, dpi }. Throws when it's broken (DataView range errors).
  function readExif(t) {
    const le = t.getUint16(0) === 0x4949;   // 'II' little-endian, 'MM' big-endian
    if (!le && t.getUint16(0) !== 0x4D4D) throw new Error('not TIFF');
    const u16 = o => t.getUint16(o, le), u32 = o => t.getUint32(o, le);
    if (u16(2) !== 42) throw new Error('not TIFF');
    const ifd = u32(4), n = u16(ifd);
    let orientation = 1, res = null, unit = 2;   // ResolutionUnit: 1 none, 2 inch (default), 3 cm
    for (let k = 0; k < n; k++) {
      const e = ifd + 2 + k * 12, tag = u16(e);
      if (tag === 0x0112) { const o = u16(e + 8); if (o >= 1 && o <= 8) orientation = o; }
      else if (tag === 0x011A) { const at = u32(e + 8), den = u32(at + 4); res = den ? u32(at) / den : null; }
      else if (tag === 0x0128) unit = u16(e + 8);
    }
    return { orientation, dpi: usable(res === null ? 0 : unit === 3 ? res * 2.54 : unit === 2 ? res : 0) };
  }
  // JPEG → { orientation 1–8, dpi or null }: JFIF density first, then EXIF XResolution. A broken EXIF block is ignored.
  function jpegInfo(b) {
    const v = view(b); let orientation = 1, jfif = null, exif = null, i = 2;
    while (i + 4 <= b.length && b[i] === 0xFF) {
      const m = b[i + 1];
      if (m === 0xFF) { i++; continue; }   // fill byte
      if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }   // markers without a length
      if (m === 0xDA || m === 0xD9) break;   // the image data starts: no more headers
      const len = v.getUint16(i + 2), s = i + 4;
      if (m === 0xE0 && ascii(b, s, 'JFIF\0') && s + 12 <= b.length) {
        const unit = b[s + 7], x = v.getUint16(s + 8);
        jfif = usable(unit === 1 ? x : unit === 2 ? x * 2.54 : 0);
      } else if (m === 0xE1 && ascii(b, s, 'Exif\0\0')) {
        try {
          const e = readExif(new DataView(b.buffer, b.byteOffset + s + 6, Math.max(0, Math.min(len - 8, b.length - s - 6))));
          orientation = e.orientation; exif = e.dpi;
        } catch {}
      }
      i += 2 + len;
    }
    return { orientation, dpi: jfif ?? exif };
  }
  // PNG → dpi from pHYs (pixels per metre, unit 1), which must come before the image data
  function pngDpi(b) {
    const v = view(b);
    for (let i = 8; i + 8 <= b.length; ) {
      const len = v.getUint32(i), type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
      if (type === 'IDAT' || type === 'IEND') break;
      if (type === 'pHYs' && len >= 9 && i + 17 <= b.length) return b[i + 16] === 1 ? usable(v.getUint32(i + 8) * 0.0254) : null;
      i += 12 + len;
    }
    return null;
  }
  // BMP → dpi from the header's horizontal pixels per metre (the old 12-byte header has none)
  function bmpDpi(b) {
    if (b.length < 42) return null;
    const v = view(b);
    return v.getUint32(14, true) >= 40 ? usable(v.getInt32(38, true) * 0.0254) : null;
  }

  // Page size in points for a w × h picture: × 72 / dpi (96 when unusable); orientations 5–8 turn it a quarter, so
  // width and height swap. A side over 14 400 pt is scaled down with the other (the picture keeps its pixels).
  function pageSize(w, h, dpi, orientation = 1) {
    const d = usable(dpi) ?? DEFAULT_DPI;
    let width = w * 72 / d, height = h * 72 / d;
    if (orientation >= 5) [width, height] = [height, width];
    const s = Math.min(1, MAX_PT / Math.max(width, height));
    return { width: width * s, height: height * s };
  }
  // Puts the picture (a 1 × 1 square in PDF, its top row at the top) on a W × H page, turned / mirrored the way
  // EXIF orientation 1–8 says.
  const placement = (o, W, H) => ({ 2: [-W, 0, 0, H, W, 0], 3: [-W, 0, 0, -H, W, H], 4: [W, 0, 0, -H, 0, H], 5: [0, -H, -W, 0, W, H],
    6: [0, -H, W, 0, 0, H], 7: [0, H, W, 0, 0, 0], 8: [0, H, -W, 0, W, 0] })[o] || [W, 0, 0, H, 0, 0];

  // BMP / GIF (first frame) / WebP → PNG bytes, decoded by Chromium
  async function toPng(bytes, type) {
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/' + type }));
    try {
      if (Math.max(bmp.width, bmp.height) > MAX_SIDE || bmp.width * bmp.height > MAX_PIXELS) throw new Error('the picture is too large');
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      c.getContext('2d').drawImage(bmp, 0, 0);
      return new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
    } finally { bmp.close(); }
  }

  // Adds the picture as a page of a pdf-lib document — at index `at` when given, else last → { width, height } in
  // points. Rejects (adding nothing) when the bytes are not a picture it can read.
  async function addImagePage(doc, bytes, at) {
    const k = kind(bytes); let img, dpi = null, orientation = 1;
    if (k === 'jpeg') { ({ orientation, dpi } = jpegInfo(bytes)); img = await doc.embedJpg(bytes); }
    else if (k === 'png') { dpi = pngDpi(bytes); img = await doc.embedPng(bytes); }
    else if (k === 'bmp' || k === 'gif' || k === 'webp') { if (k === 'bmp') dpi = bmpDpi(bytes); img = await doc.embedPng(await toPng(bytes, k)); }
    else throw new Error('not a supported picture');
    if (!(img.width > 0 && img.height > 0)) throw new Error('the picture has no size');
    const { width, height } = pageSize(img.width, img.height, dpi, orientation);
    const page = at === undefined ? doc.addPage([width, height]) : doc.insertPage(at, [width, height]);
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...placement(orientation, width, height)),
      drawObject(page.node.newXObject('Image', img.ref)), popGraphicsState());
    return { width, height };
  }

  window.SastraImages = { kind, jpegInfo, pngDpi, bmpDpi, pageSize, addImagePage };
})();
