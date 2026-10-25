// WP25: the match HUD's model and layout (the drawing is icons.ts). HudState.update reads the match for one ship
// into a HudModel each frame: hull, ward and fire, sails, purse and bank, share of the claimed sea, ships afloat and
// standing, the storm's next move, heading and wind, each battery's reload, consumables, the gull and its call
// price, the aimed fitting, the six fittings, and the rivals in sight as bearings (PROMPT.md, The match screen).
// hudLayout places every scrap and control inside the safe area, out of the frame's centre: top-left hull rope (stern
// glass below), top-centre afloat · storm dial · standing, top-right the compact chart's slot (WP24 part D), lower-left
// compass and sail setting under the floating stick's half, lower-right the right thumb's fan (aimed fitting nearest
// the corner, the gull and head home a step out, the three consumables on the outer arc, the purse beside the gull), the six
// fittings along the bottom. Sizes are in thumbs, not screens: u scales gently with the safe height and every hit
// area is at least 44 pt across, nearest-wins (controls.ts).
import { windAt, type Sea, type Wind } from '../sim/environment.ts';
import { dot, v3 } from '../sim/math.ts';
import { bearingOf, cellOf, R, TERRITORY } from '../sim/sphere.ts';
import { afloat, FLIGHT, SHIPS, type MatchState } from '../sim/state.ts';
import { newCalm, stormView, type StormView } from '../sim/storm.ts';
import { BATTERIES, BATTERY, FITTING, FORMS, GULL, SLOT } from '../sim/tables.ts';
import { gullPrice } from '../sim/territory.ts';
import { safeRect, type Rect, type View } from './safeArea.ts';

export interface Threat { readonly ship: number; readonly bearing: number; readonly near: number }

export interface HudModel {
  hull: number; // 0–1 of the form's hull
  ward: boolean;
  fire: boolean;
  sail: number; // SAIL
  torn: boolean;
  purse: number;
  bank: number;
  share: number; // 0–1 of the sea held by every ship afloat
  afloat: number;
  rank: number; // 1 = holds the most sea
  leader: boolean; // flies the gold-leaf pennant
  storm: { phase: number; announced: boolean; toMove: number; frac: number; inside: boolean; edge: boolean };
  heading: number; // compass bearing of the bow, rad
  wind: number; // bearing the wind blows toward, relative to the bow, rad
  windStrength: number;
  batteries: { battery: number; reload: number }[]; // 0 ready … 1 just fired
  consumables: { kind: number; count: number }[];
  gull: { flight: number; price: number; ready: boolean; tier: number };
  aimed: { kind: number; tier: number; ready: boolean } | null;
  fittings: { kind: number; tier: number }[];
  threats: Threat[]; // nearest first, at most 6
  inHome: boolean;
  lookout: boolean;
  sternGlass: boolean;
}

const SV = { phase: 0, calm: newCalm(), next: newCalm(), announced: false, toMove: 0, toHold: 0 } as unknown as StormView;
const WIND = { v: v3(0, 0, 0), strength: 0, steady: 0, gust: 0 } as unknown as Wind;
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
/** u of sight the threat marks fade over, and of the storm wall that counts as its edge. */
export const NEAR = { sight: 120, edge: 30 } as const;

/** The HUD's reading of the match, with what it remembers between frames (reload peaks, the storm's countdown). */
export class HudState {
  private readonly peak = new Float64Array(BATTERIES).fill(1);
  private readonly was = new Float64Array(BATTERIES);
  private stormPhase = -1;
  private stormFrom = 1;

