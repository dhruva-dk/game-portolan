import { SMALLEST, type Glyph } from './glyphs.ts';
import type { Word } from './word.ts';

export type StatName =
  | 'gunnery'
  | 'helm'
  | 'nerve'
  | 'territory'
  | 'stormcraft'
  | 'lookout'
  | 'sails'
  | 'rigging'
  | 'rudder'
  | 'hull'
  | 'keel'
  | 'mounts'
  | 'gun'
  | 'shield'
  | 'healSpeed'
  | 'healAmount'
  | 'thrift'
  | 'upkeep';

type RoleName = 'driver' | 'designer' | 'mechanic' | 'owner';

type Mark = { glyph: Glyph; word: Word };

export const STAT: Readonly<Record<StatName, Mark>> = {
  gunnery: { glyph: 'stat.gunnery', word: 'Gunnery' },
  helm: { glyph: 'stat.helm', word: 'Helm' },
  nerve: { glyph: 'stat.nerve', word: 'Nerve' },
  territory: { glyph: 'territory', word: 'Territory' },
  stormcraft: { glyph: 'stat.stormcraft', word: 'Stormcraft' },
  lookout: { glyph: 'stat.lookout', word: 'Lookout' },
  sails: { glyph: 'part.sails', word: 'Sails' },
  rigging: { glyph: 'part.rigging', word: 'Rigging' },
  rudder: { glyph: 'part.rudder', word: 'Rudder' },
  hull: { glyph: 'part.hull', word: 'Hull' },
  keel: { glyph: 'part.keel', word: 'Keel' },
  mounts: { glyph: 'part.mounts', word: 'Mounts' },
  gun: { glyph: 'part.gun', word: 'Gun' },
  shield: { glyph: 'stat.shield', word: 'Shield' },
  healSpeed: { glyph: 'stat.healSpeed', word: 'Heal speed' },
  healAmount: { glyph: 'stat.healAmount', word: 'Heal amount' },
  thrift: { glyph: 'stat.thrift', word: 'Thrift' },
  upkeep: { glyph: 'stat.upkeep', word: 'Upkeep' },
};

export const ROLE: Readonly<Record<RoleName, Mark>> = {
  driver: { glyph: 'role.driver', word: 'Driver' },
  designer: { glyph: 'role.designer', word: 'Designer' },
  mechanic: { glyph: 'role.mechanic', word: 'Mechanic' },
  owner: { glyph: 'role.owner', word: 'Owner' },
};

const POINTS_PER_UNIT = 1180 / 680;

const LEAST = new Map(SMALLEST);

export const least = (g: Glyph): number =>
  Math.ceil(((LEAST.get(g) ?? 24) / POINTS_PER_UNIT) * 2) / 2;
