// Juice timing, driven by moments: which of the juice library's recipes each moment fires (hit-stop, camera, haptic,
// flash, vignette, marker, damage number, interface bumps, particle hook), scaled to its size and to whether it
// happened to you, by you, or near you. Moments without a recipe get a direct camera move or haptic.
import { Juice, pickupRecipe, type FireContext } from '../juice/index.ts';
import type { Point } from '../juice/anim.ts';
import type { Moment, WeaponClass } from './events.ts';
import type { ActorEvent, Juice as ActorJuice } from '../render/actors/index.ts';
import type { V3 } from '../sim/math.ts';
import { EVENT_REGION as R } from '../sim/environment.ts';

const FIRE_STRENGTH: Record<WeaponClass, number> = { cannon: 1, scatter: 1.1, harpoon: 0.9, mortar: 1.2, repeater: 0.35, broadside: 1.5, chain: 1.05, heated: 1 };

/** The regions whose event shakes the camera as it starts: how hard, and the distances over which it fades. */
const EVENT_RUMBLE: Record<number, readonly [number, number, number]> = {
  [R.spires]: [0.6, 80, 600], // the Spires' needle falling
  [R.narrows]: [0.5, 80, 500], // the Narrows' rockfall
  [R.fire]: [0.8, 150, 1400], // Cinder Peak erupting
  [R.maelstrom]: [0.3, 150, 700], // the Maelstrom's vortex rising
};

const dist = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export interface Viewer {
  /** The ship the player sees from: their own, or the one they spectate. */
  me: number;
  /** Watching another captain's ship: its hits, coins and haptics are not the player's, so they stay quiet. */
  spectating: boolean;
  /** The camera's position in metres from the planet's centre. */
  eye: V3;
  /** Where a world point lands in the HUD, or null when it is behind the camera. */
  project(p: V3): Point | null;
  /** Where a world point shows on the screen, kept clear of its edges, or null when the screen doesn't show it. */
  onScreen(p: V3): Point | null;
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
    // the marker goes on the hit where the screen shows it, not on the crosshair (over your own ship, it reads as
    // a hit on you); off the screen it keeps to the crosshair
    const v = this.view, at = v.onScreen(pos);
    return { world: pos, distance: dist(pos, v.eye), dir: v.bearing(pos), anchor: () => v.project(pos), ...(at ? { at } : {}), ...extra };
  }

  react(m: Moment): void {
    // spectating, no ship is the player's: only the world's rumbles reach them
    const { juice } = this, me = this.view.spectating ? -1 : this.view.me;
    switch (m.k) {
      case 'fire':
        if (m.ship === me) juice.fire('fire', { strength: FIRE_STRENGTH[m.weapon], world: m.pos });
        return;
      case 'hit': {
        if (m.steady) return;
        const size = m.shield + m.hull;
        if (m.by === me && m.ship !== me) {
          const id = m.crit ? 'crit' : m.rake && m.hull > 0 ? 'rake' : m.hull > 0 ? 'cannonHit' : 'shieldHit';
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
      case 'regionEvent': {
        // the banner gives the warning its haptic; what lands, falls or erupts shakes the camera by how close it is
        const rumble = m.phase === 'start' ? EVENT_RUMBLE[m.region] : undefined;
        if (rumble) this.near(m.pos, rumble[0], [rumble[1], rumble[2]]);
        return;
      }
      case 'lavaBomb':
        if (m.landed) this.near(m.pos, 0.25, [30, 260]);
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
      case 'mastFall':
        if (m.by === me && m.ship !== me) juice.fire('mastDown', this.ctx(m.pos, { key: m.ship }));
        else if (m.ship === me) juice.fire('mastLost', this.ctx(m.pos, { anchor: undefined }));
        else this.near(m.pos, 0.25, [40, 260]);
        return;
      case 'juryRig':
        if (m.ship === me) juice.haptics.play('success');
        return;
      case 'ablaze':
        if (m.ship === me) {
          juice.screen.vignette({ color: '#ff5a10', alpha: 0.4, reach: 0.5, attack: 0.05, hold: 0.2, decay: 1.2 });
          juice.haptics.play('warning');
        }
        return;
      case 'quench':
        if (m.ship === me) juice.haptics.play('light');
        return;
      case 'windup':
        // a heavy gun laid on you: a cold edge to the view and a buzz, held for as long as the wind-up runs
        if (m.at !== me || m.seconds <= 0) return;
        juice.screen.vignette({ color: '#ffd23a', alpha: 0.28, reach: 0.42, attack: 0.08, hold: m.seconds * 0.8, decay: 0.3 });
        juice.haptics.play('warning');
        return;
      case 'about':
        if (m.ship !== me) return;
        // a clean tack leans the view forward a touch as she surges; a thrown gybe jars it; irons is felt, not seen
        if (m.how === 'slam') { juice.camera.play({ shake: 0.35, kick: { back: 0.25, pitch: -0.8 } }); juice.haptics.play('heavy'); }
        else if (m.how === 'irons') juice.haptics.play('warning');
        else if (m.surge > 0.8) { juice.camera.play({ fov: { deg: 1.5 + m.surge, attack: 0.25, hold: 0.4, release: 1 } }); juice.haptics.play('light'); }
        return;
      default:
        return;
    }
  }

  /** The renderer's own beats, timed by what it draws: the whale bursting out of the sea and slamming back down
   *  seconds after the breach that starts it, and a gull dropping your crate. It reports hits and shots too, with
   *  their cause, but their moments have recipes already. */
  world(j: ActorJuice, cause: ActorEvent | null): void {
    if (cause) return;
    const { juice } = this;
    juice.camera.play({ shake: j.shake, band: 'rumble', ...(j.kick ? { fov: { deg: j.kick, attack: 0.08, hold: 0.2, release: 0.9 } } : {}) });
    if (j.hitStop) juice.time.request({ scale: 0.1, hold: j.hitStop, release: 0.2, priority: 'hit' });
    if (j.flash) juice.screen.flash({ color: `#${(j.flashColor ?? 0xffffff).toString(16).padStart(6, '0')}`, alpha: j.flash, blend: 'add', attack: 0.03, hold: 0.06, decay: 0.5 });
    if (j.haptic) juice.haptics.play(j.haptic);
  }

  /** A rumble that falls off with distance from the camera. */
  private near(pos: V3, amount: number, falloff: readonly [number, number]): void {
    const d = dist(pos, this.view.eye);
    this.juice.camera.play({ shake: amount, band: 'rumble', falloff }, 1, this.view.bearing(pos), d);
    if (d < falloff[1] / 2) this.juice.haptics.play('medium');
  }
}
