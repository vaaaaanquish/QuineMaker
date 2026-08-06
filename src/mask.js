// Mask type and helpers (language-independent contract).
//
// A Mask is { width, height, cells: Uint8Array(0|1), charBit: 0|1 }.
// `charBit` is the bit value whose cells get filled with code characters
// (by default the majority bit, so the minority forms the picture's holes).

/** Choose the majority bit as the code region. */
export function majorityBit(cells) {
  let ones = 0;
  for (const v of cells) if (v) ones++;
  const zeros = cells.length - ones;
  return zeros >= ones ? 0 : 1;
}

export function countBit(cells, bit) {
  let n = 0;
  for (const v of cells) if (v === bit) n++;
  return n;
}

/** Build a Mask from a 0/1 grid, picking charBit (majority unless inverted).
 *  Optional per-cell colors (3 bytes/cell) ride along for the ANSI color mode. */
export function makeMask(cells, width, height, { invert = false, colors = null } = {}) {
  const maj = majorityBit(cells);
  const charBit = invert ? (maj ^ 1) : maj;
  return { width, height, cells, charBit, colors };
}

/** Normalize video frame grids to code bitmaps (1 = code cell).
 *  Characters go on the LIGHT pixels (charBit 0): on the usual dark terminal
 *  bright characters then match the video's light regions, so the picture
 *  reads with correct polarity. (Image mode picks the majority bit to
 *  maximize payload capacity; the video chain overflows into data rows, so
 *  capacity doesn't matter and looks win.) `invert` flips this. */
export function makeVideoBitmaps(cellGrids, { invert = false } = {}) {
  const charBit = invert ? 1 : 0;
  const bitmaps = cellGrids.map((cells) => {
    const b = new Uint8Array(cells.length);
    for (let i = 0; i < cells.length; i++) b[i] = cells[i] === charBit ? 1 : 0;
    return b;
  });
  return { charBit, bitmaps };
}
