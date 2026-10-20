// Builds the File Explorer right-click menu: SastraMenu.dll (C++, MSVC) and the unsigned sparse package
// SastraPDF.ExplorerMenu.msix, into explorer-menu/out/ (gitignored; electron-builder copies them to
// resources/explorer-menu). Needs Visual Studio Build Tools ("Desktop development with C++", x64) and the
// Windows 10/11 SDK. Run by `pnpm run dist`; alone: `pnpm run build:menu`.
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'explorer-menu'), OUT = path.join(SRC, 'out'), OBJ = path.join(OUT, 'obj');
const PF86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
const fail = msg => { console.error('build-explorer-menu: ' + msg); process.exit(1); };

// CLSID, package version and file types must be the same in the DLL, both manifests and explorer-menu.js
const { CLSID, PKG, PKG_VERSION, EXTS, TASKS } = require('../explorer-menu.js');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const problems = require('./menu-sources').menuProblems({ cpp: read('explorer-menu', 'menu.cpp'), sparse: read('explorer-menu', 'AppxManifest.xml'),
  store: read('build', 'store-manifest.xml'), CLSID, PKG, PKG_VERSION, EXTS, TASKS });
if (problems.length) fail(problems[0]);

function vcvars() {
  const vswhere = path.join(PF86, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
  if (!fs.existsSync(vswhere)) fail('Visual Studio Build Tools not found. Install "Desktop development with C++".');
  const r = spawnSync(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], { encoding: 'utf8' });
  const dir = (r.stdout || '').trim().split(/\r?\n/)[0];
  const bat = dir && path.join(dir, 'VC', 'Auxiliary', 'Build', 'vcvars64.bat');
  if (!bat || !fs.existsSync(bat)) fail('the C++ x64 build tools are not installed (Visual Studio Installer → Desktop development with C++).');
  return bat;
}
function makeappx() {
  const bin = path.join(PF86, 'Windows Kits', '10', 'bin');
  const num = v => v.split('.').map(Number);
  const vers = (fs.existsSync(bin) ? fs.readdirSync(bin) : [])
    .filter(v => /^10\.\d+\.\d+\.\d+$/.test(v) && fs.existsSync(path.join(bin, v, 'x64', 'makeappx.exe')))
    .sort((a, b) => { const x = num(a), y = num(b); for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; });
  if (!vers.length) fail('makeappx.exe not found. Install the Windows 10/11 SDK.');
  return path.join(bin, vers.at(-1), 'x64', 'makeappx.exe');
}
const run = (exe, args, opts = {}) => { const r = spawnSync(exe, args, { stdio: 'inherit', ...opts }); if (r.status !== 0) fail(`${path.basename(exe)} failed (${r.status ?? r.error})`); };

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OBJ, { recursive: true });

// 1) the DLL. /MT: no Visual C++ runtime needed on the user's PC. A .bat because vcvars sets the environment.
const bat = path.join(OBJ, 'build.bat');
fs.writeFileSync(bat, [
  '@echo off',
  `call "${vcvars()}" >nul 2>&1 || exit /b 1`,
  `cd /d "${OBJ}"`,
  `cl /nologo /std:c++17 /EHsc /O2 /MT /LD /W3 /utf-8 /DUNICODE /D_UNICODE "${path.join(SRC, 'menu.cpp')}" /Fe"${path.join(OUT, 'SastraMenu.dll')}" /link /DEF:"${path.join(SRC, 'menu.def')}" /IMPLIB:SastraMenu.lib || exit /b 1`
].join('\r\n'));
run('cmd.exe', ['/d', '/s', '/c', `""${bat}""`], { windowsVerbatimArguments: true });

// 2) the package: manifest + logos only (the DLL stays in the install folder = ExternalLocation)
const stage = path.join(OBJ, 'package');
fs.mkdirSync(path.join(stage, 'Assets'), { recursive: true });
fs.copyFileSync(path.join(SRC, 'AppxManifest.xml'), path.join(stage, 'AppxManifest.xml'));
for (const f of fs.readdirSync(path.join(SRC, 'Assets'))) fs.copyFileSync(path.join(SRC, 'Assets', f), path.join(stage, 'Assets', f));
run(makeappx(), ['pack', '/o', '/nv', '/d', stage, '/p', path.join(OUT, `${PKG}.msix`)], { stdio: ['ignore', 'ignore', 'inherit'] });

fs.rmSync(OBJ, { recursive: true, force: true });
console.log(`build-explorer-menu: ${path.relative(ROOT, OUT)}\\SastraMenu.dll and ${PKG}.msix ready`);
