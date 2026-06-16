// JavaScript shaped-Quine generator (Node). Same architecture as python.js:
// the whole program is a clean W-wide rectangle, the picture is the content of
// a template-literal string `p`, the executable renderer is base64-embedded in
// the body, and the closer line runs it. Run with `node quine.js`.
//
// payload (whitespace-free, fills the picture's "code" cells minus the 3
// opener cells `p=` + backtick):
//   base64(RENDERER) "#!#" base64(packedMask) "#!#" base64(BOTTOM) "#!#" FILL

import { b64encodeUtf8, b64encodeBytes, packBits } from './base64.js';
import { colorSegment, composeColoredRows } from './ansi.js';

const DELIM = '#!#';
const HEAD = 'p=`';      // 3 chars woven into row 0
const SEP = ' // ';       // JS line comment before the trailing comment

// Bootstrap (first bottom line): close the template, decode + eval the renderer.
const BOOT =
  "`;eval(Buffer.from(p.replace(/\\s/g,'').split('" + DELIM + "')[0],'base64').toString())";

// ANSI variant: also strip the embedded color sequences before decoding. The
// ESC (\x1b) is optional so the quine still recovers if a terminal/editor ate
// the control byte on copy-paste, leaving the bare "[..m" in the picture.
// ("[" never occurs in base64/DELIM, so stripping "[0-9;]*m" is safe.)
const BOOT_ANSI =
  "`;eval(Buffer.from(p.replace(/\\x1b?\\[[0-9;]*m/g,'').replace(/\\s/g,'').split('" +
  DELIM + "')[0],'base64').toString())";

export const MIN_WIDTH = BOOT.length + SEP.length;
const MIN_WIDTH_ANSI = BOOT_ANSI.length + SEP.length;

// East-Asian full/wide code points render as 2 columns in monospaced fonts.
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
const cw = (ch) => (isWide(ch.codePointAt(0)) ? 2 : 1);

// The renderer: plain ASCII JS, recovered via base64 and eval'd. Reads global
// `p`, rebuilds the picture + bottom block, prints them verbatim.
function buildRenderer(W, G, B) {
  return (
    "q=p.replace(/\\s/g,'');\n" +
    "P=q.split('" + DELIM + "');\n" +
    "M=Buffer.from(P[1],'base64');\n" +
    "W=" + W + ";G=" + G + ";B=" + B + ";o=[];k=0;\n" +
    "for(r=0;r<G;r++){w='';for(c=0;c<W;c++){\n" +
    "if(r<1&&c<3){w+=\"p=`\"[c]}\n" +
    "else if((M[(r*W+c)>>3]>>(7-((r*W+c)&7))&1)===B){w+=q[k++]}\n" +
    "else{w+=' '}}o.push(w)}\n" +
    "o.push(Buffer.from(P[2],'base64').toString());\n" +
    "process.stdout.write(o.join('\\n')+'\\n');\n"
  );
}

// ANSI renderer: strip color sequences + whitespace to recover q, decode the
// palette/RLE color segment P[3], and re-emit a color code when the cell color
// changes (resetting at each row end). Mirrors composeColoredRows.
function buildRendererAnsi(W, G, B) {
  return (
    "q=p.replace(/\\x1b?\\[[0-9;]*m/g,'').replace(/\\s/g,'');\n" +
    "P=q.split('" + DELIM + "');\n" +
    "M=Buffer.from(P[1],'base64');C=Buffer.from(P[3],'base64');\n" +
    "W=" + W + ";G=" + G + ";B=" + B + ";\n" +
    "K=C[0];pal=[];for(j=0;j<K;j++){pal.push([C[1+3*j],C[2+3*j],C[3+3*j]])}\n" +
    "idx=[];for(i=1+3*K;i<C.length;i+=2){for(t=0;t<C[i];t++)idx.push(C[i+1])}\n" +
    "o=[];k=0;\n" +
    "for(r=0;r<G;r++){w='';cur=-1;for(c=0;c<W;c++){\n" +
    "if(r<1&&c<3){if(cur!==-1){w+='\\x1b[0m';cur=-1}w+=\"p=`\"[c]}\n" +
    "else if((M[(r*W+c)>>3]>>(7-((r*W+c)&7))&1)===B){ci=idx[k];if(ci!==cur){a=pal[ci];w+='\\x1b[38;2;'+a[0]+';'+a[1]+';'+a[2]+'m';cur=ci}w+=q[k++]}\n" +
    "else{w+=' '}}if(cur!==-1)w+='\\x1b[0m';o.push(w)}\n" +
    "o.push(Buffer.from(P[2],'base64').toString());\n" +
    "process.stdout.write(o.join('\\n')+'\\n');\n"
  );
}

// Closer line: BOOT + ` // ` + comment (once) + `/` padding to W display cols.
function buildBottomText(comment, W, boot = BOOT) {
  const avail = W - (boot.length + SEP.length);
  let s = '';
  let wsum = 0;
  for (const ch of Array.from(comment || '')) {
    if (wsum + cw(ch) > avail) break;
    s += ch;
    wsum += cw(ch);
  }
  if (s && wsum < avail) { s += ' '; wsum += 1; }
  while (wsum < avail) { s += '/'; wsum += 1; }
  return `${boot}${SEP}${s}`;
}

function countPayloadCells(cells, W, G, B) {
  let n = 0;
  for (let r = 0; r < G; r++) {
    for (let c = 0; c < W; c++) {
      if (r === 0 && c < 3) continue;
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
      if (r === 0 && c < 3) row += HEAD[c];
      else if (cells[r * W + c] === B) row += payload[k++];
      else row += ' ';
    }
    rows.push(row);
  }
  return rows.join('\n') + '\n' + bottomText + '\n';
}

export const javascriptGenerator = {
  id: 'javascript',
  label: 'JavaScript',
  fileExt: 'js',
  verifyEngine: 'node',
  minWidth: MIN_WIDTH,

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

    let fill = '';
    for (let i = 0; i < leftover; i++) fill += renderB64[i % renderB64.length];

    const payload = Array.from(prefix + fill);
    if (payload.length !== nPayload) {
      throw new Error(`internal: payload ${payload.length} != cells ${nPayload}`);
    }

    const source = ansi
      ? composeColoredRows(cells, W, G, B, HEAD, payload, color.palette, color.idx) +
        '\n' + bottomText + '\n'
      : buildSource(cells, W, G, B, payload, bottomText);
    const commentRows = bottomText.split('\n').length - 1;
    return { source, nCode: nPayload, width: W, height: G, commentRows, ansi };
  },
};
