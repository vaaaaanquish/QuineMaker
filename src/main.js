// App wiring: image -> grid -> mask -> generated quine, plus copy.
// The output width is always auto-optimized; users don't pick it.
import { loadImage, imageToGrid, gridToCanvas } from './image.js';
import { makeMask } from './mask.js';
import { getGenerator, listGenerators } from './generators/index.js';
import { lift } from './generators/ansi.js';
import { initI18n, t } from './i18n.js';

initI18n();

const $ = (id) => document.getElementById(id);
const el = {
  drop: $('drop'), file: $('file'), preview: $('preview'),
  lang: $('lang'),
  thresh: $('thresh'), threshVal: $('threshVal'), invert: $('invert'),
  colorize: $('colorize'), ansi: $('ansi'),
  comment: $('comment'), generate: $('generate'), status: $('status'),
  copy: $('copy'), code: $('code'),
};

const SEARCH_MAX = 200;
const PREFER_WIDTH = 120;  // search picks the fitting width closest to this
const PREVIEW_WIDTH = 120; // width used only for the on-screen binary preview

// Scan widths and pick the fitting one closest to PREFER_WIDTH.
function findBestWidth(img, { threshold, invert, comment, gen, ansi }) {
  let best = null;
  for (let W = gen.minWidth; W <= SEARCH_MAX; W++) {
    const grid = imageToGrid(img, { width: W, threshold });
    const mask = makeMask(grid.cells, grid.width, grid.height, { invert, colors: grid.colors });
    const m = gen.measure(mask, { comment, ansi });
    if (!m.ok) continue;
    const score = Math.abs(W - PREFER_WIDTH);
    if (!best || score < best.score) best = { width: W, score };
  }
  return best;
}

const state = {
  img: null,       // HTMLImageElement
  result: null,    // {source,...}
  grid: null,      // the grid (with per-cell colors) used for the last result
};

const escapeHtml = (s) =>
  s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// Dark source pixels would vanish on the dark code background, so lift each
// channel into [64,255] — keeps the hue/relative tone while staying readable.
// (shared with the ANSI generator so the on-screen and terminal colors match)
const tint = (colors, idx) =>
  `rgb(${lift(colors[idx])},${lift(colors[idx + 1])},${lift(colors[idx + 2])})`;

// Render an ANSI-colored source for the on-screen pane: turn 24-bit fg codes
// (\x1b[38;2;r;g;bm ... \x1b[0m) into spans so the preview matches the terminal.
function ansiToHtml(source) {
  const re = /\x1b\[([0-9;]*)m/g;
  let html = '';
  let last = 0;
  let open = false;
  let m;
  while ((m = re.exec(source))) {
    html += escapeHtml(source.slice(last, m.index));
    last = re.lastIndex;
    const parts = m[1].split(';');
    if (m[1] === '0' || m[1] === '') {
      if (open) { html += '</span>'; open = false; }
    } else if (parts[0] === '38' && parts[1] === '2') {
      if (open) html += '</span>';
      html += `<span style="color:rgb(${+parts[2]},${+parts[3]},${+parts[4]})">`;
      open = true;
    }
  }
  html += escapeHtml(source.slice(last));
  if (open) html += '</span>';
  return html;
}

// Render the quine source as HTML, tinting each picture-region character with
// the original image's color at its cell. Picture rows are exactly W single-
// width ASCII chars, so column == char index. Bottom (closer/comment) rows,
// which may contain wide unicode, are emitted plain.
function renderColored(source, grid, picHeight) {
  const { colors, width: W } = grid;
  const lines = source.split('\n');
  const out = [];
  for (let r = 0; r < lines.length; r++) {
    const line = lines[r];
    if (r >= picHeight) { out.push(escapeHtml(line)); continue; }
    let row = '';
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === ' ') { row += ' '; continue; }
      row += `<span style="color:${tint(colors, (r * W + c) * 3)}">${escapeHtml(ch)}</span>`;
    }
    out.push(row);
  }
  return out.join('\n');
}

