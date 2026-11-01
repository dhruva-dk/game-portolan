// The Weeping Isle's plants: cloud forest (gnarled, moss-clad trees with beards of moss, epiphytes in the forks and
// water dripping from the crowns) and tree ferns, whose umbrellas of arching fronds stand above it.
import * as THREE from 'three';
import {
  Geo, V, arc, assemble, atlas, barkMaterial, beard, bendAt, clump, detail, drips, leafMaterial, many, range, rng, taper,
  twigs, wander, TAU, type Atlas, type Lod, type Paint, type Plant,
} from './kitD.ts';

// ---------------------------------------------------------------- the atlas

const C = { leaf: 0, leafFar: 1, pinna: 2, deadPinna: 3, frond: 4, deadFrond: 5, beard: 6, tuft: 7, strap: 8 } as const;

/** One pinna of a fern: a midrib up the cell with scanned leaflets on both sides, shorter toward the tip. */
function pinna(p: Paint, n: number, droop: number): void {
  const { g, s, r } = p;
  g.strokeStyle = '#3c4a22'; g.lineWidth = 2.2; g.lineCap = 'round';
  g.beginPath(); g.moveTo(s / 2, s); g.quadraticCurveTo(s / 2 + droop * s * 0.1, s * 0.5, s / 2 + droop * s * 0.18, s * 0.03); g.stroke();
  for (let i = 0; i < n; i++) {
    const t = i / n, y = s * (0.97 - t * 0.92), x = s / 2 + droop * s * 0.18 * t * t;
    const len = s * 0.3 * (1 - t * 0.75) + 4;
    for (const side of [-1, 1]) p.leaf('long', Math.floor(r() * 6), x, y, len, side * (1.05 - t * 0.35) + (r() - 0.5) * 0.12, 0.42);
  }
}

/** A whole frond seen from above, for far ferns: a rachis with pinnae on both sides, widest below the middle. */
function frond(p: Paint, rib: string): void {
  const { g, s, r } = p;
  const n = 26;
  for (let i = 0; i < n; i++) {
    const t = i / n, y = s * (0.98 - t * 0.95), x = s / 2;
    const reach = s * 0.48 * Math.pow(Math.sin(Math.PI * (0.12 + t * 0.88)), 0.8);
    for (const side of [-1, 1]) {
      const a = side * (1.25 - t * 0.4);
      g.strokeStyle = rib; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(a) * reach, y - Math.cos(a) * reach); g.stroke();
      for (let k = 0; k < 7; k++) {
        const u = (k + 0.5) / 7, px = x + Math.sin(a) * reach * u, py = y - Math.cos(a) * reach * u;
        for (const s2 of [-1, 1]) p.leaf('long', Math.floor(r() * 6), px, py, reach * 0.22 * (1 - u * 0.6) + 2, a + s2 * 0.9, 0.45);
      }
    }
  }
  g.strokeStyle = rib; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(s / 2, s); g.lineTo(s / 2, s * 0.03); g.stroke();
}

function leafSpray(p: Paint, dense: boolean): void {
  const { r, s } = p;
  if (dense) {
    for (let i = 0; i < 300; i++) {
      const a = r() * TAU, d = Math.sqrt(r());
      p.leaf(r() < 0.5 ? 'round' : 'long', Math.floor(r() * 9), s / 2 + Math.cos(a) * d * s * 0.42, s * 0.55 + Math.sin(a) * d * s * 0.38, 26 + r() * 16, r() * TAU);
    }
    return;
  }
  const pts = twigs(p, 3, '#3a3624', 2.6, 1.2, 0.85);
  for (const [x, y, a, tip] of pts) {
    const k = tip ? 4 : 2;
    for (let i = 0; i < k; i++) p.leaf(r() < 0.6 ? 'long' : 'round', Math.floor(r() * 9), x, y, 30 + r() * 14, a + (tip ? (i / 3 - 0.5) * 2.2 : (i ? 1 : -1) * (0.8 + r() * 0.4)));
  }
}

