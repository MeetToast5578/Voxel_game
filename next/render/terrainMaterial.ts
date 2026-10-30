import * as THREE from 'three';
import type { RenderLayer } from '../engine/blocks';

const VERTEX = /* glsl */ `
in uvec2 data;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 modelMatrix;
uniform vec3 cameraPosition;
uniform float time;
out vec2 vUv;
flat out float vTile;
out vec3 vColor;
out vec2 vLight;
out float vDepth;

const float SHADE[8] = float[8](0.6, 0.6, 1.0, 0.5, 0.8, 0.8, 0.85, 0.85);
const float AO[4] = float[4](0.45, 0.65, 0.82, 1.0);

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
  vec4 world = modelMatrix * vec4(p, 1.0);
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
    if (kind == 2u) tint *= vec3(0.85, 0.95, 0.85);
  }
  vColor = tint * SHADE[n] * AO[(w0 >> 27u) & 3u];
  // Fog by horizontal distance, so looking down from high up does not fog the ground.
  vDepth = length(world.xz - cameraPosition.xz);
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
in vec2 vUv;
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
  float light = max(vLight.x * daylight, vLight.y);
  light = 0.04 + 0.96 * light * light;
  vec3 color = tex.rgb * vColor * light;
  color = mix(color, fogColor, smoothstep(fogNear, fogFar, vDepth));
  outColor = vec4(color, opacity);
}`;

/** One material per render pass. Opaque never discards, so early depth testing stays on for most terrain. */
export function terrainMaterial(layer: RenderLayer, uniforms: Record<string, THREE.IUniform>): THREE.RawShaderMaterial {
  const transparent = layer === 'water' || layer === 'ice';
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: 'precision highp float;\nuniform mat4 viewMatrix;\n' + VERTEX,
    fragmentShader: FRAGMENT,
    defines: layer === 'cutout' ? { CUTOUT: 1 } : {},
    uniforms: { ...uniforms, opacity: { value: layer === 'water' ? 0.72 : layer === 'ice' ? 0.82 : 1 } },
    transparent,
    depthWrite: layer !== 'water',
    side: layer === 'cutout' || layer === 'water' ? THREE.DoubleSide : THREE.FrontSide,
  });
}
