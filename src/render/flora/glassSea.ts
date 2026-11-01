// The Glass Sea's plants: low silver fan palms and sea grape on white sand. The region's richness is the water,
// so its plants stay low and sparse: a few clumps of fans along the isles and sea grape sprawling behind the beach.
import * as THREE from 'three';
import {
  Geo, V, assemble, barkMaps, css, dirAt, grow, hsl, leafMaps, mix, paintedTexture, plantMaterial, rng, taper,
  type Atlas, type Lod, type Plant,
} from './kitC.ts';

// ---------------------------------------------------------------- materials

/** The fan leaf, painted: u runs across the fan's segments, v from the hastula (0) out to the split tips (1). */
function fanTexture(): THREE.Texture {
  return paintedTexture('glassSea-fan', 512, 512, (g, w, h) => {
    const r = rng(41);
    const N = 26, sw = w / N;
    for (let k = 0; k < N; k++) {
      const xc = (k + 0.5) * sw, hw = sw * 0.5;
      const reach = 0.9 + r() * 0.1, split = 0.5 + r() * 0.1, torn = r() < 0.12 ? 0.75 + r() * 0.1 : 1;
      const y = (v: number) => h * (1 - v * torn);
      const grad = g.createLinearGradient(xc - hw, 0, xc + hw, 0);
      grad.addColorStop(0, css(110, 24, 30));
      grad.addColorStop(0.5, css(92, 20, 60 + r() * 6));
      grad.addColorStop(1, css(110, 24, 30));
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(xc - hw - 0.6, y(0));
      g.lineTo(xc - hw - 0.6, y(split));
      g.lineTo(xc - hw * 0.72, y(reach * 0.88));
      g.lineTo(xc - hw * 0.5, y(reach));
      g.lineTo(xc - hw * 0.08, y(reach * 0.9));
      g.lineTo(xc + hw * 0.42, y(reach * (0.97 + r() * 0.03)));
      g.lineTo(xc + hw * 0.72, y(reach * 0.88));
      g.lineTo(xc + hw + 0.6, y(split));
      g.lineTo(xc + hw + 0.6, y(0));
      g.closePath();
      g.fill();
      // the fold down the middle of each segment, and fine veins either side
      g.strokeStyle = css(80, 18, 74, 0.7);
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(xc, y(0.02));
      g.lineTo(xc, y(reach * 0.9));
      g.stroke();
      g.strokeStyle = css(100, 20, 46, 0.35);
      g.lineWidth = 0.7;
      for (const f of [-0.55, -0.3, 0.3, 0.55]) {
        g.beginPath();
        g.moveTo(xc + hw * f, y(0.02));
        g.lineTo(xc + hw * f * 0.8, y(reach * 0.86));
        g.stroke();
      }
    }
    // the stiff, pale hastula where the segments meet the stalk
    g.fillStyle = css(60, 25, 62);
    g.fillRect(0, h * 0.96, w, h * 0.04);
  });
}

const fanMat = () => plantMaterial('glassSea-fan', () => ({ map: fanTexture(), roughness: 0.55, leaf: 0.55 }));
const fanBarkMat = () => plantMaterial('glassSea-fanBark', () => ({ ...barkMaps('fanpalm_bark'), roughness: 0.95 }));
const grapeLeafMat = () => plantMaterial('glassSea-grapeLeaf', () => ({ ...leafMaps('seagrape_leaf'), roughness: 0.42, leaf: 0.45 }));
const grapeBarkMat = () => plantMaterial('glassSea-grapeBark', () => ({ ...barkMaps('seagrape_bark'), roughness: 0.85 }));
const berryMat = () => plantMaterial('glassSea-berry', () => ({ roughness: 0.3 }));

/** LeafSet024: nine round leaves, three by three, stems down. */
const GRAPE_ATLAS: Atlas = { cols: 3, rows: 3, stem: 'down', aspect: 1 };
const WHOLE: [number, number, number, number] = [0, 0, 1, 1];

// ---------------------------------------------------------------- the silver fan palm

