// Which sounds each moment plays, in layers. Positions are passed through so the engine can place them; the player's
// own interface sounds (markers, stingers) play unplaced.
import type { SoundName } from '../audio/bank.ts';
import type { ConsumableKind, Moment, WeaponClass } from './events.ts';
import type { V3 } from '../sim/math.ts';

export interface Cue {
  name: SoundName;
  pos?: V3;
  /** For rarity- or level-graded sounds: the variant (rarity 0–4) or level (0–1). */
  grade?: number;
  gain?: number;
}

const FIRE: Record<WeaponClass, SoundName> = {
  cannon: 'fireCannon', scatter: 'fireScatter', harpoon: 'fireHarpoon', mortar: 'fireMortar', repeater: 'fireRepeater', broadside: 'fireBroadside',
};
const RELOAD: Record<WeaponClass, SoundName> = {
  cannon: 'reloadCannon', scatter: 'reloadScatter', harpoon: 'reloadHarpoon', mortar: 'reloadMortar', repeater: 'reloadRepeater', broadside: 'reloadBroadside',
};
const USE: Record<ConsumableKind, [SoundName, SoundName]> = {
  smallShield: ['useSmallShield', 'smallShieldDone'],
  bigShield: ['useBigShield', 'bigShieldDone'],
  repairKit: ['useRepairKit', 'repairKitDone'],
  fullRepair: ['useFullRepair', 'fullRepairDone'],
};
const ABILITY: Record<string, SoundName> = {
  smokeScreen: 'abilitySmoke', ram: 'abilityRam', repair: 'abilityRepair', reveal: 'abilityReveal', hardTurn: 'abilityHardTurn',
  decoy: 'abilityDecoy', wave: 'abilityWave', driftMine: 'mineDrop',
};

/** The sounds a moment makes, heard from ship `me`. */
export function cuesFor(m: Moment, me: number): Cue[] {
  switch (m.k) {
    case 'fire': {
      const c: Cue[] = [{ name: FIRE[m.weapon], pos: m.pos, grade: m.rarity }];
      if (m.weapon === 'mortar') c.push({ name: 'mortarWhistle', pos: m.pos });
      return c;
    }
    case 'impact':
      if (m.on === 'ship') return [{ name: m.weapon === 'harpoon' ? 'harpoonHit' : 'impactShip', pos: m.pos }];
      return [{ name: m.weapon === 'mortar' ? 'mortarBlast' : m.on === 'land' ? 'impactLand' : 'impactWater', pos: m.pos }];
    case 'hit': {
      const c: Cue[] = [];
      if (m.shield > 0) c.push({ name: 'shieldHit', pos: m.pos });
      if (m.hull > 0) c.push({ name: m.weapon === 'storm' ? 'stormDamage' : 'hullHit', pos: m.pos });
      if (m.crit) c.push({ name: 'crit', pos: m.pos });
      if (m.by === me && m.ship !== me) c.push({ name: m.crit ? 'hitMarkerCrit' : m.hull > 0 ? 'hitMarker' : 'hitMarkerShield' });
      return c;
    }
    case 'shieldBreak':
      return m.by === me || m.ship === me
        ? [{ name: 'shieldBreak', pos: m.pos }, { name: 'stingShieldBreak' }]
        : [{ name: 'shieldBreak', pos: m.pos }];
    case 'shieldUp': return [{ name: 'shieldRefill' }];
    case 'sink': {
      const c: Cue[] = [{ name: 'sinking', pos: m.pos }];
      if (m.by === me && m.ship !== me) c.push({ name: 'stingKill' });
      if (m.ship === me) c.push({ name: 'stingDefeat' });
      return c;
    }
    case 'pickup': return m.ship === me ? [{ name: 'pickup', grade: m.rarity }] : [];
    case 'drop': return m.ship === me ? [{ name: 'dropItem' }] : [];
    case 'gust': return [{ name: 'gust', pos: m.pos }];
    case 'reload': return m.ship === me ? [{ name: RELOAD[m.weapon] }] : [];
    case 'empty': return m.ship === me ? [{ name: 'empty' }] : [];
    case 'useStart': return m.ship === me ? [{ name: USE[m.item][0] }] : [];
    case 'useDone': return m.ship === me ? [{ name: USE[m.item][1] }] : [];
    case 'useCancel': return m.ship === me ? [{ name: 'useCancel' }] : [];
    case 'ability': return [{ name: ABILITY[m.id] ?? 'abilityReady', pos: m.pos }];
    case 'stormPhase': return [{ name: 'stormWarning' }, { name: 'stormShrink' }];
    case 'galeDive': return m.ship === me ? [{ name: 'galeDive' }] : [];
    case 'landing': return m.ship === me ? [{ name: 'galeLand' }, { name: 'gustLand', pos: m.pos }] : [];
    case 'deliveryCalled': return m.ship === me ? [{ name: 'gullCall', pos: m.pos }, { name: 'coinSpend' }] : [];
    case 'deliveryArrived': return [{ name: 'gullWings', pos: m.pos }, { name: 'deliveryThud', pos: m.pos }];
    case 'coins': return m.ship === me ? [{ name: 'coin' }] : [];
    case 'whaleBreach': return [{ name: 'whaleBreach', pos: m.pos }];
    case 'whaleSurface': return [{ name: 'whaleBreath', pos: m.pos }];
    case 'whaleDive': return [{ name: 'whaleDive', pos: m.pos }];
    case 'perk': return m.ship === me ? [{ name: m.on ? 'landmarkTaken' : 'landmarkLost' }] : [];
    case 'lightning': return m.warning ? [{ name: 'thunderWarn', pos: m.pos }] : [{ name: 'lightning', pos: m.pos }, { name: 'thunder', pos: m.pos }];
    case 'aground': return [{ name: 'aground', pos: m.pos }];
    case 'win': return m.ship === me ? [{ name: 'stingVictory' }] : [];
    default: return [];
  }
}
