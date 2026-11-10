// Where things go on the two devices, designed for each and not scaled from one to the other. An iPad is held by its
// sides with the thumbs resting a hand's width in from its lower corners; a phone is held by its ends with the thumbs
// low on either side, a finger's breadth from its rounded corners and clear of the camera's notch. The match HUD is laid
// out as the genre lays it (issue #54): the vitals' bars top left, the Storm's clock and the ships afloat top centre,
// the minimap disc top right, out from under both thumbs; the controls sit under the thumbs, every one at least the
// touch target, the right thumb's cluster laid round it in an arc it can sweep without moving the hand; the hotbar's
// five slots run along the bottom between the thumbs, where a thumb moves to them between fights.
import { TARGET } from './press.ts';
import type { Widths } from './pen.ts';

export type DeviceClass = 'ipad' | 'iphone';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ChartLayout {
  cls: DeviceClass;
  w: number;
  h: number;
  safe: Insets;
  /** The three line widths, CSS pixels. */
  widths: Widths;
  /** The touch target, points. */
  target: number;
  /** Where the thumbs rest, and how much of the screen each covers there. */
  thumbs: { left: Circle; right: Circle };
  /** The minimap disc, top right. */
  hud: Circle;
  /** The hail's seal, at the disc's lower left, and the coins' tally beside it. */
  hail: Circle;
  tally: Box;
  /** The shield's bar over the hull's, top left: each box is the ruled strip and the numeral at its right end. */
  bars: { shield: Box; hull: Box };
  /** The Storm's clock (its spiral and the countdown) and the ships afloat beside it, top centre. */
  clock: Box;
  afloat: Box;
  /** The match's controls: the stick under the left thumb, the fire button under the right, the rest round it. */
  controls: { stick: Circle; fire: Circle; gust: Circle; ability: Circle; reload: Circle; sails: Circle };
  /** The hotbar's five slots, left to right along the bottom. */
  slots: Box[];
  /** The reticle at the screen's centre; drawn, never pressed. */
  reticle: Circle;
  /** Where a teaching scrap pins (src/screens/scraps.ts): against the left edge, under the vitals and the row of hurts
   *  below them, over every control that side can hold whichever hand has the stick. Drawn, never pressed. */
  scrap: Box;
  /** Body heights of the numeral hand: a hit-mark, the Storm's clock, a result's large figure. */
  figure: { hit: number; clock: number; large: number };
  /** A sheet's margin from the screen's edge. */
  margin: number;
  /** The galleon mark's hull length on the HUD and on the full map. */
  mark: { hud: number; chart: number };
  /** The small rose the title's rose becomes as it lands on the lobby's ring: only its radius is read. */
  rose: Circle;
  /** The lobby (issue #54): the career plate top left (the level's ring, the rank's seal badge beside it), the
   *  settings' wheel top right, the four folio tabs along the bottom left and PLAY's banner under the right thumb. The
   *  title's rose flies to the ring. The folios' sheet lies on the right under the wheel, clear of the plate and tabs
   *  and over PLAY, which it hides while it is down. */
  lobby: { plate: Box; ring: Circle; badge: Circle; wheel: Circle; tabs: Circle[]; play: Box; sheet: Box };
}

