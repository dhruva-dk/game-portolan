// The Fire Archipelago's plants: ash-grey scrub on the cinder slopes, and the lava bloom, a twisted grey tree whose
// red pompom blossoms are the only colour on old black lava.
import * as THREE from 'three';
import {
  Geo, V, assemble, atlas, barkMaterial, bendAt, clump, detail, leafMaterial, many, range, rng, taper, twigs, wander, TAU,
  type Atlas, type Col, type Lod, type Paint, type Plant, type TwigPoint,
} from './kitD.ts';

// ---------------------------------------------------------------- the atlas

const C = { scrub: 0, scrubDead: 1, scrubFar: 2, leaf: 3, bloom: 4, pompom: 5, bloomFar: 6, ash: 7 } as const;

/** A lehua blossom: a ball of crimson stamens tipped with yellow pollen, darker at the back. */
function pompom(p: Paint, x: number, y: number, rad: number): void {
  const { g, r } = p;
  g.lineCap = 'round';
  for (const [n, light, k] of [[60, 24, 0.8], [80, 40, 1]] as const) {
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, l = rad * k * (0.5 + r() * 0.5);
      const x2 = x + Math.cos(a) * l, y2 = y + Math.sin(a) * l * 0.85;
      g.strokeStyle = `hsl(${350 + r() * 12},${78 + r() * 16}%,${light + r() * 14}%)`;
      g.lineWidth = 0.7 + r() * 0.7;
      g.beginPath(); g.moveTo(x + (x2 - x) * 0.2, y + (y2 - y) * 0.2); g.lineTo(x2, y2); g.stroke();
      if (light > 30) {
        g.fillStyle = r() < 0.6 ? `hsl(${46 + r() * 10},92%,${60 + r() * 14}%)` : `hsl(356,85%,${46 + r() * 10}%)`;
        g.beginPath(); g.arc(x2, y2, 0.9 + r() * 0.7, 0, TAU); g.fill();
      }
    }
  }
}

/** Twigs with leaves in pairs along them and a fan at each tip. */
function leafyTwigs(p: Paint, n: number, perTip: number, len: number, color: string): TwigPoint[] {
  const pts = twigs(p, n, color, 2.6, 1.25, 0.82), { r } = p;
  for (const [x, y, a, tip] of pts) {
    if (tip) for (let k = 0; k < perTip; k++) p.leaf('round', Math.floor(r() * 9), x, y, len * (0.65 + r() * 0.45), a + (k / Math.max(1, perTip - 1) - 0.5) * 2.4 + (r() - 0.5) * 0.4);
    else for (const side of [-1, 1]) p.leaf('round', Math.floor(r() * 9), x, y, len * (0.6 + r() * 0.4), a + side * (0.7 + r() * 0.5));
  }
  return pts;
}

function blob(p: Paint, n: number, len: number): void {
  const { s, r } = p;
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, d = Math.sqrt(r());
    const x = s / 2 + Math.cos(a) * d * s * 0.42, y = s * 0.55 + Math.sin(a) * d * s * 0.36;
    p.leaf('round', Math.floor(r() * 9), x, y, len * (0.7 + r() * 0.6), r() * TAU);
  }
}

