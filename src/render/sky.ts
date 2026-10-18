import * as THREE from 'three';
import { WORLD_LATITUDE_DEG } from '../config';
import { type SkyUniforms, skyFragmentShader, skyVertexShader } from './skyMaterial';
import { AXIAL_TILT_DEG } from '../world/calendar';
import { moonPhaseAt } from '../world/moon';
import { smoothstep } from '../world/time';

/** Radius of the sky dome, in blocks. Large enough to always be behind the fog. */
const SKY_RADIUS = 1000;

/** Number of points in the star field. */
const STAR_COUNT = 400;

/** Size of the sun/moon, in blocks. */
const SUN_SIZE = 12;
const MOON_SIZE = 10;

/**
 * The sky: an atmospheric scattering dome with a sun, moon, and stars.
 * All elements are recentred on the camera each frame so they always surround
 * the player. The sky shader never writes to the depth buffer so terrain is
 * always visible through it.
 */
export class Sky {
  private readonly uniforms: SkyUniforms;
  private readonly dome: THREE.Mesh;
  private readonly sun: THREE.Mesh;
  private readonly moon: THREE.Mesh;
  private readonly stars: THREE.Points;
  private readonly starPositions: Float32Array;
  // North celestial pole: altitude equals latitude, with north along +Z (the sun's south is -Z).
  private readonly starAxis = new THREE.Vector3(
    0,
    Math.sin(WORLD_LATITUDE_DEG * Math.PI / 180),
    Math.cos(WORLD_LATITUDE_DEG * Math.PI / 180),
  );