/** The lobby's places on each device, from its margins. */
function lobbyLayout(w: number, h: number, safe: Insets, phone: boolean): ChartLayout['lobby'] {
  const m = phone ? 12 : 22;
  const ring = phone ? 25 : 34, badge = phone ? 13 : 18, pad = phone ? 12 : 18, gap = phone ? 10 : 16;
  const pw = pad + ring * 2 + gap + badge * 2 + pad, ph = ring * 2 + pad * 2 * 0.75;
  const plate = { x: safe.left + m + pw / 2, y: safe.top + m + ph / 2, w: pw, h: ph };
  const wheel = phone ? 24 : 30, tab = phone ? 23 : 30, step = phone ? 58 : 72;
  const bw = phone ? 228 : 330, bh = phone ? 74 : 104;
  const sw = Math.round(w * 0.56), top = safe.top + m + wheel * 2 + 12, foot = h - safe.bottom - m;
  return {
    plate,
    ring: { x: plate.x - pw / 2 + pad + ring, y: plate.y, r: ring },
    badge: { x: plate.x + pw / 2 - pad - badge, y: plate.y, r: badge },
    wheel: { x: w - safe.right - m - wheel, y: safe.top + m + wheel, r: wheel },
    tabs: Array.from({ length: 4 }, (_, i) => ({ x: safe.left + m + tab + i * step, y: h - safe.bottom - m - tab, r: tab })),
    play: { x: w - safe.right - m - bw / 2, y: h - safe.bottom - (phone ? 102 : 210), w: bw, h: bh },
    sheet: { x: w - safe.right - m - sw / 2, y: (top + foot) / 2, w: sw, h: Math.round(foot - top) },
  };
}

/** The teaching scrap's place: `m` in from the left edge, starting under the vitals' slip and the row of hurts it can
 *  grow, as tall as there is room for over the highest control and at most its design height, half as wide again. */
function scrapPlace(safe: Insets, m: number, bars: ChartLayout['bars'], c: ChartLayout['controls']): Box {
  const top = Math.ceil(bars.hull.y + bars.hull.h / 2 + 30 + Math.round(bars.hull.h * 0.72) * 2);
  const under = Math.min(...Object.values(c).map((q) => q.y - q.r * 1.2)) - m / 2;
  const h = Math.floor(Math.min(132, under - top)), w = Math.round(h * 1.45);
  return { x: safe.left + m + Math.ceil(w / 2), y: top + Math.ceil(h / 2), w, h };
}

/** n boxes of `size` square in a row centred at (x, y), `gap` apart. */
const row = (x: number, y: number, size: number, gap: number, n = 5): Box[] =>
  Array.from({ length: n }, (_, i) => ({ x: x + (i - (n - 1) / 2) * (size + gap), y, w: size, h: size }));

/** The class of a landscape screen of this size: a phone is the one less than 500 points tall. */
export const deviceClass = (w: number, h: number): DeviceClass => (Math.min(w, h) < 500 ? 'iphone' : 'ipad');

