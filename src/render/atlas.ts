import * as THREE from 'three';
import { generateAtlasPixels } from './atlasPixels';
import { ATLAS_SIZE } from './tiles';

export function createAtlasCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas not supported');
  ctx.putImageData(new ImageData(generateAtlasPixels(), ATLAS_SIZE, ATLAS_SIZE), 0, 0);
  return canvas;
}

export function createAtlasTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
