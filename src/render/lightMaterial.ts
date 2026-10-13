import type * as THREE from 'three';

export interface LightUniforms {
  uDaylight: { value: number };
}

/** Multiplies the final color by max(skyLight * daylight, blockLight). Geometry MUST have an `aLight` vec2 attribute. */
export function patchLightMaterial(material: THREE.MeshBasicMaterial, uniforms: LightUniforms): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDaylight = uniforms.uDaylight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aLight;\nvarying vec2 vLight;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLight = aLight;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uDaylight;\nvarying vec2 vLight;')
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb *= max(vLight.x * uDaylight, vLight.y);',
      );
  };
}