let weepAtlas: Atlas | null = null;
const WEEP = () => weepAtlas ??= atlas('weep', 4, 1024, [
  // cloud forest leaves: dark, wet emerald
  (p) => { leafSpray(p, false); p.tone({ sat: 0.95, mul: [0.5, 0.82, 0.58] }); },
  (p) => { leafSpray(p, true); p.tone({ sat: 0.95, mul: [0.48, 0.8, 0.56] }); },
  // a living fern pinna, and a dead one
  (p) => { pinna(p, 20, 0.4); p.tone({ sat: 1.1, mul: [0.72, 1.0, 0.55] }); },
  (p) => { pinna(p, 20, 0.9); p.tone({ sat: 0.45, mul: [1.0, 0.72, 0.48] }); },
  // whole fronds for the far tree ferns, living and dead
  (p) => { frond(p, '#46562a'); p.tone({ sat: 1.1, mul: [0.72, 1.0, 0.55] }); },
  (p) => { frond(p, '#5a4630'); p.tone({ sat: 0.4, mul: [0.95, 0.7, 0.48] }); },
  // beards of moss hanging from the limbs
  (p) => beard(p, 90, 78, 38, 42),
  // a cushion of moss: short strands bunched upward
  (p) => {
    const { g, s, r } = p;
    for (let i = 0; i < 900; i++) {
      const a = r() * TAU, d = Math.sqrt(r()), x = s / 2 + Math.cos(a) * d * s * 0.45, y = s * 0.7 + Math.sin(a) * d * s * 0.28;
      g.strokeStyle = `hsl(${78 + r() * 30},${45 + r() * 25}%,${22 + r() * 26 - d * 8}%)`;
      g.lineWidth = 1.2 + r() * 1.4;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 8, y - 6 - r() * 12 * (1 - d)); g.stroke();
    }
  },
  // a bromeliad's strap leaf, filling the cell top to bottom
  (p) => { p.leaf('long', 1, p.s / 2, p.s, p.s, 0, 0.9); p.tone({ sat: 1.0, mul: [0.95, 0.82, 0.5] }); },
]);

const bark = () => barkMaterial('weep-bark', {
  map: 'bark_mossy_d.jpg', normal: 'bark_mossy_n.jpg', tint: 0xb8bca8, roughness: 0.78, normalScale: 1.3,
  moss: { map: 'moss_d.jpg', tint: 0xb4d48a, amount: 1 },
});
const fernBark = () => barkMaterial('weep-fern', {
  map: 'bark_fern_d.jpg', normal: 'bark_fern_n.jpg', tint: 0xb39d88, roughness: 0.86, normalScale: 1.5,
  moss: { map: 'moss_d.jpg', tint: 0xa8cc80, amount: 0.35 },
});
const leaves = () => leafMaterial('weep-leaves', { atlas: WEEP(), roughness: 0.4, translucency: 0.5 });

// ---------------------------------------------------------------- cloud forest tree

