// Portolan's sound: the one way in. Everything is synthesised (see bank.ts); there is no music anywhere.
//
//   const audio = createAudio();
//   audio.unlock();                                   // listens for the first touch; call it inside a gesture too
//   audio.setListener(camera.position, cameraForward, cameraUp);
//   audio.setAmbience({ regions: { fjords: 0.7, mistwood: 0.3 }, weather: { fog: 0.5 }, nearSurf: 0.2, wind: 1, speed: 9 });
//   audio.play('fireCannon', { pos: shipPos, rarity: 2 });
//   audio.play('tap');
//
// Positions are world metres with the planet's centre at the origin. A sound with no pos is your own: centred and
// whole. Integration maps simulation and interface events onto SoundNames; nothing here reads the simulation.
import type { Bus } from './def.ts';
import { GROUPS, SOUND_NAMES, SOUNDS, type SoundName } from './bank.ts';
import { AudioEngine, type Cue, type PlayOptions, type Vec3, type Volumes } from './engine.ts';
import { Ambience, WEATHERS, type AmbienceMix, type Weather } from './ambience.ts';
import { REGION_IDS, REGION_SOUND, type RegionId } from './regions.ts';
import { FIRE, IMPACT, RELOAD } from './sounds/weapons.ts';
import { CONSUMABLE } from './sounds/items.ts';
import { ABILITY } from './sounds/world.ts';

export type { AmbienceMix, Bus, Cue, PlayOptions, RegionId, SoundName, Vec3, Volumes, Weather };
export { ABILITY, CONSUMABLE, FIRE, GROUPS, IMPACT, REGION_IDS, REGION_SOUND, RELOAD, SOUND_NAMES, SOUNDS, WEATHERS };
export { AudioEngine } from './engine.ts';

export type WeaponClass = keyof typeof FIRE;
export type Consumable = keyof typeof CONSUMABLE;
export type ActiveAbility = keyof typeof ABILITY;
/** Sounds that loop until stopped: burning, mending, the use loops and the beds. */
export const LOOPS: readonly SoundName[] = SOUND_NAMES.filter((n) => SOUNDS[n].loop);

/** A consumable being used: finish it when the use completes, or cancel it when interrupted. */
export interface Use { finish(): void; cancel(): void }

export interface Audio {
  /** Resumes audio now (call inside a user gesture), and on the first touch, click or key if it is still locked. */
  unlock(target?: EventTarget): void;
  /** Plays a sound; returns its voice id (0 if it was too quiet or too far to be worth playing). */
  play(name: SoundName, opts?: PlayOptions): number;
  /** Starts a looping sound (burning, mending, a use loop). Stop it with stop(id). */
  loop(name: SoundName, opts?: PlayOptions): number;
  /** Moves a playing sound, such as a burning ship's crackle. */
  move(id: number, pos: Vec3 | null): void;
  stop(id: number, fade?: number): void;
  /** Usually the camera: its position, the way it faces, and its up. */
  setListener(pos: Vec3, forward: Vec3, up: Vec3): void;
  /** Where the listener is in the world. Fields left out keep their last value. */
  setAmbience(mix: AmbienceMix): void;
  /** Fades every ambience bed out (the title, a pause). */
  stopAmbience(): void;
  /** The player's volumes, 0 to 1 each. */
  setVolumes(v: Volumes): void;

  /** A weapon firing, with its rarity's weight. With no pos it is yours and ducks the ambience a touch. */
  fire(weapon: WeaponClass, opts?: { pos?: Vec3 | null; rarity?: number }): void;
  /** A round landing. A mortar adds its blast; a crit adds the sting; a shielded ship rings instead of splintering. */
  impact(on: 'water' | 'land' | 'ship', opts: { pos?: Vec3 | null; weapon?: WeaponClass; crit?: boolean; shield?: boolean }): void;
  /** The mortar's whistle, timed to end as the shell lands secondsToImpact from now. */
  whistle(pos: Vec3, secondsToImpact: number): void;
  /** A shield hit; level is how weak it is now (0 full to 1 nearly gone), and the crack builds with it. */
  shieldHit(opts: { pos?: Vec3 | null; level: number }): void;
  /** The shield breaking. Yours (no pos) gets the ceremony stinger and ducks everything else. */
  shieldBreak(pos?: Vec3 | null): void;
  /** Starts a consumable's use loop, climbing over its use time. */
  use(item: Consumable, seconds: number, pos?: Vec3 | null): Use;
  /** A run of coins. */
  coins(count: number, pos?: Vec3 | null): void;
  /** Ducks a bus for a big moment. */
  duck(bus: Bus, db: number, seconds: number): void;