let fireAtlas: Atlas | null = null;
const FIRE = () => fireAtlas ??= atlas('fire', 4, 1024, [
  // ash scrub: small leaves dulled silver-grey by ash
  (p) => { leafyTwigs(p, 3, 4, 24, '#77716a'); p.tone({ sat: 0.18, mul: [1.0, 1.02, 0.98], add: [0.1, 0.1, 0.1] }); },
  // ash scrub, dying back: bare grey twigs and a few dry leaves
  (p) => {
    const pts = twigs(p, 4, '#8a847c', 2.6, 1.5, 0.9);
    pts.forEach(([x, y, a], i) => { if (i % 4 === 0) p.leaf('round', i, x, y, 16, a + 0.8); });
    p.tone({ sat: 0.25, mul: [1.05, 0.98, 0.9], add: [0.06, 0.06, 0.06] });
  },
  // ash scrub from afar: a dense grey mound
  (p) => { blob(p, 260, 30); p.tone({ sat: 0.15, mul: [1, 1.02, 0.98], add: [0.08, 0.08, 0.08] }); },
  // lava bloom leaves: small leathery leaves, grey-green
  (p) => { leafyTwigs(p, 3, 5, 22, '#5c5550'); p.tone({ sat: 0.45, mul: [0.82, 0.92, 0.8] }); },
  // lava bloom in flower: leaves with pompoms at the tips
  (p) => {
    const pts = leafyTwigs(p, 3, 4, 20, '#5c5550');
    p.tone({ sat: 0.45, mul: [0.82, 0.92, 0.8] });
    pts.forEach(([x, y, a, tip], i) => { if (tip && i % 2 === 0) pompom(p, x + Math.sin(a) * 6, y - Math.cos(a) * 6, 13 + p.r() * 6); });
  },
  // a spray of blossoms close up
  (p) => {
    const pts = leafyTwigs(p, 2, 5, 26, '#5c5550');
    p.tone({ sat: 0.45, mul: [0.82, 0.92, 0.8] });
    pts.forEach(([x, y, a, tip]) => { if (tip) pompom(p, x + Math.sin(a) * 8, y - Math.cos(a) * 8, 18 + p.r() * 8); });
  },
  // lava bloom from afar: a dark mound spotted with red
  (p) => {
    blob(p, 240, 28);
    p.tone({ sat: 0.45, mul: [0.8, 0.9, 0.78] });
    for (let i = 0; i < 16; i++) pompom(p, p.s * (0.16 + p.r() * 0.68), p.s * (0.22 + p.r() * 0.5), 14 + p.r() * 10);
  },
  // a dusting of ash for the tops of far mounds
  (p) => { blob(p, 200, 30); p.tone({ sat: 0.05, mul: [1.1, 1.1, 1.1], add: [0.2, 0.2, 0.2] }); },
]);

const wood = () => barkMaterial('fire-bark', { map: 'bark_ash_d.jpg', normal: 'bark_ash_n.jpg', tint: 0xcfccc8, roughness: 0.94, normalScale: 1.4 });
const leaves = () => leafMaterial('fire-leaves', { atlas: FIRE(), roughness: 0.78, translucency: 0.35 });

/** Charred near the ground, ash-grey above. */
const charred = (n: number, light: number) => (i: number): Col => {
  const t = Math.min(1, i / Math.max(1, n - 1) * 1.6);
  const v = 0.32 + (light - 0.32) * t;
  return [v, v * 0.97, v * 0.95];
};

// ---------------------------------------------------------------- ash scrub