interface FanLeaf { base: THREE.Vector3; dir: THREE.Vector3; petiole: number; radius: number; spread: number; droop: number; dead: boolean }
interface FanStem { path: THREE.Vector3[]; r0: number; leaves: FanLeaf[] }

function fanPalmPlan(seed: number): FanStem[] {
  const r = rng(seed);
  const stems: FanStem[] = [];
  const n = r() < 0.45 ? 1 : r() < 0.6 ? 2 : 3;
  for (let s = 0; s < n; s++) {
    const a = r() * Math.PI * 2, H = (s === 0 ? 1.8 : 0.9) + r() * (s === 0 ? 1.6 : 1.2);
    const foot = s === 0 ? V() : V(Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35);
    const path = grow(foot, dirAt(a, 0.82 + r() * 0.12), H, 6, r, 0.12, V(0, 0.02, 0));
    const top = path[path.length - 1];
    const leaves: FanLeaf[] = [];
    const count = 16 + Math.floor(r() * 5) - s * 4;
    for (let i = 0; i < count; i++) {
      const la = i * 2.4 + r() * 0.5, t = i / count;
      // the newest leaves stand up in the middle, the oldest droop below
      const up = 0.95 - t * 1.25 + (r() - 0.5) * 0.2;
      leaves.push({
        base: top.clone().add(V(0, -t * 0.15, 0)),
        dir: dirAt(la, Math.max(-0.6, Math.min(0.97, up))),
        petiole: 0.45 + r() * 0.4 - t * 0.1,
        radius: 0.75 + r() * 0.3 - s * 0.08,
        spread: 3.5 + r() * 0.7,
        droop: 0.15 + t * 0.35 + r() * 0.1,
        dead: false,
      });
    }
    // one or two dead fans hang straw-coloured under the crown
    for (let i = 0, d = Math.floor(r() * 3); i < d; i++)
      leaves.push({ base: top.clone().add(V(0, -0.2, 0)), dir: dirAt(r() * 6.28, -0.85), petiole: 0.3 + r() * 0.3, radius: 0.5 + r() * 0.15, spread: 1.4, droop: 0.05, dead: true });
    stems.push({ path, r0: 0.12 + r() * 0.04 - s * 0.02, leaves });
  }
  return stems;
}

/** One fan: a near-circle of pleated segments around the hastula, folded up along its middle, drooping at the sides. */
function fanBlade(geo: Geo, lf: FanLeaf, lod: Lod, color: THREE.Color, swayBase: number): void {
  const pd = lf.dir;
  const n0 = V(0, 1, 0).addScaledVector(pd, -pd.y);
  if (n0.lengthSq() < 1e-4) n0.set(1, 0, 0);
  n0.normalize();
  const side = pd.clone().cross(n0).normalize();
  const h = lf.base.clone().addScaledVector(pd, lf.petiole);
  const pleats = lod === 0 ? 9 : lod === 1 ? 5 : 3;
  const cols = pleats * 2 + 1;
  const rows = lod === 0 ? [0.04, 0.35, 0.7, 1] : lod === 1 ? [0.04, 0.55, 1] : [0.04, 1];
  const depth = lod === 0 ? 0.055 : lod === 1 ? 0.03 : 0;
  const P: THREE.Vector3[][] = rows.map((rho) => {
    const row: THREE.Vector3[] = [];
    for (let c = 0; c < cols; c++) {
      const u = c / (cols - 1), th = (u - 0.5) * lf.spread;
      const d = pd.clone().multiplyScalar(Math.cos(th)).addScaledVector(side, Math.sin(th));
      const R = lf.radius * rho;
      row.push(h.clone().addScaledVector(d, R)
        .addScaledVector(n0, R * (0.28 * Math.abs(Math.sin(th)) + (c % 2 ? depth : -depth) * 1.6) - R * rho * lf.droop * (0.5 + Math.abs(th) / lf.spread)));
    }
    return row;
  });
  // each half-pleat is its own facet, so the folds catch the light
  for (let c = 0; c < cols - 1; c++) {
    const spine = P.map((row) => row[c]);
    const sides = P.map((row) => row[c + 1].clone().sub(row[c]));
    const w1 = sides.map((s) => s.length());
    sides.forEach((s) => s.normalize());
    const nrm = P.map((row, j) => {
      const rad = (j < rows.length - 1 ? P[j + 1][c].clone().sub(row[c]) : row[c].clone().sub(P[j - 1][c])).normalize();
      const nn = sides[j].clone().cross(rad).normalize();
      return nn.dot(n0) < 0 ? nn.negate() : nn;
    });
    geo.strip(spine, sides, w1.map(() => 0), w1, nrm, [c / (cols - 1), 0, (c + 1) / (cols - 1), 1], color, {
      sway: (_i, t) => swayBase + 0.12 * t * lf.radius,
      flutter: (_i, t) => 0.05 * t,
    });
  }
}