  update(sea: Sea, state: MatchState, me = 0): HudModel {
    const ship = state.ships[me], form = FORMS[ship.form];
    let ships = 0, held = 0, rank = 1;
    for (let j = 0; j < SHIPS; j++) {
      const o = state.ships[j];
      if (!afloat(o)) continue;
      ships++;
      held += o.held;
      if (j !== me && o.held > ship.held) rank++;
    }
    const p = ship.pos, plen = Math.sqrt(dot(p, p)) || 1;
    const sv = stormView(state, SV);
    if (sv.announced && sv.phase !== this.stormPhase) { this.stormPhase = sv.phase; this.stormFrom = Math.max(1, sv.toMove); }
    const c = dot(p, sv.calm.at) / plen, inside = c >= sv.calm.cos;
    const toWall = sv.calm.r - Math.acos(Math.min(1, Math.max(-1, c)));
    const heading = bearingOf(p, ship.head);
    windAt(sea, state, p, WIND);
    const threats: Threat[] = [];
    for (let j = 0; j < SHIPS; j++) {
      const o = state.ships[j];
      if (j === me || !afloat(o) || ((ship.gull.spied >> j) & 1) === 0) continue;
      const d = R * Math.acos(Math.min(1, Math.max(-1, dot(p, o.pos) / (plen * (Math.sqrt(dot(o.pos, o.pos)) || 1)))));
      threats.push({ ship: j, bearing: wrap(bearingOf(p, o.pos) - heading), near: clamp01(1 - d / NEAR.sight) });
    }
    threats.sort((a, b) => b.near - a.near);
    const batteries: HudModel['batteries'] = [];
    for (let b = 0; b < BATTERIES; b++) {
      const r = ship.reload[b];
      if (r > this.was[b] + 0.05) this.peak[b] = Math.max(0.5, r);
      this.was[b] = r;
      const has = b === BATTERY.port || b === BATTERY.starboard || (b === BATTERY.castle && form.castle)
        || (b === BATTERY.stern && ship.fittings[SLOT.stern].kind === FITTING.sternChasers);
      if (has) batteries.push({ battery: b, reload: r > 0 ? clamp01(r / this.peak[b]) : 0 });
    }
    const price = gullPrice(sea, state, me, GULL.price), flight = ship.gull.flight;
    const stern = ship.fittings[SLOT.stern], look = ship.fittings[SLOT.lookout].kind;
    const glass = (FITTING as Record<string, number>).sternGlass;
    return {
      hull: clamp01(ship.hull / form.hull),
      ward: ship.ward > 0,
      fire: ship.fire > 0,
      sail: ship.sail,
      torn: ship.torn > 0,
      purse: ship.purse,
      bank: ship.bank,
      share: held > 0 ? ship.held / held : 0,
      afloat: ships,
      rank,
      leader: state.leader === me,
      storm: { phase: sv.phase, announced: sv.announced, toMove: sv.toMove, frac: sv.announced ? clamp01(sv.toMove / this.stormFrom) : 0, inside, edge: !inside || toWall * R < NEAR.edge },
      heading,
      wind: wrap(bearingOf(p, WIND.v) - heading),
      windStrength: WIND.strength,
      batteries,
      consumables: ship.consumables.map((s) => ({ kind: s.kind, count: s.count })),
      gull: { flight, price, ready: (flight === FLIGHT.mast || flight === FLIGHT.wheel) && ship.purse + ship.bank >= price, tier: ship.gull.tier },
      aimed: stern.kind === FITTING.mortar ? { kind: stern.kind, tier: stern.tier, ready: ship.reload[BATTERY.stern] <= 0 } : null,
      fittings: ship.fittings.map((f) => ({ kind: f.kind, tier: f.tier })),
      threats: threats.slice(0, 6),
      inHome: state.owner[cellOf(TERRITORY, p)] === me + 1,
      lookout: look !== FITTING.none,
      sternGlass: glass !== undefined && look === glass,
    };
  }
}

export type ButtonKind = 'aimed' | 'gull' | 'home' | 'c0' | 'c1' | 'c2' | 'chart';
/** A control: a disc (x, y its centre, r drawn, hit the touch radius) or, with w and h, a box centred on x, y. */
export interface HudButton { readonly kind: ButtonKind; readonly x: number; readonly y: number; readonly r: number; readonly hit: number; readonly w?: number; readonly h?: number }
export interface Disc { readonly x: number; readonly y: number; readonly r: number }

