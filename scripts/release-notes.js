// GitHub release notes from a version's What's new entry (app/notes.js), so the notes are written once.
// `node scripts/release-notes.js <version>` prints Markdown; exit 1 when that version has no entry. Run by the release
// workflow (.github/workflows/release.yml).
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const WORDS = { new: 'New', improved: 'Improved', fixed: 'Fixed', removed: 'Removed' };

function loadNotes(file = path.join(ROOT, 'app', 'notes.js')) {
  const window = {};
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window }, { filename: file });
  return window.SastraNotes;
}

// "## New\n- …\n\n## Fixed\n- …\n": the kinds in What's new's order, only those the entry has
function notesMarkdown(entry, kinds = Object.keys(WORDS)) {
  return kinds.map(k => entry.notes.filter(n => n.kind === k))
    .map((list, i) => list.length ? `## ${WORDS[kinds[i]]}\n${list.map(n => `- ${n.text}\n`).join('')}` : '')
    .filter(Boolean).join('\n');
}

if (require.main === module) {
  const version = process.argv[2];
  const N = loadNotes(), entry = N.noteFor(version);
  if (!entry) { console.error(`::error::app/notes.js has no What's new entry for ${version}`); process.exit(1); }
  process.stdout.write(notesMarkdown(entry, N.KINDS));
}

module.exports = { loadNotes, notesMarkdown };
