// Juice timing: what the camera, the clock, the screen and the hands feel for each moment, scaled to its size and
// to whether it happened to you, by you, or near you. Hit-stop, kicks, shakes, flashes, haptics and ceremonies all
// start here, and every one is written to the effect log.
import type { Moment, WeaponClass } from './events.ts';
import type { CameraJuice, EffectLog, Flash } from './effects.ts';
import type { HapticsOut } from './haptics.ts';
import type { Loop } from './loop.ts';
import type { V3 } from '../sim/math.ts';

export interface JuiceOut {
  loop: Loop;
  camera: CameraJuice;
  flash: Flash;
  haptics: HapticsOut;
  log: EffectLog;
  /** Screen-space feedback the HUD shows: hit markers, toasts and ceremonies. */
  hud(name: 'hitMarker' | 'toast' | 'ceremony' | 'vignette', data: Record<string, unknown>): void;
}

const KICK: Record<WeaponClass, number> = { cannon: 0.22, scatter: 0.3, harpoon: 0.26, mortar: 0.38, repeater: 0.06, broadside: 0.55 };

const dist = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export class Juice {
  /** The ship the player sees from: their own, or the one they spectate. */
  me = 0;
  /** Where the camera is, in metres from the planet's centre, for scaling far-off moments. */
  eye: V3 = { x: 0, y: 0, z: 0 };
  private readonly out: JuiceOut;

  constructor(out: JuiceOut) {
    this.out = out;
  }

  /** Hit-stop: the world freezes for a beat. */
  private stop(seconds: number, why: string): void {
    this.out.loop.hold(seconds);
    this.out.log.add('screen', 'hitStop', { seconds, why });
  }

  /** Reacts to one moment. Positions are in metres from the planet's centre. */
  react(m: Moment): void {
    const { camera, flash, haptics, hud } = this.out, me = this.me;
    switch (m.k) {
      case 'fire':
        if (m.ship !== me) return;
        camera.punch(KICK[m.weapon], `fire ${m.weapon}`);
        if (m.weapon === 'broadside' || m.weapon === 'mortar') camera.shake(0.25, `fire ${m.weapon}`);
        haptics.play(m.weapon === 'repeater' ? 'tap' : m.weapon === 'broadside' ? 'heavy' : 'medium', `fire ${m.weapon}`);
        return;
      case 'hit':
        if (m.by === me && m.ship !== me) {
          hud('hitMarker', { crit: m.crit, shield: m.shield, hull: m.hull });
          haptics.play(m.crit ? 'medium' : 'light', 'hit landed');
          if (m.crit) this.stop(0.04, 'crit');
        } else if (m.ship === me) {
          const size = m.shield + m.hull;
          camera.shake(Math.min(0.6, 0.18 + size / 90), 'hit taken');
          hud('vignette', { color: m.hull > 0 ? 'hull' : 'shield', strength: Math.min(1, 0.25 + size / 60) });
          haptics.play(size > 25 ? 'heavy' : 'medium', 'hit taken');
        }
        return;
      case 'shieldBreak':
        // the big one: shatter, flash, glassy crack, hit-stop, kick, haptic
        if (m.by === me && m.ship !== me) {
          this.stop(0.09, 'shield break dealt');
          flash.fire('#bfe6ff', 0.45, 0.25, 'shield break dealt');
          camera.punch(0.5, 'shield break dealt');
          haptics.play('heavy', 'shield break dealt');
          hud('ceremony', { name: 'shieldBreak', ship: m.ship });
        } else if (m.ship === me) {
          this.stop(0.07, 'shield break taken');
          flash.fire('#9fd4ff', 0.35, 0.3, 'shield break taken');
          camera.shake(0.55, 'shield break taken');
          haptics.play('warning', 'shield break taken');
        }
        return;
      case 'shieldUp':
        if (m.ship === me) haptics.play('success', 'shield refilled');
        return;
      case 'sink':
        if (m.ship === me) {
          this.stop(0.15, 'sunk');
          flash.fire('#1a0d08', 0.5, 0.8, 'sunk');
          camera.shake(0.7, 'sunk');
          haptics.play('error', 'sunk');
        } else if (m.by === me) {
          this.stop(0.12, 'sank a ship');
          flash.fire('#fff1cf', 0.3, 0.3, 'sank a ship');
          camera.punch(0.6, 'sank a ship');
          camera.shake(0.35, 'sank a ship');
          haptics.play('success', 'sank a ship');
          hud('toast', { kind: 'sank', ship: m.ship });
        } else this.near(m.pos, 0.25, 160, 'a ship sank nearby');
        return;
      case 'gust':
        if (m.ship !== me) return;
        camera.zoomPunch(7, 'gust');
        camera.punch(0.18, 'gust');
        haptics.play('medium', 'gust');
        return;
      case 'empty':
        if (m.ship === me) haptics.play('tap', 'empty');
        return;
      case 'useStart':
        if (m.ship === me) haptics.play('light', `use ${m.item}`);
        return;
      case 'useDone':
        if (m.ship === me) haptics.play('success', `used ${m.item}`);
        return;
      case 'useCancel':
        if (m.ship === me) haptics.play('warning', `cancelled ${m.item}`);
        return;
      case 'ability':
        if (m.ship !== me) return;
        camera.punch(0.2, `ability ${m.id}`);
        haptics.play('medium', `ability ${m.id}`);
        return;
      case 'pickup':
        if (m.ship !== me) return;
        haptics.play(m.rarity >= 3 ? 'success' : 'light', 'pickup');
        hud('toast', { kind: 'pickup', item: m.item, rarity: m.rarity });
        return;
      case 'stormPhase':
        haptics.play('warning', 'storm phase');
        hud('toast', { kind: 'storm', phase: m.phase, seconds: m.seconds });
        return;
      case 'stormHurt':
        if (m.ship === me) hud('vignette', { color: 'storm', strength: 0.4 });
        return;
      case 'galeDive':
        if (m.ship !== me) return;
        camera.zoomPunch(12, 'gale dive');
        haptics.play('medium', 'gale dive');
        return;
      case 'landing':
        if (m.ship !== me) return;
        camera.shake(0.4, 'landing');
        camera.punch(0.35, 'landing');
        haptics.play('heavy', 'landing');
        return;
      case 'deliveryArrived':
        if (m.ship === me) haptics.play('medium', 'delivery');
        return;
      case 'whaleBreach':
        this.near(m.pos, 0.6, 260, 'whale breach');
        return;
      case 'lightning':
        if (!m.warning) {
          flash.fire('#e8f0ff', 0.4, 0.2, 'lightning');
          this.near(m.pos, 0.3, 300, 'lightning');
        }
        return;
      case 'aground':
        if (m.ship === me) { camera.shake(0.3, 'aground'); haptics.play('medium', 'aground'); }
        return;
      case 'perk':
        if (m.ship === me) { haptics.play(m.on ? 'success' : 'warning', `perk ${m.perk}`); hud('toast', { kind: 'perk', perk: m.perk, on: m.on }); }
        return;
      case 'win':
        if (m.ship !== me) return;
        this.stop(0.25, 'victory');
        flash.fire('#ffe9b0', 0.5, 0.9, 'victory');
        haptics.play('success', 'victory');
        hud('ceremony', { name: 'victory' });
        return;
      default:
        return;
    }
  }

  /** A shake that falls off with distance from the camera. */
  private near(pos: V3, amount: number, range: number, why: string): void {
    const d = dist(pos, this.eye);
    if (d < range) {
      this.out.camera.shake(amount * (1 - d / range), why);
      if (d < range / 2) this.out.haptics.play('medium', why);
    }
  }
}