export interface HudLayout {
  readonly view: View;
  readonly safe: Rect;
  /** CSS px per thumb unit. */
  readonly u: number;
  readonly buttons: readonly HudButton[];
  /** Where the floating stick may land: the left half. */
  readonly stick: Rect;
  readonly hull: Rect;
  readonly share: Rect;
  readonly sternGlass: Disc;
  readonly top: Rect;
  readonly chart: Rect;
  readonly compass: Disc;
  readonly sail: Rect;
  readonly purse: Rect;
  readonly fittings: readonly Disc[];
  /** The threat marks ride this rect's border. */
  readonly edge: Rect;
}

/** Half the 44 pt minimum touch target. */
export const MIN_HIT = 22;

/** The right thumb's fan about the safe area's lower-right corner: [kind, angle° (180 left, 90 up), distance u, radius u]. */
const FAN: readonly (readonly [ButtonKind, number, number, number])[] = [
  ['aimed', 135, 76, 30],
  ['gull', 172, 150, 25],
  ['home', 98, 150, 23],
  ['c0', 165, 232, 21],
  ['c1', 136, 232, 21],
  ['c2', 108, 232, 21],
];

export function hudLayout(view: View): HudLayout {
  const s = safeRect(view);
  const u = Math.min(1.3, Math.max(0.85, s.height / 420));
  const m = 10 * u, L = s.x, T = s.y, Rt = s.x + s.width, B = s.y + s.height;
  const ax = Rt - 18 * u, ay = B - 14 * u;
  const buttons: HudButton[] = FAN.map(([kind, deg, dist, r]) => {
    const a = (deg * Math.PI) / 180;
    return { kind, x: ax + Math.cos(a) * dist * u, y: ay - Math.sin(a) * dist * u, r: r * u, hit: Math.max(MIN_HIT, (r + 8) * u) };
  });
  const cw = 150 * u, ch = 104 * u;
  const chart: Rect = { x: Rt - m - cw, y: T + m, width: cw, height: ch };
  buttons.push({ kind: 'chart', x: chart.x + cw / 2, y: chart.y + ch / 2, r: 0, hit: Math.max(MIN_HIT, ch / 2), w: cw, h: ch });
  const hull: Rect = { x: L + m, y: T + m, width: 190 * u, height: 30 * u };
  const share: Rect = { x: L + m, y: hull.y + hull.height + 4 * u, width: 120 * u, height: 20 * u };
  const tw = 210 * u;
  const fit = 28 * u, fx = s.x + s.width * 0.42 - 2.5 * fit; // left of centre, clear of the purse
  return {
    view,
    safe: s,
    u,
    buttons,
    stick: { x: L, y: T, width: s.width / 2, height: s.height },
    hull,
    share,
    sternGlass: { x: L + m + 28 * u, y: share.y + share.height + 34 * u, r: 26 * u },
    top: { x: s.x + s.width / 2 - tw / 2, y: T + m * 0.6, width: tw, height: 50 * u },
    chart,
    compass: { x: L + m + 34 * u, y: B - m - 34 * u, r: 34 * u },
    sail: { x: L + m + 78 * u, y: B - m - 34 * u, width: 66 * u, height: 32 * u },
    purse: { x: Rt - 375 * u, y: B - 64 * u, width: 100 * u, height: 60 * u },
    fittings: Array.from({ length: 6 }, (_, i) => ({ x: fx + i * fit, y: B - 15 * u, r: 11 * u })),
    edge: { x: L + 14 * u, y: T + 14 * u, width: s.width - 28 * u, height: s.height - 28 * u },
  };
}

/** The point on `r`'s border at compass bearing `b` from its centre (0 ahead = up, π/2 starboard = right). */
export function edgePoint(r: Rect, b: number): [number, number] {
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2, dx = Math.sin(b), dy = -Math.cos(b);
  const k = Math.min(Math.abs(dx) > 1e-6 ? r.width / 2 / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? r.height / 2 / Math.abs(dy) : Infinity);
  return [cx + dx * k, cy + dy * k];
}
