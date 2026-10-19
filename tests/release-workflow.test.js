// .github/workflows/release.yml, read as text (no YAML library): it runs only by hand with a typed version, in five
// jobs. "check" holds the R2 key but installs nothing; "build" runs other people's code (pnpm install, electron-builder)
// and gets neither the R2 key nor the GitHub token, only the update key that goes into the app; "sign" and "rehash"
// (SignPath code signing) run only once SignPath is set up and see no R2 key, update key or GitHub token; "publish"
// uploads the built files with the key, installs nothing, and never releases an unsigned installer once signing is on.
// Uploads put latest.yml LAST, and "is it in R2?" counts only a real "not found" as absent. (Ported from Bohpum.)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const text = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'release.yml'), 'utf8').replace(/\r\n/g, '\n');
const otherPeoplesCode = /pnpm install|pnpm exec|electron-builder|build-explorer-menu|pnpm\/action-setup/;

// jobs: from each "  <name>:" under "jobs:" to the next; steps: from each "      - name:" / "      - uses:" to the next
const jobs = {};
{
  let cur = null;
  for (const l of text.slice(text.search(/^jobs:\n/m)).split('\n').slice(1)) {
    if (/^\s*#/.test(l)) continue;   // comments (one above each job describes the next job)
    const m = /^ {2}([\w-]+):\s*$/.exec(l); if (m) jobs[cur = m[1]] = []; else if (cur) jobs[cur].push(l);
  }
}
const stepsOf = lines => {
  const steps = [];
  for (const l of lines) { if (/^ {6}- (name|uses):/.test(l)) steps.push([l]); else if (steps.length) steps.at(-1).push(l); }
  return steps.map(s => {
    const name = (/^ {6}- name:\s*(.*)$/.exec(s[0]) || [])[1]?.replace(/^["']|["']$/g, '') || s[0].trim();
    const at = s.findIndex(l => /^ {8}env:\s*$/.test(l)), env = [];
    if (at >= 0) for (let i = at + 1; i < s.length && /^ {10}/.test(s[i]); i++) env.push(s[i].trim());
    const runAt = s.findIndex(l => /^ {8}run:/.test(l));
    let script = '';
    if (runAt >= 0) {
      const first = s[runAt].replace(/^ {8}run:\s*/, '');
      script = first === '|' ? s.slice(runAt + 1).filter(l => /^ {10}|^\s*$/.test(l)).map(l => l.slice(10)).join('\n') : first;
    }
    return { name, text: s.join('\n'), env: env.join('\n'), run: runAt >= 0 ? s.slice(runAt).join('\n') : '', script,
      shell: /^ {8}shell: pwsh/m.test(s.join('\n')) ? 'pwsh' : 'bash' };
  });
};
const J = Object.fromEntries(Object.entries(jobs).map(([k, v]) => [k, { text: v.join('\n'), steps: stepsOf(v) }]));
const ALL = ['check', 'build', 'sign', 'rehash', 'publish'];
const idx = (job, start) => J[job].steps.findIndex(s => s.name.startsWith(start));
const step = (job, start) => J[job].steps[idx(job, start)] || { run: '', text: '', env: '', script: '' };
const inOrder = (job, names) => { const at = names.map(n => idx(job, n)); return at.every(i => i >= 0) && at.every((v, i) => !i || v > at[i - 1]); };
const bash = ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files\\Git\\usr\\bin\\bash.exe'].find(p => fs.existsSync(p)) || 'bash';

test('It runs only by hand (workflow_dispatch) with a required version', () => {
  const on = (/^on:\n([\s\S]*?)^\S/m.exec(text) || [])[1] || '';
  assert.match(on, /^ {2}workflow_dispatch:/m);
  assert.doesNotMatch(on, /^ {2}(push|pull_request|pull_request_target|schedule|release|workflow_run):/m);
  assert.match(on, /^ {6}version:\n(?: {8}.*\n)*? {8}required: true/m);
});

test('No secret is given to the whole workflow or to all steps of a job; the workflow may only read', () => {
  const topEnv = (/^env:\n((?: {2}.*\n)+)/m.exec(text) || [])[1] || '';
  assert.doesNotMatch(topEnv, /secrets\./);
  assert.match(text, /^permissions:\n {2}contents: read$/m);
  for (const j of ALL) assert.doesNotMatch((/^ {4}env:\n((?: {6}.*\n)+)/m.exec(J[j].text + '\n') || [])[1] || '', /secrets\./, j);
});

test('Five jobs: check, build, sign and rehash (SignPath code signing), publish — each waiting for the ones before', () => {
  assert.deepEqual(Object.keys(J), ALL);
  assert.match(J.build.text, /^ {4}needs: check\s*$/m);
  assert.match(J.sign.text, /^ {4}needs: build\s*$/m);
  assert.match(J.rehash.text, /^ {4}needs: \[build, sign\]\s*$/m);
  assert.match(J.publish.text, /^ {4}needs: \[check, build, sign, rehash\]\s*$/m);
});

test('sign runs only when SignPath is set up; build keeps the unsigned installer on its own for it', () => {
  const on = /vars\.SIGNPATH_ORGANIZATION_ID != ''/;
  assert.match((/^ {4}if:.*$/m.exec(J.sign.text) || [''])[0], on);
  assert.ok(J.build.steps.some(s => /upload-artifact/.test(s.text) && /installer-unsigned/.test(s.text) && on.test(s.text)
    && /dist\/\$\{\{ env\.EXE \}\}\s*$/m.test(s.text)), J.build.steps.map(s => s.name).join(' | '));
  assert.match(J.build.text, /unsigned: \$\{\{ steps\.unsigned\.outputs\.artifact-id \}\}/);
});

test("sign: SignPath's action signs that artifact and waits for the approval; its only secret is the SignPath token", () => {
  const s = J.sign.steps.find(x => /signpath\/github-action-submit-signing-request@v\d/.test(x.text));
  assert.ok(s, 'the SignPath step');
  assert.match(s.text, /github-artifact-id: \$\{\{ needs\.build\.outputs\.unsigned \}\}/);
  assert.match(s.text, /wait-for-completion: true/);
  assert.match(s.text, /organization-id: \$\{\{ vars\.SIGNPATH_ORGANIZATION_ID \}\}/);
  assert.match(s.text, /project-slug: SastraPDF/);
  assert.match(s.text, /signing-policy-slug: release-signing/);
  assert.match(s.text, /api-token: \$\{\{ secrets\.SIGNPATH_API_TOKEN \}\}/);
  assert.deepEqual([...new Set(J.sign.text.match(/secrets\.\w+/g))], ['secrets.SIGNPATH_API_TOKEN']);
  assert.match(J.sign.text, /^ {6}actions: read/m);
});

test('sign and rehash never see the R2 key, the update key or the GitHub token; sign installs nothing', () => {
  assert.doesNotMatch(J.sign.text + J.rehash.text, /secrets\.(R2_|CF_ACCESS)|github\.token|GITHUB_TOKEN/);
  assert.doesNotMatch(J.rehash.text, /secrets\./);
  assert.doesNotMatch(J.sign.text, otherPeoplesCode);
  assert.match(J.rehash.text, /pnpm install --frozen-lockfile --ignore-scripts/);
});

test('rehash: the signed installer replaces the unsigned one, with its blockmap and latest.yml made again', () => {
  assert.match(J.rehash.text, /node scripts\/rehash-installer\.js "signed\/\$EXE" dist/);
  assert.match(J.rehash.text, /name: installer-signed/);
  assert.match(J.rehash.text, /name: installer-final/);
});

test('publish: unsigned only while SignPath is not set up; signed (rehash done) otherwise; never after a cancel', () => {
  const pubIf = (/^ {4}if: (.*)$/m.exec(J.publish.text) || [])[1] || '';
  assert.match(pubIf, /!cancelled\(\)/);
  assert.match(pubIf, /needs\.check\.result == 'success'/);
  assert.match(pubIf, /needs\.build\.result == 'success'/);
  assert.match(pubIf, /\(vars\.SIGNPATH_ORGANIZATION_ID == '' && needs\.sign\.result == 'skipped'\) \|\| needs\.rehash\.result == 'success'/);
  assert.match(J.publish.text, /name: \$\{\{ needs\.rehash\.result == 'success' && 'installer-final' \|\| 'installer' \}\}/);
});

test('check and publish install and build nothing; build never gets the R2 key or the GitHub token', () => {
  assert.doesNotMatch(J.check.text, otherPeoplesCode);
  assert.doesNotMatch(J.publish.text, otherPeoplesCode);
  assert.doesNotMatch(J.build.text, /secrets\.R2_|github\.token|secrets\.GITHUB_TOKEN|AWS_/);
  const keySteps = J.build.steps.filter(s => /secrets\./.test(s.text));
  assert.deepEqual(keySteps.map(s => s.name), ['Put the update key into the app (update-config.json)']);
  assert.deepEqual([...new Set(keySteps[0].text.match(/secrets\.\w+/g))].sort(), ['secrets.CF_ACCESS_CLIENT_ID', 'secrets.CF_ACCESS_CLIENT_SECRET']);
  assert.match(J.build.text, /^ {4}permissions:\n {6}contents: read/m);
  assert.match(J.publish.text, /^ {4}permissions:\n {6}contents: write/m);
  assert.match(J.check.text, /^ {4}permissions:\n {6}contents: read/m);
});

test('Each job does its steps in order', () => {
  assert.ok(inOrder('check', ['The version matches package.json', 'Before anything is built: the update address is locked']));
  assert.ok(inOrder('build', ['Install', 'Check What', 'Put the update key', 'Build the File Explorer menu', 'Build the installer', 'The build has the installer']));
  assert.ok(inOrder('publish', ['Upload to R2', 'The update address is locked', 'Remove older installers', 'GitHub release']));
});

test('check: the version, the release, the secrets and R2 first; then the lock, before anything is built', () => {
  const first = step('check', 'The version matches package.json');
  for (const s of ['R2_ACCOUNT_ID', 'R2_BUCKET', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'CF_ACCESS_CLIENT_ID', 'CF_ACCESS_CLIENT_SECRET']) assert.match(first.run, new RegExp(s));
  assert.match(first.run, /r2_has "\$EXE"/);
  assert.doesNotMatch(J.check.text, /head-object/);
  const early = step('check', 'Before anything is built: the update address is locked');
  assert.match(early.run, /sastra-update\.smith89k\.com/);
  assert.match(early.run, /CF-Access-Client-Id/);
  assert.match(early.env, /CF_ACCESS_CLIENT_SECRET/);
  assert.doesNotMatch(early.env, /R2_|AWS_/);
});

test('publish: latest.yml goes up after the installer; the lock is checked; prune through r2-prune.js', () => {
  const up = step('publish', 'Upload to R2').run, at = re => up.search(re);
  assert.ok(at(/put "dist\/\$EXE" "\$EXE"/) >= 0 && at(/put "dist\/\$EXE\.blockmap"/) > at(/put "dist\/\$EXE" "\$EXE"/)
    && at(/put dist\/latest\.yml/) > at(/put "dist\/\$EXE\.blockmap"/), up);
  assert.match(up, /source scripts\/r2-put\.sh/);
  const lock = step('publish', 'The update address is locked').run;
  assert.match(lock, /sastra-update\.smith89k\.com/);
  assert.match(lock, /\^version: \$VERSION/);
  assert.match(step('publish', 'Remove older installers').run, /node scripts\/r2-prune\.js "\$EXE"/);
});

test('The GitHub release: notes from What\'s new, the SHA-256, open source and the code signing policy', () => {
  const rel = step('publish', 'GitHub release').run;
  assert.match(rel, /node scripts\/release-notes\.js "\$VERSION"/);
  assert.match(rel, /Download the installer below and run it/);
  assert.match(rel, /SHA-256 of the installer/);
  assert.match(rel, /Free and open source \(GNU GPL 3\.0\)\. \[Code signing policy\]\(https:\/\/github\.com\/smith89k\/SastraPDF#code-signing-policy\)/);
  assert.match(rel, /gh release create "v\$VERSION" "dist\/\$EXE" --target "\$GITHUB_SHA"/);
});

test('Every bash step is valid bash', () => {
  const steps = ALL.flatMap(j => J[j].steps.filter(s => s.script && s.shell === 'bash').map(s => [j, s]));
  assert.ok(steps.length >= 10, String(steps.length));
  for (const [j, s] of steps) {
    const r = spawnSync(bash, ['-n'], { input: s.script.replace(/\$\{\{[^}]*\}\}/g, 'X'), encoding: 'utf8' });
    assert.equal(r.status, 0, `${j} › ${s.name}: ${r.stderr}`);
  }
});

// scripts/r2-put.sh, run for real in bash with a stand-in aws
test('r2-put.sh: put checks the stored size; r2_has says absent only on a real 404, and stops on anything else', () => {
  const sh = fs.readFileSync(path.join(ROOT, 'scripts', 'r2-put.sh'), 'utf8');
  assert.match(sh, /put\(\)\s*\{[\s\S]*head-object[\s\S]*ContentLength/);
  const has = (awsSays, code) => {
    const r = spawnSync(bash, ['-c', `aws() { echo "${awsSays}" >&2; return ${code}; }; source scripts/r2-put.sh; r2_has some/key; echo "rc=$?"`], { cwd: ROOT, encoding: 'utf8' });
    return { out: (r.stdout || '') + (r.stderr || ''), status: r.status };
  };
  assert.match(has('', 0).out, /rc=0/);
  assert.match(has('An error occurred (404) when calling the HeadObject operation: Not Found', 254).out, /rc=1/);
  for (const [say, code] of [['Could not connect to the endpoint URL: "https://x.r2.cloudflarestorage.com/b/some/key"', 255],
                             ['An error occurred (403) when calling the HeadObject operation: Forbidden', 254]]) {
    const r = has(say, code);
    assert.equal(r.status, 1, r.out);
    assert.doesNotMatch(r.out, /rc=/);
    assert.match(r.out, /::error::/);
  }
});

// the Windows runner checks out with core.autocrlf: a CRLF .sh breaks bash's `source`
test('Shell scripts are checked out with LF line ends', () => {
  const attrs = fs.readFileSync(path.join(ROOT, '.gitattributes'), 'utf8');
  assert.match(attrs, /^\*\.sh\s+text\s+eol=lf\s*$/m);
});
