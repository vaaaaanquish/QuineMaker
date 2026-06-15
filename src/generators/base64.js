// base64 / bit-packing helpers shared by language generators.

/** UTF-8 string -> base64 (ASCII). */
export function b64encodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Uint8Array -> base64. */
export function b64encodeBytes(u8) {
  let bin = '';
  for (const b of u8) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * Pack a 0/1 array MSB-first into bytes.
 * Mirrors Python: bit i -> byte i>>3, position (7 - i%8).
 */
export function packBits(cells) {
  const n = cells.length;
  const out = new Uint8Array(Math.ceil(n / 8));
  for (let i = 0; i < n; i++) {
    if (cells[i]) out[i >> 3] |= 1 << (7 - (i & 7));
  }
  return out;
}
