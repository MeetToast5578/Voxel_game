import * as THREE from 'three';
import type { Creature } from '../creatures/creatures';

/** A hit to show: where, how much, and whether it was critical. Aged by the overlay. */
export interface HitNumber { x: number; y: number; z: number; amount: number; crit: boolean; age: number }

const NUMBER_S = 0.9, BAR_RANGE = 20, BOSS_RANGE = 48;
const v = new THREE.Vector3();

/**
 * Combat feedback over the 3D view: floating damage numbers, health bars over hurt creatures, a boss health bar along
 * the top, and a slash trail for sword and axe sweeps. Plain DOM, updated every frame from pooled elements.
 */
export class CombatOverlay {
  private readonly root = document.createElement('div');
  private readonly numbers: HTMLDivElement[] = [];
  private readonly bars: HTMLDivElement[] = [];
  private readonly boss = document.createElement('div');
  private readonly slash = document.createElement('div');
  private slashes = 0;

  constructor() {
    this.root.id = 'combat';
    this.boss.className = 'boss-bar';
    this.boss.innerHTML = '<b></b><div><i></i></div>';
    this.slash.className = 'slash';
    this.slash.innerHTML = '<svg viewBox="0 0 200 120" aria-hidden="true"><path d="M10 100 Q 100 -30 190 70"/></svg>';
    this.slash.addEventListener('animationend', () => this.slash.classList.remove('on'));
    this.root.append(this.boss, this.slash);
    document.body.append(this.root);
  }

  /** `hits` are aged here and removed when done. */
  update(dt: number, camera: THREE.Camera, hits: HitNumber[], creatures: readonly Creature[], slashes: number, visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
    const w = innerWidth, h = innerHeight;
    const place = (el: HTMLElement, x: number, y: number, z: number): boolean => {
      v.set(x, y, z).project(camera);
      if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return false;
      el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
      return true;
    };
    for (let i = hits.length - 1; i >= 0; i--) if ((hits[i]!.age += dt) > NUMBER_S) hits.splice(i, 1);
    hits.forEach((hit, i) => {
      const el = this.numbers[i] ?? this.make(this.numbers, 'hit-number');
      const t = hit.age / NUMBER_S;
      el.textContent = String(hit.amount);
      el.className = hit.crit ? 'hit-number crit' : 'hit-number';
      el.style.opacity = String(1 - t * t);
      el.hidden = !place(el, hit.x, hit.y + 0.4 + t * 1.2, hit.z);
    });
    for (let i = hits.length; i < this.numbers.length; i++) this.numbers[i]!.hidden = true;
    const eye = camera.position;
    let n = 0, boss: Creature | null = null, bossD = BOSS_RANGE;
    for (const c of creatures) {
      const d = Math.hypot(c.body.x - eye.x, c.body.z - eye.z);
      if ((c.species.guardian || c.species.boss) && d < bossD && (c.mode === 'hunt' || c.health < c.maxHealth)) { boss = c; bossD = d; continue; }
      if (c.health >= c.maxHealth || d > BAR_RANGE || c.health <= 0) continue;
      const el = this.bars[n] ?? this.make(this.bars, 'mob-bar', '<i></i>');
      (el.firstChild as HTMLElement).style.width = `${(100 * Math.max(0, c.health)) / c.maxHealth}%`;
      el.hidden = !place(el, c.body.x, c.body.y + c.body.height + 0.35, c.body.z);
      n++;
    }
    for (let i = n; i < this.bars.length; i++) this.bars[i]!.hidden = true;
    this.boss.hidden = !boss;
    if (boss) {
      (this.boss.firstChild as HTMLElement).textContent = boss.species.name;
      (this.boss.querySelector('i') as HTMLElement).style.width = `${(100 * Math.max(0, boss.health)) / boss.maxHealth}%`;
    }
    if (slashes !== this.slashes) {
      this.slashes = slashes;
      this.slash.classList.remove('on');
      void this.slash.offsetWidth;
      this.slash.classList.add('on');
    }
  }

  private make(pool: HTMLDivElement[], className: string, html = ''): HTMLDivElement {
    const el = document.createElement('div');
    el.className = className;
    el.innerHTML = html;
    this.root.append(el);
    pool.push(el);
    return el;
  }
}
