// Rank insignia, Iron to Legend. Each tier is a metal and a silhouette that grows in prestige: a plain iron shield,
// a rimmed bronze one, silver with gull wings, gold with a star, platinum with a crest, a winged diamond, the Admiral's
// crimson shield with an anchor and laurels, and the Legend's radiant wind rose. Steps show as one to three gems
// below the badge. Insignia are full colour; mono rendering knocks their emblems out of the ink instead.
import { circle, f, fill, line, path, poly, px, py, shield, sparkle, star, wave, wedge, type Grad, type Prim } from '../draw.ts';

export const RANK_TIERS = ['iron', 'bronze', 'silver', 'gold', 'platinum', 'diamond'] as const;
export type RankTier = (typeof RANK_TIERS)[number];
export type RankStep = 1 | 2 | 3;
export type RankId = `${RankTier}${RankStep}` | 'admiral' | 'legend';

/** Every rank, lowest first. */
export const RANK_ORDER: readonly RankId[] = [
  ...RANK_TIERS.flatMap((t) => ([1, 2, 3] as const).map((s): RankId => `${t}${s}`)),
  'admiral',
  'legend',
];

interface Metal { hi: string; mid: string; lo: string; rim: string; mark: string }

const METAL: Record<RankTier | 'crimson' | 'violet' | 'royal', Metal> = {
  iron: { hi: '#b9c0c6', mid: '#717a82', lo: '#3a4148', rim: '#16191c', mark: '#e8ecef' },
  bronze: { hi: '#f8c896', mid: '#c47c3e', lo: '#743a10', rim: '#2e1402', mark: '#ffe9cf' },
  silver: { hi: '#ffffff', mid: '#c9d3db', lo: '#7b8894', rim: '#26303a', mark: '#ffffff' },
  gold: { hi: '#fff6b8', mid: '#f4c24a', lo: '#a86a08', rim: '#3e2600', mark: '#fffae0' },
  platinum: { hi: '#f2fffd', mid: '#a6e6df', lo: '#3f8f8c', rim: '#0f3a39', mark: '#ffffff' },
  diamond: { hi: '#effaff', mid: '#7cc6ff', lo: '#2457d0', rim: '#0b2360', mark: '#ffffff' },
  crimson: { hi: '#ff8a7a', mid: '#d0303a', lo: '#6a0c16', rim: '#2a0306', mark: '#ffe08a' },
  violet: { hi: '#e6ccff', mid: '#8a4cf0', lo: '#34107a', rim: '#160430', mark: '#ffe9a0' },
  royal: { hi: '#fffbe0', mid: '#ffd35a', lo: '#c07a06', rim: '#3e2400', mark: '#ffffff' },
};

const grad = (m: Metal, y1: number, y2: number): Grad => ({ stops: [m.hi, m.mid, m.lo], y1, y2 });

/** A filled metal part with its dark rim. */
const metal = (d: string, m: Metal, y1: number, y2: number, rw = 0.8): Prim => fill(d, { col: grad(m, y1, y2), rim: m.rim, rw });

/** A line in the metal's mark colour, knocked out in mono. */
const mark = (d: string, m: Metal, w: number): Prim => line(d, w, { col: m.mark, knock: true });
const markFill = (d: string, m: Metal): Prim => fill(d, { col: m.mark, knock: true });

/** The gap between parts in mono: drawn as the rim in colour. */
const gap = (d: string, m: Metal, w = 1.2): Prim => line(d, w, { col: m.rim, knock: true });

/** A gull's wing reaching out from x,y: dir 1 to the right, -1 to the left; n feathers along its trailing edge. */
function wing(x: number, y: number, dir: 1 | -1, len: number, lift: number, n: number): string {
  const X = (v: number) => f(x + dir * v), Y = (v: number) => f(y + v);
  let d = `M${X(0)} ${Y(-1.6)}C${X(len * 0.3)} ${Y(-lift * 0.75)} ${X(len * 0.62)} ${Y(-lift)} ${X(len)} ${Y(-lift)}`;
  const tip = [len, -lift], base = [len * 0.18, 2.4];
  const vx = base[0] - tip[0], vy = base[1] - tip[1], vl = Math.sqrt(vx * vx + vy * vy), nx = vy / vl, ny = -vx / vl;
  let prev = tip;
  for (let i = 1; i <= n; i++) {
    const t = i / n, p = [tip[0] + vx * t, tip[1] + vy * t], b = (vl / n) * 0.42;
    const c = [(prev[0] + p[0]) / 2 + nx * b * -1, (prev[1] + p[1]) / 2 + ny * b * -1];
    d += `Q${X(c[0])} ${Y(c[1])} ${X(p[0])} ${Y(p[1])}`;
    prev = p;
  }
  return d + `L${X(0)} ${Y(2)}Z`;
}