function buildFanPalm(seed: number, lod: Lod): THREE.Object3D {
  const r = rng(seed * 7 + 3);
  const bark = new Geo(), leaves = new Geo();
  const tint = hsl(95 + r() * 20, 30 + r() * 15, 62 + r() * 10);
  for (const st of fanPalmPlan(seed)) {
    const H = st.path[st.path.length - 1].y;
    const sides = lod === 0 ? 9 : lod === 1 ? 6 : 4;
    const path = lod === 2 ? [st.path[0], st.path[3], st.path[6]] : st.path;
    const radii = taper(path.length, st.r0 * 1.5, st.r0 * 0.85, 0.4);
    const swayAt = (y: number) => 0.06 * H * (y / H) ** 2;
    bark.tube(path, radii, sides, (_i, t) => hsl(32, 20, 60 + t * 10).multiplyScalar(1.7), { sway: (i) => swayAt(path[i].y) }, 2, 0.6);
    const topSway = swayAt(H);
    // a ring of old leaf bases under the crown
    if (lod === 0) {
      const top = st.path[st.path.length - 1];
      for (let i = 0; i < 9; i++) {
        const d = dirAt(i * 2.4, 0.55);
        bark.tube([top.clone().add(V(0, -0.25 - (i % 3) * 0.1, 0)), top.clone().add(V(0, -0.1, 0)).addScaledVector(d, 0.22)], [st.r0 * 0.5, st.r0 * 0.2], 4, hsl(32, 25, 50).multiplyScalar(1.7), { sway: topSway }, 1, 0.6);
      }
    }
    const keep = lod === 0 ? st.leaves.length : lod === 1 ? Math.ceil(st.leaves.length * 0.65) : 5;
    st.leaves.slice(0, keep).forEach((lf) => {
      const c = lf.dead ? hsl(38, 45, 62) : mix(tint, hsl(80, 30, 70), r() * 0.3);
      if (lod < 2) {
        const tip = lf.base.clone().addScaledVector(lf.dir, lf.petiole);
        bark.tube([lf.base, lf.base.clone().lerp(tip, 0.5).add(V(0, 0.03, 0)), tip], [0.022, 0.016, 0.012], lod === 0 ? 4 : 3, hsl(70, 25, 62).multiplyScalar(1.8), { sway: (i) => topSway + i * 0.05 }, 1, 2);
      }
      fanBlade(leaves, lf, lod, c, topSway);
    });
  }
  return assemble('Silver fan palm', lod, [{ geo: bark, mat: fanBarkMat() }, { geo: leaves, mat: fanMat() }]);
}

// ---------------------------------------------------------------- sea grape

interface Twig { path: THREE.Vector3[]; fruit: boolean }

