import { blowOf, type Blow, type Deed, type GunKind } from '../play/player.ts';
import type { SoundName } from './bank.ts';

export type Happening = Deed;

export const DEEDS = [
  'fired',
  'winding',
  'reloading',
  'reloaded',
  'fell',
  'struck',
  'sank',
  'took',
  'mended',
  'gust',
] as const satisfies readonly Happening['kind'][];

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
  'mendWard',
  'mendHull',
  'gust',
  'ready',
  'select',
  'whistle',
  'claim',
  'closing',
  'thunder',
  'tap',
  'open',
  'close',
  'launch',
  'lost',
  'salute',
] as const;
export type Cue = (typeof CUE_NAMES)[number];

export type Bus = 'world' | 'own' | 'ui';

interface CueSound {
  sound: SoundName | 'report';
  level: number;
  bus: Bus;
}

export const soundOf = (c: CueSound, gun: GunKind | null): SoundName =>
  c.sound === 'report' ? (gun ?? 'cannon') : c.sound;

export const CUES: Record<Cue, CueSound> = {
  fire: { sound: 'report', level: 0, bus: 'own' },
  fired: { sound: 'report', level: 0, bus: 'world' },
  wind: { sound: 'wind', level: 0, bus: 'own' },
  wound: { sound: 'wind', level: 0, bus: 'world' },
  reload: { sound: 'reload', level: 0, bus: 'own' },
  splash: { sound: 'splash', level: 0, bus: 'world' },
  thud: { sound: 'thud', level: 0, bus: 'world' },
  strike: { sound: 'strike', level: 0, bus: 'world' },
  hurt: { sound: 'hurt', level: 0, bus: 'own' },
  ring: { sound: 'ring', level: 0, bus: 'own' },
  shatter: { sound: 'shatter', level: 0, bus: 'own' },
  sank: { sound: 'sink', level: 0, bus: 'world' },
  sunk: { sound: 'sink', level: 2, bus: 'own' },
  took: { sound: 'took', level: 0, bus: 'own' },
  mendWard: { sound: 'mendWard', level: 0, bus: 'own' },
  mendHull: { sound: 'mendHull', level: 0, bus: 'own' },
  gust: { sound: 'gust', level: 0, bus: 'own' },
  ready: { sound: 'ready', level: 0, bus: 'own' },
  select: { sound: 'select', level: 0, bus: 'own' },
  whistle: { sound: 'whistle', level: 0, bus: 'world' },
  claim: { sound: 'claim', level: 0, bus: 'own' },
  closing: { sound: 'closing', level: 0, bus: 'own' },
  thunder: { sound: 'thunder', level: 0, bus: 'own' },
  tap: { sound: 'tap', level: 0, bus: 'ui' },
  open: { sound: 'open', level: 0, bus: 'ui' },
  close: { sound: 'close', level: 0, bus: 'ui' },
  launch: { sound: 'launch', level: 0, bus: 'ui' },
  lost: { sound: 'lost', level: 0, bus: 'ui' },
  salute: { sound: 'salute', level: 0, bus: 'ui' },
};

const TAKEN = {
  broke: 'shatter',
  hull: 'hurt',
  shield: 'ring',
} as const satisfies Record<Blow, Cue>;

export function cueOf(h: Happening, own: number | null): Cue | null {
  const mine = h.ship === own;
  switch (h.kind) {
    case 'fired':
      return mine ? 'fire' : 'fired';
    case 'winding':
      return mine ? 'wind' : 'wound';
    case 'reloading':
      return mine ? 'reload' : null;
    case 'reloaded':
      return mine ? 'ready' : null;
    case 'fell':
      return h.land ? 'thud' : 'splash';
    case 'struck':
      return !mine ? 'strike' : TAKEN[blowOf(h)];
    case 'sank':
      return mine ? 'sunk' : 'sank';
    case 'took':
      return mine ? 'took' : null;
    case 'mended':
      return !mine
        ? null
        : h.piece === 'smallShield' || h.piece === 'bigShield'
          ? 'mendWard'
          : 'mendHull';
    case 'gust':
      return mine ? 'gust' : null;
  }
}