const wings = (cy: number, len: number, lift: number, n: number, m: Metal, x0 = 4.6): Prim[] => [
  metal(wing(12 + x0, cy, 1, len, lift, n), m, cy - lift, cy + 3, 0.7),
  metal(wing(12 - x0, cy, -1, len, lift, n), m, cy - lift, cy + 3, 0.7),
  line(`M${f(12 + x0 + len * 0.3)} ${f(cy - lift * 0.42)}L${f(12 + x0 + len * 0.62)} ${f(cy - lift * 0.68)}M${f(12 - x0 - len * 0.3)} ${f(cy - lift * 0.42)}L${f(12 - x0 - len * 0.62)} ${f(cy - lift * 0.68)}`, 0.6, { col: m.rim, fine: true, op: 0.5 }),
];

/** One to three gems under the badge. */
const pips = (step: RankStep, m: Metal, y = 21.4): Prim[] => {
  const out: Prim[] = [];
  for (let i = 0; i < step; i++) {
    const x = 12 + (i - (step - 1) / 2) * 3.8;
    out.push(fill(poly(x, y - 2, x + 1.6, y, x, y + 2, x - 1.6, y), { col: grad(m, y - 2, y + 2), rim: m.rim, rw: 0.7 }));
  }
  return out;
};

/** A laurel branch curving up one side. */
function laurel(side: 1 | -1, m: Metal): Prim[] {
  const out: Prim[] = [], cx = 12, cy = 11, r = 10.2;
  out.push(line(path(...[100, 118, 136, 154, 172].flatMap((a) => [px(cx, r, side > 0 ? 180 - a : a), py(cy, r, side > 0 ? 180 - a : a)])), 0.9, { col: m.lo }));
  for (const a of [104, 122, 140, 158]) {
    const aa = side > 0 ? 180 - a : a, x = px(cx, r, aa), y = py(cy, r, aa);
    const t = aa + (side > 0 ? -60 : 60), tx = px(x, 3.2, t), ty = py(y, 3.2, t);
    const mx = (x + tx) / 2, my = (y + ty) / 2, k = 1.1;
    const c1x = px(mx, k, t + 90), c1y = py(my, k, t + 90), c2x = px(mx, k, t - 90), c2y = py(my, k, t - 90);
    out.push(fill(`M${f(x)} ${f(y)}Q${f(c1x)} ${f(c1y)} ${f(tx)} ${f(ty)}Q${f(c2x)} ${f(c2y)} ${f(x)} ${f(y)}Z`, { col: grad(m, y - 2, y + 2), rim: m.rim, rw: 0.45 }));
  }
  return out;
}

/** An anchor, the Admiral's mark. */
const anchor = (cx: number, cy: number, m: Metal): Prim[] => [
  mark(circle(cx, cy - 5.6, 1.3), m, 1.1),
  mark(`M${cx} ${cy - 4.2}V${cy + 5.2}`, m, 1.5),
  mark(`M${cx - 3} ${cy - 2.6}H${cx + 3}`, m, 1.3),
  mark(`M${cx - 4.6} ${cy + 1.4}C${cx - 4.2} ${cy + 4.6} ${cx - 2} ${cy + 5.6} ${cx} ${cy + 5.6}C${cx + 2} ${cy + 5.6} ${cx + 4.2} ${cy + 4.6} ${cx + 4.6} ${cy + 1.4}`, m, 1.4),
  markFill(poly(cx - 4.6, cy + 0.2, cx - 5.8, cy + 2.4, cx - 3.6, cy + 2), m),
  markFill(poly(cx + 4.6, cy + 0.2, cx + 5.8, cy + 2.4, cx + 3.6, cy + 2), m),
];

