import * as THREE from 'three';
import type { RenderLayer } from '../engine/blocks';

const VERTEX = /* glsl */ `
in uvec2 data;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 modelMatrix;
uniform vec3 cameraPosition;
uniform highp sampler2D batchingTexture;
uniform highp usampler2D batchingIdTexture;
uniform float time;
uniform float autumn;
uniform float summer;
out vec2 vUv;
flat out float vTile;
out vec3 vColor;
out vec2 vLight;
out float vDepth;
out vec2 vWorldXZ;

const float SHADE[8] = float[8](0.6, 0.6, 1.0, 0.5, 0.8, 0.8, 0.85, 0.85);
const float AO[4] = float[4](0.45, 0.65, 0.82, 1.0);

/** The chunk's origin: the translation of this draw's instance matrix (see ChunkMeshes). */
vec3 chunkOrigin() {
  int size = textureSize(batchingIdTexture, 0).x;
  uint id = texelFetch(batchingIdTexture, ivec2(gl_DrawID % size, gl_DrawID / size), 0).r;
  int width = textureSize(batchingTexture, 0).x;
  int j = int(id) * 4 + 3;
  return texelFetch(batchingTexture, ivec2(j % width, j / width), 0).xyz;
}

void main() {
  uint w0 = data.x;
  uint w1 = data.y;
  vec3 p = vec3(float(w0 & 511u), float((w0 >> 9u) & 511u), float((w0 >> 18u) & 511u)) / 16.0;
  uint n = w0 >> 29u;
  vec2 corner = vec2(float((w1 >> 18u) & 1u), float((w1 >> 19u) & 1u));
  if (n == 0u) vUv = vec2(-p.z, p.y);
  else if (n == 1u) vUv = vec2(p.z, p.y);
  else if (n == 2u || n == 3u) vUv = p.xz;
  else if (n == 4u) vUv = vec2(p.x, p.y);
  else if (n == 5u) vUv = vec2(-p.x, p.y);
  else vUv = corner;
  vec4 world = modelMatrix * vec4(p + chunkOrigin(), 1.0);
  if (((w1 >> 30u) & 1u) == 1u) {
    // Plants sway at their tops.
    float phase = time * 1.7 + world.x * 0.7 + world.z * 0.9;
    world.xz += vec2(sin(phase), cos(phase * 0.8)) * 0.06;
  }
  vTile = float(w1 & 1023u);
  vLight = vec2(float((w1 >> 10u) & 15u), float((w1 >> 14u) & 15u)) / 15.0;
  vec3 tint = vec3(1.0);
  uint kind = (w1 >> 20u) & 3u;
  if (kind != 0u) {
    float hum = float((w1 >> 22u) & 15u) / 15.0;
    float temp = float((w1 >> 26u) & 15u) / 15.0;
    vec3 cold = mix(vec3(0.82, 0.92, 0.86), vec3(0.72, 0.9, 0.82), hum);
    vec3 warm = mix(vec3(1.12, 1.0, 0.62), vec3(0.85, 1.05, 0.7), hum);
    tint = mix(cold, warm, temp);
    if (kind == 2u) {
      tint *= vec3(0.85, 0.95, 0.85);
      // Leaves turn orange and red through autumn, more in cold places.
      tint = mix(tint, vec3(1.5, 0.75, 0.3), autumn * (0.55 + 0.35 * (1.0 - temp)));
    } else {
      // Grass dries in high summer where it is warm and dry.
      tint = mix(tint, vec3(1.2, 1.0, 0.55), summer * temp * (1.0 - hum) * 0.6);
    }
  }
  vColor = tint * SHADE[n] * AO[(w0 >> 27u) & 3u];
  // Fog by horizontal distance, so looking down from high up does not fog the ground.
  vDepth = length(world.xz - cameraPosition.xz);
  vWorldXZ = world.xz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const FRAGMENT = /* glsl */ `
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray tiles;
uniform float daylight;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
uniform float opacity;
uniform float time;
in vec2 vUv;
in vec2 vWorldXZ;
flat in float vTile;
in vec3 vColor;
in vec2 vLight;
in float vDepth;
out vec4 outColor;

void main() {
  // fract() repeats the tile across merged quads; the gradients of the unwrapped UV keep mip selection smooth at seams.
  vec4 tex = textureGrad(tiles, vec3(fract(vUv), vTile), dFdx(vUv), dFdy(vUv));
#ifdef CUTOUT
  if (tex.a < 0.5) discard;
#endif
  // Light levels follow a curve (dark falls off quickly); the sky's share is then scaled by daylight.
  vec2 curved = vLight * vLight;
  float light = 0.03 + 0.97 * max(curved.x * daylight, curved.y);
  vec3 color = tex.rgb * vColor * light;
#ifdef WATER
  // Moving ripples on the water.
  float ripple = sin(vWorldXZ.x * 1.3 + time * 1.7) * sin(vWorldXZ.y * 1.1 - time * 1.3);
  color *= 1.0 + 0.1 * ripple;
#endif
  // Haze that thickens quickly then levels off, reaching the fog colour exactly at fogFar (same curve as the horizon).
  color = mix(color, fogColor, (1.0 - exp(-3.0 * clamp((vDepth - fogNear) / (fogFar - fogNear), 0.0, 1.0))) / (1.0 - exp(-3.0)));
  outColor = vec4(color, opacity);
}`;

/**
 * One material per render pass. Opaque never discards, so early depth testing stays on for most terrain. Without
 * WEBGL_multi_draw three draws each chunk of a pool separately and sets _gl_DrawID itself.
 */
export function terrainMaterial(layer: RenderLayer, uniforms: Record<string, THREE.IUniform>, multiDraw: boolean): THREE.RawShaderMaterial {
  const transparent = layer === 'water' || layer === 'ice';
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: (multiDraw ? '#extension GL_ANGLE_multi_draw : require\n' : '#define gl_DrawID _gl_DrawID\nuniform int _gl_DrawID;\n')
      + 'precision highp float;\nuniform mat4 viewMatrix;\n' + VERTEX,
    fragmentShader: FRAGMENT,
    defines: layer === 'cutout' ? { CUTOUT: 1 } : layer === 'water' ? { WATER: 1 } : {},
    uniforms: { ...uniforms, opacity: { value: layer === 'water' ? 0.72 : layer === 'ice' ? 0.82 : 1 } },
    transparent,
    depthWrite: layer !== 'water',
    side: layer === 'cutout' || layer === 'water' ? THREE.DoubleSide : THREE.FrontSide,
  });
}
