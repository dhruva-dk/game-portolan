// First-time tips: a short card the first time each of the game's key moments happens to the player, from the first
// weapon to the whale rising, and the drawings the chart teaches with itself (the hand over the Gale). Moments and a
// look over the player's ship each frame offer tips; each shows once ever, one at a time, and the ones shown are kept
// in the browser's storage beside the settings. Capture mode keeps them in
// memory and starts with them off, so the capture tools' frames show only what they arrange.
import { ability } from '../sim/abilities.ts';
import { atHome } from '../sim/territory.ts';
import { openAt } from '../sim/nav.ts';
import { seaLevelAt } from '../sim/environment.ts';
import { seaState } from '../sim/seaway.ts';
import { R, along, tangentAt } from '../sim/sphere.ts';
import { activeOf } from '../sim/perks.ts';
import { INK, isWeapon } from '../sim/tables.ts';
import { PHASE, PLAYER, TICK, WEATHER_NAMES, canCall, isNight, newSky, skyAt } from '../sim/match.ts';
import { REGIONS } from '../sim/world/index.ts';
import { v3 } from '../sim/math.ts';
// straight from the icons, not the parts kit's index, so the tips load without its stylesheet (and under node)
import { ABILITY_ICON, ICON, WEATHER_ICON } from '../ui/parts/icons.ts';
import type { TipView } from '../ui/parts/overlays.ts';
import { WEAPON_NAME, type WeaponId } from '../ui/model.ts';
import type { Moment } from './events.ts';
import type { Session } from './session.ts';
import { weaponOf } from './moments.ts';

export const TIPS_KEY = 'portolan.tips';

/** Every tip, by id: its glyph, title and line. The ability's, the weapon's and the landmark's are filled in. */
export const TIPS = {
  weapon: { icon: ICON.cannon, title: 'Your {weapon}', text: 'Drag on the right of the screen to aim, and hold Fire. Shots fly in an arc and take time to land.' },
  shot: { icon: ICON.target, title: 'Lead your shots', text: 'Aim where a ship will be, not where it is. Reload tops the magazine up early.' },
  gust: { icon: ICON.gust, title: 'Gust', text: 'Tap Gust for a burst of speed and a hop. Its charges fill again over time.' },
  ability: { icon: ICON.star, title: 'Your ability: {ability}', text: '{text} Tap Ability; it cools down after.' },
  shieldBreak: { icon: ICON.shield, title: 'Shield down', text: 'Hits go to your hull now. Use a shield, or get clear and mend in your own water.' },
  loot: { icon: ICON.hand, title: 'Loot taken', text: 'Tap a slot to hold it. Drag one slot onto another to swap them; Drop lets one go.' },
  consumable: { icon: ICON.hourglass, title: 'Hold steady', text: 'A hit, a swap or a dive breaks it off: use it when you are clear.' },
  gull: { icon: ICON.gull, title: 'Call a gull', text: 'You have the coins: tap the gull by your hotbar and pick a parcel. It flies out from the nearest landmark.' },
  mend: { icon: ABILITY_ICON.repair, title: 'Home water', text: 'Your own water mends your hull once nobody has hit you for a few seconds.' },
  landmark: { icon: ICON.flag, title: 'You hold {landmark}', text: '{perk} is yours while its water is: {perkText}' },
  storm: { icon: ICON.storm, title: 'The Storm closes in', text: 'Stay inside the white ring on the map. Outside it, the Storm wears your hull down.' },
  tide: { icon: ICON.anchor, title: 'The tide is falling', text: 'Shallows round you are closing. Keep to deep water, or you will run aground.' },
  night: { icon: ICON.moon, title: 'Night', text: 'Far ships show only as lanterns, with no name or health bar.' },
  mast: { icon: ICON.mast, title: 'Mainmast down', text: 'You sail on the fore and mizzen until the crew rigs a jury mast. A Full Repair rigs one at once.' },
  flood: { icon: ICON.leak, title: 'Taking water', text: 'Shot at the waterline lets the sea in: she slows and lists, and too much sinks her. Get clear so the crew can pump.' },
  rudder: { icon: ICON.rudder, title: 'Rudder hit', text: 'Shot into the stern has her slow to answer the helm. A repair, or quiet water, mends it.' },
  fire: { icon: ICON.fire, title: 'On fire', text: 'The flames eat your canvas and leap to ships close downwind. Rain puts them out.' },
  rake: { icon: ICON.target, title: 'Raking fire', text: 'A shot down a ship\'s length from bow or stern does more harm. Cross her bow, or her stern, to rake her.' },
  whale: { icon: ICON.whale, title: 'The whale', text: 'When it breaches it lifts the ships near it, flips any right over it, and scatters loot.' },
  seaway: { icon: ICON.cannon, title: 'Rough sea', text: 'Your deck rolls. Shots fly truest at the top of each roll, when the ring round Fire glows.' },
  windup: { icon: ICON.target, title: 'A heavy gun on you', text: 'Harpoon, mortar and broadside wind up before they fire. Turn your bow or stern to them, or sail out from where the shell is falling.' },
  irons: { icon: ICON.wind, title: 'In irons', text: 'Head to wind your canvas shakes and she stops. Turn off the wind, or Gust to break free.' },
  tack: { icon: ICON.sail, title: 'Going about', text: 'Turn your bow through the wind briskly and the canvas fills on the new side with a burst of speed.' },
  gybe: { icon: ICON.sail, title: 'Gybe', text: 'Swing your stern through a strong wind too fast and the yards slam across: you lose speed and aim. Ease the turn.' },
  'weather:fog': { icon: WEATHER_ICON.fog, title: 'Fog', text: 'You see less far, and ships deep in it drop off the map.' },
  'weather:rain': { icon: WEATHER_ICON.rain, title: 'Rain', text: 'The wind gusts and swirls, and the sea runs rough.' },
  'weather:thunder': { icon: WEATHER_ICON.thunder, title: 'Thunder', text: 'Lightning strikes ships in open water. Keep close to land.' },
  'weather:calm': { icon: WEATHER_ICON.calm, title: 'Calm', text: 'The wind dies away. Gust to get out of it.' },
  'weather:snow': { icon: WEATHER_ICON.snow, title: 'Snow', text: 'Ice builds in your rigging and slows your turns. It melts once you are out.' },
  'weather:ash': { icon: WEATHER_ICON.ash, title: 'Ash', text: 'Embers burn ships that stay in it. Sail out.' },
} as const satisfies Record<string, { icon: string; title: string; text: string }>;

