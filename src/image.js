// Image pipeline: decode -> resize to target width -> grayscale -> threshold
// -> 0/1 grid. Runs entirely in the browser on a <canvas>.

// A monospaced character cell is taller than it is wide. We pack ~CHAR_ASPECT
// rows per column-width so the rendered text keeps the image's proportions
// instead of looking vertically stretched. (cell width / cell height ≈ 0.5)
export const CHAR_ASPECT = 0.5;

/** Load a File/Blob into an HTMLImageElement. */
export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

/**
 * Convert an image to a binary grid.
 * @param {HTMLImageElement} img
 * @param {{width:number, threshold:number}} opts threshold in [0,255]
 * @returns {{cells:Uint8Array, colors:Uint8ClampedArray, width:number, height:number}}
 *   cell == 1 means "dark" (luminance < threshold).
 *   colors holds the resized image's RGB per cell (3 bytes/cell), so the
 *   on-screen quine can tint each code character with its source color.
 */
export function imageToGrid(img, { width, threshold }) {
  const W = Math.max(1, Math.round(width));
  // correct for the tall character cell so the picture isn't stretched
  const H = Math.max(1, Math.round((W * img.naturalHeight * CHAR_ASPECT) / img.naturalWidth));

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);

  const cells = new Uint8Array(W * H);
  const colors = new Uint8ClampedArray(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const a = data[i * 4 + 3];
    // Treat transparent pixels as light (background).
    const lum = a < 16 ? 255 : 0.299 * r + 0.587 * g + 0.114 * b;
    cells[i] = lum < threshold ? 1 : 0;
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  return { cells, colors, width: W, height: H };
}

/** Render a 0/1 grid to a small canvas for on-screen preview. */
export function gridToCanvas(grid, canvas, { charBit }) {
  const { cells, width: W, height: H } = grid;
  canvas.width = W;
  canvas.height = H;
  // display un-stretched: each (short) row is shown 1/CHAR_ASPECT taller
  canvas.style.aspectRatio = `${W * CHAR_ASPECT} / ${H}`;
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    // code cell -> dark ink, hole -> white
    const ink = cells[i] === charBit ? 30 : 245;
    out.data[i * 4] = ink;
    out.data[i * 4 + 1] = ink;
    out.data[i * 4 + 2] = ink;
    out.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
}