/** The wind rose: four long points split light and dark, four short ones. */
function rose(cx: number, cy: number, r: number, m: Metal, gold: Metal): Prim[] {
  const out: Prim[] = [];
  out.push(fill(star(cx, cy, 4, r * 0.62, r * 0.2, -45), { col: grad(gold, cy - r, cy + r), rim: gold.rim, rw: 0.5 }));
  for (const a of [-90, 0, 90, 180]) {
    const tx = px(cx, r, a), ty = py(cy, r, a);
    const lx = px(cx, r * 0.24, a - 45), ly = py(cy, r * 0.24, a - 45), rx = px(cx, r * 0.24, a + 45), ry = py(cy, r * 0.24, a + 45);
    out.push(fill(poly(cx, cy, lx, ly, tx, ty), { col: m.hi, rim: m.rim, rw: 0.5 }));
    out.push(fill(poly(cx, cy, tx, ty, rx, ry), { col: m.lo, rim: m.rim, rw: 0.5 }));
  }
  out.push(fill(circle(cx, cy, r * 0.16), { col: gold.hi, rim: gold.rim, rw: 0.5, knock: true }));
  return out;
}

function tier(t: RankTier, step: RankStep): Prim[] {
  const m = METAL[t], P = pips(step, m);
  switch (t) {
    case 'iron': {
      const s = shield(12, 9.8, 12.4, 15);
      return [
        metal(s, m, 2.3, 17.3),
        mark(shield(12, 9.7, 9.4, 11.8), m, 0.6),
        mark(wave(8.4, 15.6, 9.6, 1.1, 1.5), m, 1.5),
        fill(circle(8.6, 5.4, 0.7), { col: m.mark, fine: true }),
        fill(circle(15.4, 5.4, 0.7), { col: m.mark, fine: true }),
        ...P,
      ];
    }
    case 'bronze': {
      const s = shield(12, 9.6, 14.4, 17);
      return [
        metal(s, m, 1.1, 18.1, 0.9),
        gap(shield(12, 9.5, 10.6, 13), m, 0.7),
        metal(shield(12, 9.5, 10, 12.4), m, 4, 16),
        mark(wave(8.4, 15.6, 7.8, 1, 1.5), m, 1.3),
        mark(wave(8.8, 15.2, 11.2, 1, 1.5), m, 1.3),
        ...P,
      ];
    }
    case 'silver': {
      return [
        ...wings(8.8, 7.8, 6.4, 3, m),
        gap(shield(12, 9.8, 13.8, 16.4), m, 1.4),
        metal(shield(12, 9.8, 12.4, 15), m, 2.3, 17.3),
        mark(shield(12, 9.7, 9.4, 11.8), m, 0.6),
        markFill(`M7.6 8.6C9 7.8 10.6 8 12 9.6C13.4 8 15 7.8 16.4 8.6C15 8.8 13.4 9.8 12 11.8C10.6 9.8 9 8.8 7.6 8.6Z`, m),
        ...P,
      ];
    }
    case 'gold': {
      return [
        ...wings(9.6, 8.8, 7.6, 4, m),
        gap(shield(12, 10.4, 13.8, 16.4), m, 1.4),
        metal(shield(12, 10.4, 12.4, 15), m, 2.9, 17.9),
        mark(shield(12, 10.3, 9.4, 11.8), m, 0.6),
        markFill(circle(12, 10, 2.2), m),
        ...[0, 45, 90, 135, 180, 225, 270, 315].map((a) => mark(path(px(12, 3.2, a), py(10, 3.2, a), px(12, 4.4, a), py(10, 4.4, a)), m, 0.9)),
        metal(star(12, 1.9, 5, 2.4, 1.05), m, -0.5, 4.3, 0.6),
        ...P,
      ];
    }
    case 'platinum': {
      const crest = 'M5.6 4.4L8.6 5.4L12 1.4L15.4 5.4L18.4 4.4L18.4 11C18.4 14.6 15.6 17 12 18.6C8.4 17 5.6 14.6 5.6 11Z';
      return [
        ...wings(10, 9.4, 8.8, 4, m, 5.2),
        gap(crest, m, 1.6),
        metal(crest, m, 1.4, 18.6),
        mark('M7.4 6.8L9 7.4L12 4L15 7.4L16.6 6.8V11C16.6 13.8 14.6 15.6 12 16.8C9.4 15.6 7.4 13.8 7.4 11Z', m, 0.6),
        markFill(star(12, 10.8, 5, 3.6, 1.5), m),
        metal(sparkle(4.2, 2.6, 2.2), m, 0.4, 4.8, 0.4),
        metal(sparkle(19.8, 2.6, 2.2), m, 0.4, 4.8, 0.4),
        ...P,
      ];
    }
    case 'diamond': {
      const gem = 'M8 4H16L19.6 8.4L12 18.8L4.4 8.4Z';
      return [
        ...wings(10, 9.8, 9.2, 4, METAL.silver, 5.6),
        gap(gem, m, 1.6),
        metal(gem, m, 4, 18.8, 0.9),
        fill('M8 4H16L19.6 8.4H4.4Z', { col: m.hi, op: 0.85 }),
        mark('M4.6 8.4H19.4M8 4L9.6 8.4L12 18.4L14.4 8.4L16 4M12 4.2L9.6 8.4M12 4.2L14.4 8.4', m, 0.55),
        fill(sparkle(16.6, 5.4, 1.6), { col: '#ffffff', fine: true }),
        ...P,
      ];
    }
  }
}

