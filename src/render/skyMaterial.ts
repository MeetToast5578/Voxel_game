import type * as THREE from 'three';

/** Uniforms shared by the sky, sun, moon, and star shaders. */
export interface SkyUniforms {
  /** Time of day, 0..1. 0 = sunrise, 0.25 = noon, 0.5 = sunset, 0.75 = midnight. */
  uTime: { value: number };
  /** Time of year, 0..1. 0 = spring equinox. */
  uSeason: { value: number };
  /** Sun position in world space. */
  uSunPos: { value: THREE.Vector3 };
  /** Moon position in world space. */
  uMoonPos: { value: THREE.Vector3 };
  /** Star intensity, 0 (day) to 1 (night). */
  uStarIntensity: { value: number };
}

/**
 * Atmospheric sky shader using a simple Rayleigh scattering approximation.
 * The sky color is a gradient from zenith to horizon, tinted by the sun
 * position and time of day. Sunrise/sunset produce warm colors near the horizon.
 */
export const skyVertexShader = `
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  void main() {
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    vNormal = normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const skyFragmentShader = `
  uniform float uTime;
  uniform float uSeason;
  uniform vec3 uSunPos;
  uniform vec3 uMoonPos;
  uniform float uStarIntensity;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;

  // Simple atmospheric scattering approximation.
  // Rayleigh scattering: blue dominates when the sun is high, red/orange near sunset.
  vec3 skyColorFromSun(vec3 zenith, vec3 horizon, float sunHeight, float sunDistance) {
    // Base gradient: zenith at top, horizon at bottom.
    float t = 0.5 + vNormal.y * 0.5;
    vec3 color = mix(horizon, zenith, t);

    // Add sun glow near the sun direction.
    vec3 viewDir = normalize(vNormal);
    vec3 sunDir = normalize(uSunPos);
    float sunAngle = dot(viewDir, sunDir);
    float glow = pow(max(sunAngle, 0.0), 64.0);
    color += glow * 0.5 * vec3(1.0, 0.8, 0.6);

    // Daylight color shift based on sun height.
    // High sun: blue zenith. Low sun: orange/red horizon.
    float dayFactor = smoothstep(-0.2, 0.6, sunHeight);
    vec3 dayZenith = mix(vec3(0.1, 0.2, 0.4), vec3(0.4, 0.6, 0.9), dayFactor);
    vec3 dayHorizon = mix(vec3(0.5, 0.3, 0.2), vec3(0.8, 0.9, 1.0), dayFactor);
    color = mix(color, mix(horizon, zenith, t), 0.0); // keep base
    color = mix(color, dayZenith, dayFactor * 0.5);
    color = mix(color, dayHorizon, dayFactor * 0.3);

    // Night: darken everything.
    float nightFactor = (1.0 - smoothstep(-0.2, 0.2, sunHeight));
    color *= mix(1.0, 0.05, nightFactor);

    return color;
  }

  void main() {
    // Sun height: positive = above horizon.
    float sunHeight = normalize(uSunPos).y;
    vec3 zenith = vec3(0.1, 0.2, 0.5);
    vec3 horizon = vec3(0.4, 0.6, 0.8);

    vec3 color = skyColorFromSun(zenith, horizon, sunHeight, 0.0);

    // The rotating Points field owns the stars; screen-space noise would remain fixed.

    gl_FragColor = vec4(color, 1.0);
  }
`;
