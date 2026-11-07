// Marks that stay: where shot has struck the land and the rock, and where fire has fallen on it, the ground keeps a
// scorch for the rest of the match, the permanence of "Juice It or Lose It" (Jonasson and Purho, 2012) and of Nijman's
// "Art of Screenshake". A cannonball leaves a ragged black bite with a pale gouge of broken stone at its heart, a
// heated ball a wider burn, a lava bomb a broad crater ringed with soot. Each is fresh for a few seconds, its heart
// glowing like coals and smoking hot, then cools to char that the rain only darkens.
//
// They are decals of the simplest kind that holds on a sphere of generated land: a ring of points in the world that
// the land's and the rock's own materials read, each fragment asking how far it is from each mark. Nothing is
// projected, so a mark wraps over a cliff edge, into a crack and across a boulder as one piece, and costs nothing
// where there are none (an empty slot has no radius and drops out at once).
import { Vector4 } from 'three/webgpu';
import { Fn, If, Loop, clamp, float, length, max, min, mix, pow, sin, smoothstep, uniform, uniformArray, vec3, vec4, renderGroup } from 'three/tsl';
import type { Node } from 'three/webgpu';
import { P } from './uniforms.ts';

type F = Node<'float'>;
type V3 = Node<'vec3'>;
type V4 = Node<'vec4'>;

/** How many marks the ground keeps at once; past that the oldest goes. */
export const MARKS = 32;

export const MARK_KIND = { shot: 0, heated: 1, lava: 2 } as const;
export type MarkKind = (typeof MARK_KIND)[keyof typeof MARK_KIND];

/** The radius each kind leaves, in metres, and how long it stays hot. */
const SIZE: Record<MarkKind, number> = { 0: 1.6, 1: 2.6, 2: 5.5 };
const HOT: Record<MarkKind, number> = { 0: 4, 1: 9, 2: 14 };

// xyz: where, in metres from the planet's centre; w: radius (0: an empty slot)
const SPOTS = Array.from({ length: MARKS }, () => new Vector4(0, 0, 0, 0));
// x: when it was made (P.time); y: how long it stays hot; z: its own seed; w: lava (1) or not
const LOOKS = Array.from({ length: MARKS }, () => new Vector4(-1e6, 1, 0, 0));
const spots = uniformArray(SPOTS, 'vec4').setGroup(renderGroup);
const looks = uniformArray(LOOKS, 'vec4').setGroup(renderGroup);
/** How many slots have held a mark since the last clear: the shaders look no further. */
const used = uniform(0, 'int').setGroup(renderGroup);
let next = 0, seed = 1;

/** Leaves a mark at `at` (metres, world). `size` scales the kind's own radius. */
export function addMark(at: { x: number; y: number; z: number }, kind: MarkKind, size = 1): void {
  // a second hit on the same spot deepens the mark that is there rather than stacking another on it
  for (let i = 0; i < MARKS; i++) {
    const s = SPOTS[i];
    if (s.w > 0 && Math.hypot(s.x - at.x, s.y - at.y, s.z - at.z) < s.w * 0.45) {
      s.w = Math.min(s.w * 1.15, SIZE[kind] * size * 1.8);
      LOOKS[i].x = P.time.value as number;
      LOOKS[i].y = Math.max(LOOKS[i].y, HOT[kind]);
      return;
    }
  }
  const i = next;
  next = (next + 1) % MARKS;
  SPOTS[i].set(at.x, at.y, at.z, SIZE[kind] * size);
  seed = (seed * 16807) % 2147483647;
  LOOKS[i].set(P.time.value as number, HOT[kind], (seed % 1000) / 1000, kind === MARK_KIND.lava ? 1 : 0);
  used.value = Math.max(used.value as number, i + 1);
}

/** Clears every mark, for a new match. */
export function clearMarks(): void {
  for (const s of SPOTS) s.set(0, 0, 0, 0);
  for (const l of LOOKS) l.set(-1e6, 1, 0, 0);
  next = 0;
  used.value = 0;
}

/** How many slots hold a mark now. */
export const markCount = (): number => SPOTS.filter((s) => s.w > 0).length;

/**
 * The marks at a point of ground: x how charred (0–1), y how much of it is the pale gouge at a shot's heart, z how
 * hot (the coals' glow, 0–1), w soot beyond the char. `p` is the world position, `n` a noise value 0–1 for the edges.
 */
export const marksAt = Fn(([p, n]: [V3, F]) => {
  const out = vec4(0).toVar('marks');
  // only the slots that have ever held a mark are looked at, and of those only the near ones do the work
  Loop(used, ({ i }: { i: Node<'int'> }) => {
    const s = spots.element(i) as unknown as V4, r = s.w;
    const off = p.sub(s.xyz).toVar(), d = length(off);
    If(d.lessThan(r.mul(2)), () => {
      const l = looks.element(i) as unknown as V4;
      // ragged all round, differently for each mark and the same from any side: a few products of sines in the mark's
      // own space, so the edge is torn alike on a beach and up a cliff (a noise projected on a plane would smear)
      const u = off.div(max(r, 1e-3)), k = l.z.mul(40);
      const torn = sin(u.x.mul(4.1).add(k)).mul(sin(u.y.mul(3.7).add(k.mul(0.7)))).mul(sin(u.z.mul(4.3).add(k.mul(1.3)))).mul(0.42)
        .add(sin(u.x.mul(9.3).add(u.y.mul(7.1)).add(k.mul(0.3))).mul(sin(u.z.mul(8.7).sub(u.y.mul(6.1)).add(k.mul(1.9)))).mul(0.16));
      const reach = d.div(max(r, 1e-3)).sub(torn).sub(n.sub(0.5).mul(0.12));
      const char = smoothstep(1, 0.55, reach);
      // the bite of a shot: pale broken stone; a lava bomb's crater stays black
      const gouge = smoothstep(0.3, 0.12, reach).mul(float(1).sub(l.w));
      const soot = smoothstep(1.9, 0.9, reach).mul(0.6);
      const hot = clamp(float(1).sub(P.time.sub(l.x).div(l.y)), 0, 1);
      const coals = pow(smoothstep(0.85, 0.2, reach), float(1.5)).mul(hot).mul(hot);
      out.assign(max(out, vec4(char, gouge, coals, soot)));
    });
  });
  return out;
});

/**
 * Lays the marks onto a ground's albedo and roughness: char blackens and roughens it, the gouge shows pale broken
 * stone, soot greys what is round it, and fresh coals glow (returned, at the lamps' scale, for the emissive).
 */
export function scorch(albedo: V3, rough: F, m: V4, n: F): { albedo: V3; rough: F; glow: V3 } {
  const ash = vec3(0.035, 0.032, 0.03), stone = vec3(0.2, 0.19, 0.17);
  let a: V3 = mix(albedo, albedo.mul(0.55), m.w);
  a = mix(a, ash.mul(n.mul(0.6).add(0.7)), m.x.mul(0.92));
  a = mix(a, stone.mul(n.mul(0.5).add(0.75)), m.y.mul(0.7));
  const rg = mix(rough, float(0.95), max(m.x, m.y));
  const flicker = sin(P.time.mul(7).add(n.mul(23))).mul(0.25).add(0.75);
  const glow = vec3(1, 0.3, 0.05).mul(m.z.mul(flicker).mul(min(float(1), n.mul(1.4).add(0.3))));
  return { albedo: a, rough: rg, glow };
}