function admiral(): Prim[] {
  const m = METAL.crimson, g = METAL.royal;
  const s = shield(12, 11.2, 11.6, 14);
  return [
    ...laurel(-1, METAL.gold),
    ...laurel(1, METAL.gold),
    ...wings(9.6, 9.8, 7.4, 4, g, 4.6),
    gap(s, g, 2.2),
    fill(s, { col: grad(m, 4.2, 18.2), rim: g.mid, rw: 1.3 }),
    ...anchor(12, 11, g),
    metal(star(12, 2.4, 5, 2.8, 1.2), g, -0.4, 5.2, 0.6),
    metal(star(5.4, 4, 5, 1.4, 0.6), g, 2.6, 5.4, 0.4),
    metal(star(18.6, 4, 5, 1.4, 0.6), g, 2.6, 5.4, 0.4),
  ];
}

function legend(): Prim[] {
  const v = METAL.violet, g = METAL.royal;
  let rays = '';
  for (let i = 0; i < 16; i++) rays += wedge(12, 11.4, 11.6, i * 22.5 - 90 - 4, i * 22.5 - 90 + 4);
  return [
    fill(rays, { col: { stops: ['#fff3b0', '#ffb22e'], y1: 0, y2: 23 }, op: 0.75 }),
    ...laurel(-1, g),
    ...laurel(1, g),
    ...wings(11.4, 10.4, 7.8, 4, g, 5.6),
    gap(circle(12, 11.4, 7.6), g, 1.6),
    fill(circle(12, 11.4, 7.2), { col: grad(v, 4.2, 18.6), rim: g.mid, rw: 1.1 }),
    ...rose(12, 11.4, 6.6, { ...g, hi: '#fff6c8', lo: '#d08a10' }, g),
    metal(star(12, 1.8, 5, 2.3, 1), g, -0.5, 4.1, 0.5),
    metal(star(7.6, 3, 5, 1.5, 0.65), g, 1.5, 4.5, 0.4),
    metal(star(16.4, 3, 5, 1.5, 0.65), g, 1.5, 4.5, 0.4),
    fill(sparkle(20.6, 18.6, 1.6), { col: '#ffffff', fine: true }),
    fill(sparkle(3.6, 18.2, 1.2), { col: '#ffffff', fine: true }),
  ];
}

export const RANK_ICONS = Object.fromEntries(
  RANK_ORDER.map((id): [RankId, Prim[]] => {
    if (id === 'admiral') return [id, admiral()];
    if (id === 'legend') return [id, legend()];
    return [id, tier(id.slice(0, -1) as RankTier, Number(id.slice(-1)) as RankStep)];
  }),
) as Record<RankId, Prim[]>;
