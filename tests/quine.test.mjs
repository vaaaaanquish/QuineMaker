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
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

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

// A diamond plus a synthetic RGB gradient, for exercising the ANSI color mode.
function coloredDiamond(width, height = width) {
  const m = diamondMask(width, height);
  const colors = new Uint8ClampedArray(width * height * 3);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const i = (r * width + c) * 3;
      colors[i] = (255 * c) / width;       // R ramps left->right
      colors[i + 1] = (255 * r) / height;  // G ramps top->bottom
      colors[i + 2] = 200;
    }
  }
  m.colors = colors;
  return m;
}

function runCase(lang, gen, runner, ext, mark, name, mask, comment, ansi = false) {
  const { source, colored, width, height } = gen.generate(mask, { comment, ansi });
  const tag = `[${lang}${ansi ? '+ansi' : ''}] ${name}`;

  // 1) the SAVED source is clean text (no ANSI bytes) and a clean rectangle:
  // every line is exactly `width` display columns.
  if (source.includes('\x1b')) throw new Error(`${tag} saved source contains ANSI escape bytes`);
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

  // 4) quine: run the saved (clean) source.
  //   - plain: stdout == source (strict byte-for-byte quine)
  //   - ansi : stdout == colored (the generator's predicted colored output),
  //            and stripping the ANSI from stdout reproduces the source — a
  //            quine "modulo ANSI".
  const dir = mkdtempSync(join(tmpdir(), 'quine-'));
  const file = join(dir, `q.${ext}`);
  writeFileSync(file, source);
  const res = spawnSync(runner, [file], { encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`${tag} ${runner} error: ${res.stderr}`);
  const expected = ansi ? colored : source;
  if (res.stdout !== expected) {
    let i = 0;
    while (i < expected.length && res.stdout[i] === expected[i]) i++;
    throw new Error(
      `${tag} NOT a quine. First diff at ${i}: ` +
      `exp=${JSON.stringify(expected.slice(i, i + 20))} out=${JSON.stringify(res.stdout.slice(i, i + 20))}`
    );
  }
  if (ansi && stripAnsi(res.stdout) !== source) {
    throw new Error(`${tag} ANSI-stripped output does not match the saved source`);
  }

  // 5) the colored output is itself a fixed point: re-running it reproduces it,
  // even if a terminal/editor ate the ESC bytes when it was copied out (the
  // bare "[..m" sequences are stripped by the renderer just the same).
  if (ansi) {
    for (const [suffix, text] of [['out', colored], ['out.noesc', colored.replaceAll('\x1b', '')]]) {
      const f = join(dir, `q.${suffix}.${ext}`);
      writeFileSync(f, text);
      const r2 = spawnSync(runner, [f], { encoding: 'utf8' });
      if (r2.status !== 0) throw new Error(`${tag} re-running colored (${suffix}) crashes: ${r2.stderr}`);
      if (r2.stdout !== colored) throw new Error(`${tag} colored output (${suffix}) is not a fixed point`);
    }
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

// ANSI color cases: same shapes with a gradient, generated as colored quines.
const ansiCases = [
  ['color diamond-120 default', coloredDiamond(120), ''],
  ['color diamond-120 ascii comment', coloredDiamond(120), 'QuineMaker by m3'],
  ['color diamond-140x100 unicode', coloredDiamond(140, 100), 'クワイン'],
];

let failed = 0;
for (const { lang, gen, runner, ext, mark } of langs) {
  for (const [name, mask, comment] of cases) {
    try { runCase(lang, gen, runner, ext, mark, name, mask, comment); }
    catch (e) { failed++; console.error(`✗ ${e.message}`); }
  }
  for (const [name, mask, comment] of ansiCases) {
    try { runCase(lang, gen, runner, ext, mark, name, mask, comment, true); }
    catch (e) { failed++; console.error(`✗ ${e.message}`); }
  }
}

if (failed) { console.error(`\n${failed} test(s) failed`); process.exit(1); }
console.log('\nall tests passed');