function cloudTree(seed: number, lod: Lod): THREE.Object3D {
  const r = rng(seed), d = detail(lod), A = WEEP();
  const H = range(r, 8, 14), R = H * range(r, 0.38, 0.5);
  const wd = new Geo(), lv = new Geo();
  const bend = bendAt(0.05 * H, H);
  const mossy = (i: number, n: THREE.Vector3) => 0.35 + 0.5 * Math.max(0, n.y) + (i === 0 ? 0.3 : 0);
  const lean = V((r() - 0.5) * 0.5, 1, (r() - 0.5) * 0.5);
  const trunk = wander(r, V(0, 0, 0), lean, H * range(r, 0.28, 0.4), Math.max(3, Math.round(6 * d.seg)), 0.45);
  const r0 = 0.04 * H + 0.12;
  const radii = taper(trunk.length, r0, r0 * 0.7);
  radii[0] *= 1.5;
  wd.tube(trunk, radii, { sides: d.sides + 1, texM: 1.4, wind: (p) => [bend(p), 0, 0], moss: mossy, gnarl: d.fine ? 0.3 : 0.12 });
  const top = trunk[trunk.length - 1];
  const crown = V(top.x, H * 0.68, top.z);
  // buttress roots arch over the wet rock and into it
  if (d.mid) for (let k = 0; k < (d.fine ? 6 : 3); k++) {
    const a = (k / 6) * TAU + r() * 0.6;
    const out = V(Math.cos(a), 0, Math.sin(a));
    const reach = r0 * range(r, 3, 5.5);
    const path = arc(trunk[1].clone().multiplyScalar(0.6).addScaledVector(out, r0 * 0.6), out.clone().multiplyScalar(reach * 0.55).add(V(0, r0 * 1.4, 0)), out.clone().multiplyScalar(reach).add(V(0, -0.15, 0)), Math.max(3, Math.round(6 * d.seg)));
    wd.tube(path, taper(path.length, r0 * 0.4, r0 * 0.12), { sides: Math.max(3, d.sides - 2), texM: 1.4, wind: () => [0, 0, 0], moss: () => 0.7 });
  }
  // crooked limbs lean out from the top of the trunk, splitting toward the edge of the dome
  const ends: THREE.Vector3[] = [], forks: THREE.Vector3[] = [], hangs: THREE.Vector3[] = [];
  const limbs = lod === 2 ? 3 : 4 + Math.floor(r() * 3);
  for (let k = 0; k < limbs; k++) {
    const a = (k / limbs) * TAU + r() * 0.7;
    const from = trunk[Math.max(1, trunk.length - 1 - Math.floor(r() * 2))];
    const limb = wander(r, from, V(Math.cos(a), range(r, 0.55, 1.1), Math.sin(a)), H * range(r, 0.38, 0.52), Math.max(2, Math.round(6 * d.seg)), 0.6);
    wd.tube(limb, taper(limb.length, r0 * 0.6, r0 * 0.22), { sides: Math.max(3, d.sides - 1), texM: 1.4, wind: (p) => [bend(p), 0, 0], moss: mossy, gnarl: d.fine ? 0.25 : 0 });
    forks.push(limb[1]);
    hangs.push(limb[Math.floor(limb.length / 2)], limb[limb.length - 2]);
    const end = limb[limb.length - 1];
    ends.push(end);
    if (d.mid) for (let j = 0; j < (d.fine ? 3 : 2); j++) {
      const b = a + (r() - 0.5) * 2.2;
      const br = wander(r, limb[limb.length - 2 - (j % 2)], V(Math.cos(b), range(r, 0.3, 1), Math.sin(b)), H * range(r, 0.15, 0.25), 3, 0.7);
      wd.tube(br, taper(br.length, r0 * 0.22, r0 * 0.07), { sides: 3, texM: 1.4, wind: (p) => [bend(p), 0.15, 0], moss: mossy });
      ends.push(br[br.length - 1]);
      if (j === 0) hangs.push(br[1]);
    }
  }
  // the crown: a dense, lumpy dome of leaf clumps, dark underneath
  const size = 1.1 * d.cardSize;
  for (const e of ends) {
    const s = R * range(r, 0.38, 0.5);
    clump(lv, r, e.clone().add(V(0, s * 0.2, 0)), [s, s * 0.62, s], many(lod === 2 ? 4 : 16, d), size,
      () => A.uv(lod === 0 ? C.leaf : C.leafFar), { crown, bend, flutter: 0.4, tip: 0.04 });
  }
  if (lod > 0) clump(lv, r, crown.clone().add(V(0, R * 0.35, 0)), [R * 0.7, R * 0.35, R * 0.7], many(18, d, 3), size, () => A.uv(C.leafFar), { crown, bend, flutter: 0.3 });
  // moss beards hang from the limbs and sway long after a gust
  if (d.mid) for (const h of hangs) {
    if (r() < 0.35) continue;
    const len = range(r, 0.8, 2.4) * (lod ? 1.2 : 1);
    const a = r() * Math.PI;
    for (let k = 0; k < (d.fine ? 2 : 1); k++) {
      const right = V(Math.cos(a + k * 1.57), 0, Math.sin(a + k * 1.57));
      lv.card(h.clone().add(V(0, 0.05, 0)), right, V(0, 1, 0), len * 0.55, len, A.uv(C.beard), { anchor: 'top', wind: [bend(h), 0.5, r()], tip: 0.35, col: [0.95, 1, 0.9] });
    }
  }
  // epiphytes: bromeliad rosettes in the forks and cushions of moss along the limbs
  if (d.fine) {
    for (const f of forks) {
      if (r() < 0.4) continue;
      const n = 9 + Math.floor(r() * 5), red = r() < 0.4;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + r() * 0.3, len = range(r, 0.3, 0.55), out = V(Math.cos(a), 0, Math.sin(a));
        const path = arc(f, f.clone().addScaledVector(out, len * 0.25).add(V(0, len * 0.7, 0)), f.clone().addScaledVector(out, len * 0.8).add(V(0, len * 0.55, 0)), 3);
        lv.ribbon(path, [0.07, 0.065, 0.045, 0.01], () => V(-Math.sin(a), 0, Math.cos(a)), A.uv(C.strap), () => red ? [1.25, 0.55, 0.45] : [0.75, 1.05, 0.65], (i) => [bend(f), 0.3 * i / 3, k / n]);
      }
    }
    for (let k = 0; k < 10; k++) {
      const e = hangs[Math.floor(r() * hangs.length)];
      lv.scatter(r, e.clone().add(V(0, 0.12, 0)), e.clone().add(V(0, -0.5, 0)), range(r, 0.45, 0.8), A.uv(C.tuft), { wind: [bend(e), 0.1, r()], flat: 0.7 });
    }
  }
  const parts: [Geo, THREE.Material][] = [[wd, bark()], [lv, leaves()]];
  const group = assemble('cloudTree', lod, parts);
  // water dripping from the crown's edge
  if (d.fine) {
    const from = Array.from({ length: 40 }, () => {
      const e = ends[Math.floor(r() * ends.length)];
      return e.clone().add(V((r() - 0.5) * R * 0.6, -R * 0.15, (r() - 0.5) * R * 0.6));
    });
    group.add(drips(r, from, from.map((p) => Math.max(0.5, p.y - 0.05))));
  }
  return group;
}

