// Copies the PDF libraries from node_modules into app/vendor so the app runs fully offline.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'app', 'vendor');
fs.mkdirSync(out, { recursive: true });

const files = [
  'pdfjs-dist/build/pdf.min.js',
  'pdfjs-dist/build/pdf.worker.min.js',
  'pdf-lib/dist/pdf-lib.min.js',
  'jszip/dist/jszip.min.js'
];

for (const f of files) {
  const src = path.join(root, 'node_modules', f);
  if (!fs.existsSync(src)) { console.error('Missing ' + src + ' — run "npm install" again.'); process.exit(1); }
  fs.copyFileSync(src, path.join(out, path.basename(f)));
  console.log('vendor: ' + path.basename(f));
}
