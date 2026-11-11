/**
 * Item icons painted in code, for content that has no authored sheet yet: 16×16 maps doubled to the 32×32 tile size,
 * with a dark outline added around every shape. Letters index each icon's palette; '.' is clear.
 */
const SIZE = 32;
const OUTLINE = [28, 22, 26, 255];

type Icon = readonly [palette: Readonly<Record<string, string>>, rows: readonly string[]];

const GOLD = { g: '#e8b84a', G: '#fff0a8', o: '#a8742a' };
const ICONS: Readonly<Record<string, Icon>> = {
  moth_lure: [{ p: '#7a60a0', P: '#b8a0e0', y: '#e8ff90', Y: '#ffffff', w: '#8a6040', ...GOLD }, [
    '.......gg.......',
    '......g..g......',
    '.......gg.......',
    '......gGgg......',
    '.....pPPPPp.....',
    '....pPyyyyPp....',
    '....pyYYYyyp....',
    '....pyYyyyyp....',
    '....pyyyyyyp....',
    '.....pyyyyp.....',
    '......gggg......',
    '......gGgg......',
    '.......ww.......',
    '................',
    '................',
    '................']],
  spark_wand: [{ w: '#8a6040', W: '#b88a5a', b: '#4a8ae0', B: '#c0e4ff', y: '#fff6a0' }, [
    '................',
    '...........y....',
    '..........yBy...',
    '.........bBBb...',
    '........bBbbby..',
    '.........bbb....',
    '........Ww.y....',
    '.......Ww.......',
    '......Ww........',
    '.....Ww.........',
    '....Ww..........',
    '...Ww...........',
    '..Ww............',
    '.Ww.............',
    '................',
    '................']],
  ember_staff: [{ w: '#5a3a28', W: '#8a5a3a', r: '#e04020', R: '#ffb050', y: '#ffe890', ...GOLD }, [
    '..........y.....',
    '.........rRr....',
    '........rRyRr...',
    '.........rRr..y.',
    '........g.r.....',
    '.......gGg......',
    '......Wwg.......',
    '.....Ww.........',
    '....Ww..........',
    '...Ww...........',
    '..Ww............',
    '.Ww.............',
    'Ww..............',
    '................',
    '................',
    '................']],
  life_crystal: [{ r: '#e02848', R: '#ff8098', W: '#ffe0e8', d: '#8a1028', p: '#c04070' }, [
    '................',
    '.......W........',
    '......WRr.......',
    '.....WRRrr......',
    '....RRRRrrr.....',
    '...RRRRrrrrd....',
    '..pRRRrrrrrdd...',
    '..pRRrrrrrrdd...',
    '...pRrrrrrdd....',
    '....prrrrdd.....',
    '.....prrdd......',
    '......pdd.......',
    '.......d........',
    '................',
    '................',
    '................']],
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
  grappling_hook: [{ i: '#9aa3ad', I: '#e2e8ee', d: '#5d6670', r: '#a07a50', R: '#c8a070' }, [
    '..........i.....',
    '.........iIi..i.',
    '........iIdi.iI.',
    '.......iIi..iIi.',
    '......iIiiiiIi..',
    '.......iddddi...',
    '........idi.....',
    '.......rR.......',
    '......rR........',
    '.....rR.........',
    '....rR..........',
    '...rRr..........',
    '..rR.rR.........',
    '..R...rR........',
    '.......rR.......',
    '................']],
  scarab_charm: [{ b: '#2a8a8a', B: '#7ee0d0', d: '#145050', ...GOLD }, [
    '.......gg.......',
    '......g..g......',
    '.......gg.......',
    '......gGgg......',
    '....d.bbbb.d....',
    '...d.bBBBBb.d...',
    '....bBbbbbBb....',
    '..ddbbbBBbbbdd..',
    '....bbbbbbbb....',
    '..ddbbbbbbbbdd..',
    '....bbbbbbbb....',
    '...d.bbbbbb.d...',
    '.....dbbbbd.....',
    '.......dd.......',
    '................',
    '................']],
  jungle_idol: [{ s: '#6a8a4a', S: '#9ac070', d: '#3a5028', e: '#60e0a0', l: '#3a8a3a', ...GOLD }, [
    '.....l....l.....',
    '....lll..lll....',
    '.....sSSSSs.....',
    '....sSSSSSSs....',
    '....sSeSSeSs....',
    '....sSSSSSSd....',
    '....ssSddSsd....',
    '.....sssssd.....',
    '....gsSSSsdg....',
    '...gsSSSSSSdg...',
    '...gsSssssSdg...',
    '....sSssssdd....',
    '....ssd..ssd....',
    '....ddd..ddd....',
    '................',
    '................']],
  fire_block: [{ r: '#e04018', o: '#f08a28', y: '#ffd860', w: '#fff4c0' }, [
    '.......r........',
    '......rr....r...',
    '.....ror...rr...',
    '..r..roor..ror..',
    '..rr.royr.roor..',
    '.ror.royor.ryr..',
    '.royrroyyorroyr.',
    '.royoroywyoroyr.',
    'rroyyoywwyoyyorr',
    'royyyywwwwyyyyor',
    'royywwwwwwwwyyor',
    'rooyywwwwwwyyoor',
    '.rooyyywwyyyoor.',
    '..rrooyyyyoorr..',
    '....rrroorrr....',
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

/** One bottle, filled with each potion's colour: L liquid, l its shine, D its shade. */
const BOTTLE = [
  '................',
  '.......cc.......',
  '.......cc.......',
  '......gGGg......',
  '.......gg.......',
  '.......gg.......',
  '......gLLg......',
  '.....gLlLLg.....',
  '....gLlLLLLg....',
  '....gLlLLLLg....',
  '....gLLLLLLg....',
  '....gLLLLLDg....',
  '.....gLLLDg.....',
  '......gggg......',
  '................',
  '................'];
const POTION_COLOURS: Readonly<Record<string, [string, string, string]>> = {
  healing_potion: ['#e0303c', '#ff9aa0', '#8a1020'], regeneration_potion: ['#f070b0', '#ffc0e0', '#a03070'],
  swiftness_potion: ['#40c8f0', '#c0f0ff', '#1a7aa0'], fire_resistance_potion: ['#f08020', '#ffd090', '#a04010'],
  water_breathing_potion: ['#3060e0', '#a0c0ff', '#183890'], antidote: ['#60c040', '#c8f0a0', '#2e7a20'],
  glass_bottle: ['#d6ecf4', '#ffffff', '#a8c8d4'],
};
for (const [key, [L, l, D]] of Object.entries(POTION_COLOURS)) (ICONS as Record<string, Icon>)[key] = [{ c: '#8a6040', g: '#b8d4e0', G: '#ffffff', L, l, D }, BOTTLE];

/** A tied sack in each boss's colours: B cloth, b its shade, t the tie, g the gold showing at the neck. */
const BAG = [
  '................',
  '......tt.tt.....',
  '.......ttt......',
  '......gGgg......',
  '.......tt.......',
  '.....BBBBBB.....',
  '....BBBBBBBb....',
  '...BBBBBBBBbb...',
  '..BBBBBBBBBBbb..',
  '..BBBBBBBBBBbb..',
  '..BBBBBBBBBbbb..',
  '..BBBBBBBBBbbb..',
  '...BBBBBBBbbb...',
  '....bbbbbbbb....',
  '................',
  '................'];
for (const [key, B, b, t] of [['king_slime_bag', '#4a8ae0', '#2a5ab8', '#e8b84a'], ['gloom_matriarch_bag', '#8a70b0', '#5a4880', '#e8ff90'],
  ['warden_bag', '#c04a20', '#7a2a10', '#ffb050']] as const) (ICONS as Record<string, Icon>)[key] = [{ B, b, t, ...GOLD }, BAG];

/** Spears and hammers in every tier: one picture each, its head in the tier's colours (h, H shine, d shade). */
const SPEAR = [
  '..............Hh',
  '.............Hhd',
  '............Hhd.',
  '...........hhd..',
  '..........dd....',
  '.........ww.....',
  '........ww......',
  '.......ww.......',
  '......ww........',
  '.....ww.........',
  '....ww..........',
  '...ww...........',
  '..ww............',
  '.ww.............',
  'ww..............',
  '................'];
const HAMMER = [
  '................',
  '.......HHh......',
  '......HHhhh.....',
  '.....HHhhhhd....',
  '....Hhhhhhhdd...',
  '.....hhhwhhdd...',
  '......hdwhddd...',
  '.......wwd......',
  '......ww........',
  '.....ww.........',
  '....ww..........',
  '...ww...........',
  '..ww............',
  '.ww.............',
  '................',
  '................'];
const TIER_COLOURS: Readonly<Record<string, [string, string, string]>> = {
  wooden: ['#a07040', '#c89a60', '#6a4a2a'], stone: ['#8a8a8a', '#c0c0c0', '#5a5a5a'], iron: ['#c8ccd2', '#f4f6f8', '#7a808a'],
  diamond: ['#4ae0e0', '#c0fffa', '#1a8a90'], jade: ['#3ac070', '#a8f4c8', '#1a7040'],
};
for (const [tier, [h, H, d]] of Object.entries(TIER_COLOURS)) {
  (ICONS as Record<string, Icon>)[`${tier}_spear`] = [{ h, H, d, w: '#8a6040' }, SPEAR];
  (ICONS as Record<string, Icon>)[`${tier}_hammer`] = [{ h, H, d, w: '#8a6040' }, HAMMER];
}
/** Arrows by kind: the head's colours over the same shaft and fletching. */
const ARROW_ROWS = [
  '................',
  '...........hHh..',
  '..........hHhh..',
  '.........dhhd...',
  '........ww.d....',
  '.......ww.......',
  '......ww........',
  '.....ww.........',
  '....ww..........',
  '..fww...........',
  '.ffw............',
  'fff.............',
  '.f..............',
  '................',
  '................',
  '................'];
for (const [key, [h, H, d]] of [['iron_arrow', ['#c8ccd2', '#f4f6f8', '#7a808a']], ['ember_arrow', ['#f06020', '#ffd090', '#a02a10']], ['jade_arrow', ['#3ac070', '#a8f4c8', '#1a7040']]] as const)
  (ICONS as Record<string, Icon>)[key] = [{ h, H, d, w: '#8a6040', f: '#f0ece0' }, ARROW_ROWS];
Object.assign(ICONS as Record<string, Icon>, {
  throwing_knife: [{ i: '#c8ccd2', I: '#f4f6f8', d: '#7a808a', w: '#6a4428', r: '#a03030' }, [
    '................',
    '...........II...',
    '..........Iid...',
    '.........Iid....',
    '........Iid.....',
    '.......Iid......',
    '......Iid.......',
    '.....rdd........',
    '....rww.........',
    '...rww..........',
    '...ww...........',
    '..ww............',
    '................',
    '................',
    '................',
    '................']],
  boomerang: [{ w: '#b07a40', W: '#d8a868', d: '#6a4422', r: '#c03838' }, [
    '................',
    '..WWw...........',
    '..Wwww..........',
    '...wwww.........',
    '....wwwr........',
    '.....wwrw.......',
    '......wwww......',
    '.......wwwwd....',
    '......wwwwwwd...',
    '.....rwwdd.dd...',
    '....wwwd........',
    '...wwwd.........',
    '..wwdd..........',
    '..ddd...........',
    '................',
    '................']],
  dash_boots: [{ b: '#7a4a2a', B: '#a87048', d: '#4a2a18', f: '#f0ece0', F: '#b8c8d8' }, [
    '................',
    '.........ff.....',
    '........fFFf....',
    '....bbb.fFf.....',
    '....bBb..f......',
    '....bBb.........',
    '....bBb.........',
    '....bBbbbbb.....',
    '...bbBBbbbbbb...',
    '...bbbbbbbbbbb..',
    '...ddddddddddd..',
    '................',
    '................',
    '................',
    '................',
    '................']],
});

/** Whole-face tiles for the alchemy table: a dark slate top with bottles and a bowl, plank sides with a drawer. */
const WOOD = { w: '#9a6a3c', W: '#b88452', d: '#6a4424' };
(ICONS as Record<string, Icon>).alchemy_table_top = [{ ...WOOD, s: '#3c4450', S: '#4c5664', r: '#e0303c', b: '#3060e0', n: '#60c040', g: '#cfe6f0', k: '#8a8a8a' }, [
  'dddddddddddddddd',
  'dWWWWWWWWWWWWWWd',
  'dWssssssssssssWd',
  'dWsSSgsssgSSssWd',
  'dWsSgrgsgbgSssWd',
  'dWssgrgsgbgsssWd',
  'dWssgggsgggsssWd',
  'dWssssssssssssWd',
  'dWssskkkkksSssWd',
  'dWsskknnnkkSssWd',
  'dWsskknnnkkSssWd',
  'dWssskkkkksSssWd',
  'dWssssssssssssWd',
  'dWWWWWWWWWWWWWWd',
  'dwwwwwwwwwwwwwwd',
  'dddddddddddddddd']];
(ICONS as Record<string, Icon>).alchemy_table_side = [{ ...WOOD, k: '#e8b84a' }, [
  'dddddddddddddddd',
  'dWWWWWWWWWWWWWWd',
  'dwwwwwwwwwwwwwwd',
  'dddddddddddddddd',
  'dWddddddddddddWd',
  'dWdWWWWWWWWWWdWd',
  'dWdwwwwkkwwwwdWd',
  'dWdwwwwkkwwwwdWd',
  'dWddddddddddddWd',
  'dWwwwwwwwwwwwwWd',
  'dWwwwwwwwwwwwwWd',
  'dWddddddddddddWd',
  'dWwwwwwwwwwwwwWd',
  'dWwwwwwwwwwwwwWd',
  'dwwwwwwwwwwwwwwd',
  'dddddddddddddddd']];

const hex = (c: string): number[] => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)).concat(255);

/** Art made by recolouring other art: [source tile, hue in degrees given to its blue-green gem colours]. */
const RECOLOURED: readonly [RegExp, (name: string) => string, number][] = [[/^jade(_|$)/, (n) => n.replace(/^jade/, 'diamond'), 138]];

/** The source tile a recoloured tile is made from, if it is one. */
export function recolourSource(name: string): { from: string; hue: number } | undefined {
  const r = RECOLOURED.find(([re]) => re.test(name));
  return r && { from: r[1](name), hue: r[2] };
}

/** Pixels with their cyan and blue colours turned to `hue`, everything else (handles, stone) kept. */
export function recolour(pixels: Uint8ClampedArray, hue: number): Uint8ClampedArray {
  const out = pixels.slice();
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i]! / 255, g = out[i + 1]! / 255, b = out[i + 2]! / 255, max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (d < 0.08 || max === r) continue;
    const h = 60 * (max === g ? (b - r) / d + 2 : (r - g) / d + 4);
    if (h < 150 || h > 250) continue;
    // HSV with the new hue, a touch deeper.
    const v = max * 0.92, s = d / max, k = (n: number) => (n + hue / 60) % 6, f = (n: number) => v - v * s * Math.max(0, Math.min(k(n), 4 - k(n), 1));
    out[i] = f(5) * 255;
    out[i + 1] = f(3) * 255;
    out[i + 2] = f(1) * 255;
  }
  return out;
}

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
