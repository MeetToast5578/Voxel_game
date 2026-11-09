/**
 * Item icons painted in code, for content that has no authored sheet yet: 16×16 maps doubled to the 32×32 tile size,
 * with a dark outline added around every shape. Letters index each icon's palette; '.' is clear.
 */
const SIZE = 32;
const OUTLINE = [28, 22, 26, 255];

type Icon = readonly [palette: Readonly<Record<string, string>>, rows: readonly string[]];

const GOLD = { g: '#e8b84a', G: '#fff0a8', o: '#a8742a' };
const ICONS: Readonly<Record<string, Icon>> = {
  slime_crown: [{ b: '#5a9cf0', B: '#b8dcff', d: '#2a5ab8', r: '#e03050', ...GOLD }, [
    '................',
    '................',
    '..g...g...g.....',
    '..gG.gGg.gG.....',
    '..gGggrggGg.....',
    '..gGGGGGGGg.....',
    '..ggggggggg.....',
    '...bbbbbbb......',
    '..bBbbbbbbbb....',
    '.bBbbbbbbbbbb...',
    '.bbbbbbbbbbbd...',
    '.bbbbbbbbbbdd...',
    '..dddddddddd....',
    '................',
    '................',
    '................']],
  gel: [{ g: '#5cc850', G: '#b8f4a0', d: '#2e8a3a', w: '#ffffff' }, [
    '................',
    '................',
    '................',
    '................',
    '.......gg.......',
    '......gGgg......',
    '.....gGwggg.....',
    '....gGwgggggg...',
    '...ggGggggggg...',
    '...gggggggggd...',
    '..gggggggggddd..',
    '..ggggggggdddd..',
    '...ddddddddd....',
    '................',
    '................',
    '................']],
  swift_anklet: [{ b: '#8a5a32', B: '#c08a52', d: '#4a3020', w: '#f2f0e6', s: '#b8c4d0', ...GOLD }, [
    '................',
    '..........ww....',
    '.........wwws...',
    '........wwwss...',
    '...bbb.wwwws....',
    '...bBbwwws......',
    '...bBbbs........',
    '...bBbb.........',
    '...gGgg.........',
    '...bBbbbbbb.....',
    '..bbBBbbbbbbb...',
    '..bbbbbbbbbbbb..',
    '..dddddddddddd..',
    '................',
    '................',
    '................']],
  cloud_charm: [{ w: '#f4f8ff', l: '#a9c4e8', L: '#7d9cc8', ...GOLD }, [
    '................',
    '.......gg.......',
    '......g..g......',
    '.......gg.......',
    '.......Gg.......',
    '.....wwwww......',
    '...wwwwwwwww....',
    '..wwwwwwwwwwww..',
    '.wwwwwwwwwwwwww.',
    '.wwwwwwwwwwwwwl.',
    '.lwwwwwwwwwwwll.',
    '..llwwwwwwwlll..',
    '...LLLLLLLLLL...',
    '................',
    '................',
    '................']],
  feather_charm: [{ w: '#f4f1ea', s: '#b9c2cc', q: '#8a7050', r: '#c05050', ...GOLD }, [
    '................',
    '............ww..',
    '..........wwws..',
    '.........wwwss..',
    '........wwwss...',
    '.......wwwss....',
    '......wwwss.....',
    '.....wwwss......',
    '....wwwss.......',
    '...wwwss........',
    '...wwss.........',
    '...gGs..........',
    '..rgg...........',
    '..q.............',
    '.q..............',
    '................']],
  iron_band: [{ i: '#9aa3ad', I: '#e2e8ee', d: '#5d6670', a: '#4a8ad8', A: '#a8d0ff' }, [
    '................',
    '................',
    '.....iiiiii.....',
    '...iiIIIIiiii...',
    '..iIIi....iiii..',
    '.iIi........dii.',
    '.iI..........di.',
    '.ii..........di.',
    '.ii..........dd.',
    '.iid........ddd.',
    '..iidd....dddd..',
    '...dddiaAidd....',
    '.....ddaadd.....',
    '................',
    '................',
    '................']],
  gill_pendant: [{ t: '#2f9c94', T: '#7ee0cc', d: '#1d6266', c: '#8a6a44', ...GOLD }, [
    '...c........c...',
    '....c......c....',
    '.....c....c.....',
    '......c..c......',
    '.......gg.......',
    '......tTTt......',
    '.....tTttTt.....',
    '....tTtdtdTt....',
    '....ttdtdtdt....',
    '....tdtdtdtt....',
    '.....tdtdtd.....',
    '......tdtd......',
    '.......dd.......',
    '................',
    '................',
    '................']],
  ember_ring: [{ r: '#e04020', R: '#ffb050', y: '#ffe890', ...GOLD }, [
    '................',
    '.......yy.......',
    '......yRRy......',
    '.....RrRRrR.....',
    '.....rRyyRr.....',
    '......rRRr......',
    '....ggGrrGgg....',
    '...gGg....ggg...',
    '..gG........go..',
    '..gg........go..',
    '..gg........oo..',
    '..ggo......ooo..',
    '...gooo..ooo....',
    '.....oooooo.....',
    '................',
    '................']],
  heart_locket: [{ r: '#c8283c', R: '#ff6a78', d: '#7a1424', ...GOLD }, [
    '.....g....g.....',
    '......g..g......',
    '.......gg.......',
    '.......Gg.......',
    '...ggg....ggg...',
    '..gRRrg..grrrg..',
    '.gRRrrrggrrrrdg.',
    '.gRrrrrrrrrrrdg.',
    '.grrrrrrrrrrddg.',
    '..grrrrrrrrrdg..',
    '...grrrrrrrdg...',
    '....grrrrddg....',
    '.....grrddg.....',
    '......gddg......',
    '.......gg.......',
    '................']],
};

const hex = (c: string): number[] => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)).concat(255);

/** RGBA, top row first, or undefined if no icon has that name. */
export function paintedPixels(name: string): Uint8ClampedArray | undefined {
  const icon = ICONS[name];
  if (!icon) return undefined;
  const [palette, rows] = icon;
  const small = (x: number, y: number) => (x < 0 || y < 0 || x > 15 || y > 15 ? '.' : rows[y]![x]!);
  const out = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const ch = small(x, y);
    let rgba: number[] | undefined;
    if (ch !== '.') rgba = hex(palette[ch]!);
    else if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => small(x + dx!, y + dy!) !== '.')) rgba = OUTLINE;
    if (!rgba) continue;
    for (let j = 0; j < 4; j++) out.set(rgba, ((y * 2 + (j >> 1)) * SIZE + x * 2 + (j & 1)) * 4);
  }
  return out;
}

export const PAINTED_NAMES = Object.keys(ICONS);
