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

const DELIM = '#!#'; // not in the base64 alphabet
const HEAD = "p='''";

// Bootstrap that runs when the file executes (the first bottom line).
const BOOT =
  `''';exec(__import__("base64").b64decode("".join(p.split()).split("` +
  DELIM +
  `")[0]))`;

const SEP = ' # '; // separator before the trailing comment: ` # comment`
export const MIN_WIDTH = BOOT.length + SEP.length; // closer + ` # ` must fit

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

// Build the closer line: `''';exec(…)#` followed by the comment tiled to fill
// the row to exactly W *display* columns (so the right edge stays solid and
// aligned). With no comment, the neutral base64 `fallback` is tiled instead.
// At most one trailing space remains when a full-width char straddles the edge.
function buildBottomText(comment, W) {
  const avail = W - (BOOT.length + SEP.length); // display cols after ` # `
  let s = '';
  let wsum = 0;
  for (const ch of Array.from(comment || '')) {
    if (wsum + cw(ch) > avail) break;
    s += ch;
    wsum += cw(ch);
  }
  if (s && wsum < avail) { s += ' '; wsum += 1; } // gap before the filler
  while (wsum < avail) { s += '/'; wsum += 1; }    // `/` fills to the edge
  return `${BOOT}${SEP}${s}`;
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

function metrics(mask) {
  const { width: W, height: G, cells, charBit: B } = mask;
  const renderB64 = b64encodeUtf8(buildRenderer(W, G, B));
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
    const { nPayload, renderB64, maskB64 } = metrics(mask);
    const bottomB64 = b64encodeUtf8(
      buildBottomText((opts.comment || '').replace(/[\r\n]+/g, ' '), mask.width)
    );
    const baseLen = renderB64.length + DELIM.length + maskB64.length +
      DELIM.length + bottomB64.length + DELIM.length;
    const leftover = nPayload - baseLen;
    return { width: mask.width, leftover, ok: leftover >= 0 && mask.width >= MIN_WIDTH };
  },

  /**
   * @param {{width:number,height:number,cells:Uint8Array|number[],charBit:0|1}} mask
   * @param {{comment?:string}} [opts]
   * @returns {{source:string, nCode:number, width:number, height:number, commentRows:number}}
   */
  generate(mask, opts = {}) {
    const { W, G, B, cells, renderB64, maskB64, nPayload } = metrics(mask);
    if (W < MIN_WIDTH) {
      throw new Error(`出力幅が狭すぎます: ${W} < 最小 ${MIN_WIDTH}（末尾の起動コードが収まりません）。`);
    }

    const cleaned = (opts.comment || '').replace(/[\r\n]+/g, ' ');
    const bottomText = buildBottomText(cleaned, W);
    const bottomB64 = b64encodeUtf8(bottomText);
    const prefix = `${renderB64}${DELIM}${maskB64}${DELIM}${bottomB64}${DELIM}`;
    const leftover = nPayload - prefix.length;
    if (leftover < 0) {
      throw new Error(
        `画像が小さすぎます: コードセル ${nPayload} < 必要 ${prefix.length}。出力幅を上げるか反転してください。`
      );
    }

    // neutral base64 fill (no "_"), so the body shows only code-like text
    let fill = '';
    for (let i = 0; i < leftover; i++) fill += renderB64[i % renderB64.length];

    const payload = Array.from(prefix + fill);
    if (payload.length !== nPayload) {
      throw new Error(`internal: payload ${payload.length} != cells ${nPayload}`);
    }

    const source = buildSource(cells, W, G, B, payload, bottomText);
    const commentRows = bottomText.split('\n').length - 1;
    return { source, nCode: nPayload, width: W, height: G, commentRows };
  },
};
