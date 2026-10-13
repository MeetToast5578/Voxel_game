import { MAX_FOV, MAX_RENDER_DISTANCE, MIN_FOV, MIN_RENDER_DISTANCE } from '../config';
import { MAX_SENSITIVITY, MIN_SENSITIVITY, type Settings } from '../storage/settings';
import { el } from './dom';

export interface MenuCallbacks {
  /** Called from the Play button's click handler, so it may request pointer lock. */
  onPlay(): void;
  onSettingsChange(settings: Settings): void;
  onNewWorld(): void;
}

const CONTROLS: readonly [string, string][] = [
  ['W A S D', 'Move'],
  ['Mouse', 'Look'],
  ['Space', 'Jump / fly up / swim up'],
  ['Shift', 'Sprint / fly down'],
  ['F', 'Toggle flying'],
  ['Left click', 'Break block'],
  ['Right click', 'Place block'],
  ['Middle click', 'Pick block'],
  ['1-9, wheel', 'Select block'],
  ['F3', 'Debug info'],
  ['Esc', 'Pause'],
];

/** Full-screen start/pause menu with settings and the controls list. */
export class Menu {
  private readonly overlay: HTMLDivElement;
  private readonly title: HTMLHeadingElement;
  private readonly playButton: HTMLButtonElement;
  private settings: Settings;

  /** note: one line shown under the Play button (e.g. that saving is unavailable), or null. */
  constructor(
    parent: HTMLElement,
    settings: Settings,
    note: string | null,
    private readonly callbacks: MenuCallbacks,
  ) {
    this.settings = { ...settings };
    this.overlay = el('div', 'menu-overlay');
    const panel = el('div', 'menu-panel');
    this.title = el('h1', 'menu-title', 'Voxel Game');
    this.playButton = el('button', 'menu-button primary', 'Play');
    this.playButton.addEventListener('click', () => this.callbacks.onPlay());

    const settingsBox = el('div', 'menu-settings');
    settingsBox.append(
      this.slider('Render distance', 'renderDistance', MIN_RENDER_DISTANCE, MAX_RENDER_DISTANCE, 1, (v) => `${v} chunks`),
      this.slider('Field of view', 'fov', MIN_FOV, MAX_FOV, 1, (v) => `${v}°`),
      this.slider('Mouse sensitivity', 'mouseSensitivity', MIN_SENSITIVITY, MAX_SENSITIVITY, 0.05, (v) => `${v.toFixed(2)}×`),
    );

    const newWorld = el('button', 'menu-button', 'New world');
    newWorld.addEventListener('click', () => {
      if (window.confirm('Delete this world and start a new one?')) this.callbacks.onNewWorld();
    });

    const controls = el('table', 'menu-controls');
    for (const [key, action] of CONTROLS) {
      const row = el('tr', '');
      row.append(el('td', 'key', key), el('td', '', action));
      controls.append(row);
    }

    panel.append(this.title, this.playButton);
    if (note) panel.append(el('p', 'menu-note', note));
    panel.append(settingsBox, newWorld, controls);
    this.overlay.append(panel);
    parent.append(this.overlay);
  }

  get visible(): boolean {
    return this.overlay.style.display !== 'none';
  }

  show(mode: 'start' | 'paused'): void {
    this.title.textContent = mode === 'start' ? 'Voxel Game' : 'Paused';
    this.playButton.textContent = mode === 'start' ? 'Play' : 'Resume';
    this.overlay.style.display = '';
  }

  hide(): void {
    this.overlay.style.display = 'none';
  }

  private slider(
    label: string,
    key: keyof Settings,
    min: number,
    max: number,
    step: number,
    format: (v: number) => string,
  ): HTMLLabelElement {
    const row = el('label', 'menu-slider');
    const value = el('span', 'value', format(this.settings[key]));
    const input = el('input', '');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(this.settings[key]);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      this.settings = { ...this.settings, [key]: v };
      value.textContent = format(v);
      this.callbacks.onSettingsChange({ ...this.settings });
    });
    row.append(el('span', 'label', label), value, input);
    return row;
  }
}
