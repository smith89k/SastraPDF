// Sastra PDF — the small window for File Explorer menu jobs (Split / Images / Reduce file size). main.js sends one batch
// per menu click ({ task, paths }); batches run one after another. Per click: open the PDFs (page counts decide the
// names), ask ONE Replace / Keep both / Cancel question, then write each file as soon as it is made.
(() => {
  const desk = window.sastra, Ops = window.SastraOps, Reduce = window.SastraReduce, { PDFDocument } = window.PDFLib;
  const $ = s => document.querySelector(s);
  const DPI = 300, JPG_QUALITY = 0.92;
  const queue = [];
  let running = false, cancelled = false, saved = 0, problemCount = 0, closeTimer = null, sizeBefore = 0, sizeAfter = 0;

  const dirOf = p => p.replace(/[\\/][^\\/]*$/, '');
  const fileOf = p => p.split(/[\\/]/).pop();
  const join = (d, n) => d.replace(/[\\/]+$/, '') + '\\' + n;
  const folderName = name => Ops.baseName(name).replace(/[ .]+$/, '') || 'PDF';   // Windows drops trailing dots/spaces
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const why = e => {
    const m = String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
    return /EACCES|EPERM/.test(m) ? 'no permission to save there' : /ENOSPC/.test(m) ? 'the disk is full'
      : /EBUSY/.test(m) ? 'a file with that name is open in another program' : m;
  };
  function show(what, step, frac) { $('#what').textContent = what; $('#step').textContent = step || ''; $('#fill').style.width = Math.round((frac || 0) * 100) + '%'; }
  function showWaiting() { const n = queue.length; $('#waiting').hidden = !n; $('#waiting').textContent = n ? `${n} more waiting` : ''; }
  function problem(text) { problemCount++; const li = document.createElement('li'); li.textContent = text; $('#problems').appendChild(li); $('#problems').hidden = false; }

  // the window is as tall as this content: report every change (problems list, "N more waiting")
  new ResizeObserver(() => desk.taskSize($('.task').getBoundingClientRect().height)).observe($('.task'));
  desk.onTaskBatch(b => { clearTimeout(closeTimer); queue.push(b); showWaiting(); if (!running) run(); });
  $('#bCancel').onclick = () => { cancelled = true; queue.length = 0; showWaiting(); $('#bCancel').disabled = true; $('#step').textContent = 'Stopping…'; };
  $('#bClose').onclick = () => window.close();

  // "Already there": the question is asked inside this window, like the app's own boxes → 'replace' | 'keep' | null
  let answer = null;
  const ASK = ['#bNo', '#bReplace', '#bKeep'];
  function ask(message, detail) {
    return new Promise(res => {
      $('#askMsg').textContent = message; $('#askDetail').textContent = detail; $('#ask').hidden = false;
      $('#bCancel').hidden = true; for (const id of ASK) $(id).hidden = false;
      answer = v => { answer = null; $('#ask').hidden = true; for (const id of ASK) $(id).hidden = true; $('#bCancel').hidden = false; res(v); };
      desk.taskFocus(); $('#bKeep').focus();
    });
  }
  $('#bNo').onclick = () => answer?.(null); $('#bReplace').onclick = () => answer?.('replace'); $('#bKeep').onclick = () => answer?.('keep');
  // no title bar, so Esc: answers Cancel, stops the job, or closes the finished window
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (answer) answer(null); else if (running) $('#bCancel').click(); else window.close();
  });
  desk.taskReady();

  async function run() {
    running = true; cancelled = false;
    $('#bCancel').hidden = false; $('#bCancel').disabled = false; $('#bClose').hidden = true;
    while (queue.length && !cancelled) { const b = queue.shift(); showWaiting(); await batch(b); }
    running = false; finish();
  }
  function finish() {
    document.body.dataset.done = String(+(document.body.dataset.done || 0) + 1);   // finished runs (tests read it)
    $('#bCancel').hidden = true; $('#bClose').hidden = false;
    const files = plural(saved, 'file');
    if (cancelled) show('Cancelled', `${files} saved`, 1);
    else if (problemCount) show('Done, with problems', `${files} saved · ${plural(problemCount, 'problem')} below`, 1);
    else {   // Reduce file size adds the sizes: "2 files saved · 18.6 MB → 4.9 MB"
      show('Done', `${files} saved${sizeAfter ? ` · ${Ops.fmtBytes(sizeBefore)} → ${Ops.fmtBytes(sizeAfter)}` : ''}`, 1);
      closeTimer = setTimeout(() => window.close(), 2000);
    }
    $('#bClose').focus();
  }

  async function readBytes(p, name) {
    const f = await desk.readFile(p);
    if (f.error) { problem(`${name}: couldn't read it (${f.error})`); return null; }
    return new Uint8Array(f.data);
  }
  async function countPages(p, name) {
    const bytes = await readBytes(p, name); if (!bytes) return 0;
    const task = (await Ops.pdfjs()).getDocument({ data: bytes, ...Ops.PDFJS_OPTS });   // pdf.js 6: destroy() lives on the loading task
    try { return (await task.promise).numPages; }
    catch (e) { problem(e?.name === 'PasswordException' ? `${name}: it's password-protected` : `${name}: it may be damaged or not a PDF`); return 0; }
    finally { task.destroy(); }
  }

  async function batch({ task, paths }) {
    if (task === 'reduce') return reduceBatch(paths);
    const split = task.startsWith('split'), inFolder = task.endsWith('-folder');
    const verb = split ? 'Splitting' : 'Making images of';
    const jobs = [];
    for (const [k, p] of paths.entries()) {
      if (cancelled) return;
      const name = fileOf(p);
      show(`Opening ${name}`, paths.length > 1 ? `File ${k + 1} of ${paths.length}` : '', 0);
      const n = await countPages(p, name); if (!n) continue;
      if (split && n < 2) { problem(`${name}: only one page — nothing to split`); continue; }
      const base = Ops.baseName(name), dir = inFolder ? join(dirOf(p), folderName(name)) : dirOf(p);
      const names = Array.from({ length: n }, (_, i) => split ? `${base}-${i + 1}.pdf` : Ops.imageName(base, i, n, 'jpg'));
      jobs.push({ path: p, name, n, dir, names });
    }
    if (!jobs.length || cancelled) return;
    const groups = jobs.map(j => ({ dir: j.dir, names: j.names })), q = await desk.nameClashes(groups);
    let choice = null;
    if (q.count) {
      show('Some files are already there', '', 0);
      choice = await ask(q.message, q.detail);
      if (!choice) { problem(`Cancelled: nothing saved for ${jobs.length === 1 ? jobs[0].name : plural(jobs.length, 'PDF')}`); return; }
    }
    const final = await desk.resolveNames(groups, choice);
    for (const [k, j] of jobs.entries()) {
      if (cancelled) return;
      j.names = final[k];
      if (inFolder) { const r = await desk.makeDir(j.dir); if (r.error) { problem(`${j.name}: couldn't make the folder "${fileOf(j.dir)}" (${r.error})`); continue; } }
      try { await (split ? splitOne(j, verb) : imagesOne(j, verb)); }
      catch (e) { problem(`${j.name}: ${why(e)}`); }
    }
  }

  // Reduce file size: "<name>_reduced.pdf" next to each PDF (reduce.js, as the main window's Save as Reduced Size PDF).
  // The "already there" question first, from the names alone; then each file is reduced and written at once.
  async function reduceBatch(paths) {
    const jobs = paths.map(p => ({ path: p, name: fileOf(p), dir: dirOf(p) }));
    const groups = jobs.map(j => ({ dir: j.dir, names: [Reduce.reducedName(j.name)] })), q = await desk.nameClashes(groups);
    let choice = null;
    if (q.count) {
      show('Some files are already there', '', 0);
      choice = await ask(q.message, q.detail);
      if (!choice) { problem(`Cancelled: nothing saved for ${jobs.length === 1 ? jobs[0].name : plural(jobs.length, 'PDF')}`); return; }
    }
    const final = await desk.resolveNames(groups, choice);
    for (const [k, j] of jobs.entries()) {
      if (cancelled) return;
      show(`Reducing ${j.name}`, jobs.length > 1 ? `File ${k + 1} of ${jobs.length}` : '', 0);
      const bytes = await readBytes(j.path, j.name); if (!bytes) continue;
      let r;
      try { r = await Reduce.reduce(bytes, { isCancelled: () => cancelled, onStep: ({ i, n }) => show(`Reducing ${j.name}`, `Picture ${i} of ${n}`, (i - 1) / n) }); }
      catch (e) {
        if (e?.reason === 'cancelled') return;
        problem(e?.reason === 'protected' ? `${j.name}: it's password-protected` : `${j.name}: it may be damaged or not a PDF`); continue;
      }
      if (!r.bytes) { problem(`${j.name} is already as small as it can be — no copy made`); continue; }
      try { await desk.writeFile(join(j.dir, final[k][0]), r.bytes); saved++; sizeBefore += r.before; sizeAfter += r.after; }
      catch (e) { problem(`${j.name}: ${why(e)}`); }
    }
  }

  async function splitOne(j, verb) {
    const bytes = await readBytes(j.path, j.name); if (!bytes) return;
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    if (src.isEncrypted) { problem(`${j.name}: it's protected, so it can't be split`); return; }
    for (let i = 0; i < j.n; i++) {
      if (cancelled) return;
      show(`${verb} ${j.name}`, `Page ${i + 1} of ${j.n}`, i / j.n);
      const out = await PDFDocument.create(); const [pg] = await out.copyPages(src, [i]); out.addPage(pg);
      await desk.writeFile(join(j.dir, j.names[i]), await out.save());
      saved++;
    }
  }

  async function imagesOne(j, verb) {
    const bytes = await readBytes(j.path, j.name); if (!bytes) return;
    const task = (await Ops.pdfjs()).getDocument({ data: bytes, ...Ops.PDFJS_OPTS }), doc = await task.promise;
    try {
      for (let i = 0; i < j.n; i++) {
        if (cancelled) return;
        show(`${verb} ${j.name}`, `Page ${i + 1} of ${j.n}`, i / j.n);
        const { blob, dpi } = await Ops.renderPage(doc, i, DPI, 'image/jpeg', JPG_QUALITY);
        if (dpi < DPI) problem(`${j.name}: page ${i + 1} is very large, so it was made at ${dpi} dpi`);
        await desk.writeFile(join(j.dir, j.names[i]), await blob.arrayBuffer());
        saved++;
      }
    } finally { task.destroy(); }
  }
})();
