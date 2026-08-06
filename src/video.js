// Video pipeline: load a video file and sample frames at a given fps as
// small luminance grids (already at the output grid resolution). Storing
// luma-per-cell instead of full-resolution canvases keeps memory flat for
// hundreds of frames, and threshold/invert changes re-binarize instantly
// without re-seeking the video.

import { CHAR_ASPECT } from './image.js';

// Safety cap — a 10-minute video at 12fps would be 7200 frames; extraction
// is one seek per frame, so keep it bounded.
export const MAX_FRAMES = 2000;

/** Load a File/Blob into an HTMLVideoElement (metadata ready). */
export function loadVideo(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.onloadedmetadata = () => resolve(v);
    v.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('video load failed'));
    };
    v.src = url;
  });
}

/** Release the object URL behind a video created by loadVideo. */
export function releaseVideo(video) {
  if (video && video.src.startsWith('blob:')) URL.revokeObjectURL(video.src);
}

/** Frame count that frameLumas() will produce for a video at some fps. */
export function frameCountFor(video, fps) {
  if (!video || !isFinite(video.duration)) return 0;
  return Math.min(MAX_FRAMES, Math.max(1, Math.round(video.duration * fps)));
}

function seekTo(video, t) {
  return new Promise((resolve, reject) => {
    // Setting the same time again may not fire 'seeked'; the frame is
    // already displayed, so drawing it is fine.
    if (Math.abs(video.currentTime - t) < 1e-6) return resolve();
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('seek failed')); };
    const cleanup = () => {
      video.removeEventListener('seeked', done);
      video.removeEventListener('error', fail);
    };
    video.addEventListener('seeked', done);
    video.addEventListener('error', fail);
    video.currentTime = t;
  });
}

/**
 * Sample frames at segment midpoints (avoids black lead-in/out frames) and
 * return per-cell luminance grids at `width` (height follows CHAR_ASPECT).
 * `isCancelled` lets the caller abandon a superseded extraction (two loops
 * must never seek the same video element concurrently); returns null then.
 * @returns {Promise<{frames:Uint8ClampedArray[], width:number, height:number}|null>}
 */
export async function frameLumas(video, { fps, width, onProgress, isCancelled }) {
  const sw = video.videoWidth;
  const sh = video.videoHeight;
  if (!sw || !sh || !isFinite(video.duration)) throw new Error('bad video');
  const n = frameCountFor(video, fps);
  const W = width;
  const H = Math.max(1, Math.round((W * sh * CHAR_ASPECT) / sw));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const frames = [];
  for (let i = 0; i < n; i++) {
    if (isCancelled && isCancelled()) return null;
    await seekTo(video, (video.duration * (i + 0.5)) / n);
    ctx.drawImage(video, 0, 0, W, H);
    const { data } = ctx.getImageData(0, 0, W, H);
    const luma = new Uint8ClampedArray(W * H);
    for (let j = 0; j < W * H; j++) {
      luma[j] = 0.299 * data[j * 4] + 0.587 * data[j * 4 + 1] + 0.114 * data[j * 4 + 2];
    }
    frames.push(luma);
    if (onProgress) onProgress(i + 1, n);
  }
  return { frames, width: W, height: H };
}

/** Luma grid -> 0/1 cells (1 = dark, same convention as imageToGrid). */
export function binarizeLuma(luma, threshold) {
  const cells = new Uint8Array(luma.length);
  for (let i = 0; i < luma.length; i++) cells[i] = luma[i] < threshold ? 1 : 0;
  return cells;
}