  /** Hears every sound as it fires: the capture tools log these. Returns an unsubscribe. */
  onCue(f: (c: Cue) => void): () => void;
  /** Renders sounds now so they start without a hitch; a region's bed and life ahead of arriving. */
  prepare(names: readonly SoundName[] | RegionId): void;
  suspend(): void;
  resume(): void;
  readonly engine: AudioEngine;
  readonly ambience: Ambience;
}

/** The order the worker renders the bank in: what is heard first, first. Region beds are rendered on demand. */
function startupOrder(): [SoundName, number][] {
  const first: SoundName[] = ['sea', 'swell', 'wind', 'bowWash', 'tap', 'back', 'tab', 'confirm', 'fireCannon', 'impactWater', 'impactShip', 'hullHit', 'shieldHit', 'shieldCrack', 'shieldBreak', 'hitMarker', 'hitMarkerShield', 'creak', 'slap', 'gust'];
  const rest = SOUND_NAMES.filter((n) => !first.includes(n) && !n.startsWith('bed'));
  return [...first, ...rest].flatMap((n) => [...Array(SOUNDS[n].variants).keys()].map((v) => [n, v] as [SoundName, number]));
}

export function createAudio(opts: { radius?: number; context?: BaseAudioContext; worker?: boolean } = {}): Audio {
  const engine = new AudioEngine(opts.context, opts.radius ?? 554), ambience = new Ambience(engine);
  if (opts.worker !== false) engine.startWorker(startupOrder());
  let unlocked = false;
  const a: Audio = {
    engine, ambience,
    unlock(target) {
      engine.unlock();
      if (!unlocked && typeof window !== 'undefined') { engine.unlockOn(target ?? window); unlocked = true; }
    },
    play: (name, o) => engine.play(name, o),
    loop: (name, o) => engine.play(name, o),
    move: (id, pos) => engine.setVoice(id, { pos }, 0.1),
    stop: (id, fade) => engine.stopVoice(id, fade),
    setListener: (pos, fwd, up) => engine.setListener(pos, fwd, up),
    setAmbience: (mix) => ambience.set(mix),
    stopAmbience: () => ambience.stop(),
    setVolumes: (v) => engine.setVolumes(v),

    fire(weapon, o = {}) {
      engine.play(FIRE[weapon], { pos: o.pos, rarity: o.rarity ?? 0 });
      if (!o.pos) engine.duck('amb', weapon === 'broadside' ? 7 : weapon === 'repeater' ? 1.5 : 4, weapon === 'broadside' ? 1 : 0.3);
    },
    impact(on, o) {
      const pos = o.pos ?? null;
      if (on === 'ship' && o.shield) engine.play('shieldHit', { pos });
      else if (on === 'ship' && o.weapon === 'harpoon') engine.play('harpoonHit', { pos });
      else engine.play(IMPACT[on], { pos, gain: o.weapon === 'repeater' ? 0.6 : 1, rate: o.weapon === 'repeater' ? 1.2 : 1 });
      if (o.weapon === 'mortar') engine.play('mortarBlast', { pos });
      if (o.crit) engine.play('crit', { pos });
    },
    whistle(pos, t) {
      engine.play('mortarWhistle', { pos, delay: Math.max(0, t - 1.25) });
    },
    shieldHit(o) {
      engine.play('shieldHit', { pos: o.pos });
      if (o.level > 0.25) engine.play('shieldCrack', { pos: o.pos, level: Math.min(0.999, (o.level - 0.25) / 0.75) });
    },
    shieldBreak(pos) {
      engine.play('shieldBreak', { pos });
      if (!pos) {
        engine.play('stingShieldBreak');
        engine.duck('amb', 10, 1.2, 1.2);
        engine.duck('fx', 5, 0.25, 0.5);
      }
    },
    use(item, seconds, pos) {
      const c = CONSUMABLE[item], id = engine.play(c.use, { pos, duration: seconds + 0.5 });
      let over = false;
      return {
        finish() { if (over) return; over = true; engine.stopVoice(id, 0.08); engine.play(c.done, { pos }); },
        cancel() { if (over) return; over = true; engine.stopVoice(id, 0.15); engine.play('useCancel', { pos }); },
      };
    },
    coins: (k, pos) => engine.coins(k, pos),
    duck: (bus, db, s) => engine.duck(bus, db, s),

    onCue: (f) => engine.onCue(f),
    prepare(names) {
      if (typeof names === 'string') ambience.prepare(names);
      else for (const n of names) for (let v = 0; v < SOUNDS[n].variants; v++) engine.prepare(n, v);
    },
    suspend: () => void engine.suspend(),
    resume: () => void engine.resume(),
  };
  return a;
}
