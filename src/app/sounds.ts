// Sound for moments: each moment plays its layers through the audio engine's helpers or by name, placed in the
// world unless it is the player's own. Every sound the engine actually starts reaches the effect log through onCue.
import type { Audio, SoundName, Use } from '../audio/index.ts';
import type { ConsumableKind, Moment } from './events.ts';
import type { EffectLog } from './effects.ts';
import type { V3 } from '../sim/math.ts';

const ABILITY: Record<string, SoundName> = {
  smokeScreen: 'abilitySmoke', ram: 'abilityRam', repair: 'abilityRepair', reveal: 'abilityReveal', hardTurn: 'abilityHardTurn',
  decoy: 'abilityDecoy', wave: 'abilityWave', driftMine: 'mineDrop',
};

export class MomentSound {
  readonly audio: Audio;
  /** The ship the player hears from. */
  me = 0;
  private readonly uses = new Map<number, { item: ConsumableKind; use: Use }>();

  constructor(audio: Audio, log: EffectLog) {
    this.audio = audio;
    audio.onCue((c) => log.add('sound', c.name, {
      variant: c.variant, bus: c.bus, gain: +c.gain.toFixed(3), ...(c.pos ? { at: [Math.round(c.pos.x), Math.round(c.pos.y), Math.round(c.pos.z)] } : {}),
    }));
  }

  /** Positions for other ships' sounds; the player's own are unplaced. */
  private at(ship: number, pos: V3): V3 | null {
    return ship === this.me ? null : pos;
  }

  react(m: Moment): void {
    const a = this.audio, me = this.me;
    switch (m.k) {
      case 'fire':
        a.fire(m.weapon, { pos: this.at(m.ship, m.pos), rarity: m.rarity });
        if (m.weapon === 'mortar') a.whistle(m.pos, 1.4);
        return;
      case 'impact':
        if (m.on !== 'ship') a.impact(m.on, { pos: m.pos, weapon: m.weapon });
        return;
      case 'hit':
        if (m.weapon === 'storm') { if (m.ship === me) a.play('stormDamage'); return; }
        if (m.shield > 0) a.shieldHit({ pos: this.at(m.ship, m.pos), level: 0.5 });
        if (m.hull > 0) a.impact('ship', { pos: this.at(m.ship, m.pos), weapon: m.weapon in FIRE_OK ? (m.weapon as never) : undefined, crit: m.crit });
        if (m.by === me && m.ship !== me) a.play(m.crit ? 'hitMarkerCrit' : m.hull > 0 ? 'hitMarker' : 'hitMarkerShield');
        return;
      case 'shieldBreak':
        a.shieldBreak(m.ship === me ? null : m.pos);
        if (m.by === me) a.play('stingShieldBreak');
        return;
      case 'shieldUp':
        a.play('shieldRefill', { pos: this.at(m.ship, m.pos) });
        return;
      case 'sink':
        a.play('sinking', { pos: this.at(m.ship, m.pos) });
        if (m.by === me && m.ship !== me) a.play('stingKill');
        if (m.ship === me) a.play('stingDefeat');
        return;
      case 'pickup':
        if (m.ship === me) a.play('pickup', { rarity: m.rarity });
        return;
      case 'drop':
        if (m.ship === me) a.play('dropItem');
        return;
      case 'gust':
        a.play('gust', { pos: this.at(m.ship, m.pos) });
        return;
      case 'reload':
        if (m.ship === me) a.play(RELOAD[m.weapon]);
        return;
      case 'empty':
        if (m.ship === me) a.play('empty');
        return;
      case 'useStart': {
        if (m.ship !== me) return;
        this.uses.get(m.ship)?.use.cancel();
        this.uses.set(m.ship, { item: m.item, use: a.use(m.item, m.seconds) });
        return;
      }
      case 'useDone':
        this.uses.get(m.ship)?.use.finish();
        this.uses.delete(m.ship);
        return;
      case 'useCancel':
        this.uses.get(m.ship)?.use.cancel();
        this.uses.delete(m.ship);
        return;
      case 'ability':
        a.play(ABILITY[m.id] ?? 'abilityReady', { pos: this.at(m.ship, m.pos) });
        return;
      case 'stormPhase':
        a.play('stormWarning');
        a.play('stormShrink', { delay: 0.6 });
        return;
      case 'galeDive':
        if (m.ship === me) a.play('galeDive');
        return;
      case 'landing':
        if (m.ship === me) a.play('galeLand');
        return;
      case 'deliveryCalled':
        if (m.ship === me) { a.play('coinSpend'); a.play('gullCall', { pos: m.pos }); }
        return;
      case 'deliveryArrived':
        a.play('gullWings', { pos: m.pos });
        a.play('deliveryThud', { pos: m.pos, delay: 0.15 });
        return;
      case 'coins':
        if (m.ship === me) a.coins(Math.max(1, Math.round(m.amount / 5)));
        return;
      case 'whaleBreach': a.play('whaleBreach', { pos: m.pos }); return;
      case 'whaleSurface': a.play('whaleBreath', { pos: m.pos }); return;
      case 'whaleDive': a.play('whaleDive', { pos: m.pos }); return;
      case 'perk':
        if (m.ship === me) a.play(m.on ? 'landmarkTaken' : 'landmarkLost');
        return;
      case 'lightning':
        if (m.warning) a.play('thunderWarn', { pos: m.pos });
        else { a.play('lightning', { pos: m.pos }); a.play('thunder', { pos: m.pos, delay: 0.3 }); }
        return;
      case 'aground':
        a.play('aground', { pos: this.at(m.ship, m.pos) });
        return;
      case 'win':
        if (m.ship === me) a.play('stingVictory');
        return;
      default:
        return;
    }
  }

  /** Stops every use loop (leaving a match). */
  clear(): void {
    for (const u of this.uses.values()) u.use.cancel();
    this.uses.clear();
  }
}

const FIRE_OK = { cannon: 1, scatter: 1, harpoon: 1, mortar: 1, repeater: 1, broadside: 1 } as const;
const RELOAD: Record<keyof typeof FIRE_OK, SoundName> = {
  cannon: 'reloadCannon', scatter: 'reloadScatter', harpoon: 'reloadHarpoon', mortar: 'reloadMortar', repeater: 'reloadRepeater', broadside: 'reloadBroadside',
};
