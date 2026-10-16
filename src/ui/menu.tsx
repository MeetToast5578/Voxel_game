import { render } from 'preact';
import { MAX_FOV, MAX_RENDER_DISTANCE, MIN_FOV, MIN_RENDER_DISTANCE } from '../config';
import { MAX_SENSITIVITY, MIN_SENSITIVITY, type Settings } from '../storage/settings';
import { Section } from './components';
import { CONTROL_SECTIONS } from './controls';

export interface MenuCallbacks {
  /** Called from the Play or Resume click handler, so it may request pointer lock. */
  onPlay(): void;
  onSettingsChange(settings: Settings): void;
  onNewWorld(): void;
  /** The Inventory button in the pause menu. */
  onInventory(): void;
}

export type MenuMode = 'start' | 'paused';

interface ViewProps {
  mode: MenuMode;
  settings: Settings;
  notes: string[];
  callbacks: MenuCallbacks;
  onSetting: (key: keyof Settings, value: number) => void;
}

function Slider(p: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onInput: (v: number) => void;
}) {
  const id = `setting-${p.label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div class="menu-slider">
      <label for={id} class="label">
        {p.label}
      </label>
      <span class="value">{p.format(p.value)}</span>
      <input
        id={id}
        type="range"
        min={p.min}
        max={p.max}
        step={p.step}
        value={p.value}
        onInput={(e) => p.onInput(Number((e.currentTarget as HTMLInputElement).value))}
      />
    </div>
  );
}

function MenuView({ mode, settings, notes, callbacks, onSetting }: ViewProps) {
  return (
    <div class="menu-panel">
      <h1 class="menu-title">{mode === 'start' ? 'Voxel Game' : 'Paused'}</h1>
      {notes.map((note) => (
        <p class="menu-note" key={note} role="status">
          {note}
        </p>
      ))}
      <div class="menu-actions">
        <button type="button" class="menu-button primary" onClick={callbacks.onPlay}>
          {mode === 'start' ? 'Play' : 'Resume'}
        </button>
        {mode === 'paused' && (
          <button type="button" class="menu-button" onClick={callbacks.onInventory}>
            Inventory (E)
          </button>
        )}
      </div>
      <Section title="Settings">
        <div class="menu-settings">
          <Slider
            label="Render distance"
            value={settings.renderDistance}
            min={MIN_RENDER_DISTANCE}
            max={MAX_RENDER_DISTANCE}
            step={1}
            format={(v) => `${v} chunks`}
            onInput={(v) => onSetting('renderDistance', v)}
          />
          <Slider
            label="Field of view"
            value={settings.fov}
            min={MIN_FOV}
            max={MAX_FOV}
            step={1}
            format={(v) => `${v}°`}
            onInput={(v) => onSetting('fov', v)}
          />
          <Slider
            label="Mouse sensitivity"
            value={settings.mouseSensitivity}
            min={MIN_SENSITIVITY}
            max={MAX_SENSITIVITY}
            step={0.05}
            format={(v) => `${v.toFixed(2)}×`}
            onInput={(v) => onSetting('mouseSensitivity', v)}
          />
        </div>
      </Section>
      <Section title="Controls">
        {CONTROL_SECTIONS.map((section) => (
          <div class="controls-group" key={section.title}>
            <h3 class="controls-title">{section.title}</h3>
            <table class="menu-controls">
              <tbody>
                {section.rows.map(([key, action]) => (
                  <tr key={key}>
                    <td class="key">{key}</td>
                    <td>{action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </Section>
      <div class="menu-actions">
        <button
          type="button"
          class="menu-button danger"
          onClick={() => {
            if (window.confirm('Delete this world and start a new one?')) callbacks.onNewWorld();
          }}
        >
          New world
        </button>
      </div>
    </div>
  );
}

/**
 * The start and pause menu: title, Play or Resume, the pause menu's Inventory button, settings, the controls list, and
 * short notes (saving unavailable, or the browser refused the mouse).
 */
export class Menu {
  private readonly root: HTMLDivElement;
  private mode: MenuMode = 'start';
  private settings: Settings;
  private lockNote: string | null = null;

  constructor(
    parent: HTMLElement,
    settings: Settings,
    /** One line shown in both menus (e.g. that saving is unavailable), or null. */
    private readonly storageNote: string | null,
    private readonly callbacks: MenuCallbacks,
  ) {
    this.settings = { ...settings };
    this.root = document.createElement('div');
    this.root.className = 'menu-overlay';
    this.root.style.display = 'none';
    parent.append(this.root);
  }

  get visible(): boolean {
    return this.root.style.display !== 'none';
  }

  /** The mode the menu was last shown in ('start' before the first game and 'paused' after). */
  get currentMode(): MenuMode {
    return this.mode;
  }

  show(mode: MenuMode): void {
    this.mode = mode;
    this.root.style.display = '';
    this.draw();
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  /** Shows why the mouse was not captured, or clears the note when null. */
  setLockNote(text: string | null): void {
    if (text === this.lockNote) return;
    this.lockNote = text;
    this.draw();
  }

  private draw(): void {
    const notes = [this.storageNote, this.lockNote].filter((n): n is string => n !== null);
    render(
      <MenuView
        mode={this.mode}
        settings={this.settings}
        notes={notes}
        callbacks={this.callbacks}
        onSetting={(key, value) => {
          this.settings = { ...this.settings, [key]: value };
          this.callbacks.onSettingsChange({ ...this.settings });
          this.draw();
        }}
      />,
      this.root,
    );
  }
}