// Paint the current result into the code pane. In ANSI mode we show `colored`
// — what the file prints when run — while the copy/save path uses the clean
// `source`; otherwise the colorize toggle tints the plain source.
function showCode() {
  if (!state.result) return;
  if (state.result.ansi) {
    el.code.innerHTML = ansiToHtml(state.result.colored);
  } else if (el.colorize.checked && state.grid) {
    el.code.innerHTML = renderColored(state.result.source, state.grid, state.result.height);
  } else {
    el.code.textContent = state.result.source;
  }
}

function setStatus(msg, kind = '') {
  el.status.textContent = msg || '';
  el.status.className = `status ${kind}`;
}

// Populate language selector.
for (const { id, label } of listGenerators()) {
  const opt = document.createElement('option');
  opt.value = id; opt.textContent = label;
  el.lang.appendChild(opt);
}

// ---- image loading ----
async function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    setStatus(t('err_pick_image'), 'error');
    return;
  }
  try {
    state.img = await loadImage(file);
    updatePreview();
  } catch {
    setStatus(t('err_load_image'), 'error');
  }
}

el.drop.addEventListener('click', () => el.file.click());
el.file.addEventListener('change', (e) => handleFile(e.target.files[0]));
el.drop.addEventListener('dragover', (e) => { e.preventDefault(); el.drop.classList.add('over'); });
el.drop.addEventListener('dragleave', () => el.drop.classList.remove('over'));
el.drop.addEventListener('drop', (e) => {
  e.preventDefault();
  el.drop.classList.remove('over');
  handleFile(e.dataTransfer.files[0]);
});

// ---- binary preview (at a fixed width; the real width is chosen on generate)
function updatePreview() {
  if (!state.img) return;
  el.threshVal.textContent = el.thresh.value;
  const grid = imageToGrid(state.img, { width: PREVIEW_WIDTH, threshold: +el.thresh.value });
  const mask = makeMask(grid.cells, grid.width, grid.height, { invert: el.invert.checked });
  gridToCanvas(grid, el.preview, { charBit: mask.charBit });
  setStatus('');
  el.generate.disabled = false;
  el.copy.disabled = true;
}

for (const c of [el.thresh, el.invert]) c.addEventListener('input', updatePreview);

// Toggling colorize only affects how the already-generated code is painted.
el.colorize.addEventListener('change', showCode);

// ---- generate (always auto-optimizes the width) ----
el.generate.addEventListener('click', () => {
  if (!state.img) return;
  const gen = getGenerator(el.lang.value);
  const threshold = +el.thresh.value;
  const invert = el.invert.checked;
  const comment = el.comment.value;
  const ansi = el.ansi.checked;
  try {
    setStatus(t('status_searching'));
    const best = findBestWidth(state.img, { threshold, invert, comment, gen, ansi });
    if (!best) { const e = new Error('no width'); e.code = 'err_no_width'; throw e; }

    const grid = imageToGrid(state.img, { width: best.width, threshold });
    const mask = makeMask(grid.cells, grid.width, grid.height, { invert, colors: grid.colors });
    gridToCanvas(grid, el.preview, { charBit: mask.charBit });

    state.result = gen.generate(mask, { comment, ansi });
    state.grid = grid;
    showCode();
    el.copy.disabled = false;
    const totalRows = state.result.height + 1 + state.result.commentRows;
    setStatus(t('done', { w: state.result.width, rows: totalRows, len: state.result.source.length }), 'ok');
  } catch (e) {
    setStatus(e.code ? t(e.code, e.params) : (e.message || String(e)), 'error');
    state.result = null;
    el.code.textContent = '';
    el.copy.disabled = true;
  }
});

// ---- copy ----
el.copy.addEventListener('click', async () => {
  if (!state.result) return;
  await navigator.clipboard.writeText(state.result.source);
  setStatus(t('copied'), 'ok');
});
