// Shared engine for the video quine chain (language-agnostic parts).
//
// A video quine is a CYCLIC chain: program S_i is shaped like frame i and,
// when run, prints S_{(i+1) mod N} byte-for-byte — after N runs the original
// S_0 comes back, so the system is a true quine of period N.
//
// S_0 must contain the whole video, and a frame's picture holds only a few
// KB, so each program carries full-width "data rows". Layout (top to bottom):
//   row 0   : opener (p=''' / p=`) + payload
//   rows    : data rows (payload, W chars each; count adapts per frame)
//   rows    : the PICTURE (G rows; payload chars on code cells, spaces on
//             holes) — placed LAST so running/cat-ing a program leaves the
//             picture on screen with no head/tail gymnastics
//   closer  : boot line (decodes + executes the renderer)
//
// Payload (whitespace-free, read in text order):
//   b64(RENDERER) D b64(BOTTOM) D idx D blob64 D FILL
//
// blob64 = base64(deflate(concat of bit-packed layouts of ALL N frames)).
// Carrying plain layouts (not XOR deltas) compresses better — deflate's
// window already exploits inter-frame similarity — and the renderer only
// ever INFLATES (deterministic everywhere), so the chain stays byte-exact:
// python uses zlib.decompress, node uses zlib.inflateSync, and the browser
// generator compresses once via CompressionStream('deflate').

import { b64encodeUtf8, b64encodeBytes, packBits } from './base64.js';

async function deflateBytes(u8) {
  const stream = new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Build the cyclic chain. Language particulars come in via `lang`; the
 * composition below is the reference implementation the embedded renderers
 * must match byte-for-byte.
 *
 * @param {{width:number,height:number,bitmaps:Uint8Array[]}} frames 1 = code cell
 * @param {{head:string, delim:string, bottomText:string, buildRenderer:(W,G,N)=>string}} lang
 * @returns {Promise<{source:string, composeFrame:(i:number)=>string, frames:number,
 *            width:number, height:number, dataRows:number, commentRows:number}>}
 */
export async function buildVideoChain(frames, lang) {
  const { width: W, height: G, bitmaps } = frames;
  const { head, delim: D, bottomText, buildRenderer } = lang;
  const N = bitmaps.length;
  const stride = Math.ceil((W * G) / 8);
  const packed = new Uint8Array(stride * N);
  bitmaps.forEach((bm, j) => packed.set(packBits(bm), j * stride));
  const blob64 = b64encodeBytes(await deflateBytes(packed));
  const rendererB64 = b64encodeUtf8(buildRenderer(W, G, N));
  const bottomB64 = b64encodeUtf8(bottomText);

  function composeFrame(i) {
    const b = bitmaps[i];
    const T = [rendererB64, bottomB64, String(i), blob64].join(D) + D;
    const L = T.length;
    let C = 0;
    for (const v of b) C += v;
    const A = W - head.length;                            // row-0 payload cells
    const X = L > A + C ? Math.ceil((L - A - C) / W) : 0; // data rows
    const g = (k) => (k < L ? T[k] : rendererB64[(k - L) % rendererB64.length]);
    const rows = [];
    let row = head;
    let k = 0;
    for (; k < A; k++) row += g(k);
    rows.push(row);
    for (let r = 0; r < X; r++) {
      row = '';
      for (let c = 0; c < W; c++) row += g(k++);
      rows.push(row);
    }
    for (let r = 0; r < G; r++) {
      row = '';
      for (let c = 0; c < W; c++) row += b[r * W + c] ? g(k++) : ' ';
      rows.push(row);
    }
    return rows.join('\n') + '\n' + bottomText + '\n';
  }

  const source = composeFrame(0);
  const commentRows = bottomText.split('\n').length - 1;
  const dataRows = source.split('\n').length - 1 - 1 - G - 1 - commentRows;
  return { source, composeFrame, frames: N, width: W, height: G, dataRows, commentRows };
}
