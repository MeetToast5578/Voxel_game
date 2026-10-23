import type * as THREE from 'three';
import { WEATHER_WET_DARKENING } from '../config';

export interface LightUniforms {
  uDaylight: { value: number };
  uWetness: { value: number };
  /** Wind strength 0..1 and a clock in seconds, for foliage sway (T-F5). */
  uWind: { value: number };
  uWindTime: { value: number };
}

/**
 * Multiplies the final color by max(skyLight * daylight, blockLight). Geometry MUST have an `aLight` vec2 attribute.
 * Fog uses the horizontal distance from the camera, so terrain far below or above is not fogged by height alone.
 * With `sway`, geometry MUST also have an `aSway` float attribute: each vertex moves downwind (+X) by up to that many
 * blocks, with gusts that vary by position. The offset depends only on world position, so shared corners stay together.
 */
export function patchLightMaterial(material: THREE.MeshBasicMaterial, uniforms: LightUniforms, wettable = false, transition?: { value: THREE.Vector2 }, sway = false): void {
  material.customProgramCacheKey = () => `voxel-light-${wettable ? "wet" : "dry"}-${transition ? "transition" : "full"}-${sway ? "sway" : "still"}`;
  material.onBeforeCompile = (shader) => {
    if (transition) shader.uniforms.uTerrainFade = transition;
    shader.uniforms.uDaylight = uniforms.uDaylight;
    shader.uniforms.uWetness = uniforms.uWetness;
    if (sway) {
      shader.uniforms.uWind = uniforms.uWind;
      shader.uniforms.uWindTime = uniforms.uWindTime;
    }
    const swayCode = sway
      ? '\nvec3 swayWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nfloat swayPhase = dot(swayWorld, vec3(0.37, 0.21, 0.29));\ntransformed.x += aSway * uWind * (0.6 + 0.4 * sin(uWindTime * 2.0 + swayPhase));\ntransformed.z += aSway * uWind * 0.3 * sin(uWindTime * 2.7 + swayPhase * 1.3);'
      : '';
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec2 aLight;\nvarying vec2 vLight;\nvarying float vWetExposure;\nvarying vec3 vWetPosition;${sway ? '\nattribute float aSway;\nuniform float uWind;\nuniform float uWindTime;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>${swayCode}\nvLight = aLight;\nvWetExposure = step(0.99, aLight.x);\nvWetPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`)
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
