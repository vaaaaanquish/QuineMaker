// Video-chain test: build N synthetic frames, generate the CYCLIC chain with
// the real generators, then run each S_i with the real interpreter and assert
// stdout == S_{(i+1) mod N} byte-for-byte (the JS-side composition and the
// embedded renderer must agree). Running the last frame must reproduce S_0
// exactly — the system is a quine of period N.
//
// Also exercises the overflow path: payload that doesn't fit in a picture
// spills into full-width data rows between the opener row and the picture.
//
// Usage: node tests/video.test.mjs   (requires python3 and node >= 18 on PATH)

import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pythonGenerator } from '../src/generators/python.js';
import { javascriptGenerator } from '../src/generators/javascript.js';
import { makeVideoBitmaps } from '../src/mask.js';

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

// N frames of a filled square sliding left -> right (1 = dark subject).
function movingSquareFrames(W, H, N) {
  const side = Math.floor(H / 2);
  const frames = [];
  for (let f = 0; f < N; f++) {
    const cells = new Uint8Array(W * H);
    const x0 = Math.round(((W - side) * f) / Math.max(1, N - 1));
    const y0 = (H - side) >> 1;
    for (let r = y0; r < y0 + side; r++) {
      for (let c = x0; c < x0 + side; c++) cells[r * W + c] = 1;
    }
    frames.push(cells);
  }
  return frames;
}

// Frames alternating between nearly full and nearly empty pictures — the
// empty ones have almost no code cells, forcing everything into data rows.
function pulseFrames(W, H, N) {
  const frames = [];
  for (let f = 0; f < N; f++) {
    const cells = new Uint8Array(W * H);
    const on = f % 2 === 0;
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        cells[r * W + c] = on || (r === H >> 1 && c >= f && c < f + 4) ? 1 : 0;
      }
    }
    frames.push(cells);
  }
  return frames;
}

async function runChainCase(lang, gen, runner, ext, name, cellGrids, W, H, comment, invert = false) {
  const tag = `[${lang}] ${name}`;
  const { bitmaps } = makeVideoBitmaps(cellGrids, { invert });
  const res0 = await gen.generateVideo({ width: W, height: H, bitmaps }, { comment });
  const { source, composeFrame, frames, width, height, dataRows } = res0;

  if (frames !== cellGrids.length) {
    throw new Error(`${tag} expected ${cellGrids.length} frames, got ${frames}`);
  }
  const sources = [];
  for (let i = 0; i < frames; i++) sources.push(composeFrame(i));
  if (source !== sources[0]) throw new Error(`${tag} source != composeFrame(0)`);

  // Every frame program is a clean rectangle (opener row + data rows +
  // picture + closer, all W display columns), no ANSI, no "_" in the picture.
  for (const [i, src] of sources.entries()) {
    if (src.includes('\x1b')) throw new Error(`${tag} S_${i} contains ANSI escape bytes`);
    const lines = src.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    const bad = lines.find((l) => dispW(l) !== width);
    if (bad !== undefined) {
      throw new Error(`${tag} S_${i} non-rectangular: a line has ${dispW(bad)} cols, want ${width}`);
    }
    // the picture is the G rows just above the closer
    const picture = lines.slice(-1 - height, -1).join('\n');
    if (picture.includes('_')) {
      throw new Error(`${tag} S_${i} picture contains "_" filler`);
    }
  }

  // Cyclic chain: running S_i prints S_{(i+1) mod N} — the run of the last
  // frame must reproduce S_0 byte-for-byte (quine of period N).
  const dir = mkdtempSync(join(tmpdir(), 'quine-video-'));
  for (let i = 0; i < frames; i++) {
    const file = join(dir, `s${i}.${ext}`);
    writeFileSync(file, sources[i]);
    const res = spawnSync(runner, [file], { encoding: 'utf8' });
    if (res.status !== 0) throw new Error(`${tag} S_${i} ${runner} error: ${res.stderr}`);
    const next = (i + 1) % frames;
    const expected = sources[next];
    if (res.stdout !== expected) {
      let j = 0;
      while (j < expected.length && res.stdout[j] === expected[j]) j++;
      throw new Error(
        `${tag} S_${i} does not print S_${next}. First diff at ${j}: ` +
        `exp=${JSON.stringify(expected.slice(j, j + 20))} out=${JSON.stringify(res.stdout.slice(j, j + 20))}`
      );
    }
  }

  console.log(`✓ ${tag} (${frames} frames cyclic, ${width}x${height} pic + ${dataRows} data rows, S_0 ${source.length} chars)`);
}

const langs = [
  { lang: 'python', gen: pythonGenerator, runner: 'python3', ext: 'py' },
  { lang: 'javascript', gen: javascriptGenerator, runner: 'node', ext: 'js' },
];
const cases = [
  ['square-110x40 x6', movingSquareFrames(110, 40, 6), 110, 40, 'QuineMaker video'],
  ['square-120x44 x12 unicode', movingSquareFrames(120, 44, 12), 120, 44, '動画クワイン'],
  // 40 frames on a small grid: total delta data far exceeds any single
  // picture's capacity, so early frames must carry data rows.
  ['square-80x24 x40 overflow', movingSquareFrames(80, 24, 40), 80, 24, 'long'],
  // nearly-empty pictures (few code cells) — everything spills below.
  ['pulse-90x20 x9 empty pics', pulseFrames(90, 20, 9), 90, 20, ''],
];

let failed = 0;
for (const { lang, gen, runner, ext } of langs) {
  for (const [name, cellGrids, W, H, comment] of cases) {
    try { await runChainCase(lang, gen, runner, ext, name, cellGrids, W, H, comment); }
    catch (e) { failed++; console.error(`✗ ${e.message}`); }
  }
}

if (failed) { console.error(`\n${failed} test(s) failed`); process.exit(1); }
console.log('\nall video tests passed');
