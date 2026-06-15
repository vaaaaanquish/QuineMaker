// App wiring: image -> grid -> mask -> generated quine, plus copy.
// The output width is always auto-optimized; users don't pick it.
import { loadImage, imageToGrid, gridToCanvas } from './image.js';
import { makeMask } from './mask.js';
import { getGenerator, listGenerators } from './generators/index.js';
import { initI18n, t } from './i18n.js';

initI18n();

const $ = (id) => document.getElementById(id);
const el = {
  drop: $('drop'), file: $('file'), preview: $('preview'),
  lang: $('lang'),
  thresh: $('thresh'), threshVal: $('threshVal'), invert: $('invert'),
  comment: $('comment'), generate: $('generate'), status: $('status'),
  copy: $('copy'), code: $('code'),
};

const SEARCH_MAX = 200;
const PREFER_WIDTH = 120;  // search picks the fitting width closest to this
const PREVIEW_WIDTH = 120; // width used only for the on-screen binary preview

// Scan widths and pick the fitting one closest to PREFER_WIDTH.
function findBestWidth(img, { threshold, invert, comment, gen }) {
  let best = null;
  for (let W = gen.minWidth; W <= SEARCH_MAX; W++) {
    const grid = imageToGrid(img, { width: W, threshold });
    const mask = makeMask(grid.cells, grid.width, grid.height, { invert });
    const m = gen.measure(mask, { comment });
    if (!m.ok) continue;
    const score = Math.abs(W - PREFER_WIDTH);
    if (!best || score < best.score) best = { width: W, score };
  }
  return best;
}

const state = {
  img: null,       // HTMLImageElement
  result: null,    // {source,...}
};

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

// ---- generate (always auto-optimizes the width) ----
el.generate.addEventListener('click', () => {
  if (!state.img) return;
  const gen = getGenerator(el.lang.value);
  const threshold = +el.thresh.value;
  const invert = el.invert.checked;
  const comment = el.comment.value;
  try {
    setStatus(t('status_searching'));
    const best = findBestWidth(state.img, { threshold, invert, comment, gen });
    if (!best) { const e = new Error('no width'); e.code = 'err_no_width'; throw e; }

    const grid = imageToGrid(state.img, { width: best.width, threshold });
    const mask = makeMask(grid.cells, grid.width, grid.height, { invert });
    gridToCanvas(grid, el.preview, { charBit: mask.charBit });

    state.result = gen.generate(mask, { comment });
    el.code.textContent = state.result.source;
    el.copy.disabled = false;
    const totalRows = state.result.height + 1 + state.result.commentRows;
    setStatus(t('done', { w: state.result.width, rows: totalRows, len: state.result.source.length }), 'ok');
  } catch (e) {
    setStatus(e.code ? t(e.code, e.params) : (e.message || String(e)), 'error');
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