// ---------------------------------------------------------------- tree fern

function treeFern(seed: number, lod: Lod): THREE.Object3D {
  const r = rng(seed), d = detail(lod), A = WEEP();
  const H = range(r, 3, 8);
  const wd = new Geo(), lv = new Geo();
  const bend = bendAt(0.04 * H + 0.05, H);
  const lean = V((r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5).multiplyScalar(H);
  const trunk = arc(V(0, 0, 0), V(lean.x * 0.15, H * 0.5, lean.z * 0.15), V(lean.x * 0.3, H, lean.z * 0.3), Math.max(3, Math.round(9 * d.seg)));
  const radii = taper(trunk.length, 0.26, 0.17);
  radii[0] = 0.38; // the root mantle flares at the foot
  wd.tube(trunk, radii, { sides: d.sides + 1, texM: 0.9, wind: (p) => [bend(p), 0, 0], moss: (i) => Math.max(0, 0.8 - i / trunk.length * 1.6), gnarl: d.fine ? 0.08 : 0 });
  const top = trunk[trunk.length - 1];
  const tipBend = (t: number, p: THREE.Vector3) => bend(p) + 0.35 * t * t;
  // a skirt of dead fronds hangs down the trunk under the crown
  if (d.mid) {
    const n = many(11, d, 4);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + r() * 0.4, out = V(Math.cos(a), 0, Math.sin(a));
      const len = range(r, 1.4, 2.4);
      const down = V(0, -1, 0).addScaledVector(out, range(r, 0.15, 0.35)).normalize();
      const at = top.clone().addScaledVector(out, 0.12).add(V(0, -0.1, 0));
      lv.card(at, V(-out.z, 0, out.x), down.negate(), len * 0.35, len, A.uv(C.deadFrond), { anchor: 'top', wind: [bend(at), 0.2, r()], tip: 0.08, col: [0.9, 0.85, 0.8] });
    }
  }
  // living fronds arch up and out from the crown and droop at the tips
  const fronds = lod === 2 ? 8 : 10 + Math.floor(r() * 6);
  for (let k = 0; k < fronds; k++) {
    const a = k * 2.39996 + r() * 0.3, out = V(Math.cos(a), 0, Math.sin(a));
    const L = range(r, 2.2, 3.4) * (0.75 + H / 16);
    const rise = range(r, 0.25, 0.6);
    const ctrl = top.clone().addScaledVector(out, L * 0.45).add(V(0, L * rise, 0));
    const tip = top.clone().addScaledVector(out, L * 0.9).add(V(0, L * (rise - 0.55), 0));
    const segs = lod === 0 ? 10 : lod === 1 ? 6 : 3;
    const path = arc(top.clone().add(V(0, 0.05, 0)), ctrl, tip, segs);
    const side = V(-out.z, 0, out.x);
    const width = (t: number) => L * 0.3 * Math.pow(Math.sin(Math.PI * (0.12 + t * 0.88)), 0.8) + 0.02;
    if (lod === 0) {
      wd.tube(path, taper(path.length, 0.028, 0.006), { sides: 3, texM: 0.9, col: [0.8, 0.85, 0.6], wind: (p, i) => [tipBend(i / segs, p), 0.1, k / fronds] });
      // pinnae: one card each side of the rachis, lying in the frond's plane, leaning toward the tip
      const n = 18;
      for (let i = 1; i < n; i++) {
        const t = i / n, f = t * segs, i0 = Math.min(segs - 1, Math.floor(f));
        const at = path[i0].clone().lerp(path[i0 + 1], f - i0);
        const along = path[i0 + 1].clone().sub(path[i0]).normalize();
        const up = along.clone().cross(side).normalize().negate();
        const w = width(t);
        for (const s of [-1, 1]) {
          const dir = side.clone().multiplyScalar(s).addScaledVector(along, 0.45).addScaledVector(up, -0.15).normalize();
          const across = dir.clone().cross(up).normalize();
          lv.card(at, across, dir, w * 0.4, w, A.uv(C.pinna), { wind: [tipBend(t, at), 0.55, (i * 0.13 + k * 0.37) % 1], tip: 0.06, col: [0.9 + t * 0.15, 0.95 + t * 0.1, 0.9] });
        }
      }
    } else {
      // far fronds: the whole frond painted on one ribbon that follows the arch
      lv.ribbon(path, path.map((_, i) => width(i / segs) * 2), () => side, A.uv(C.frond), (i) => [0.85 + i / segs * 0.2, 0.95, 0.85], (i) => [tipBend(i / segs, path[i]), 0.4, k / fronds],
        (i) => { const j = Math.min(segs - 1, i); return path[j + 1].clone().sub(path[j]).normalize().cross(side).normalize().negate(); });
    }
  }
  // fiddleheads uncurl at the heart of the crown
  if (d.fine) for (let k = 0; k < 2 + Math.floor(r() * 3); k++) {
    const a = r() * TAU, out = V(Math.cos(a), 0, Math.sin(a)), stalk = range(r, 0.25, 0.6);
    const pts: THREE.Vector3[] = [top.clone().addScaledVector(out, 0.04)];
    for (let i = 1; i <= 6; i++) pts.push(pts[0].clone().add(V(0, (stalk * i) / 6, 0)).addScaledVector(out, 0.03 * i));
    const c = pts[pts.length - 1];
    for (let i = 1; i <= 14; i++) {
      const th = (i / 14) * TAU * 1.3, rad = 0.09 * (1 - i / 17);
      pts.push(c.clone().addScaledVector(out, Math.sin(th) * rad).add(V(0, (1 - Math.cos(th)) * rad * 0.9 - 0.0, 0)).add(V(0, 0, 0)));
    }
    wd.tube(pts, taper(pts.length, 0.03, 0.012), { sides: 5, texM: 0.3, col: [1.1, 1.05, 0.75], wind: (p) => [bend(p), 0.05, 0] });
  }
  return assemble('treeFern', lod, [[wd, fernBark()], [lv, leaves()]]);
}

export const PLANTS: Plant[] = [
  {
    id: 'cloudTree', name: 'Cloud forest tree', build: cloudTree,
    placement: { minHeight: 4, maxHeight: 320, maxSlope: 42, density: 2.4, cluster: 0.35 },
  },
  {
    id: 'treeFern', name: 'Tree fern', build: treeFern,
    placement: { minHeight: 2, maxHeight: 260, maxSlope: 45, density: 2.2, cluster: 0.6 },
  },
];