  constructor(scene: THREE.Scene) {
    this.uniforms = {
      uTime: { value: 0 },
      uSeason: { value: 0 },
      uSunPos: { value: new THREE.Vector3() },
      uMoonPos: { value: new THREE.Vector3() },
      uStarIntensity: { value: 0 },
    };

    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms as unknown as { [uniform: string]: THREE.IUniform<any> },
      vertexShader: skyVertexShader,
      fragmentShader: skyFragmentShader,
      side: THREE.BackSide, // inside of the sphere
      depthWrite: false,
      fog: false,
    });

    this.dome = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 32, 16), skyMaterial);
    this.dome.renderOrder = 0; // drawn first, before terrain
    scene.add(this.dome);

    // Sun: billboard quad facing the camera.
    const sunMaterial = new THREE.MeshBasicMaterial({
      color: 0xffaa44,
      transparent: true,
      depthWrite: false,
    });
    this.sun = new THREE.Mesh(new THREE.PlaneGeometry(SUN_SIZE, SUN_SIZE), sunMaterial);
    this.sun.renderOrder = 1;
    scene.add(this.sun);

    // Moon: billboard quad facing the camera.
    const moonMaterial = new THREE.ShaderMaterial({
      uniforms: { uPhase: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float uPhase;
        varying vec2 vUv;
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float radius2 = dot(p, p);
          if (radius2 > 1.0) discard;
          vec3 normal = vec3(p, sqrt(max(0.0, 1.0 - radius2)));
          float angle = uPhase * 6.28318530718;
          float lit = dot(normal, vec3(sin(angle), 0.0, -cos(angle)));
          if (lit <= 0.0) discard;
          gl_FragColor = vec4(vec3(0.86, 0.86, 0.94) * (0.7 + 0.3 * lit), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
    });
    this.moon = new THREE.Mesh(new THREE.PlaneGeometry(MOON_SIZE, MOON_SIZE), moonMaterial);
    this.moon.renderOrder = 1;
    scene.add(this.moon);

    // Stars: random points in the sky dome.
    this.starPositions = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      this.starPositions[i * 3] = (Math.random() - 0.5) * 2 * SKY_RADIUS;
      this.starPositions[i * 3 + 1] = (Math.random() - 0.5) * SKY_RADIUS;
      this.starPositions[i * 3 + 2] = (Math.random() - 0.5) * 2 * SKY_RADIUS;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(this.starPositions, 3));
    const starMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 2,
      transparent: true,
      depthWrite: false,
    });
    this.stars = new THREE.Points(starGeometry, starMaterial);
    this.stars.renderOrder = 0;
    scene.add(this.stars);
  }

  /**
   * Update sky, sun, moon, and star positions for the current time.
   * `timeOfDay` is 0..1 (0 = sunrise, 0.25 = noon, 0.5 = sunset, 0.75 = midnight).
   * `season` is 0..1 (0 = spring equinox). `camera` is the player's camera.
   */
  update(timeOfDay: number, season: number, camera: THREE.Object3D): void {
    // Recenter the sky dome on the camera so it always surrounds the player.
    this.dome.position.copy(camera.position);
    this.stars.position.copy(camera.position);
    // Set an absolute orientation, not an accumulated frame delta: save/reload and time jumps agree.
    this.stars.quaternion.setFromAxisAngle(this.starAxis, timeOfDay * Math.PI * 2);

    // Solar declination: +AXIAL_TILT at summer solstice (season 0.25), -AXIAL_TILT at winter (0.75).
    const declination = AXIAL_TILT_DEG * Math.sin(2 * Math.PI * season);
    const declinationRad = (declination * Math.PI) / 180;
    const latitudeRad = (WORLD_LATITUDE_DEG * Math.PI) / 180;

    // Hour angle: noon is 0, sunrise/sunset at ±~PI/2 (simplified).
    const hourAngle = (timeOfDay - 0.25) * 2 * Math.PI;

    // Sun altitude: simplified model.
    const sunAltitudeRad = Math.asin(
      Math.sin(latitudeRad) * Math.sin(declinationRad) +
        Math.cos(latitudeRad) * Math.cos(declinationRad) * Math.cos(hourAngle),
    );
    const sunAltitude = sunAltitudeRad;

    // Sun azimuth: direction along the horizon (0 = south, positive = west).
    const sunAzimuthRad = Math.atan2(
      -Math.sin(hourAngle),
      Math.cos(latitudeRad) * Math.tan(declinationRad) -
        Math.sin(latitudeRad) * Math.cos(hourAngle),
    );

    // Sun position: place it on the sky dome.
    const sunDistance = SKY_RADIUS * 0.9;
    const sunX = sunDistance * Math.sin(sunAzimuthRad) * Math.cos(sunAltitude);
    const sunY = sunDistance * Math.sin(sunAltitude);
    const sunZ = -sunDistance * Math.cos(sunAzimuthRad) * Math.cos(sunAltitude);
    this.uniforms.uSunPos.value.set(sunX, sunY, sunZ);
    this.sun.position.copy(camera.position).add(this.uniforms.uSunPos.value);
    this.sun.lookAt(camera.position); // billboard: always face camera

    // Stylised night-time orbit; the phase is derived from the saved year clock.
    (this.moon.material as THREE.ShaderMaterial).uniforms.uPhase.value = moonPhaseAt(season);
    this.uniforms.uMoonPos.value.set(-sunX, -sunY, -sunZ);
    this.moon.position.copy(camera.position).add(this.uniforms.uMoonPos.value);
    this.moon.lookAt(camera.position);

    // Star intensity: 0 at day, 1 at night.
    const nightFactor = 1 - smoothstep(-0.12, 0.08, Math.sin(sunAltitude));
    this.uniforms.uStarIntensity.value = nightFactor * nightFactor;
    (this.stars.material as THREE.PointsMaterial).opacity = this.uniforms.uStarIntensity.value;

    // Sun/moon visibility: sun up during day, moon up at night.
    const sunVisible = sunAltitude > -0.1;
    this.sun.visible = sunVisible;
    this.moon.visible = !sunVisible;

    // Uniforms for the sky shader.
    this.uniforms.uTime.value = timeOfDay;
    this.uniforms.uSeason.value = season;
  }

  /** Dispose of all geometries and materials. */
  dispose(): void {
    (this.dome.geometry as THREE.BufferGeometry).dispose();
    (this.dome.material as THREE.Material).dispose();
    (this.sun.geometry as THREE.BufferGeometry).dispose();
    (this.sun.material as THREE.Material).dispose();
    (this.moon.geometry as THREE.BufferGeometry).dispose();
    (this.moon.material as THREE.Material).dispose();
    (this.stars.geometry as THREE.BufferGeometry).dispose();
    (this.stars.material as THREE.Material).dispose();
  }
}