function ashScrub(seed: number, lod: Lod): THREE.Object3D {
  const r = rng(seed), d = detail(lod), A = FIRE();
  const H = range(r, 0.7, 1.9), R = H * range(r, 0.9, 1.5);
  const wd = new Geo(), lv = new Geo();
  const bend = bendAt(0.14 * H, H);
  const steps = Math.max(2, Math.round(5 * d.seg));
  const stems = lod === 2 ? 3 : 4 + Math.floor(r() * 4);
  const top = V(0, H * 0.55, 0);
  const ends: THREE.Vector3[] = [];
  for (let k = 0; k < stems; k++) {
    const a = (k / stems) * TAU + r() * 0.8;
    const out = range(r, 0.5, 1.1);
    const path = wander(r, V(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05), V(Math.cos(a) * out, 1, Math.sin(a) * out), H * range(r, 0.75, 1.1), steps, 0.7);
    wd.tube(path, taper(path.length, 0.035 * H + 0.02, 0.008), { sides: Math.max(3, d.sides - 2), texM: 0.5, col: charred(path.length, 0.8), wind: (p) => [bend(p), 0, 0], gnarl: d.fine ? 0.2 : 0 });
    ends.push(path[path.length - 1]);
    if (d.mid) for (let b = 0; b < (d.fine ? 3 : 1); b++) {
      const from = path[1 + Math.floor(r() * (path.length - 2))];
      const bd = V(Math.cos(a + (r() - 0.5) * 1.6), range(r, 0.3, 0.9), Math.sin(a + (r() - 0.5) * 1.6));
      const br = wander(r, from, bd, H * range(r, 0.35, 0.6), Math.max(2, steps - 2), 0.8);
      if (d.fine) wd.tube(br, taper(br.length, 0.018 * H + 0.008, 0.005), { sides: 3, texM: 0.5, col: [0.7, 0.69, 0.67], wind: (p) => [bend(p), 0.2, 0] });
      ends.push(br[br.length - 1]);
    }
  }
  // a dead stem or two standing out of the mound
  if (d.mid) for (let k = 0; k < 1 + Math.floor(r() * 2); k++) {
    const a = r() * TAU;
    const snag = wander(r, V(0, 0, 0), V(Math.cos(a) * 0.4, 1, Math.sin(a) * 0.4), H * range(r, 1.0, 1.35), steps, 0.9);
    wd.tube(snag, taper(snag.length, 0.03 * H, 0.006), { sides: 3, texM: 0.5, col: [0.92, 0.9, 0.86], wind: (p) => [bend(p) * 0.6, 0, 0] });
  }
  // gnarled roots gripping the cinders
  if (d.fine) for (let k = 0; k < 4; k++) {
    const a = r() * TAU;
    const root = wander(r, V(0, 0.08, 0), V(Math.cos(a), -0.15, Math.sin(a)), range(r, 0.4, 0.9), 4, 0.6, -0.02);
    root.forEach((p) => { p.y = Math.max(0.01, p.y); });
    wd.tube(root, taper(root.length, 0.04, 0.012), { sides: 4, texM: 0.5, col: [0.3, 0.29, 0.28], wind: () => [0, 0, 0] });
  }
  // the foliage: a low dome, flattened by the wind, thicker on top
  const size = 0.42 * H * d.cardSize + 0.15;
  for (const e of ends) {
    const n = many(lod === 2 ? 2 : 7, d);
    clump(lv, r, e.clone().lerp(top, 0.15), [R * 0.32, H * 0.22, R * 0.32], n, size,
      (i) => A.uv(lod === 2 ? (i % 3 === 0 ? C.ash : C.scrubFar) : i % 5 === 0 ? C.scrubDead : C.scrub),
      { crown: top, bend, flutter: 0.5, flat: 0.35, col: [1, 1, 1] });
  }
  if (lod < 2) clump(lv, r, V(0, H * 0.75, 0), [R * 0.6, H * 0.2, R * 0.6], many(10, d), size * 1.1, () => A.uv(lod ? C.scrubFar : C.scrub), { crown: top, bend, flutter: 0.4, flat: 0.6 });
  return assemble('ashScrub', lod, [[wd, wood()], [lv, leaves()]]);
}

// ---------------------------------------------------------------- lava bloom

