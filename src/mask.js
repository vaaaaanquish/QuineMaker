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

/** Build a Mask from a 0/1 grid, picking charBit (majority unless inverted). */
export function makeMask(cells, width, height, { invert = false } = {}) {
  const maj = majorityBit(cells);
  const charBit = invert ? (maj ^ 1) : maj;
  return { width, height, cells, charBit };
}