/** Stems sprawl low from the root, turn up, and fork; leafy twigs crowd their ends into a rounded mound. */
function seaGrapePlan(seed: number): { limbs: { path: THREE.Vector3[]; r0: number }[]; twigs: Twig[]; size: number } {
  const r = rng(seed);
  const size = 0.8 + r() * 0.5;
  const limbs: { path: THREE.Vector3[]; r0: number }[] = [];
  const twigs: Twig[] = [];
  const twigsAt = (from: THREE.Vector3, dir: THREE.Vector3, n: number) => {
    for (let k = 0; k < n; k++) {
      const d = dir.clone().add(V((r() - 0.5) * 1.6, 0.3 + r() * 0.6, (r() - 0.5) * 1.6)).normalize();
      twigs.push({ path: grow(from, d, (0.25 + r() * 0.2) * size, 3, r, 0.4), fruit: r() < 0.25 });
    }
  };
  const stems = 5 + Math.floor(r() * 3);
  for (let s = 0; s < stems; s++) {
    const a = (s / stems) * Math.PI * 2 + (r() - 0.5) * 0.6;
    const L = (1.0 + r() * 1.1) * size;
    const path = grow(V((r() - 0.5) * 0.2, 0, (r() - 0.5) * 0.2), dirAt(a, 0.18 + r() * 0.3), L, 5, r, 0.35, V(0, 0.09, 0));
    limbs.push({ path, r0: (0.055 + r() * 0.03) * size });
    const nb = 2 + Math.floor(r() * 3);
    for (let b = 0; b < nb; b++) {
      const from = path[1 + Math.floor(r() * 4)];
      const d = dirAt(a + (r() - 0.5) * 2.2, 0.3 + r() * 0.5);
      const bp = grow(from, d, (0.5 + r() * 0.7) * size, 3, r, 0.4, V(0, 0.05, 0));
      limbs.push({ path: bp, r0: (0.028 + r() * 0.015) * size });
      twigsAt(bp[bp.length - 1], d, 2 + Math.floor(r() * 2));
      if (r() < 0.5) twigsAt(bp[2], d, 1);
    }
    twigsAt(path[path.length - 1], dirAt(a, 0.6), 3 + Math.floor(r() * 2));
    twigsAt(path[3], dirAt(a, 0.3), 1);
  }
  return { limbs, twigs, size };
}

