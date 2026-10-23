import { describe, expect, it } from 'vitest';
import { SLAB_HEIGHT, SLAB_HEIGHT_M, BLOCK_SIZE_M } from '../src/config';
import { moveAndCollide, type CollisionFn } from '../src/player/physics';
import { resolvePlacement } from '../src/player/placementTarget';
import { raycastVoxels } from '../src/player/raycast';
import { BLOCKS, BlockId, slabState, slabBounds, blockStateName, parseBlockStateName, blocksSky, isOpaque, blockFaceTile, slabItemState } from '../src/world/blocks';
import { blockGeometry } from '../src/render/blockGeometry';
import { buildChunkMesh } from '../src/render/mesher';
import { chunkRecord, parseChunkRecord } from '../src/storage/save';
import { TestWorld } from './support/testWorld';
import { canFallInto } from '../src/world/falling';

const bottom = slabState(BlockId.STONE), top = slabState(BlockId.STONE, true);
const shape = { halfWidth: .2, height: .4 };
const away = { x: 20, y: 20, z: 20 };
const hit = { x: 0, y: 0, z: 0, nx: 1, ny: 0, nz: 0, distance: 1 };

describe('slab states and items', () => {
  it('appends two halves for every solid cube, preserving textures, names and light shortcut', () => {
    expect(SLAB_HEIGHT * BLOCK_SIZE_M).toBe(SLAB_HEIGHT_M);
    // Types appended after the slabs (ice, T-G2) have no slab.
    for (const material of BLOCKS.filter(d => d.shape === 'cube' && d.solid && d.id < 77)) {
      for (const upper of [false, true]) {
        const state = slabState(material.id, upper);
        expect(state).toBeGreaterThanOrEqual(77);
        expect(parseBlockStateName(blockStateName(state))).toBe(state);
        expect(blocksSky(state)).toBe(false); expect(isOpaque(state)).toBe(false);
        expect(canFallInto(state)).toBe(false);
        for (const dir of [[1,0,0],[0,1,0],[0,0,1]]) expect(blockFaceTile(state, dir[0]!, dir[1]!, dir[2]!)).toBe(blockFaceTile(material.id, dir[0]!, dir[1]!, dir[2]!));
        expect(slabItemState(state)).toBe(slabState(material.id));
        const geometry = blockGeometry(state, 1); geometry.computeBoundingBox();
        expect(geometry.boundingBox!.max.y - geometry.boundingBox!.min.y).toBe(SLAB_HEIGHT);
        expect(geometry.boundingBox!.min.y).toBe(upper ? 0 : -.5);
        expect(geometry.boundingBox!.max.y).toBe(upper ? .5 : 0);
      }
    }
    const record = parseChunkRecord(chunkRecord('0,0,0', new Map([[0, bottom], [1, top]])))!;
    expect(record.edits).toEqual(new Map([[0, bottom], [1, top]]));
  });
});

describe('slab placement and merging', () => {
  const air = () => BlockId.AIR;
  it('selects halves by side hit height, and uses bottom/top on upper/lower faces', () => {
    expect(resolvePlacement(hit, air, bottom, away, shape, .2)?.state).toBe(bottom);
    expect(resolvePlacement(hit, air, bottom, away, shape, .8)?.state).toBe(top);
    expect(resolvePlacement({ ...hit, nx: 0, ny: 1 }, air, top, away, shape)?.state).toBe(bottom);
    expect(resolvePlacement({ ...hit, nx: 0, ny: -1 }, air, bottom, away, shape)?.state).toBe(top);
  });
  it('merges complementary matching halves, refusing other materials and occupied halves', () => {
    const internal = { ...hit, nx: 0, ny: 1 };
    expect(resolvePlacement(internal, () => bottom, bottom, away, shape)).toEqual({ x: 0, y: 0, z: 0, state: BlockId.STONE });
    expect(resolvePlacement({ ...internal, ny: -1 }, () => top, bottom, away, shape)?.state).toBe(BlockId.STONE);
    expect(resolvePlacement(internal, () => slabState(BlockId.PLANKS), bottom, away, shape)).toBeNull();
    expect(resolvePlacement(hit, () => bottom, bottom, away, shape, .2)).toBeNull();
    expect(resolvePlacement(hit, () => bottom, bottom, away, shape, .8)?.state).toBe(BlockId.STONE);
  });
  it('checks the occupied half and refuses merging a full cube into the player', () => {
    const feet = { x: 1.5, y: .5, z: .5 };
    expect(resolvePlacement(hit, air, bottom, feet, shape, .2)).not.toBeNull();
    expect(resolvePlacement(hit, air, bottom, feet, shape, .8)).toBeNull();
    expect(resolvePlacement(hit, () => bottom, bottom, feet, shape, .8)).toBeNull();
  });
});

