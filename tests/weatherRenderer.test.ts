import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { WeatherRenderer } from '../src/render/weather';
import type { WeatherSample } from '../src/world/weather';

const rain: WeatherSample = { precipitation: 'rain', cloudCover: 1, humidity: 1, isStorm: false, pressure: 0, windSpeed: 0 };
afterEach(() => vi.restoreAllMocks());
function fixture() {
  const scene = new THREE.Scene();
  const weather = new WeatherRenderer(scene);
  const particles = scene.children[0] as THREE.Points;
  const positions = particles.geometry.getAttribute('position');
  positions.setXYZ(0, 0, 5, 0);
  return { weather, particles, positions };
}
function updateAtAltitude(weather: WeatherRenderer, top: (x: number, z: number) => number | undefined, dt = 0) {
  // Regression against the old five-argument API: Reflect lets this fail on behaviour before the signature is extended.
  Reflect.apply(weather.update, weather, [100, -100, rain, dt, top, 200]);
}

describe('precipitation coordinates and roofs', () => {
  it('recentres precipitation at camera altitude and samples column tops in block coordinates', () => {
    const {weather,particles} = fixture();
    try {
      const top = vi.fn(() => 198);
      updateAtAltitude(weather, top);
      expect(particles.position.toArray()).toEqual([100,200,-100]);
      expect(top).toHaveBeenCalledWith(100,-100);
    } finally { weather.dispose(); }
  });
  it('keeps drops above the roof and resets drops that penetrate below it', () => {
    const {weather,positions} = fixture();
    try {
      updateAtAltitude(weather, () => 198);
      expect(positions.getY(0)).toBe(5); // world y=205 is above the roof
      positions.setXYZ(0,0,1,0);
      updateAtAltitude(weather, () => 205);
      expect(positions.getY(0)).toBeGreaterThan(5); // world y=201 is sheltered
    } finally { weather.dispose(); }
  });
  it('keeps wetness bounded through long frames and dries without precipitation', () => {
    const {weather} = fixture();
    try {
      weather.update(0,0,rain,10,() => undefined);
      expect(weather.wetness).toBeGreaterThan(0);
      expect(weather.wetness).toBeLessThanOrEqual(1);
      const before=weather.wetness;
      weather.update(0,0,{...rain,precipitation:'none'},10,() => undefined);
      expect(weather.wetness).toBeGreaterThanOrEqual(0);
      expect(weather.wetness).toBeLessThan(before);
    } finally { weather.dispose(); }
  });
});
