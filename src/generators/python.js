// Python shaped-Quine generator — full-rectangle, comment in the trailing `#`.
//
// Output is a clean W-wide rectangle (by display width) with no plain logic
// lines. Layout:
//   - the picture: rows whose "code" cells hold a base64 payload and whose
//     holes are spaces. Row 0 cols 0..4 hold the opener  p='''  (woven in).
//     These rows are the content of the triple-quoted string `p`.
//   - the bottom block: the closer  ''';exec(…)#<comment>  closes the string,
//     runs the embedded renderer, and shows the user comment as a readable
//     `#` comment (OUTSIDE the base64). Long comments wrap onto extra `#`
//     lines. Padding uses display width so CJK (full-width) text stays aligned.
//
// payload (whitespace-free, fills the picture's "code" cells, minus the 5
// opener cells):
//   base64(RENDERER) "#!#" base64(packedMask) "#!#" base64(BOTTOM) "#!#" FILL
// BOTTOM (the closer + comment lines, already padded) is stored verbatim so the
// renderer reprints it without any width math. FILL is a neutral base64 tail
// (a repeat of the renderer's base64) so the body never shows "_".

import { b64encodeUtf8, b64encodeBytes, packBits } from './base64.js';
import { colorSegment, composeColoredRows } from './ansi.js';

const DELIM = '#!#'; // not in the base64 alphabet
const HEAD = "p='''";

// Bootstrap that runs when the file executes (the first bottom line).
const BOOT =
  `''';exec(__import__("base64").b64decode("".join(p.split()).split("` +
  DELIM +
  `")[0]))`;

// ANSI variant: also strip the embedded color sequences before decoding. The
// ESC (\x1b) is optional so the quine still recovers if a terminal/editor ate
// the control byte on copy-paste, leaving the bare "[..m" in the picture.
// ("[" never occurs in base64/DELIM, so stripping "[0-9;]*m" is safe.)
const BOOT_ANSI =
  `''';exec(__import__("base64").b64decode(__import__("re").sub(r"\\x1b?\\[[0-9;]*m|\\s","",p).split("` +
  DELIM +
  `")[0]))`;

const SEP = ' # '; // separator before the trailing comment: ` # comment`
export const MIN_WIDTH = BOOT.length + SEP.length; // closer + ` # ` must fit
const MIN_WIDTH_ANSI = BOOT_ANSI.length + SEP.length;

// East-Asian full/wide code points render as 2 columns in monospaced fonts.
function isWide(cp) {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0x303e) ||
    (cp >= 0x3041 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}
const cw = (ch) => (isWide(ch.codePointAt(0)) ? 2 : 1);

// The renderer: ordinary multi-line Python, recovered intact via base64.
// Rebuilds the picture and appends the stored bottom block, verbatim.
function buildRenderer(W, G, B) {
  return `import base64 as z,sys
q="".join(p.split())
P=q.split("${DELIM}")
M=z.b64decode(P[1])
W=${W};G=${G};B=${B}
b=[(M[i//8]>>(7-i%8))&1 for i in range(W*G)]
o=[];k=0
for r in range(G):
 w=[]
 for c in range(W):
  if r<1 and c<5:w.append("p='''"[c])
  elif b[r*W+c]==B:w.append(q[k]);k+=1
  else:w.append(" ")
 o.append("".join(w))
o.append(z.b64decode(P[2]).decode())
sys.stdout.write("\\n".join(o)+"\\n")
`;
}

// ANSI renderer: recovers q by stripping color sequences + whitespace, decodes
// the palette/RLE color segment P[3], and re-emits a color code whenever the
// cell color changes (resetting at each row end). Mirrors composeColoredRows.
function buildRendererAnsi(W, G, B) {
  return `import base64 as z,sys,re
q=re.sub(r"\\x1b?\\[[0-9;]*m|\\s","",p)
P=q.split("${DELIM}")
M=z.b64decode(P[1]);C=z.b64decode(P[3])
W=${W};G=${G};B=${B}
b=[(M[i//8]>>(7-i%8))&1 for i in range(W*G)]
K=C[0];pal=[(C[1+3*j],C[2+3*j],C[3+3*j]) for j in range(K)]
idx=[];i=1+3*K
while i<len(C):
 idx+=[C[i+1]]*C[i];i+=2
o=[];k=0
for r in range(G):
 w=[];cur=-1
 for c in range(W):
  if r<1 and c<5:
   if cur!=-1:w.append("\\x1b[0m");cur=-1
   w.append("p='''"[c])
  elif b[r*W+c]==B:
   ci=idx[k]
   if ci!=cur:a=pal[ci];w.append("\\x1b[38;2;%d;%d;%dm"%(a[0],a[1],a[2]));cur=ci
   w.append(q[k]);k+=1
  else:w.append(" ")
 if cur!=-1:w.append("\\x1b[0m")
 o.append("".join(w))
o.append(z.b64decode(P[2]).decode())
sys.stdout.write("\\n".join(o)+"\\n")
`;
}

// Build the closer line: `''';exec(…)#` followed by the comment tiled to fill
// the row to exactly W *display* columns (so the right edge stays solid and
// aligned). With no comment, the neutral base64 `fallback` is tiled instead.
// At most one trailing space remains when a full-width char straddles the edge.
function buildBottomText(comment, W, boot = BOOT) {
  const avail = W - (boot.length + SEP.length); // display cols after ` # `
  let s = '';
  let wsum = 0;
  for (const ch of Array.from(comment || '')) {
    if (wsum + cw(ch) > avail) break;
    s += ch;
    wsum += cw(ch);
  }
  if (s && wsum < avail) { s += ' '; wsum += 1; } // gap before the filler
  while (wsum < avail) { s += '/'; wsum += 1; }    // `/` fills to the edge
  return `${boot}${SEP}${s}`;
}

