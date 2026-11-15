// Chart disc: a planet as the chartmaker draws it on a paper disc: the hemisphere round its islands' midst seen
// square on, its coasts inked over a sea wash, ruled with a graticule and the rhumbs. A planet's coasts are traced
// once per seed and kept (a planet is the same every time it is drawn).

import { traceCoasts, type Coast } from '../coasts';
import { INK, WASH, paperDisc, roughCircle } from '../ink';
import { createPlanet } from '../../world/planet';
import { dot, frameAt, normalize, type Vec3 } from '../../world/sphere';
import { make, type Part } from './part';

/** Coasts by planet seed, the few drawn lately. */
const kept = new Map<number, { coasts: Coast[]; at: Vec3 }>();
function coastsOf(seed: number) {
  let k = kept.get(seed);
  if (!k) {
    const coasts = traceCoasts(createPlanet(seed).islands, 36);
    const sum = coasts.reduce<[number, number, number]>((s, c) => [s[0] + c.centre[0], s[1] + c.centre[1], s[2] + c.centre[2]], [0, 0, 1e-6]);
    k = { coasts, at: normalize(sum) };
    kept.set(seed, k);
    if (kept.size > 8) kept.delete(kept.keys().next().value as number);
  }
  return k;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** A chart disc `size` across. */
export function chartDisc(size: number): Part<number> {
  const el = make('div', 'k-disc');
  let last = -1;
  return {
    el,
    set(seed) {
      if (seed === last) return;
      last = seed;
      const { coasts, at } = coastsOf(seed), f = frameAt(at), c = size / 2, r = c - 6;
      const xy = (p: Vec3): [number, number] => [c + dot(p, f.east) * r, c - dot(p, f.north) * r];
      let land = '';
      for (const coast of coasts) {
        if (dot(coast.centre, f.up) < 0.05) continue;
        land += `M${coast.ring.map((p) => xy(p).map(r1).join(' ')).join('L')}Z`;
      }
      let grid = '';
      for (const k of [0.34, 0.64, 0.87]) grid += `<circle cx="${c}" cy="${c}" r="${r1(r * k)}" fill="none" stroke="${INK.iron}" stroke-width=".4" opacity=".45"/>`;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        grid += `<path d="M${c} ${c}L${r1(c + Math.cos(a) * r)} ${r1(c + Math.sin(a) * r)}" stroke="${INK.iron}" stroke-width="${i % 4 ? 0.3 : 0.6}" opacity=".5"/>`;
      }
      el.innerHTML = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${paperDisc(c, c, c - 1)}`
        + `<path d="${roughCircle(c, c, r, seed % 97, 0.6)}" fill="${WASH.sea}"/>${grid}`
        + `<path d="${land}" fill="${WASH.sand}" stroke="${INK.iron}" stroke-width="1.1" stroke-linejoin="round"/></svg>`;
    },
  };
}
