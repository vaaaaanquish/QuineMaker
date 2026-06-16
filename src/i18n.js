// Tiny i18n for the static site. Auto-detects ja/en from the browser, with a
// manual toggle persisted in localStorage. Translations are applied to the DOM
// via data-i18n attributes; dynamic strings use t(key, params).

const STR = {
  ja: {
    title: 'QuineMaker — 画像から整形Quineを生成',
    tagline_pre: '画像をアップロードすると、その形に整形された ',
    tagline_post: '（実行するとソース自身を出力するコード）を生成します。',
    tagline_browser: '生成はすべてブラウザ内で実行されます。',
    sec_image: '1. 画像',
    drop: '画像をドラッグ＆ドロップ、またはクリックして選択',
    sec_settings: '2. 設定',
    label_lang: '言語',
    label_threshold: '二値化しきい値',
    invert: 'コード領域を反転',
    colorize: 'コード文字を元画像の色で着色',
    label_comment: '末尾コメント',
    comment_ph: '例: QuineMaker by m3',
    btn_generate: 'Quine を生成',
    sec_output: '3. 出力',
    btn_copy: 'コピー',
    aria_preview: '二値化プレビュー',
    aria_code: '生成されたQuine',
    err_pick_image: '画像ファイルを選んでください',
    err_load_image: '画像の読み込みに失敗しました',
    status_searching: '最適な出力幅を探索中…',
    err_no_width: '収まる出力幅が見つかりませんでした。画像や反転を変えてみてください。',
    done: '生成完了 ({w}×{rows}, {len}字)',
    copied: 'クリップボードにコピーしました',
    err_width_small: '出力幅が狭すぎます: {w} < 最小 {min}（末尾の起動コードが収まりません）。',
    err_image_small: '画像が小さすぎます: コードセル {n} < 必要 {need}。出力幅を上げるか反転してください。',
  },
  en: {
    title: 'QuineMaker — turn an image into a shaped Quine',
    tagline_pre: 'Upload an image and get a ',
    tagline_post: ' (a program that prints its own source) shaped like it.',
    tagline_browser: 'Everything runs in your browser.',
    sec_image: '1. Image',
    drop: 'Drag & drop an image, or click to choose',
    sec_settings: '2. Settings',
    label_lang: 'Language',
    label_threshold: 'Threshold',
    invert: 'Invert code region',
    colorize: 'Tint code with source image colors',
    label_comment: 'Trailing comment',
    comment_ph: 'e.g. QuineMaker by m3',
    btn_generate: 'Generate Quine',
    sec_output: '3. Output',
    btn_copy: 'Copy',
    aria_preview: 'binarized preview',
    aria_code: 'generated Quine',
    err_pick_image: 'Please choose an image file',
    err_load_image: 'Failed to load the image',
    status_searching: 'Searching for the best width…',
    err_no_width: 'No fitting width found. Try a different image or toggle invert.',
    done: 'Done ({w}×{rows}, {len} chars)',
    copied: 'Copied to clipboard',
    err_width_small: 'Output width too small: {w} < min {min} (the bootstrap line does not fit).',
    err_image_small: 'Image too small: code cells {n} < needed {need}. Increase width or invert.',
  },
};

let lang = 'en';

export function detectLang() {
  const saved = localStorage.getItem('lang');
  if (saved === 'ja' || saved === 'en') return saved;
  return (navigator.language || '').toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

export function getLang() {
  return lang;
}

export function t(key, params) {
  let s = (STR[lang] && STR[lang][key]) ?? (STR.en[key] ?? key);
  if (params) for (const k of Object.keys(params)) s = s.replaceAll(`{${k}}`, params[k]);
  return s;
}

export function applyI18n() {
  document.documentElement.lang = lang;
  document.title = t('title');
  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of document.querySelectorAll('[data-i18n-ph]')) {
    el.placeholder = t(el.dataset.i18nPh);
  }
  for (const el of document.querySelectorAll('[data-i18n-aria]')) {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  }
  for (const b of document.querySelectorAll('.lang-switch button')) {
    b.classList.toggle('active', b.dataset.lang === lang);
  }
}

export function setLang(next) {
  lang = next === 'ja' ? 'ja' : 'en';
  localStorage.setItem('lang', lang);
  applyI18n();
}

export function initI18n() {
  lang = detectLang();
  applyI18n();
  for (const b of document.querySelectorAll('.lang-switch button')) {
    b.addEventListener('click', () => setLang(b.dataset.lang));
  }
}
