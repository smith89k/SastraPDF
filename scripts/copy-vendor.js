// Copies the PDF libraries from node_modules into app/vendor so the app runs fully offline.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'app', 'vendor');
fs.rmSync(out, { recursive: true, force: true });   // generated folder: start clean so old files don't ship
fs.mkdirSync(out, { recursive: true });

const files = [
  'pdfjs-dist/build/pdf.min.mjs',
  'pdfjs-dist/build/pdf.worker.min.mjs',
  'pdf-lib/dist/pdf-lib.min.js',
  'jszip/dist/jszip.min.js'
];
// pdf.js support files: image decoders for scanned pages (JBIG2, JPEG 2000) and colour profiles,
// the 14 standard PDF fonts, and character maps for Chinese/Japanese/Korean text.
// quickjs-eval.* runs scripts inside PDF forms, which the app never does, so it stays out.
const dirs = ['wasm', 'standard_fonts', 'cmaps'];
const skip = f => /^quickjs-eval\./.test(f);

const need = src => { if (!fs.existsSync(src)) { console.error('Missing ' + src + ' — run "npm install" again.'); process.exit(1); } };
for (const f of files) {
  const src = path.join(root, 'node_modules', f); need(src);
  fs.copyFileSync(src, path.join(out, path.basename(f)));
  console.log('vendor: ' + path.basename(f));
}
for (const d of dirs) {
  const src = path.join(root, 'node_modules', 'pdfjs-dist', d); need(src);
  const dst = path.join(out, 'pdfjs', d); fs.mkdirSync(dst, { recursive: true });
  const list = fs.readdirSync(src).filter(f => !skip(f));
  for (const f of list) fs.copyFileSync(path.join(src, f), path.join(dst, f));
  console.log('vendor: pdfjs/' + d + '/ (' + list.length + ' files)');
}