// Code cells that carry payload (bits==B in rows 0..G-1, minus 5 opener cells).
function countPayloadCells(cells, W, G, B) {
  let n = 0;
  for (let r = 0; r < G; r++) {
    for (let c = 0; c < W; c++) {
      if (r === 0 && c < 5) continue;
      if (cells[r * W + c] === B) n++;
    }
  }
  return n;
}

function metrics(mask, ansi = false) {
  const { width: W, height: G, cells, charBit: B } = mask;
  const renderB64 = b64encodeUtf8((ansi ? buildRendererAnsi : buildRenderer)(W, G, B));
  const maskB64 = b64encodeBytes(packBits(cells));
  const nPayload = countPayloadCells(cells, W, G, B);
  return { W, G, B, cells, renderB64, maskB64, nPayload };
}

function buildSource(cells, W, G, B, payload, bottomText) {
  const rows = [];
  let k = 0;
  for (let r = 0; r < G; r++) {
    let row = '';
    for (let c = 0; c < W; c++) {
      if (r === 0 && c < 5) row += HEAD[c];
      else if (cells[r * W + c] === B) row += payload[k++];
      else row += ' ';
    }
    rows.push(row);
  }
  return rows.join('\n') + '\n' + bottomText + '\n';
}

export const pythonGenerator = {
  id: 'python',
  label: 'Python',
  fileExt: 'py',
  verifyEngine: 'pyodide',
  minWidth: MIN_WIDTH,

  // Lightweight sizing for the width search.
  measure(mask, opts = {}) {
    const ansi = !!opts.ansi;
    const { W, G, B, cells, nPayload, renderB64, maskB64 } = metrics(mask, ansi);
    const boot = ansi ? BOOT_ANSI : BOOT;
    const bottomB64 = b64encodeUtf8(
      buildBottomText((opts.comment || '').replace(/[\r\n]+/g, ' '), mask.width, boot)
    );
    let baseLen = renderB64.length + DELIM.length + maskB64.length +
      DELIM.length + bottomB64.length + DELIM.length;
    if (ansi) {
      baseLen += colorSegment(cells, mask.colors, W, G, B, HEAD.length).b64.length + DELIM.length;
    }
    const min = ansi ? MIN_WIDTH_ANSI : MIN_WIDTH;
    const leftover = nPayload - baseLen;
    return { width: mask.width, leftover, ok: leftover >= 0 && mask.width >= min };
  },

  /**
   * @param {{width:number,height:number,cells:Uint8Array|number[],charBit:0|1}} mask
   * @param {{comment?:string}} [opts]
   * @returns {{source:string, nCode:number, width:number, height:number, commentRows:number}}
   */
  generate(mask, opts = {}) {
    const ansi = !!opts.ansi;
    const { W, G, B, cells, renderB64, maskB64, nPayload } = metrics(mask, ansi);
    const min = ansi ? MIN_WIDTH_ANSI : MIN_WIDTH;
    if (W < min) {
      throw Object.assign(new Error('width too small'),
        { code: 'err_width_small', params: { w: W, min } });
    }

    const cleaned = (opts.comment || '').replace(/[\r\n]+/g, ' ');
    const bottomText = buildBottomText(cleaned, W, ansi ? BOOT_ANSI : BOOT);
    const bottomB64 = b64encodeUtf8(bottomText);
    const color = ansi ? colorSegment(cells, mask.colors, W, G, B, HEAD.length) : null;
    const prefix = ansi
      ? `${renderB64}${DELIM}${maskB64}${DELIM}${bottomB64}${DELIM}${color.b64}${DELIM}`
      : `${renderB64}${DELIM}${maskB64}${DELIM}${bottomB64}${DELIM}`;
    const leftover = nPayload - prefix.length;
    if (leftover < 0) {
      throw Object.assign(new Error('image too small'),
        { code: 'err_image_small', params: { n: nPayload, need: prefix.length } });
    }

    // neutral base64 fill (no "_"), so the body shows only code-like text
    let fill = '';
    for (let i = 0; i < leftover; i++) fill += renderB64[i % renderB64.length];

    const payload = Array.from(prefix + fill);
    if (payload.length !== nPayload) {
      throw new Error(`internal: payload ${payload.length} != cells ${nPayload}`);
    }

    // The SAVED source is always clean (no ANSI bytes), so it opens uncorrupted
    // in an editor. In ANSI mode the colors live only in the base64 segment
    // P[3]; running the file recovers them and prints the colored form below.
    const source = buildSource(cells, W, G, B, payload, bottomText);
    // `colored` is the exact byte sequence the embedded renderer reproduces on
    // stdout — used for the on-screen preview and as the expected run output.
    // It is a quine "modulo ANSI": stripping its color codes yields `source`.
    const colored = ansi
      ? composeColoredRows(cells, W, G, B, HEAD, payload, color.palette, color.idx) +
        '\n' + bottomText + '\n'
      : undefined;
    const commentRows = bottomText.split('\n').length - 1;
    return { source, colored, nCode: nPayload, width: W, height: G, commentRows, ansi };
  },
};