/** What the chart teaches by drawing it the first time: the Gale's hand, pointing where a press marks the dive. */
const DRAWN = ['gale'] as const;

export type TipId = keyof typeof TIPS | (typeof DRAWN)[number];

/** Seconds a tip stays, the pause before the next, and how long after landing the first ones wait. */
const SHOW = 7, GAP = 1.2, SETTLE = 3;
/** Seconds between the slower looks round: the weather and the tide. */
const LOOK = 0.5;
/** Metres round the ship searched for a passage the tide is about to shut, and seconds ahead it looks. */
const PASSAGE = [14, 26, 40], AHEAD = 20;
/** Metres within which the whale coming up is worth a tip. */
const WHALE_NEAR = 260;

/** The ids read back from storage: anything that isn't a list of known ids is dropped. */
export function parseSeen(raw: string | null): Set<TipId> {
  const out = new Set<TipId>();
  try {
    const v: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(v)) for (const id of v) if (typeof id === 'string' && (id in TIPS || (DRAWN as readonly string[]).includes(id))) out.add(id as TipId);
  } catch {
    // a broken save shows the tips again
  }
  return out;
}

const fill = (s: string, args: Record<string, string>): string => s.replace(/\{(\w+)\}/g, (_, k: string) => args[k] ?? '');

/** A tip as the card shows it, with its blanks filled. */
export function tipView(id: keyof typeof TIPS, args: Record<string, string> = {}, icon?: string): TipView {
  const t = TIPS[id];
  return { id, icon: icon ?? t.icon, title: fill(t.title, args), text: fill(t.text, args) };
}

const SKY = newSky(), P = v3(), T = v3();

export class Tips {
  /** Whether tips are offered at all: off in capture mode until the hook turns them on. */
  on: boolean;
  private readonly seen: Set<TipId>;
  private readonly storage: Storage | null;
  private readonly queue: TipView[] = [];
  private showing: TipView | null = null;
  private left = 0;
  private gap = 0;
  private atSea = 0;
  private look = 0;

  constructor(capture: boolean) {
    let st: Storage | null = null;
    try {
      st = capture ? null : localStorage;
    } catch {
      // storage blocked: the tips seen are remembered for this visit
    }
    this.storage = st;
    let raw: string | null = null;
    try {
      raw = st?.getItem(TIPS_KEY) ?? null;
    } catch {
      raw = null;
    }
    this.seen = parseSeen(raw);
    this.on = !capture;
  }

  /** The tips shown so far, in no order. */
  get shown(): TipId[] {
    return [...this.seen];
  }

  /** A new match: nothing showing or waiting. */
  reset(): void {
    this.queue.length = 0;
    this.showing = null;
    this.left = this.gap = this.atSea = this.look = 0;
  }

  /** Whether the chart should draw its teaching for `id` now: true the first time it is asked (and from then on it
   *  counts as shown). */
  drawn(id: (typeof DRAWN)[number]): boolean {
    if (!this.on || this.seen.has(id)) return false;
    this.seen.add(id);
    this.save();
    return true;
  }

  /** Forgets every tip shown, so each shows again. */
  forget(): void {
    this.seen.clear();
    this.save();
  }

