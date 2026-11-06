// Sound for moments: each moment plays its layers through the audio engine's helpers or by name, placed in the
// world unless it is the player's own. Every sound the engine actually starts reaches the effect log through onCue.
import type { Audio, SoundName, Use } from '../audio/index.ts';
import type { ConsumableKind, Moment } from './events.ts';
import type { EffectLog } from './effects.ts';
import type { V3 } from '../sim/math.ts';
import { EVENT_REGION as R } from '../sim/environment.ts';
import { regionAt } from '../sim/world/index.ts';

const ABILITY: Record<string, SoundName> = {
  smokeScreen: 'abilitySmoke', ram: 'abilityRam', repair: 'abilityRepair', reveal: 'abilityReveal', hardTurn: 'abilityHardTurn',
  decoy: 'abilityDecoy', wave: 'abilityWave', driftMine: 'mineDrop',
};

type Cue = readonly [SoundName, number] | null;

/** Each region's event as heard, by region index: its warning, its start and its end, each a sound and its gain. */
const EVENT_SOUND: Record<number, readonly [Cue, Cue, Cue]> = {
  [R.ice]: [['iceBoom', 0.6], ['floesGrind', 1], null],
  [R.fjords]: [null, ['floodSurge', 1], null],
  [R.mist]: [null, ['fogSurge', 1], null],
  [R.spires]: [['rockfall', 0.35], ['rockfall', 1], null],
  [R.narrows]: [['rockfall', 0.3], ['rockfall', 1], null],
  [R.basalt]: [null, ['floodSurge', 0.6], ['floodSurge', 0.5]],
  [R.kelp]: [null, ['kelpBloom', 1], null],
  [R.blossom]: [null, ['floodSurge', 1], null],
  [R.glass]: [['whaleSong', 0.8], ['whaleBreach', 1], null],
  [R.jade]: [null, ['tideDraw', 0.9], ['floodSurge', 0.5]],
  [R.coral]: [null, ['floodSurge', 0.7], null],
  [R.spice]: [null, ['clamOpen', 1], null],
  [R.fire]: [['thunder', 0.5], ['eruption', 1], null],
  [R.weeping]: [['thunderWarn', 0.8], ['cloudburst', 1], null],
  [R.mangrove]: [null, ['floodSurge', 0.7], null],
  [R.maelstrom]: [['vortexSurge', 0.4], ['vortexSurge', 1], null],
};
/** The events that fill their whole region, heard all round you while you are in it rather than from their spot. */
const WIDE = new Set<number>([R.mist, R.blossom, R.jade, R.coral, R.weeping, R.mangrove]);