describe('partial-cell physics and aiming', () => {
  it.each([false, true])('lands on the actual surface at high speed (top=%s)', upper => {
    const bounds = slabBounds(upper ? top : bottom)!;
    const pos = { x: .5, y: 10, z: .5 }, vel = { x: 0, y: -100, z: 0 };
    const r = moveAndCollide(pos, vel, .2, shape, (x,y,z) => x === 0 && y === 0 && z === 0 ? bounds : false);
    expect(r.onGround).toBe(true); expect(pos.y).toBeCloseTo(bounds[1] + .0001, 5);
  });
  it('passes through empty halves and hits the underside of a top slab', () => {
    const cell: CollisionFn = (x,y,z) => x === 0 && y === 0 && z === 0 ? slabBounds(top)! : false;
    const pos = { x: -1, y: 0, z: .5 }, vel = { x: 3, y: 0, z: 0 };
    expect(moveAndCollide(pos, vel, 1, { ...shape, height: .3 }, cell).hitX).toBe(false);
    const head = { x: .5, y: -.2, z: .5 };
    expect(moveAndCollide(head, {x:0,y:10,z:0}, 1, shape, cell).hitY).toBe(true);
    expect(head.y + shape.height).toBeCloseTo(.5 - .0001, 5);
  });
  it('steps up a half-block and settles at half height', () => {
    const pos = { x: -.5, y: .0001, z: .5 }, vel = {x:1,y:-1,z:0};
    const r = moveAndCollide(pos,vel,1,shape,(x,y) => y < 0 ? true : x >= 0 && y === 0 ? slabBounds(bottom)! : false, 1);
    expect(r.stepped).toBeCloseTo(.5); expect(pos.y).toBeCloseTo(.5001);
  });
  it('targets internal faces, skips empty half rays, and respects reach from inside the cell', () => {
    const cells = (x: number,y: number,z: number) => x === 0 && y === 0 && z === 0 ? slabBounds(bottom)! : false;
    expect(raycastVoxels(-1,.75,.5,1,0,0,5,cells)).toBeNull();
    expect(raycastVoxels(.5,2,.5,0,-1,0,5,cells)).toMatchObject({ny:1,distance:1.5});
    expect(raycastVoxels(.5,.75,.5,0,-1,0,5,cells)).toMatchObject({ny:1,distance:.25});
    expect(raycastVoxels(.5,.75,.5,0,-1,0,.2,cells)).toBeNull();
  });
});

it('meshes half heights, keeps the interior face below a cube, and leaves neighbouring cube faces visible', () => {
  const world = new TestWorld().set(5,5,5,bottom).set(5,6,5,BlockId.STONE).set(6,5,5,BlockId.STONE);
  const mesh = buildChunkMesh(world.neighbors(0),world.tops(),0).solid;
  const faces: number[][] = [];
  for(let i=0;i<mesh.positions.length;i+=12) faces.push(Array.from(mesh.positions.slice(i,i+12)));
  expect(faces.some(f => [1,4,7,10].every(i => f[i] === 5.5))).toBe(true);
  expect(faces.some(f => [0,3,6,9].every(i => f[i] === 6) && Math.min(f[1]!,f[4]!,f[7]!,f[10]!) === 5 && Math.max(f[1]!,f[4]!,f[7]!,f[10]!) === 6)).toBe(true);
});

it('keeps fluids from replacing slabs, drops falling sand on bottom halves, and checks actual support contact', async () => {
  const { World } = await import('../src/world/world');
  const { Chunk } = await import('../src/world/chunk');
  const { handleFall } = await import('../src/world/falling');
  const { scheduleFlowChecks } = await import('../src/world/flow');
  const { unsupportedGroup } = await import('../src/world/collapse');
  const world = new World(1); world.addChunk(new Chunk(0,0,0));
  world.installColumnTops(0,0,new Int32Array(256).fill(-1000));
  world.setBlock(5,5,5,bottom); world.setBlock(5,6,5,BlockId.SAND);
  handleFall(world,{x:5,y:6,z:5,dueTick:0,reason:'fall'});
  expect(world.getBlock(5,5,5)).toBe(bottom); expect(world.getBlock(5,6,5)).toBe(BlockId.AIR);
  expect(world.takeDrops()).toHaveLength(1);
  world.setBlock(6,5,5,BlockId.WATER); scheduleFlowChecks(world,6,5,5);
  for(let i=0;i<8;i++)world.tickStep(1000);
  expect(world.getBlock(5,5,5)).toBe(bottom);
  world.setBlock(9,4,9,BlockId.BEDROCK); world.setBlock(9,5,9,top);
  expect(unsupportedGroup(world,9,5,9)).toHaveLength(1); // half-block air gap under top slab
  world.setBlock(9,5,9,bottom);
  expect(unsupportedGroup(world,9,5,9)).toBeNull(); // bottom slab touches the anchor
});