export function chartLayout(w: number, h: number, safe: Insets = { top: 0, right: 0, bottom: 0, left: 0 }): ChartLayout {
  const cls = deviceClass(w, h);
  if (cls === 'ipad') {
    const L = { x: safe.left + 150, y: h - safe.bottom - 210, r: 78 };
    const R = { x: w - safe.right - 150, y: h - safe.bottom - 210, r: 78 };
    const disc = Math.round(Math.min(150, Math.max(124, Math.min(w, h) * 0.14)));
    const bars = {
      shield: { x: safe.left + 26 + 150, y: safe.top + 26 + 13, w: 300, h: 26 },
      hull: { x: safe.left + 26 + 150, y: safe.top + 26 + 13 + 32, w: 300, h: 26 },
    };
    const controls = {
      stick: { x: L.x, y: L.y, r: 72 },
      fire: { x: R.x, y: R.y, r: 54 },
      gust: { x: R.x - 128, y: R.y - 92, r: 34 },
      ability: { x: R.x - 14, y: R.y - 160, r: 40 },
      reload: { x: R.x - 150, y: R.y + 46, r: 34 },
      sails: { x: L.x + 18, y: L.y - 170, r: 36 },
    };
    return {
      cls, w, h, safe,
      widths: { hair: 0.6, fine: 1.05, bold: 1.9 },
      target: TARGET,
      thumbs: { left: L, right: R },
      hud: { x: w - safe.right - disc - 26, y: safe.top + disc + 26, r: disc },
      hail: { x: w - safe.right - disc * 2 - 26 - 32 - 6, y: safe.top + disc + 26 + disc * 0.62, r: 32 },
      tally: { x: w - safe.right - disc * 2 - 26 - 64 - 6 - 10 - 72, y: safe.top + disc + 26 + disc * 0.62, w: 144, h: 36 },
      bars,
      clock: { x: w / 2 - 66, y: safe.top + 26 + 22, w: 120, h: 44 },
      afloat: { x: w / 2 + 66, y: safe.top + 26 + 22, w: 120, h: 44 },
      controls,
      slots: row((L.x + R.x) / 2, h - safe.bottom - 46, 68, 12),
      reticle: { x: w / 2, y: h / 2, r: 14 },
      scrap: scrapPlace(safe, 16, bars, controls),
      figure: { hit: 26, clock: 22, large: 64 },
      margin: 22,
      mark: { hud: 34, chart: 64 },
      rose: { x: safe.left + 22 + 72, y: safe.top + 22 + 72, r: 72 },
      lobby: lobbyLayout(w, h, safe, false),
    };
  }
  const L = { x: safe.left + 92, y: h - safe.bottom - 102, r: 56 };
  const R = { x: w - safe.right - 92, y: h - safe.bottom - 102, r: 56 };
  const disc = Math.round(Math.min(92, Math.max(64, h * 0.17)));
  const bars = {
    shield: { x: safe.left + 12 + 95, y: safe.top + 12 + 10, w: 190, h: 20 },
    hull: { x: safe.left + 12 + 95, y: safe.top + 12 + 10 + 24, w: 190, h: 20 },
  };
  const controls = {
    stick: { x: L.x, y: L.y, r: 56 },
    fire: { x: R.x, y: R.y, r: 40 },
    gust: { x: R.x + 6, y: R.y - 86, r: 28 },
    ability: { x: R.x - 100, y: R.y - 58, r: 31 },
    reload: { x: R.x - 112, y: R.y + 30, r: 28 },
    sails: { x: L.x + 6, y: L.y - 110, r: 28 },
  };
  return {
    cls, w, h, safe,
    widths: { hair: 0.5, fine: 0.9, bold: 1.6 },
    target: TARGET,
    thumbs: { left: L, right: R },
    hud: { x: w - safe.right - disc - 10, y: safe.top + disc + 10, r: disc },
    hail: { x: w - safe.right - disc * 2 - 10 - 25 - 5, y: safe.top + disc + 10 + disc * 0.62, r: 25 },
    tally: { x: w - safe.right - disc * 2 - 10 - 50 - 5 - 7 - 52, y: safe.top + disc + 10 + disc * 0.62, w: 104, h: 28 },
    bars,
    clock: { x: w / 2 - 46, y: safe.top + 12 + 17, w: 84, h: 34 },
    afloat: { x: w / 2 + 46, y: safe.top + 12 + 17, w: 84, h: 34 },
    controls,
    // between the stick's reach and the reload's, centred on the gap
    slots: row((L.x + 56 + R.x - 112 - 28) / 2, h - safe.bottom - 31, 50, 6),
    reticle: { x: w / 2, y: h / 2, r: 10 },
    scrap: scrapPlace(safe, 12, bars, controls),
    figure: { hit: 18, clock: 16, large: 44 },
    margin: 12,
    mark: { hud: 26, chart: 48 },
    rose: { x: safe.left + 12 + 46, y: safe.top + 12 + 46, r: 46 },
    lobby: lobbyLayout(w, h, safe, true),
  };
}

type Shape = { kind: 'circle'; c: Circle } | { kind: 'box'; b: Box };

const overlap = (a: Shape, b: Shape): boolean => {
  const box = (s: Shape): Box => (s.kind === 'box' ? s.b : { x: s.c.x, y: s.c.y, w: s.c.r * 2, h: s.c.r * 2 });
  if (a.kind === 'circle' && b.kind === 'circle') return Math.hypot(a.c.x - b.c.x, a.c.y - b.c.y) < a.c.r + b.c.r;
  const A = box(a), B = box(b);
  return Math.abs(A.x - B.x) * 2 < A.w + B.w && Math.abs(A.y - B.y) * 2 < A.h + B.h;
};

