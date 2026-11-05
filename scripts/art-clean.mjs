/**
 * Clears stray specks that slicing a generated sheet copies in from neighbouring cells: groups of visible pixels that
 * touch the top or side edges (never the bottom, where stems and wrists belong) and are much smaller than the tile's
 * main shape. Repeating cutouts such as leaves are not passed in. `p` is RGBA, `n` the tile size.
 * Self-contained so the packers can inject it into the browser page with addScriptTag.
 */
export function dropStrays(p, n) {
  const label = new Int32Array(n * n).fill(-1), groups = [];
  for (let start = 0; start < n * n; start++) {
    if (label[start] >= 0 || !p[start * 4 + 3]) continue;
    const id = groups.length, cells = [start];
    let edge = false, bottom = false;
    label[start] = id;
    for (let k = 0; k < cells.length; k++) {
      const c = cells[k], x = c % n, y = (c - x) / n;
      if (x === 0 || y === 0 || x === n - 1) edge = true;
      if (y === n - 1) bottom = true;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy, o = ny * n + nx;
          if (nx < 0 || ny < 0 || nx >= n || ny >= n || label[o] >= 0 || !p[o * 4 + 3]) continue;
          label[o] = id;
          cells.push(o);
        }
      }
    }
    groups.push({ cells, edge: edge && !bottom });
  }
  const largest = Math.max(0, ...groups.map((g) => g.cells.length));
  for (const g of groups) {
    if (!g.edge || g.cells.length * 8 >= largest) continue;
    for (const c of g.cells) p[c * 4] = p[c * 4 + 1] = p[c * 4 + 2] = p[c * 4 + 3] = 0;
  }
}
