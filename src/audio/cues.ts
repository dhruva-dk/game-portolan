// What is heard for what happens: the one table from each happening to its
// sound (CUES), and from each kind of deed on the sea to its cue (cueOf). A cue
// says which sound, how loud against the sound's own level, and where it plays:
// placed in the world (heard from where it happened, carried, delayed, dulled
// and panned: space.ts), hers (heard close), or the UI's.
//
// A deed (Happening) is the match's own report of what happened (player.ts
// Deed, read from status.moments): numbered in order (seq), at a moment on the
// world's clock (time), where (at, a unit vector), and the ship it befell
// (ship). The rest are heard from what she sees and holds as it changes
// (listen.ts): a slot of her stores taken in hand, a ball passing near, her
// water, the storm, and the screens.

import {
  blowOf,
  isGun,
  type Blow,
  type Deed,
  type GunKind,
} from '../player.ts';
import type { SoundName } from './bank.ts';

/** A deed on the sea: player.ts Deed (see the header). */
export type Happening = Deed;

/** Every kind of deed. */
export const DEEDS = [
  'fired',
  'winding',
  'reloading',
  'reloaded',
  'swapped',
  'fell',
  'struck',
  'sank',
  'took',
  'mended',
  'gust',
] as const satisfies readonly Happening['kind'][];

/** What is heard. */
export const CUE_NAMES = [
  'fire',
  'fired',
  'wind',
  'wound',
  'reload',
  'splash',
  'thud',
  'strike',
  'hurt',
  'ring',
  'shatter',
  'sank',
  'sunk',
  'took',
  'swap',
  'mendWard',
  'mendHull',
  'gust',
  'ready',
  'select',
  'whistle',
  'claim',
  'closing',
  'tap',
  'open',
  'close',
  'launch',
  'lost',
  'salute',
] as const;
export type Cue = (typeof CUE_NAMES)[number];

/**
 * Where a cue plays: placed in the world (others', heard from where it
 * happened: space.ts), hers (heard close), or the UI's. The bed has its own
 * (bed.ts).
 */
export type Bus = 'world' | 'own' | 'ui';

/**
 * A cue: its sound (`report`: the report of the gun that fired, by its kind:
 * bank.ts REPORTS), its level against the sound's own (dB), and where it plays.
 */
interface CueSound {
  sound: SoundName | 'report';
  level: number;
  bus: Bus;
}

/**
 * The sound a cue plays, for a gun of kind `gun` (a cannon's, if none is said).
 */
export const soundOf = (c: CueSound, gun: GunKind | null): SoundName =>
  c.sound === 'report' ? (gun ?? 'cannon') : c.sound;

export const CUES: Record<Cue, CueSound> = {
  // her gun, and everyone else's from where it fired, by its kind; wound up
  // (heard from others too: a warning), and her reload begun
  fire: { sound: 'report', level: 0, bus: 'own' },
  fired: { sound: 'report', level: 0, bus: 'world' },
  wind: { sound: 'wind', level: 0, bus: 'own' },
  wound: { sound: 'wind', level: 0, bus: 'world' },
  reload: { sound: 'reload', level: 0, bus: 'own' },
  // balls come down, or home
  splash: { sound: 'splash', level: 0, bus: 'world' },
  thud: { sound: 'thud', level: 0, bus: 'world' },
  strike: { sound: 'strike', level: 0, bus: 'world' },
  // her own blows: on her hull, on her ward, her ward broken
  hurt: { sound: 'hurt', level: 0, bus: 'own' },
  ring: { sound: 'ring', level: 0, bus: 'own' },
  shatter: { sound: 'shatter', level: 0, bus: 'own' },
  // a ship going down from where she lies; hers, close
  sank: { sound: 'sink', level: 0, bus: 'world' },
  sunk: { sound: 'sink', level: 2, bus: 'own' },
  // her stores: a gun taken up or swapped in hand onto her plinth
  took: { sound: 'took', level: 0, bus: 'own' },
  swap: { sound: 'swap', level: 0, bus: 'own' },
  mendWard: { sound: 'mendWard', level: 0, bus: 'own' },
  mendHull: { sound: 'mendHull', level: 0, bus: 'own' },
  gust: { sound: 'gust', level: 0, bus: 'own' },
  ready: { sound: 'ready', level: 0, bus: 'own' },
  select: { sound: 'select', level: 0, bus: 'own' },
  whistle: { sound: 'whistle', level: 0, bus: 'world' },
  // her water, and the storm
  claim: { sound: 'claim', level: 0, bus: 'own' },
  closing: { sound: 'closing', level: 0, bus: 'own' },
  // the screens
  tap: { sound: 'tap', level: 0, bus: 'ui' },
  open: { sound: 'open', level: 0, bus: 'ui' },
  close: { sound: 'close', level: 0, bus: 'ui' },
  launch: { sound: 'launch', level: 0, bus: 'ui' },
  lost: { sound: 'lost', level: 0, bus: 'ui' },
  salute: { sound: 'salute', level: 0, bus: 'ui' },
};

/** The cue for a blow on her. */
const TAKEN = {
  broke: 'shatter',
  hull: 'hurt',
  shield: 'ring',
} as const satisfies Record<Blow, Cue>;

/**
 * The cue for a deed, `own` her ship's id; null for one not heard. Her ward
 * taking all of a blow rings; taking its last breaks it; the rest of a blow on
 * her is on her hull.
 */
export function cueOf(h: Happening, own: number | null): Cue | null {
  const hers = h.ship === own;
  switch (h.kind) {
    case 'fired':
      return hers ? 'fire' : 'fired';
    case 'winding':
      return hers ? 'wind' : 'wound';
    case 'reloading':
      return hers ? 'reload' : null;
    case 'reloaded':
      return hers ? 'ready' : null;
    case 'swapped':
      return hers ? 'swap' : null;
    case 'fell':
      return h.land ? 'thud' : 'splash';
    case 'struck':
      return !hers ? 'strike' : TAKEN[blowOf(h)];
    case 'sank':
      return hers ? 'sunk' : 'sank';
    case 'took':
      return !hers ? null : isGun(h.piece) ? 'swap' : 'took';
    case 'mended':
      return !hers
        ? null
        : h.piece === 'smallShield' || h.piece === 'bigShield'
          ? 'mendWard'
          : 'mendHull';
    case 'gust':
      return hers ? 'gust' : null;
  }
}
