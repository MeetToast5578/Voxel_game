import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAtlasCanvas } from '../src/render/atlas';
import { drawBlockIcon, iconUrl, ICON_PIXELS } from '../src/ui/icons';
import { BlockId, getBlockDef, slabState } from '../src/world/blocks';
import { ATLAS_SIZE, ATLAS_TILES, TILE_SIZE } from '../src/render/tiles';

function canvasFixture() {
  const context = { clearRect: vi.fn(), drawImage: vi.fn(), putImageData: vi.fn(), imageSmoothingEnabled: true };
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toDataURL: vi.fn(() => 'data:image/png;base64,test-icon'),
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, context };
}

afterEach(() => vi.unstubAllGlobals());

describe('CPU-backed icon readback (T-A2a)', () => {
  it('draws the same nearest-neighbour texture tile using a readback-friendly canvas', () => {
    const { canvas, context } = canvasFixture();
    const atlas = {} as HTMLCanvasElement;
    canvas.width = canvas.height = ICON_PIXELS;
    drawBlockIcon(canvas, atlas, BlockId.TALL_GRASS);
    expect(canvas.getContext).toHaveBeenCalledWith('2d', { willReadFrequently: true });
    expect(context.imageSmoothingEnabled).toBe(false);
    const tile = getBlockDef(BlockId.TALL_GRASS).tiles.side;
    expect(context.drawImage).toHaveBeenCalledWith(
      atlas, (tile % ATLAS_TILES) * TILE_SIZE, Math.floor(tile / ATLAS_TILES) * TILE_SIZE,
      TILE_SIZE, TILE_SIZE, 0, 0, ICON_PIXELS, ICON_PIXELS,
    );
    drawBlockIcon(canvas, atlas, BlockId.AIR);
    expect(context.clearRect).toHaveBeenCalledTimes(2);
    expect(context.drawImage).toHaveBeenCalledTimes(1);
  });

  it('encodes a newly requested icon only once and reuses its cached URL', () => {
    const { canvas } = canvasFixture();
    const createElement = vi.fn(() => canvas);
    vi.stubGlobal('document', { createElement });
    const atlas = {} as HTMLCanvasElement;
    const first = iconUrl(atlas, BlockId.TALL_GRASS);
    expect(first).toBe('data:image/png;base64,test-icon');
    expect(iconUrl(atlas, BlockId.TALL_GRASS)).toBe(first);
    expect(iconUrl(atlas, BlockId.AIR)).toBe('');
    expect(canvas.getContext).toHaveBeenCalledWith('2d', { willReadFrequently: true });
    expect(canvas.toDataURL).toHaveBeenCalledTimes(1);
    expect(createElement).toHaveBeenCalledTimes(1);
  });

  it('also keeps the source atlas CPU-backed while retaining the generated pixels', () => {
    const { canvas, context } = canvasFixture();
    vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
    vi.stubGlobal('ImageData', class {
      constructor(readonly data: Uint8ClampedArray, readonly width: number, readonly height: number) {}
    });
    expect(createAtlasCanvas()).toBe(canvas);
    expect(canvas.width).toBe(ATLAS_SIZE);
    expect(canvas.height).toBe(ATLAS_SIZE);
    expect(canvas.getContext).toHaveBeenCalledWith('2d', { willReadFrequently: true });
    const [image, x, y] = context.putImageData.mock.calls[0]! as unknown as [ImageData, number, number];
    expect(image.data.length).toBe(ATLAS_SIZE * ATLAS_SIZE * 4);
    expect([x, y]).toEqual([0, 0]);
  });
});

it('draws bottom and top slab icons into opposite halves with empty space preserved', () => {
  const { canvas, context } = canvasFixture();
  canvas.width = canvas.height = ICON_PIXELS;
  for (const top of [false, true]) {
    drawBlockIcon(canvas, {} as HTMLCanvasElement, slabState(BlockId.STONE, top));
    const args = context.drawImage.mock.lastCall!;
    expect(args.slice(5)).toEqual([0, top ? 0 : ICON_PIXELS / 2, ICON_PIXELS, ICON_PIXELS / 2]);
    expect(context.imageSmoothingEnabled).toBe(false);
  }
});
