import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { WeatherRenderer } from '../src/render/weather';
import type { WeatherSample } from '../src/world/weather';
import { metersToBlocks, PRECIP_WIND_DRIFT } from '../src/config';

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

describe('wind (T-F5)', () => {
  it('carries drops downwind (+X) and wraps them back into the box', () => {
    const {weather,positions} = fixture();
    try {
      const windy = { ...rain, windSpeed: 10 };
      Reflect.apply(weather.update, weather, [0, 0, windy, 0.1, () => undefined, 0]);
      const step = metersToBlocks(10 * PRECIP_WIND_DRIFT) * 0.1;
      expect(positions.getX(0)).toBeCloseTo(step);
      positions.setXYZ(0, 29.9, 5, 0);
      Reflect.apply(weather.update, weather, [0, 0, windy, 0.1, () => undefined, 0]);
      expect(positions.getX(0)).toBeCloseTo(29.9 + step - 60);
    } finally { weather.dispose(); }
  });
});

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

describe('lightning (T-F14)', () => {
  it('counts each new strike and reports a fading flash', () => {
    const { weather } = fixture();
    try {
      vi.spyOn(Math, 'random').mockReturnValue(0); // a strike on the first check
      const storm: WeatherSample = { ...rain, isStorm: true };
      weather.update(0, 0, storm, 0.05, () => undefined, 0);
      expect(weather.strikes).toBe(1);
      expect(weather.getFlashIntensity()).toBeGreaterThan(0);
      weather.update(0, 0, storm, 0.05, () => undefined, 0); // still flashing: no new strike
      expect(weather.strikes).toBe(1);
    } finally { weather.dispose(); }
  });
});
