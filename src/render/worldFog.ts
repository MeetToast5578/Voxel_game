import * as THREE from 'three';

/** Shared references keep entities in the same horizontal haze as terrain and far land. */
export type WorldFogUniforms = Readonly<Record<string, THREE.IUniform>>;
export function worldFogUniforms(source?: WorldFogUniforms): Record<string, THREE.IUniform> {
  return {
    worldFogColor: source?.fogColor ?? {value: new THREE.Color()},
    worldFogNear: source?.fogNear ?? {value: 1e20},
    worldFogFar: source?.fogFar ?? {value: 2e20},
  };
}
export const WORLD_FOG_FRAGMENT = /* glsl */ `
uniform vec3 worldFogColor;
uniform float worldFogNear;
uniform float worldFogFar;
vec3 applyWorldFog(vec3 color, float distanceXZ) {
  float t = clamp((distanceXZ - worldFogNear) / max(0.0001, worldFogFar - worldFogNear), 0.0, 1.0);
  float haze = (1.0 - exp(-3.0 * t)) / (1.0 - exp(-3.0));
  return mix(color, worldFogColor, haze);
}`;

/** Chain existing skin/lighting shader hooks; no global scene fog is applied to the sky. */
export function attachWorldFog(material: THREE.MeshBasicMaterial, source?: WorldFogUniforms): void {
  if (!source) return;
  const before = material.onBeforeCompile, cacheKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    Object.assign(shader.uniforms, worldFogUniforms(source));
    shader.vertexShader = 'varying float vWorldFogDepth;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 fogPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        fogPosition = instanceMatrix * fogPosition;
      #endif
      vWorldFogDepth = length((modelMatrix * fogPosition).xz - cameraPosition.xz);`);
    shader.fragmentShader = 'varying float vWorldFogDepth;\n' + WORLD_FOG_FRAGMENT + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', 'gl_FragColor.rgb = applyWorldFog(gl_FragColor.rgb, vWorldFogDepth);');
  };
  material.customProgramCacheKey = () => cacheKey.call(material) + ':world-fog-v1';
}