  /** A moment in the match: the ones that happen to the player offer their tips. */
  moment(m: Moment, s: Session): void {
    if (!this.on || s.watch !== PLAYER) return;
    const mine = 'ship' in m && m.ship === PLAYER;
    switch (m.k) {
      case 'fire': if (mine) this.offer('shot'); break;
      case 'shieldBreak': if (mine) this.offer('shieldBreak'); break;
      case 'pickup': if (mine) this.offer('loot'); break;
      case 'useStart': if (mine) this.offer('consumable'); break;
      case 'stormPhase': this.offer('storm'); break;
      case 'mastFall': if (mine) this.offer('mast'); break;
      case 'ablaze': if (mine) this.offer('fire'); break;
      case 'windup': if (m.at === PLAYER && m.seconds > 0) this.offer('windup'); break;
      case 'about': if (mine) this.offer(m.how === 'irons' ? 'irons' : m.how === 'slam' ? 'gybe' : m.how === 'tack' && m.surge > 1 ? 'tack' : 'gybe'); break;
      case 'hit': if (m.rake && m.by === PLAYER) this.offer('rake'); break;
      case 'perk': {
        const r = REGIONS.find((x) => x.perk === m.perk);
        if (mine && m.on && r) this.offer('landmark', { landmark: r.landmark, perk: r.perkName, perkText: r.perkText });
        break;
      }
      case 'whaleSurface':
      case 'whaleBreach': {
        // the moment's place is in metres, the ship's a unit vector
        const me = s.me.pos, l = Math.hypot(m.pos.x, m.pos.y, m.pos.z) || 1;
        const d = R * Math.acos(Math.max(-1, Math.min(1, (m.pos.x * me.x + m.pos.y * me.y + m.pos.z * me.z) / l)));
        if (s.me.phase === PHASE.sea && d < WHALE_NEAR) this.offer('whale');
        break;
      }
      default:
    }
  }

  /** Looks over the player's ship for what offers a tip, and moves the cards on by `dt` seconds. The tip to show now,
   *  or null. */
  update(s: Session, dt: number): TipView | null {
    if (this.on && s.watch === PLAYER) this.watch(s, dt);
    if (this.showing) {
      this.left -= dt;
      if (this.left > 0) return this.showing;
      this.showing = null;
      this.gap = GAP;
    }
    this.gap -= dt;
    if (this.gap > 0 || !this.queue.length) return null;
    const next = this.queue.shift()!;
    this.showing = next;
    this.left = SHOW;
    this.seen.add(next.id as TipId);
    this.save();
    return next;
  }

  private watch(s: Session, dt: number): void {
    const st = s.state, me = s.me;
    if (me.phase !== PHASE.sea) return;
    this.atSea += dt;
    if (this.atSea < SETTLE) return;
    const held = me.slots.find((x) => isWeapon(x.kind));
    if (held) {
      const w = weaponOf(held.kind) as WeaponId;
      this.offer('weapon', { weapon: WEAPON_NAME[w] }, ICON[w]);
    }
    this.offer('gust');
    const a = ability(activeOf(me));
    this.offer('ability', { ability: a.name, text: a.text }, ABILITY_ICON[a.id]);
    if (canCall(me, 0)) this.offer('gull');
    if (me.hull < 100 && st.tick - me.lastHit >= Math.round(INK.quiet / TICK) && atHome(st, PLAYER)) this.offer('mend');
    if (isNight(st, me.pos)) this.offer('night');
    if (me.flood > 0.15) this.offer('flood');
    if (me.rudder > 0.3) this.offer('rudder');
    this.look -= dt;
    if (this.look > 0) return;
    this.look = LOOK;
    skyAt(st, me.pos, SKY);
    for (const w of WEATHER_NAMES) if (SKY[w] > 0.4) this.offer(`weather:${w}` as keyof typeof TIPS);
    if (this.closing(st.tick * TICK, me.pos)) this.offer('tide');
    if (seaState(st, me.pos) > 0.3) this.offer('seaway');
  }

  /** Whether the tide is falling and water round p that is open now will be shut in a little while. */
  private closing(t: number, p: { x: number; y: number; z: number }): boolean {
    const now = seaLevelAt(t), soon = seaLevelAt(t + AHEAD);
    if (soon >= now) return false;
    for (const d of PASSAGE) {
      for (let k = 0; k < 8; k++) {
        along(p, tangentAt(p, (k * Math.PI) / 4, T), d, P);
        if (openAt(P, now) && !openAt(P, soon)) return true;
      }
    }
    return false;
  }

  /** Queues a tip that has never shown and isn't already waiting. */
  private offer(id: keyof typeof TIPS, args: Record<string, string> = {}, icon?: string): void {
    if (this.seen.has(id) || this.showing?.id === id || this.queue.some((q) => q.id === id)) return;
    this.queue.push(tipView(id, args, icon));
  }

  private save(): void {
    try {
      this.storage?.setItem(TIPS_KEY, JSON.stringify([...this.seen]));
    } catch {
      // storage full or blocked: the tips seen hold for this visit
    }
  }
}
