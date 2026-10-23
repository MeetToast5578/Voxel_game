import type * as THREE from 'three';
import { WEATHER_WET_DARKENING } from '../config';

export interface LightUniforms {
  uDaylight: { value: number };
  uWetness: { value: number };
}

/**
 * Multiplies the final color by max(skyLight * daylight, blockLight). Geometry MUST have an `aLight` vec2 attribute.
 * Fog uses the horizontal distance from the camera, so terrain far below or above is not fogged by height alone.
 */
export function patchLightMaterial(material: THREE.MeshBasicMaterial, uniforms: LightUniforms, wettable = false, transition?: { value: THREE.Vector2 }): void {
  material.customProgramCacheKey = () => `voxel-light-${wettable ? "wet" : "dry"}-${transition ? "transition" : "full"}`;
  material.onBeforeCompile = (shader) => {
    if (transition) shader.uniforms.uTerrainFade = transition;
    shader.uniforms.uDaylight = uniforms.uDaylight;
    shader.uniforms.uWetness = uniforms.uWetness;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aLight;\nvarying vec2 vLight;\nvarying float vWetExposure;\nvarying vec3 vWetPosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLight = aLight;\nvWetExposure = step(0.99, aLight.x);\nvWetPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      .replace(
        '#include <fog_vertex>',
        '#ifdef USE_FOG\nvFogDepth = length((modelMatrix * vec4(transformed, 1.0)).xz - cameraPosition.xz);\n#endif',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${transition ? 'uniform vec2 uTerrainFade;\n' : ''}uniform float uDaylight;\nuniform float uWetness;\nvarying vec2 vLight;\nvarying float vWetExposure;\nvarying vec3 vWetPosition;`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>\ndiffuseColor.rgb *= max(vLight.x * uDaylight, vLight.y);${wettable ? `\ndiffuseColor.rgb *= 1.0 - clamp(uWetness, 0.0, 1.0) * vWetExposure * max(normalize(cross(dFdx(vWetPosition), dFdy(vWetPosition))).y, 0.0) * ${WEATHER_WET_DARKENING.toFixed(2)};` : ''}`,
      );
    if (transition) shader.fragmentShader = shader.fragmentShader.replace('#include <alphahash_fragment>',
      'if (uTerrainFade.y > 0.0) diffuseColor.a *= 1.0 - smoothstep(uTerrainFade.x, uTerrainFade.y, length(vWetPosition.xz - cameraPosition.xz));\n#include <alphahash_fragment>');
  };
}