function buildSeaGrape(seed: number, lod: Lod): THREE.Object3D {
  const plan = seaGrapePlan(seed);
  const r = rng(seed * 13 + lod);
  const bark = new Geo(), leaves = new Geo(), fruit = new Geo();
  const sway = (p: THREE.Vector3) => 0.03 * Math.pow(Math.hypot(p.x, p.y, p.z), 1.3);
  const centre = V(0, 0.6 * plan.size, 0);
  const leafTint = (shade = 1) => {
    const k = r();
    const c = k < 0.07 ? hsl(6, 75, 52) // old leaves turn red
      : k < 0.14 ? hsl(42, 75, 60) // and yellow
      : hsl(80 + r() * 30, 35 + r() * 20, 50 + r() * 14);
    return c.multiplyScalar(shade);
  };
  plan.limbs.forEach((l, i) => {
    if (lod === 2 && l.r0 < 0.04 * plan.size) return;
    const sides = lod === 0 ? 7 : lod === 1 ? 5 : 3;
    bark.tube(l.path, taper(l.path.length, l.r0, l.r0 * 0.45), sides, hsl(28, 14, 58 + (i % 3) * 5).multiplyScalar(1.9), { sway: (k) => sway(l.path[k]) }, 1, 1.2);
  });
  const berry = new THREE.OctahedronGeometry(0.012, 0);
  const clusterCard = (at: THREE.Vector3, size: number, shade: number) => {
    const out = at.clone().sub(centre).normalize();
    const right = out.clone().cross(V(0, 1, 0));
    if (right.lengthSq() < 0.01) right.set(1, 0, 0);
    right.normalize();
    const a = r() * Math.PI;
    const rr = right.clone().multiplyScalar(Math.cos(a)).add(V(0, Math.sin(a) * 0.6, 0)).normalize();
    const up = out.clone().cross(rr).normalize();
    leaves.card(at, rr, up, size, size, WHOLE, leafTint(shade), { sway: sway(at), flutter: 0.02, crown: centre });
  };
  for (const tw of plan.twigs) {
    const tip = tw.path[tw.path.length - 1];
    if (lod === 0) {
      bark.tube(tw.path, [0.016, 0.013, 0.01, 0.008], 4, hsl(15, 35, 50).multiplyScalar(1.6), { sway: (k) => sway(tw.path[k]) }, 1, 2);
      // a rosette of big round leaves crowded at the twig end
      const n = 6 + Math.floor(r() * 4);
      for (let k = 0; k < n; k++) {
        const t = 0.45 + (0.55 * k) / (n - 1);
        const f = (tw.path.length - 1) * t, i0 = Math.min(tw.path.length - 2, Math.floor(f));
        const p = tw.path[i0].clone().lerp(tw.path[i0 + 1], f - i0);
        const td = tw.path[i0 + 1].clone().sub(tw.path[i0]).normalize();
        const a = k * 2.4 + r() * 0.6;
        const ring = V(Math.cos(a), 0, Math.sin(a));
        const along = ring.multiplyScalar(0.9).addScaledVector(td, 0.5).add(V(0, 0.15 + r() * 0.35, 0)).normalize();
        const face = V(0, 1, 0).addScaledVector(along, -along.y).normalize().addScaledVector(p.clone().sub(centre).normalize(), 0.4).normalize();
        const L = 0.27 + r() * 0.1;
        leaves.leaf(p, along, face, L, GRAPE_ATLAS, Math.floor(r() * 9), leafTint(), { segs: 1, fold: 0.12, curl: 0.1, sway: sway(p), flutter: 0.025, crown: centre });
      }
      // nine-leaf cards fill the inside of the mound, in shade
      if (r() < 0.6) clusterCard(tw.path[1].clone().lerp(centre, 0.25), 0.6, 0.6);
      if (tw.fruit) {
        // a raceme of sea grapes hanging from the twig end
        const hang = grow(tip, V((r() - 0.5) * 0.4, -1, (r() - 0.5) * 0.4), 0.18 + r() * 0.1, 3, r, 0.2);
        bark.tube(hang, [0.006, 0.005, 0.004, 0.003], 3, hsl(80, 30, 50).multiplyScalar(1.5), { sway: sway(tip) + 0.05 }, 1, 2);
        const ripe = r() < 0.4;
        for (let b = 0; b < 11; b++) {
          const t = b / 10, f = t * 3, i0 = Math.min(2, Math.floor(f));
          const p = hang[i0].clone().lerp(hang[i0 + 1], f - i0).add(V((r() - 0.5) * 0.035, 0, (r() - 0.5) * 0.035));
          const c = ripe && r() < 0.6 ? hsl(300, 35, 25) : hsl(90 + r() * 20, 45, 45);
          fruit.geometry(berry, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z), c, { sway: sway(tip) + 0.05 });
        }
      }
    } else if (lod === 1) {
      clusterCard(tip, 0.8 * (0.85 + r() * 0.3), 1);
      if (r() < 0.5) clusterCard(tw.path[1].clone().lerp(centre, 0.2), 0.7, 0.65);
    } else if (r() < 0.45) {
      clusterCard(tip, 1.6 * (0.85 + r() * 0.3), 0.9);
    }
  }
  return assemble('Sea grape', lod, [{ geo: bark, mat: grapeBarkMat() }, { geo: leaves, mat: grapeLeafMat() }, { geo: fruit, mat: berryMat() }]);
}

// ---------------------------------------------------------------- the region's list

export const PLANTS: Plant[] = [
  {
    id: 'silverFanPalm',
    name: 'Silver fan palm',
    build: buildFanPalm,
    // low clumps along the white-sand isles, never far above the water
    placement: { minHeight: 0.6, maxHeight: 9, maxSlope: 22, density: 0.5, cluster: 7 },
  },
  {
    id: 'seaGrape',
    name: 'Sea grape',
    build: buildSeaGrape,
    // sprawls along the top of the beach, the first green above the tide line
    placement: { minHeight: 0.5, maxHeight: 6, maxSlope: 25, density: 1.2, cluster: 9 },
  },
];
