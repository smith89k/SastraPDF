// Warns when the versions on the About screen (CREDITS in app/index.html) no longer match the
// packages npm installed. Never fails the install.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const installed = pkg => require(path.join(root, 'node_modules', pkg, 'package.json')).version;
const libs = { 'pdf.js': 'pdfjs-dist', 'pdf-lib': 'pdf-lib', 'JSZip': 'jszip', 'pako': 'pako', 'Electron': 'electron' };

const html = fs.readFileSync(path.join(root, 'app', 'index.html'), 'utf8');
const start = html.indexOf('const CREDITS = [');
const block = html.slice(start, html.indexOf('];', start));
const problems = [];
for (const [, name, shown] of block.matchAll(/\['([^']+)','([^']*)',/g)) {
  const pkg = libs[name]; if (!pkg) continue;
  const v = installed(pkg);
  if (shown !== v) problems.push(`About lists ${name} ${shown || '(no version)'}, installed is ${v}`);
}
if (problems.length) console.warn('credits: the About screen is out of date —\n  ' + problems.join('\n  '));
else console.log('credits: About screen versions match the installed packages');