function lavaBloom(seed: number, lod: Lod): THREE.Object3D {
  const r = rng(seed), d = detail(lod), A = FIRE();
  const shrub = r() < 0.35; // a young bush on newer lava, or a tree on old
  const H = shrub ? range(r, 1.6, 2.8) : range(r, 3.8, 7.5);
  const wd = new Geo(), lv = new Geo();
  const bend = bendAt(0.05 * H + 0.1, H);
  const sides = d.sides;
  const trunks = shrub ? 3 + Math.floor(r() * 2) : 1 + Math.floor(r() * 2);
  const crown = V(0, H * 0.72, 0);
  const pads: { at: THREE.Vector3; s: number }[] = [];
  for (let t = 0; t < trunks; t++) {
    const a = r() * TAU, lean = shrub ? 0.6 : 0.25;
    const trunkLen = H * (shrub ? 0.45 : 0.5) * range(r, 0.85, 1.1);
    const trunk = wander(r, V(Math.cos(a) * 0.08 * t, 0, Math.sin(a) * 0.08 * t), V(Math.cos(a) * lean, 1, Math.sin(a) * lean), trunkLen, Math.max(3, Math.round(7 * d.seg)), 0.55);
    const r0 = (shrub ? 0.05 : 0.11) * (H / 5) + 0.04;
    wd.tube(trunk, taper(trunk.length, r0 * 1.25, r0 * 0.7), { sides, texM: 0.7, col: charred(trunk.length, 0.95), wind: (p) => [bend(p), 0, 0], gnarl: d.fine ? 0.28 : 0.1 });
    const tip = trunk[trunk.length - 1];
    const limbs = lod === 2 ? 2 : 3 + Math.floor(r() * 3);
    for (let k = 0; k < limbs; k++) {
      const b = (k / limbs) * TAU + r() * 0.9;
      const limb = wander(r, tip, V(Math.cos(b), range(r, 0.5, 1.1), Math.sin(b)), H * range(r, 0.3, 0.45), Math.max(2, Math.round(5 * d.seg)), 0.7);
      wd.tube(limb, taper(limb.length, r0 * 0.65, r0 * 0.25), { sides: Math.max(3, sides - 2), texM: 0.7, col: [0.92, 0.9, 0.88], wind: (p) => [bend(p), 0, 0], gnarl: d.fine ? 0.2 : 0 });
      const end = limb[limb.length - 1];
      pads.push({ at: end, s: 1 });
      if (d.mid) for (let j = 0; j < (d.fine ? 2 : 1); j++) {
        const from = limb[Math.max(1, limb.length - 2 - j)];
        const c = b + (r() - 0.5) * 2;
        const twig = wander(r, from, V(Math.cos(c), range(r, 0.2, 0.9), Math.sin(c)), H * range(r, 0.15, 0.25), 3, 0.8);
        if (d.fine) wd.tube(twig, taper(twig.length, r0 * 0.22, r0 * 0.08), { sides: 3, texM: 0.7, col: [0.9, 0.88, 0.86], wind: (p) => [bend(p), 0.2, 0] });
        pads.push({ at: twig[twig.length - 1], s: 0.7 });
      }
    }
  }
  // roots spread over the bare lava, then dive into its cracks
  if (d.fine) for (let k = 0; k < 5; k++) {
    const a = r() * TAU;
    const root = wander(r, V(0, 0.12, 0), V(Math.cos(a), -0.1, Math.sin(a)), range(r, 0.7, 1.6) * (H / 5 + 0.4), 6, 0.7, -0.03);
    root.forEach((p, i) => { p.y = i === root.length - 1 ? -0.05 : Math.max(0.02, p.y * 0.6); });
    wd.tube(root, taper(root.length, 0.06 * (H / 5) + 0.02, 0.01), { sides: 4, texM: 0.7, col: [0.4, 0.38, 0.37], wind: () => [0, 0, 0] });
  }
  // foliage pads at the branch ends, blossoms on their sunny tops
  const size = (shrub ? 0.42 : 0.55) * d.cardSize;
  for (const pad of pads) {
    const s = pad.s * (shrub ? 0.45 : 0.85) * (H / 5 + 0.3);
    const n = many(lod === 2 ? 3 : 15, d);
    clump(lv, r, pad.at.clone().add(V(0, s * 0.25, 0)), [s, s * 0.55, s], n, size,
      (i) => A.uv(lod === 2 ? C.bloomFar : i % 3 === 0 ? C.bloom : lod === 1 && i % 3 === 1 ? C.bloomFar : C.leaf),
      { crown, bend, flutter: 0.45, flat: 0.25, tip: 0.05 });
    if (d.fine) for (let k = 0; k < 2; k++) {
      // blossoms held up above the leaves on short stalks, where they catch the light
      const p = pad.at.clone().add(V((r() - 0.5) * s, s * range(r, 0.45, 0.75), (r() - 0.5) * s));
      lv.scatter(r, p, crown, 0.3 + r() * 0.15, A.uv(C.pompom), { wind: [bend(p), 0.7, r()], flat: 0.5 });
    }
  }
  return assemble('lavaBloom', lod, [[wd, wood()], [lv, leaves()]]);
}

export const PLANTS: Plant[] = [
  {
    id: 'ashScrub', name: 'Ash scrub', build: ashScrub,
    placement: { minHeight: 1, maxHeight: 140, maxSlope: 38, density: 7, cluster: 0.45 },
  },
  {
    id: 'lavaBloom', name: 'Lava bloom', build: lavaBloom,
    placement: { minHeight: 2, maxHeight: 110, maxSlope: 30, density: 1, cluster: 0.65 },
  },
];
