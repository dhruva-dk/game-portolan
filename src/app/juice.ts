// Juice timing, driven by moments: which of the juice library's recipes each moment fires (hit-stop, camera, haptic,
// flash, vignette, marker, damage number, interface bumps, particle hook), scaled to its size and to whether it
// happened to you, by you, or near you. Moments without a recipe get a direct camera move or haptic.
import { Juice, pickupRecipe, type FireContext } from '../juice/index.ts';
import type { Point } from '../juice/anim.ts';
import type { Moment, WeaponClass } from './events.ts';
import type { V3 } from '../sim/math.ts';

const FIRE_STRENGTH: Record<WeaponClass, number> = { cannon: 1, scatter: 1.1, harpoon: 0.9, mortar: 1.2, repeater: 0.35, broadside: 1.5 };

const dist = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export interface Viewer {
  /** The ship the player sees from: their own, or the one they spectate. */
  me: number;
  /** The camera's position in metres from the planet's centre. */
  eye: V3;
  /** Where a world point lands in the HUD, or null when it is behind the camera. */
  project(p: V3): Point | null;
  /** Screen direction from the view's centre to a world point, radians clockwise from straight ahead. */
  bearing(p: V3): number;
}

export class MomentJuice {
  readonly juice: Juice;
  private readonly view: Viewer;

  constructor(juice: Juice, view: Viewer) {
    this.juice = juice;
    this.view = view;
  }

  private ctx(pos: V3 | null, extra: FireContext = {}): FireContext {
    if (!pos) return extra;
    const v = this.view;
    return { world: pos, distance: dist(pos, v.eye), dir: v.bearing(pos), anchor: () => v.project(pos), ...extra };
  }

  react(m: Moment): void {
    const { juice } = this, me = this.view.me;
    switch (m.k) {
      case 'fire':
        if (m.ship === me) juice.fire('fire', { strength: FIRE_STRENGTH[m.weapon], world: m.pos });
        return;
      case 'hit': {
        if (m.steady) return;
        const size = m.shield + m.hull;
        if (m.by === me && m.ship !== me) {
          const id = m.crit ? 'crit' : m.hull > 0 ? 'cannonHit' : 'shieldHit';
          juice.fire(id, this.ctx(m.pos, { value: Math.round(size), key: m.ship, strength: Math.min(1.3, 0.6 + size / 40) }));
        } else if (m.ship === me && size > 0) {
          juice.fire('hurt', this.ctx(m.pos, { value: Math.round(size), strength: Math.min(1.3, 0.4 + size / 40), anchor: undefined }));
        }
        return;
      }
      case 'shieldBreak':
        if (m.by === me && m.ship !== me) juice.fire('shieldBreak', this.ctx(m.pos, { key: m.ship }));
        else if (m.ship === me) juice.fire('shieldLost', this.ctx(m.pos, { anchor: undefined }));
        return;
      case 'sink':
        if (m.by === me && m.ship !== me) juice.fire('sink', this.ctx(m.pos, { key: m.ship }));
        else if (m.ship === me) {
          juice.camera.play({ shake: 0.6, band: 'rumble', fov: { deg: -6, attack: 0.1, hold: 0.4, release: 1.2 } });
          juice.haptics.play('error');
        } else this.near(m.pos, 0.3, [40, 220]);
        return;
      case 'gust':
        if (m.ship === me) juice.fire('gust', { world: m.pos });
        return;
      case 'pickup':
        if (m.ship === me) juice.fire(pickupRecipe(m.rarity), { world: m.pos });
        return;
      case 'coins':
        if (m.ship === me) juice.fire('coins', { value: m.amount, count: Math.min(12, Math.max(2, Math.round(m.amount / 5))) });
        return;
      case 'useDone':
        if (m.ship === me) juice.fire(m.item === 'smallShield' || m.item === 'bigShield' ? 'consumable.shield' : 'consumable.repair');
        return;
      case 'shieldUp':
        return;
      case 'useStart':
        if (m.ship === me) juice.haptics.play('light');
        return;
      case 'useCancel':
        if (m.ship === me) juice.haptics.play('warning');
        return;
      case 'empty':
        if (m.ship === me) juice.haptics.play('select');
        return;
      case 'ability':
        if (m.ship === me) {
          juice.camera.play({ shake: 0.15, fov: { deg: 3, attack: 0.08, hold: 0.1, release: 0.4 } });
          juice.haptics.play('medium');
        }
        return;
      case 'stormPhase':
        juice.haptics.play('warning');
        return;
      case 'galeDive':
        if (m.ship === me) {
          juice.camera.play({ fov: { deg: 12, attack: 0.2, hold: 0.6, release: 1 }, shake: 0.2, band: 'rumble' });
          juice.haptics.play('medium');
        }
        return;
      case 'landing':
        if (m.ship === me) {
          juice.camera.play({ shake: 0.45, kick: { back: 0.6, pitch: 1.4 } });
          juice.haptics.play('heavy');
        }
        return;
      case 'deliveryArrived':
        if (m.ship === me) juice.haptics.play('medium');
        return;
      case 'whaleBreach':
        this.near(m.pos, 0.55, [60, 320]);
        return;
      case 'lightning':
        if (!m.warning) this.near(m.pos, 0.35, [30, 300]);
        return;
      case 'aground':
        if (m.ship === me) { juice.camera.play({ shake: 0.3 }); juice.haptics.play('medium'); }
        return;
      case 'perk':
        if (m.ship === me) juice.haptics.play(m.on ? 'success' : 'warning');
        return;
      case 'win':
        if (m.ship === me) juice.fire('win');
        return;
      default:
        return;
    }
  }

  /** A rumble that falls off with distance from the camera. */
  private near(pos: V3, amount: number, falloff: readonly [number, number]): void {
    const d = dist(pos, this.view.eye);
    this.juice.camera.play({ shake: amount, band: 'rumble', falloff }, 1, this.view.bearing(pos), d);
    if (d < falloff[1] / 2) this.juice.haptics.play('medium');
  }
}
