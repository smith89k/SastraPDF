// Sastra PDF — Reduce file size, as Acrobat's File › Save as Other › Reduced Size PDF. Pictures sharper than they need
// to be (over 225 ppi across their page) are resampled to 150 ppi; pictures are saved as JPEG (quality 0.75, Acrobat's
// "medium") when that is at least 10 % smaller; plain streams get Flate; page thumbnails, other programs' private data
// and objects nothing uses go; object streams pack the rest. Text, fonts (Khmer too), lines, links, bookmarks, forms and
// comments are not touched. Shared by index.html (Save ▾ › Save as Reduced Size PDF…) and task.html (File Explorer ›
// Reduce file size), so both make the same file. Spec: docs/superpowers/specs/2026-10-20-reduce-size-design.md
(() => {
  const { PDFDocument, PDFName, PDFDict, PDFArray, PDFRef, PDFStream, PDFRawStream, PDFNumber, decodePDFRawStream } = PDFLib;
  const N = n => PDFName.of(n);
  const ABOVE_PPI = 225, TO_PPI = 150, QUALITY = 0.75, MIN_BYTES = 20 * 1024, PICTURE_GAIN = 0.9, FILE_GAIN = 0.99;
  const fail = reason => Object.assign(new Error(reason), { reason });
  const num = (dict, key) => { const v = dict.lookup(N(key)); return v instanceof PDFNumber ? v.asNumber() : undefined; };

  // "Report.pdf" → "Report_reduced.pdf"
  const reducedName = name => String(name).replace(/\.pdf$/i, '') + '_reduced.pdf';

  // For each picture (by object), the longest side in points of the largest page it is drawn on — pictures inside Form
  // XObjects count for the page that draws the form.
  function pageSides(doc){
    const side = new Map(), seen = new Set();
    const walk = (res, long) => {
      const xo = res instanceof PDFDict ? res.lookup(N('XObject')) : null;
      if (!(xo instanceof PDFDict)) return;
      for (const [, v] of xo.entries()) {
        if (!(v instanceof PDFRef)) continue;
        const s = doc.context.lookup(v); if (!(s instanceof PDFStream)) continue;
        const sub = s.dict.lookup(N('Subtype'));
        if (sub === N('Image')) side.set(v.tag, Math.max(side.get(v.tag) || 0, long));
        else if (sub === N('Form') && !seen.has(v.tag + '@' + long)) { seen.add(v.tag + '@' + long); walk(s.dict.lookup(N('Resources')), long); }
      }
    };
    for (const p of doc.getPages()) { const { width, height } = p.getSize(); walk(p.node.Resources(), Math.max(width, height)); }
    return side;
  }

  // colour components of a picture's colour space: 1 (grey) or 3 (RGB); 0 = leave it (CMYK, Indexed, Lab…)
  function colours(cs){
    if (cs === N('DeviceRGB')) return 3;
    if (cs === N('DeviceGray')) return 1;
    if (cs instanceof PDFArray && cs.size() === 2 && cs.lookup(0) === N('ICCBased')) {
      const s = cs.lookup(1), n = s instanceof PDFStream ? num(s.dict, 'N') : 0;
      return n === 1 || n === 3 ? n : 0;
    }
    return 0;
  }

  // a JPEG's size and colour components, from its frame header (SOFn); null if it can't be read or isn't 8-bit
  function jpegInfo(b){
    if (b[0] !== 0xFF || b[1] !== 0xD8) return null;
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xFF) return null;
      const m = b[i + 1];
      if (m === 0xFF) { i++; continue; }
      if (m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC)
        return b[i + 4] === 8 ? { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8], comps: b[i + 9] } : null;
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
    return null;
  }

  // a /Decode array that maps every component to itself (pdf-lib writes [0 1] on its soft masks) is the same as none
  function identityDecode(d, key){
    const a = d.lookup(N(key)); if (!a) return true;
    if (!(a instanceof PDFArray) || a.size() % 2) return false;
    for (let i = 0; i < a.size(); i++) if (a.lookup(i)?.asNumber?.() !== i % 2) return false;
    return true;
  }

  // How a picture can be redone, or null: 8 bits a component, grey or RGB, JPEG or Flate (no predictor or a PNG one),
  // no colour-key /Mask or /Decode array, stored in at least 20 KB (small icons and logos stay as they are).
  // mask: a soft mask (no size floor; grey; may leave out its colour space).
  function plan(stream, { mask = false } = {}){
    const d = stream.dict;
    if (d.lookup(N('Subtype')) !== N('Image') || (!mask && stream.contents.length < MIN_BYTES)) return null;
    if (num(d, 'BitsPerComponent') !== 8 || !identityDecode(d, 'Decode') || d.has(N('Mask'))) return null;
    const w = num(d, 'Width'), h = num(d, 'Height'); if (!(w > 0 && h > 0)) return null;
    const cs = d.lookup(N('ColorSpace')), comps = mask && !cs ? 1 : colours(cs);
    if (!comps || (mask && comps !== 1)) return null;
    let f = d.lookup(N('Filter')), p = d.lookup(N('DecodeParms'));
    if (f instanceof PDFArray) { if (f.size() !== 1) return null; f = f.lookup(0); p = p instanceof PDFArray ? p.lookup(0) : p; }
    if (f === N('DCTDecode')) { const j = jpegInfo(stream.contents); return j && j.comps === comps && j.w === w && j.h === h ? { kind:'jpeg', w, h, comps } : null; }
    if (f !== N('FlateDecode')) return null;
    const pred = p instanceof PDFDict ? num(p, 'Predictor') ?? 1 : 1;
    if (pred === 1) return { kind:'flate', w, h, comps, png:false };
    if (pred < 10 || (num(p, 'Colors') ?? 1) !== comps || (num(p, 'BitsPerComponent') ?? 8) !== 8 || (num(p, 'Columns') ?? 1) !== w) return null;
    return { kind:'flate', w, h, comps, png:true };
  }

  // undo PNG row filters (Predictor ≥ 10): each row is a filter byte (0 none, 1 sub, 2 up, 3 average, 4 Paeth) + the row
  function unPng(src, rowBytes, rows, bpp){
    if (src.length < (rowBytes + 1) * rows) throw new Error('short picture data');
    const out = new Uint8Array(rowBytes * rows);
    for (let y = 0; y < rows; y++) {
      const t = src[y * (rowBytes + 1)], s = y * (rowBytes + 1) + 1, o = y * rowBytes, up = o - rowBytes;
      for (let x = 0; x < rowBytes; x++) {
        const a = x >= bpp ? out[o + x - bpp] : 0, b = y ? out[up + x] : 0, c = x >= bpp && y ? out[up + x - bpp] : 0;
        let v = src[s + x];
        if (t === 1) v += a; else if (t === 2) v += b; else if (t === 3) v += (a + b) >> 1;
        else if (t === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
        out[o + x] = v;   // Uint8Array keeps it mod 256
      }
    }
    return out;
  }

  // grey or RGB bytes → ImageData (RGBA, opaque)
  function rgba(px, w, h, comps){
    const img = new ImageData(w, h), d = img.data;
    for (let i = 0, j = 0, k = 0; i < w * h; i++, j += comps, k += 4) {
      d[k] = px[j]; d[k + 1] = px[comps === 3 ? j + 1 : j]; d[k + 2] = px[comps === 3 ? j + 2 : j]; d[k + 3] = 255;
    }
    return img;
  }

  // the picture's pixels, resized to `size` with Chromium's high-quality resampling. EXIF orientation and a JPEG's own
  // colour profile are ignored, as PDF viewers do.
  async function bitmapOf(stream, p, size){
    const opts = { imageOrientation:'none', colorSpaceConversion:'none', resizeWidth:size.w, resizeHeight:size.h, resizeQuality:'high' };
    if (p.kind === 'jpeg') return createImageBitmap(new Blob([stream.contents], { type:'image/jpeg' }), opts);
    const raw = decodePDFRawStream(stream).decode(), px = p.png ? unPng(raw, p.w * p.comps, p.h, p.comps) : raw;
    if (px.length < p.w * p.h * p.comps) throw new Error('short picture data');
    return createImageBitmap(rgba(px, p.w, p.h, p.comps), opts);
  }

  async function jpegOf(bitmap){
    const c = new OffscreenCanvas(bitmap.width, bitmap.height);
    c.getContext('2d', { alpha:false }).drawImage(bitmap, 0, 0); bitmap.close();
    return new Uint8Array(await (await c.convertToBlob({ type:'image/jpeg', quality:QUALITY })).arrayBuffer());
  }

  // a resized picture's soft mask (8-bit grey) at the same size, lossless (Flate); null = leave the picture alone
  async function maskOf(doc, ref, size){
    const m = doc.context.lookup(ref);
    if (!(m instanceof PDFRawStream) || m.dict.has(N('Matte'))) return null;
    const p = plan(m, { mask:true }); if (!p) return null;
    const bmp = await bitmapOf(m, p, size), c = new OffscreenCanvas(size.w, size.h), x = c.getContext('2d');
    x.drawImage(bmp, 0, 0); bmp.close();
    const d = x.getImageData(0, 0, size.w, size.h).data, grey = new Uint8Array(size.w * size.h);
    for (let i = 0; i < grey.length; i++) grey[i] = d[i * 4];
    return doc.context.flateStream(grey, { Type:'XObject', Subtype:'Image', Width:size.w, Height:size.h, ColorSpace:'DeviceGray', BitsPerComponent:8 });
  }

  // the same object with new contents: the dictionary's other keys (/SMask, /Intent, /Interpolate, /Metadata…) stay
  function restream(doc, ref, old, bytes, set){
    const dict = old.dict.clone(doc.context);
    for (const k of ['Filter', 'DecodeParms', 'Length', 'DL']) dict.delete(N(k));
    for (const [k, v] of Object.entries(set)) dict.set(N(k), doc.context.obj(v));
    doc.context.assign(ref, PDFRawStream.of(dict, bytes));
  }

  // one picture: resample past 225 ppi to 150 ppi (on the page's long side), save as JPEG; kept only if ≥ 10 % smaller
  async function shrink(doc, ref, stream, p, long){
    const inches = long / 72, longPx = Math.max(p.w, p.h);
    let size = { w:p.w, h:p.h };
    if (longPx > inches * ABOVE_PPI) { const k = inches * TO_PPI / longPx; size = { w:Math.max(1, Math.round(p.w * k)), h:Math.max(1, Math.round(p.h * k)) }; }
    const resized = size.w !== p.w || size.h !== p.h, sm = stream.dict.get(N('SMask'));
    let mask = null;
    if (resized && sm) { if (!(sm instanceof PDFRef) || !(mask = await maskOf(doc, sm, size))) return; }
    const jpg = await jpegOf(await bitmapOf(stream, p, size));
    if (jpg.length > stream.contents.length * PICTURE_GAIN) return;
    restream(doc, ref, stream, jpg, { Width:size.w, Height:size.h, ColorSpace:'DeviceRGB', BitsPerComponent:8, Filter:'DCTDecode' });
    if (mask) doc.context.assign(sm, mask);
  }

  // Packing and clean-up: page thumbnails and other programs' private data (/PieceInfo) go, plain streams get Flate (not
  // XML metadata, which tools read as text), and objects nothing points to any more are dropped.
  function tidy(doc){
    const ctx = doc.context;
    for (const p of doc.getPages()) { p.node.delete(N('Thumb')); p.node.delete(N('PieceInfo')); }
    doc.catalog.delete(N('PieceInfo'));
    for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream) || obj.dict.has(N('Filter')) || obj.dict.lookup(N('Type')) === N('Metadata') || obj.contents.length < 64
          || obj.dict.has(N('DecodeParms')) || obj.dict.has(N('F')) || obj.dict.has(N('FFilter'))) continue;
      const packed = ctx.flateStream(obj.contents);
      for (const [k, v] of obj.dict.entries()) if (k !== N('Length') && k !== N('Filter')) packed.dict.set(k, v);
      if (packed.contents.length < obj.contents.length) ctx.assign(ref, packed);
    }
    const keep = new Set(), todo = [ctx.trailerInfo.Root, ctx.trailerInfo.Info];
    while (todo.length) {
      const o = todo.pop();
      if (o instanceof PDFRef) { if (!keep.has(o.tag)) { keep.add(o.tag); todo.push(ctx.lookup(o)); } }
      else if (o instanceof PDFDict) for (const [, v] of o.entries()) todo.push(v);
      else if (o instanceof PDFArray) for (let i = 0; i < o.size(); i++) todo.push(o.get(i));
      else if (o instanceof PDFStream) todo.push(o.dict);
    }
    for (const [ref] of ctx.enumerateIndirectObjects()) if (!keep.has(ref.tag)) ctx.delete(ref);
  }

  // → { bytes (null when not at least 1 % smaller), before, after }; throws .reason 'protected' | 'damaged' | 'cancelled'.
  // Pictures are done one at a time and each bitmap is closed at once, so a long scan doesn't fill memory.
  async function reduce(bytes, { onStep = () => {}, isCancelled = () => false } = {}){
    const before = bytes.byteLength;
    let doc;
    try { doc = await PDFDocument.load(bytes, { ignoreEncryption:true, updateMetadata:false }); } catch { throw fail('damaged'); }
    if (doc.isEncrypted) throw fail('protected');
    try {
      const sides = pageSides(doc), largest = Math.max(72, ...doc.getPages().map(p => { const s = p.getSize(); return Math.max(s.width, s.height); }));
      const masks = new Set(), jobs = [];
      for (const [, obj] of doc.context.enumerateIndirectObjects()) {
        const sm = obj instanceof PDFStream ? obj.dict.get(N('SMask')) : null;
        if (sm instanceof PDFRef) masks.add(sm.tag);   // soft masks are never JPEG'd on their own
      }
      for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
        if (!(obj instanceof PDFRawStream) || masks.has(ref.tag)) continue;
        const p = plan(obj); if (p) jobs.push({ ref, obj, p });
      }
      for (const [k, j] of jobs.entries()) {
        if (isCancelled()) throw fail('cancelled');
        onStep({ i:k + 1, n:jobs.length });
        try { await shrink(doc, j.ref, j.obj, j.p, sides.get(j.ref.tag) || largest); } catch { /* this picture stays as it was */ }
      }
      if (isCancelled()) throw fail('cancelled');
      tidy(doc);
      const out = await doc.save({ useObjectStreams:true, updateFieldAppearances:false });
      return { bytes: out.length <= before * FILE_GAIN ? out : null, before, after: out.length };
    } catch (e) { if (!e?.reason) console.error(e); throw e?.reason ? e : fail('damaged'); }
  }

  window.SastraReduce = { reduce, reducedName };
})();
