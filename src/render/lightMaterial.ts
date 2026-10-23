import type * as THREE from 'three';
import { WEATHER_WET_DARKENING } from '../config';

export interface LightUniforms {
  uDaylight: { value: number };
  uWetness: { value: number };
  /** Wind strength 0..1 and a clock in seconds, for foliage sway (T-F5). */
  uWind: { value: number };
  uWindTime: { value: number };
  /** The year's effect on foliage (T-F7): x autumn colour, y leaves fallen, z high summer. See foliageSeason. */
  uSeason: { value: THREE.Vector3 };
}

/**
 * Seasonal foliage colour (T-F7), before lighting. Each world texel (16 per block) gets its own random value, from the
 * position before wind sway, so the pattern of fallen leaves does not shimmer in the wind.
 */
const SEASON_FRAGMENT = `
vec3 seasonCell = fract(floor(vSeasonPosition * 16.0 + 0.001) * 0.1031);
seasonCell += dot(seasonCell, seasonCell.yzx + 33.33);
float seasonRandom = fract((seasonCell.x + seasonCell.y) * seasonCell.z);
if (seasonRandom < vSeason.x * uSeason.y * 0.88) discard;
float seasonLuma = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
diffuseColor.rgb = mix(diffuseColor.rgb, seasonLuma * mix(vec3(2.2, 1.1, 0.25), vec3(2.0, 0.55, 0.2), seasonRandom), vSeason.x * uSeason.x);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.14, 0.1, 0.07), vSeason.x * uSeason.y * uSeason.y);
diffuseColor.rgb = mix(diffuseColor.rgb, seasonLuma * vec3(1.45, 1.15, 0.55), vSeason.y * uSeason.z * 0.8);`;

/**
 * Multiplies the final color by max(skyLight * daylight, blockLight). Geometry MUST have an `aLight` vec2 attribute.
 * Fog uses the horizontal distance from the camera, so terrain far below or above is not fogged by height alone.
 * With `foliage`, geometry MUST also have an `aSway` float and an `aSeason` vec2 attribute (see MeshData).
 * - Wind (T-F5): each vertex moves downwind (+X) by up to aSway blocks, with gusts that vary by position. The offset
 *   depends only on world position, so shared corners stay together.
 * - Seasons (T-F7): deciduous leaves (aSeason.x) turn orange and red in autumn, then fall texel by texel, leaving twigs
 *   through winter. Dry grass (aSeason.y) browns in high summer. Nothing is remeshed: only uSeason changes.
 */
export function patchLightMaterial(material: THREE.MeshBasicMaterial, uniforms: LightUniforms, wettable = false, transition?: { value: THREE.Vector2 }, foliage = false): void {
  material.customProgramCacheKey = () => `voxel-light-${wettable ? "wet" : "dry"}-${transition ? "transition" : "full"}-${foliage ? "foliage" : "plain"}`;
  material.onBeforeCompile = (shader) => {
    if (transition) shader.uniforms.uTerrainFade = transition;
    shader.uniforms.uDaylight = uniforms.uDaylight;
    shader.uniforms.uWetness = uniforms.uWetness;
    if (foliage) {
      shader.uniforms.uWind = uniforms.uWind;
      shader.uniforms.uWindTime = uniforms.uWindTime;
      shader.uniforms.uSeason = uniforms.uSeason;
    }
    const swayCode = foliage
      ? '\nvec3 swayWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nfloat swayPhase = dot(swayWorld, vec3(0.37, 0.21, 0.29));\ntransformed.x += aSway * uWind * (0.6 + 0.4 * sin(uWindTime * 2.0 + swayPhase));\ntransformed.z += aSway * uWind * 0.3 * sin(uWindTime * 2.7 + swayPhase * 1.3);'
      : '';
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec2 aLight;\nvarying vec2 vLight;\nvarying float vWetExposure;\nvarying vec3 vWetPosition;${foliage ? '\nattribute float aSway;\nattribute vec2 aSeason;\nvarying vec2 vSeason;\nvarying vec3 vSeasonPosition;\nuniform float uWind;\nuniform float uWindTime;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>${swayCode}${foliage ? '\nvSeason = aSeason;\nvSeasonPosition = (modelMatrix * vec4(position, 1.0)).xyz;' : ''}\nvLight = aLight;\nvWetExposure = step(0.99, aLight.x);\nvWetPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`)
      .replace(
        '#include <fog_vertex>',
        '#ifdef USE_FOG\nvFogDepth = length((modelMatrix * vec4(transformed, 1.0)).xz - cameraPosition.xz);\n#endif',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${transition ? 'uniform vec2 uTerrainFade;\n' : ''}uniform float uDaylight;\nuniform float uWetness;\nvarying vec2 vLight;\nvarying float vWetExposure;\nvarying vec3 vWetPosition;${foliage ? '\nuniform vec3 uSeason;\nvarying vec2 vSeason;\nvarying vec3 vSeasonPosition;' : ''}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>${foliage ? SEASON_FRAGMENT : ''}\ndiffuseColor.rgb *= max(vLight.x * uDaylight, vLight.y);${wettable ? `\ndiffuseColor.rgb *= 1.0 - clamp(uWetness, 0.0, 1.0) * vWetExposure * max(normalize(cross(dFdx(vWetPosition), dFdy(vWetPosition))).y, 0.0) * ${WEATHER_WET_DARKENING.toFixed(2)};` : ''}`,
      );
    if (transition) shader.fragmentShader = shader.fragmentShader.replace('#include <alphahash_fragment>',
      'if (uTerrainFade.y > 0.0) diffuseColor.a *= 1.0 - smoothstep(uTerrainFade.x, uTerrainFade.y, length(vWetPosition.xz - cameraPosition.xz));\n#include <alphahash_fragment>');
  };
}
