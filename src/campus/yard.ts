// What stands round the buildings: each plot's plinth, the scaffolding round a building under way, and the crew's
// quay. In a plot's own metres (kit.ts), as the buildings are.

import { QUAY, type Site } from '../world/rookery';
import { TONE as T, boundsOf, createKit, type Form } from './kit';

/** A plot's plinth: a course of dressed stone over its levelled ground (world/rookery.ts terraced), as wide as the
 *  building grows, its face going down past the ground round it; a water plot's only on its land, to the waterline. */
export function plinthOf(site: Site): Form {
  const k = createKit(), front = site.water ? 0.5 : site.front + 0.6;
  k.box(-site.half - 0.6, Math.min(-2.5, site.low - site.top - 0.5), -site.back - 0.6, site.half + 0.6, 0, front, T.stone);
  // a darker course along its top edge, so its outline reads from afar
  k.box(-site.half - 0.75, -0.18, front - 0.15, site.half + 0.75, 0.02, front + 0.15, T.timber);
  return k.form;
}

/**
 * The scaffolding round a building's next form while it is under way: poles a few metres apart a little out from it all
 * round, as tall as the form, ledgers of planks every two metres up, ladders at the corners; on a water plot only round
 * what stands on its land.
 */
export function scaffoldOf(next: Form, water: boolean): Form {
  const k = createKit(), { min, max } = boundsOf(next);
  const x0 = min[0] - 0.9, x1 = max[0] + 0.9, z0 = min[2] - 0.9, z1 = (water ? Math.min(max[2], 1.5) : max[2]) + 0.9;
  const top = max[1] + 1, step = 3;
  const posts = (a: number, b: number): number[] => {
    const n = Math.max(1, Math.round((b - a) / step));
    return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
  };
  for (const x of posts(x0, x1)) for (const z of [z0, z1]) k.pole(x, z, 0, top, T.timber, 0.16);
  for (const z of posts(z0, z1).slice(1, -1)) for (const x of [x0, x1]) k.pole(x, z, 0, top, T.timber, 0.16);
  for (let y = 2; y < top; y += 2) {
    k.box(x0 - 0.1, y, z1 - 0.5, x1 + 0.1, y + 0.12, z1 + 0.1, T.deck);
    k.box(x0 - 0.1, y, z0 - 0.1, x1 + 0.1, y + 0.12, z0 + 0.5, T.deck);
    k.box(x0 - 0.1, y, z0, x0 + 0.5, y + 0.12, z1, T.deck);
    k.box(x1 - 0.5, y, z0, x1 + 0.1, y + 0.12, z1, T.deck);
    // a rail over each ledger, a metre up
    k.box(x0 - 0.05, y + 1, z1 - 0.05, x1 + 0.05, y + 1.08, z1 + 0.05, T.timber);
    k.box(x0 - 0.05, y + 1, z0 - 0.05, x1 + 0.05, y + 1.08, z0 + 0.05, T.timber);
  }
  // braces across the faces seen from the sea and the hill, one to each bay
  const brace = (xa: number, xb: number, z: number) => {
    const t = 0.1, h = top - 0.5;
    k.quad([xa, 0.2, z + t], [xa + t * 2, 0.2, z + t], [xb, h, z + t], [xb - t * 2, h, z + t], T.timber);
    k.quad([xa + t * 2, 0.2, z - t], [xa, 0.2, z - t], [xb - t * 2, h, z - t], [xb, h, z - t], T.timber);
  };
  const xs = posts(x0, x1);
  for (let i = 0; i + 1 < xs.length; i += 2) {
    brace(xs[i], xs[i + 1], z1 + 0.12);
    brace(xs[i + 1], xs[i], z0 - 0.12);
  }
  // a hoist's jib over the corner seen from the sea, its block in the crew's colour
  k.pole(x1, z1, top, top + 2, T.timber, 0.2);
  k.box(x1 - 3, top + 1.8, z1 - 0.1, x1 + 0.1, top + 2, z1 + 0.1, T.timber);
  k.box(x1 - 2.9, top - 0.4, z1 - 0.2, x1 - 2.5, top + 1.8, z1 + 0.2, T.first);
  return k.form;
}

/** The crew's quay: a plinth on the land, a timber jetty on piles out past the shallows, bollards along it and a
 *  lamp at its head, the crew's flag at its root. */
export function quayOf(site: Site): Form {
  const k = createKit(), w = QUAY.half, out = QUAY.front;
  k.box(-w - 2.5, -2.5, -site.back, w + 2.5, 0, 0.6, T.stone);
  k.box(-w, -0.35, -0.5, w, 0, out, T.deck, true);
  k.box(-w - 0.1, -0.5, -0.5, -w + 0.1, 0.05, out, T.timber);
  k.box(w - 0.1, -0.5, -0.5, w + 0.1, 0.05, out, T.timber);
  for (let z = 3; z <= out; z += 4) for (const s of [-1, 1]) k.pole(s * (w - 0.2), z, -8, -0.35, T.timber, 0.4);
  for (let z = 8; z <= out - 2; z += 6) for (const s of [-1, 1]) k.drum(s * (w - 0.4), z, 0.22, 0, 0.6, T.iron, 6);
  k.pole(0, out - 0.6, 0, 3.4, T.iron, 0.18);
  k.box(-0.3, 3.4, out - 0.9, 0.3, 4, out - 0.3, T.gilt);
  k.flag(-w - 1.8, -0.5, 0, 7);
  return k.form;
}
