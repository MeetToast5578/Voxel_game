/** Portable palette/index format emitted by the artwork packers (little-endian uint16 indices). */
export interface PackedArtTile { palette: number[]; indices: string }
export function decodeArtTile(tile: PackedArtTile): Uint8ClampedArray {
  const binary = atob(tile.indices);
  const pixels = new Uint8ClampedArray(binary.length * 2);
  for (let i = 0; i < binary.length / 2; i++) {
    const index = binary.charCodeAt(i * 2) | binary.charCodeAt(i * 2 + 1) << 8;
    for (let channel = 0; channel < 4; channel++) pixels[i * 4 + channel] = tile.palette[index * 4 + channel]!;
  }
  return pixels;
}
