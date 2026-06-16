// Shared helpers for the ANSI-colored quine mode.
//
// A colored quine is a quine "modulo ANSI": the SAVED source is clean text
// (no escape bytes, so it opens uncorrupted in an editor), and running it
// prints the SAME text repainted with 24-bit ANSI color codes — stripping the
// colors from that output reproduces the source exactly. The colors are NOT
// stored as escape bytes in the source; they live in a base64 segment, and the
// embedded renderer rebuilds them. (The renderer still strips any ANSI it sees
// while recovering the payload, so re-running the colored output also works.)
//
// Color data must fit inside the picture's code cells, so colors are coarsely
// quantized (4 levels/channel) into a small palette and the per-cell palette
// indices are run-length encoded — stored as one extra base64 segment.

import { b64encodeBytes } from './base64.js';

// Lift dark colors into [64,255] so they stay readable on dark backgrounds
// (the in-app code pane and most terminals). Shared with the on-screen display.
export const lift = (v) => Math.round(64 + (v * 191) / 255);

// Coarse quantization to {0,85,170,255}: keeps the palette tiny (<=64 colors)
// and RLE runs long, so the color data comfortably fits the code cells.
const quant = (v) => Math.round(v / 85) * 85;
const qlift = (v) => quant(lift(v));

export const ESC = '\x1b';
export const reset = () => `${ESC}[0m`;
export const fg = (r, g, b) => `${ESC}[38;2;${r};${g};${b}m`;

// Walk the payload code cells (cells === B, excluding the opener) in render
// order and build a small palette plus a per-cell palette index. The order
// matches how the renderer consumes payload chars, so idx[k] is the color of
// the k-th payload char.
export function buildPalette(cells, colors, W, G, B, openerLen) {
  const map = new Map();
  const palette = [];
  const idx = [];
  for (let r = 0; r < G; r++) {
    for (let c = 0; c < W; c++) {
      if (r === 0 && c < openerLen) continue;
      if (cells[r * W + c] !== B) continue;
      const i = (r * W + c) * 3;
      const rr = qlift(colors[i]), gg = qlift(colors[i + 1]), bb = qlift(colors[i + 2]);
      const key = (rr << 16) | (gg << 8) | bb;
      let pi = map.get(key);
      if (pi === undefined) { pi = palette.length; map.set(key, pi); palette.push([rr, gg, bb]); }
      idx.push(pi);
    }
  }
  return { palette, idx };
}

// Encode palette + RLE(count,index) of per-cell indices to bytes:
//   [K] [r g b]*K  then  [count index]* (count in 1..255).
export function encodeColorBytes(palette, idx) {
  const bytes = [palette.length];
  for (const [r, g, b] of palette) bytes.push(r, g, b);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j < idx.length && idx[j] === idx[i] && j - i < 255) j++;
    bytes.push(j - i, idx[i]);
    i = j;
  }
  return Uint8Array.from(bytes);
}

// Build the color segment for a mask: returns the base64 plus the palette/idx
// reused to compose the source so it matches what the renderer decodes.
export function colorSegment(cells, colors, W, G, B, openerLen) {
  if (!colors) {
    throw Object.assign(new Error('no colors for ANSI mode'), { code: 'err_no_colors' });
  }
  const { palette, idx } = buildPalette(cells, colors, W, G, B, openerLen);
  if (palette.length > 255) throw new Error(`internal: palette ${palette.length} > 255`);
  return { b64: b64encodeBytes(encodeColorBytes(palette, idx)), palette, idx };
}

// Compose the picture rows WITH ANSI color codes — the exact byte sequence the
// embedded renderer reproduces. `head` fills row 0 cols 0..head.length-1 and is
// never colored; a color code is emitted only when the cell color changes, and
// a reset closes each row that opened one.
export function composeColoredRows(cells, W, G, B, head, payload, palette, idx) {
  const rows = [];
  let k = 0;
  for (let r = 0; r < G; r++) {
    let row = '';
    let cur = -1;
    for (let c = 0; c < W; c++) {
      if (r === 0 && c < head.length) {
        if (cur !== -1) { row += reset(); cur = -1; }
        row += head[c];
      } else if (cells[r * W + c] === B) {
        const ci = idx[k];
        if (ci !== cur) { const a = palette[ci]; row += fg(a[0], a[1], a[2]); cur = ci; }
        row += payload[k++];
      } else {
        row += ' ';
      }
    }
    if (cur !== -1) row += reset();
    rows.push(row);
  }
  return rows.join('\n');
}
