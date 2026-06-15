// Unit test: generate a quine from a synthetic mask, run it with the real
// interpreter (python3 / node), and assert stdout == source. Also checks the
// output is a clean W-wide rectangle (by display width) and the body has no
// "_" filler.
//
// Usage: node tests/quine.test.mjs   (requires python3 and node on PATH)

import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pythonGenerator } from '../src/generators/python.js';
import { javascriptGenerator } from '../src/generators/javascript.js';
import { makeMask } from '../src/mask.js';

function isWide(cp) {
  return (
    (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0x303e) ||
    (cp >= 0x3041 && cp <= 0x33ff) || (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}
const dispW = (s) => Array.from(s).reduce((w, ch) => w + (isWide(ch.codePointAt(0)) ? 2 : 1), 0);

function diamondMask(width, height = width) {
  const cells = new Uint8Array(width * height);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const d = Math.abs(r - (height >> 1)) + Math.abs(c - (width >> 1));
      cells[r * width + c] = Math.abs(d - Math.floor(width / 3)) <= 1 ? 1 : 0;
    }
  }
  return makeMask(cells, width, height, {});
}

function runCase(lang, gen, runner, ext, mark, name, mask, comment) {
  const { source, width, height } = gen.generate(mask, { comment });
  const tag = `[${lang}] ${name}`;

  // 1) clean rectangle: every line is exactly `width` display columns
  const lines = source.split('\n');
  if (lines[lines.length - 1] === '') lines.pop(); // trailing newline
  const bad = lines.find((l) => dispW(l) !== width);
  if (bad !== undefined) {
    throw new Error(`${tag} non-rectangular: a line has ${dispW(bad)} cols, want ${width}`);
  }

  // 2) no "_" in the picture body (the base64 region; closer/comment may have _)
  const body = lines.slice(0, height).join('\n');
  if (body.includes('_')) throw new Error(`${tag} body contains "_" filler`);

  // 3) the comment appears as a readable trailing comment
  if (comment) {
    const first = Array.from(comment.replace(/[\r\n]+/g, ' '))[0];
    if (!source.includes(mark + first)) {
      throw new Error(`${tag} comment not found in the trailing comment`);
    }
  }

  // 4) true quine: interpreter stdout == source
  const dir = mkdtempSync(join(tmpdir(), 'quine-'));
  const file = join(dir, `q.${ext}`);
  writeFileSync(file, source);
  const res = spawnSync(runner, [file], { encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`${tag} ${runner} error: ${res.stderr}`);
  if (res.stdout !== source) {
    let i = 0;
    while (i < source.length && res.stdout[i] === source[i]) i++;
    throw new Error(
      `${tag} NOT a quine. First diff at ${i}: ` +
      `src=${JSON.stringify(source.slice(i, i + 20))} out=${JSON.stringify(res.stdout.slice(i, i + 20))}`
    );
  }
  console.log(`✓ ${tag} (${source.length} chars, ${width}x${height} rect)`);
}

const langs = [
  { lang: 'python', gen: pythonGenerator, runner: 'python3', ext: 'py', mark: '# ' },
  { lang: 'javascript', gen: javascriptGenerator, runner: 'node', ext: 'js', mark: '// ' },
];
const cases = [
  ['diamond-100 default fill', diamondMask(100), ''],
  ['diamond-100 ascii comment', diamondMask(100), 'QuineMaker by m3'],
  ['diamond-120 unicode comment', diamondMask(120), 'クワイン製造機'],
  ['diamond-90x140 quoty comment', diamondMask(90, 140), `a'b"c:d\\e@f#g!h`],
];

let failed = 0;
for (const { lang, gen, runner, ext, mark } of langs) {
  for (const [name, mask, comment] of cases) {
    try { runCase(lang, gen, runner, ext, mark, name, mask, comment); }
    catch (e) { failed++; console.error(`✗ ${e.message}`); }
  }
}

if (failed) { console.error(`\n${failed} test(s) failed`); process.exit(1); }
console.log('\nall tests passed');