export class MomentSound {
  readonly audio: Audio;
  /** The ship the player hears from. */
  me = 0;
  /** Where that ship is, for the events that fill a region. */
  ear: () => V3 | null = () => null;
  private readonly uses = new Map<number, { item: ConsumableKind; use: Use }>();
  /** When the Storm last bit the player's hull, in seconds: its sound comes once a second, not every tick. */
  private storm = -1;
  /** Each burning ship's crackle, by ship. */
  private readonly flames = new Map<number, number>();
  /** When a waterline hit last gushed, per ship, so a broadside's balls make one gush and not four. */
  private readonly gushed = new Map<number, number>();

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
      case 'impact': {
        if (m.on !== 'ship') a.impact(m.on, { pos: m.pos, weapon: m.weapon });
        const st = m.struck;
        if (!st) return;
        const pos = this.at(m.ship, m.pos);
        if (st.sail) a.play('sailTear', { pos, gain: m.weapon === 'chain' ? 1 : 0.6 });
        const now = performance.now() / 1000;
        if (st.waterline && now - (this.gushed.get(m.ship) ?? -9) > 0.6) { this.gushed.set(m.ship, now); a.play('floodGush', { pos }); }
        return;
      }
      case 'hit':
        if (m.steady) return;
        if (m.weapon === 'storm') { if (m.ship === me) a.play('stormDamage'); return; }
        if (m.shield > 0) a.shieldHit({ pos: this.at(m.ship, m.pos), level: 0.5 });
        if (m.hull > 0) a.impact('ship', { pos: this.at(m.ship, m.pos), weapon: m.weapon in FIRE_OK ? (m.weapon as never) : undefined, crit: m.crit });
        if (m.by === me && m.ship !== me) a.play(m.crit ? 'hitMarkerCrit' : m.hull > 0 ? 'hitMarker' : 'hitMarkerShield');
        return;
      case 'stormHurt': {
        const now = performance.now() / 1000;
        if (m.ship === me && now - this.storm >= 1) { this.storm = now; a.play('stormDamage'); }
        return;
      }
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
      case 'regionEvent': {
        const cue = EVENT_SOUND[m.region]?.[m.phase === 'warn' ? 0 : m.phase === 'start' ? 1 : 2];
        const ear = WIDE.has(m.region) ? this.ear() : null, pos = ear && regionAt(ear) === m.region ? null : m.pos;
        if (cue) a.play(cue[0], { pos, gain: cue[1] });
        if (m.phase === 'start' && m.region === R.weeping) a.play('thunder', { pos: m.pos, delay: 0.8 });
        return;
      }
      case 'lavaBomb':
        if (m.landed) a.play('lavaBomb', { pos: m.pos });
        else a.whistle(m.pos, m.seconds);
        return;
      case 'aground':
        a.play('aground', { pos: this.at(m.ship, m.pos) });
        return;
      case 'win':
        // the victory screen's ceremony plays the sting
        return;
      case 'mastFall':
        a.play('mastFall', { pos: this.at(m.ship, m.pos) });
        if (m.by === me && m.ship !== me) a.play('stingShieldBreak', { delay: 0.9 });
        return;
      case 'juryRig':
        a.play('juryRig', { pos: this.at(m.ship, m.pos) });
        return;
      case 'ablaze':
        a.play('ignite', { pos: this.at(m.ship, m.pos) });
        return;
      case 'quench':
        a.play('quench', { pos: this.at(m.ship, m.pos) });
        return;
      case 'about': {
        // canvas filling on the new board, louder for the way she carried; the yards slamming; or the canvas shaking
        const pos = this.at(m.ship, m.pos);
        if (m.how === 'slam') { a.play('yardSlam', { pos }); a.play('creak', { pos, delay: 0.25 }); }
        else if (m.how === 'irons') a.play('sailLuff', { pos });
        else a.play('sailFill', { pos, gain: 0.45 + 0.25 * Math.min(1, m.surge / 2) });
        return;
      }
      default:
        return;
    }
  }

  /** Keeps a crackle going over every ship that is burning, and stops each as its fire goes out or it sinks. */
  fires(ships: readonly { burn: number; pos: V3; phase: number }[], sunk: number, metres: (p: V3) => V3): void {
    ships.forEach((s, i) => {
      const id = this.flames.get(i), on = s.burn > 0 && s.phase !== sunk;
      if (on && !id) this.flames.set(i, this.audio.loop('burning', { pos: this.at(i, metres(s.pos)) }));
      else if (on && id) this.audio.move(id, this.at(i, metres(s.pos)));
      else if (!on && id) { this.audio.stop(id, 0.8); this.flames.delete(i); }
    });
  }

  /** Stops every use loop (leaving a match). */
  clear(): void {
    for (const u of this.uses.values()) u.use.cancel();
    this.uses.clear();
    for (const id of this.flames.values()) this.audio.stop(id, 0.3);
    this.flames.clear();
  }
}

const FIRE_OK = { cannon: 1, scatter: 1, harpoon: 1, mortar: 1, repeater: 1, broadside: 1, chain: 1, heated: 1 } as const;
const RELOAD: Record<keyof typeof FIRE_OK, SoundName> = {
  cannon: 'reloadCannon', scatter: 'reloadScatter', harpoon: 'reloadHarpoon', mortar: 'reloadMortar', repeater: 'reloadRepeater', broadside: 'reloadBroadside',
  chain: 'reloadChain', heated: 'reloadHeated',
};
