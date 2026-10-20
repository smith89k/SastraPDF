// Sastra PDF — Reduce file size, as Acrobat's File › Save as Other › Reduced Size PDF: plain streams get Flate, page
// thumbnails, other programs' private data and objects nothing uses go, object streams pack the rest. Text, fonts
// (Khmer too), lines, links, bookmarks, forms and comments are not touched. Shared by index.html (Save ▾ › Save as
// Reduced Size PDF…) and task.html (File Explorer › Reduce file size), so both make the same file.
// Spec: docs/superpowers/specs/2026-10-20-reduce-size-design.md
(() => {
  const { PDFDocument, PDFName, PDFDict, PDFArray, PDFRef, PDFStream, PDFRawStream } = PDFLib;
  const N = n => PDFName.of(n);
  const FILE_GAIN = 0.99;   // no copy unless at least 1 % smaller
  const fail = reason => Object.assign(new Error(reason), { reason });

  // "Report.pdf" → "Report_reduced.pdf"
  const reducedName = name => String(name).replace(/\.pdf$/i, '') + '_reduced.pdf';

  // Packing and clean-up: page thumbnails and other programs' private data (/PieceInfo) go, plain streams get Flate (not
  // XML metadata, which tools read as text), and objects nothing points to any more are dropped.
  function tidy(doc){
    const ctx = doc.context;
    for (const p of doc.getPages()) { p.node.delete(N('Thumb')); p.node.delete(N('PieceInfo')); }
    doc.catalog.delete(N('PieceInfo'));
    for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream) || obj.dict.has(N('Filter')) || obj.dict.lookup(N('Type')) === N('Metadata') || obj.contents.length < 64) continue;
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

  async function reduce(bytes, { onStep = () => {}, isCancelled = () => false } = {}){
    const before = bytes.byteLength;
    let doc;
    try { doc = await PDFDocument.load(bytes, { ignoreEncryption:true, updateMetadata:false }); } catch { throw fail('damaged'); }
    if (doc.isEncrypted) throw fail('protected');
    try {
      if (isCancelled()) throw fail('cancelled');
      tidy(doc);
      const out = await doc.save({ useObjectStreams:true, updateFieldAppearances:false });
      return { bytes: out.length <= before * FILE_GAIN ? out : null, before, after: out.length };
    } catch (e) { throw e?.reason ? e : fail('damaged'); }
  }

  window.SastraReduce = { reduce, reducedName };
})();