/**
 * What breaks the layout's rules: a control smaller than the target, two controls' targets overlapping (the hotbar's
 * slots are controls too), the disc under a thumb or over a control, the readings (bars, clock, ships afloat) under
 * the disc or a control, anything outside the safe area. Empty when the layout holds.
 */
export function layoutProblems(l: ChartLayout): string[] {
  const out: string[] = [];
  const t = l.target / 2;
  const asShape = (v: Circle | Box, grow: boolean): Shape => ('r' in v
    ? { kind: 'circle', c: { ...v, r: grow ? Math.max(v.r, t) : v.r } }
    : { kind: 'box', b: { ...v, w: grow ? Math.max(v.w, l.target) : v.w, h: grow ? Math.max(v.h, l.target) : v.h } });
  const ctl: [string, Shape][] = [...Object.entries(l.controls), ['hail', l.hail] as const, ...l.slots.map((b, i) => [`slot ${i + 1}`, b] as const)]
    .map(([k, v]) => [k, asShape(v, true)]);
  for (let i = 0; i < ctl.length; i++) for (let j = i + 1; j < ctl.length; j++) {
    if (overlap(ctl[i][1], ctl[j][1])) out.push(`${ctl[i][0]} and ${ctl[j][0]} overlap`);
  }
  const disc: Shape = { kind: 'circle', c: l.hud };
  for (const [k, th] of Object.entries(l.thumbs)) if (overlap(disc, { kind: 'circle', c: th })) out.push(`the disc is under the ${k} thumb`);
  for (const [k, s] of ctl) if (overlap(disc, s)) out.push(`the disc covers ${k}`);
  const readings: [string, Shape][] = [['shield bar', asShape(l.bars.shield, false)], ['hull bar', asShape(l.bars.hull, false)],
    ['clock', asShape(l.clock, false)], ['ships afloat', asShape(l.afloat, false)], ['tally', asShape(l.tally, false)], ['scrap', asShape(l.scrap, false)]];
  for (const [k, s] of readings) {
    if (overlap(disc, s)) out.push(`the disc covers the ${k}`);
    for (const [c, cs] of ctl) if (overlap(s, cs)) out.push(`the ${k} is under ${c}`);
  }
  const inside = (s: Shape) => {
    const b = s.kind === 'box' ? s.b : { x: s.c.x, y: s.c.y, w: s.c.r * 2, h: s.c.r * 2 };
    return b.x - b.w / 2 >= l.safe.left && b.x + b.w / 2 <= l.w - l.safe.right && b.y - b.h / 2 >= l.safe.top && b.y + b.h / 2 <= l.h - l.safe.bottom;
  };
  for (const [k, s] of [...ctl, ...readings, ['disc', disc] as [string, Shape]]) if (!inside(s)) out.push(`${k} is outside the safe area`);
  // the lobby: its pressables apart from one another and inside the safe area
  const lb = l.lobby, lobby: [string, Shape][] = [['career plate', asShape(lb.plate, true)], ['wheel', asShape(lb.wheel, true)],
    ...lb.tabs.map((c, i) => [`tab ${i + 1}`, asShape(c, true)] as [string, Shape]), ['play', asShape(lb.play, true)]];
  for (let i = 0; i < lobby.length; i++) for (let j = i + 1; j < lobby.length; j++) {
    if (overlap(lobby[i][1], lobby[j][1])) out.push(`${lobby[i][0]} and ${lobby[j][0]} overlap`);
  }
  for (const [k, s] of lobby) if (!inside(s)) out.push(`${k} is outside the safe area`);
  const sheet = asShape(lb.sheet, false);
  if (!inside(sheet)) out.push('the folio sheet is outside the safe area');
  for (const [k, s] of lobby) if (k !== 'play' && overlap(sheet, s)) out.push(`the folio sheet covers ${k}`);
  return out;
}
