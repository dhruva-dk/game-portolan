// The Coral Atolls' plants: coconut palms leaning over the islet rings, and coral gardens in the lagoons, seen
// through clear turquoise water: branching, brain and plate corals in pinks and oranges, with sea fans rocking
// in the swell. Corals are rigid; only the fans move, with the surge rather than the wind.
import * as THREE from 'three';
import {
  Geo, V, assemble, barkMaps, css, dirAt, grow, hsl, mix, paintedTexture, plantMaterial, rng, scanTexture, smooth, taper,
  type Lod, type Plant, type Rand,
} from './kitC.ts';

// ---------------------------------------------------------------- the coconut frond

/** Two pinnate fronds side by side, green (u 0-0.5) and dead (u 0.5-1): rachis down the middle, tip at the top. */
function frondTexture(): THREE.Texture {
  return paintedTexture('coralAtolls-frond', 1024, 1024, (g, w, h) => {
    const r = rng(52);
    for (const dead of [false, true]) {
      const x0 = dead ? w / 2 : 0, xc = x0 + w / 4, half = w / 4;
      const N = 70;
      for (let side = -1; side <= 1; side += 2)
        for (let i = 0; i < N; i++) {
          const v = (i + 0.5 + (r() - 0.5) * 0.4) / N;
          const y = h * (1 - v);
          // leaflets are longest mid-frond, slant towards the tip, and some are torn short
          const len = half * 0.97 * Math.pow(Math.sin(Math.PI * Math.min(1, v * 1.05)), 0.6) * (r() < 0.1 ? 0.5 + r() * 0.3 : 0.9 + r() * 0.1);
          const ex = xc + side * len, ey = y - len * (0.35 + v * 0.25);
          const bw = 5 + (1 - v) * 4;
          const lum = dead ? 38 + r() * 18 : 30 + r() * 16;
          g.fillStyle = dead ? css(32 + r() * 10, 40 + r() * 20, lum) : css(78 + r() * 22, 45 + r() * 20, lum);
          g.beginPath();
          g.moveTo(xc, y - bw / 2);
          g.quadraticCurveTo(xc + side * len * 0.5, y - len * 0.25 - bw, ex, ey);
          g.quadraticCurveTo(xc + side * len * 0.5, y - len * 0.2 + bw * 0.4, xc, y + bw / 2);
          g.fill();
          g.strokeStyle = dead ? css(35, 40, lum + 12, 0.7) : css(70, 50, lum + 18, 0.7);
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(xc, y);
          g.quadraticCurveTo(xc + side * len * 0.5, y - len * 0.22, ex, ey);
          g.stroke();
        }
      // the rachis
      g.strokeStyle = dead ? css(35, 35, 55) : css(62, 45, 55);
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(xc, h);
      g.lineTo(xc, 0);
      g.stroke();
    }
  });
}

const frondMat = () => plantMaterial('coralAtolls-frond', () => ({ map: frondTexture(), roughness: 0.6, leaf: 0.6 }));
const trunkMat = () => plantMaterial('coralAtolls-trunk', () => ({ ...barkMaps('coconut_bark'), roughness: 0.9 }));
const nutMat = () => plantMaterial('coralAtolls-nut', () => ({ roughness: 0.55 }));

// ---------------------------------------------------------------- coconut palm

interface Frond { dir: THREE.Vector3; length: number; sag: number; width: number; dead: boolean }

function coconutPlan(seed: number): { trunk: THREE.Vector3[]; r0: number; fronds: Frond[]; nuts: number } {
  const r = rng(seed);
  const H = 11 + r() * 9;
  // the trunk leans out (along +x, towards the sea) and curves back up towards the light
  const lean = 0.18 + r() * 0.45, az = (r() - 0.5) * 0.5;
  const trunk: THREE.Vector3[] = [];
  const p = V();
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    trunk.push(p.clone());
    const t = i / steps, th = lean * (1 - 0.75 * smooth(t)) + Math.sin(t * 9 + seed) * 0.03;
    p.add(V(Math.sin(th) * Math.cos(az), Math.cos(th), Math.sin(th) * Math.sin(az)).multiplyScalar(H / steps));
  }
  const fronds: Frond[] = [];
  const n = 22 + Math.floor(r() * 7);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    // the spear leaves stand up in the middle, the oldest hang down
    const elev = 1.2 - t * 1.9 + (r() - 0.5) * 0.25;
    const e = Math.max(-1.2, Math.min(1.35, elev));
    const a = i * 2.39996 + r() * 0.2;
    fronds.push({ dir: V(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)), length: 3.6 + r() * 1.8 - Math.max(0, e - 0.9) * 1.5, sag: 0.18 + (1 - Math.abs(Math.sin(e))) * 0.32 + r() * 0.08, width: 0.85 + r() * 0.25, dead: false });
  }
  for (let i = 0, d = Math.floor(r() * 3); i < d; i++)
    fronds.push({ dir: dirAt(r() * 6.28, -0.92), length: 3 + r() * 1.2, sag: 0.05, width: 0.6, dead: true });
  return { trunk, r0: 0.19 + r() * 0.05, fronds, nuts: 5 + Math.floor(r() * 11) };
}

function buildCoconut(seed: number, lod: Lod): THREE.Object3D {
  const plan = coconutPlan(seed);
  const r = rng(seed * 17 + 1);
  const trunk = new Geo(), fronds = new Geo(), nuts = new Geo();
  const top = plan.trunk[plan.trunk.length - 1];
  const H = top.y;
  const swayAt = (y: number) => 0.045 * H * (Math.max(0, y) / H) ** 2;
  const topSway = swayAt(H);
  // trunk: a flared, ringed bole, slimming upwards and swelling a little under the crown
  const path = lod === 2 ? plan.trunk.filter((_, i) => i % 4 === 0 || i === plan.trunk.length - 1) : lod === 1 ? plan.trunk.filter((_, i) => i % 2 === 0) : plan.trunk;
  const radii = path.map((q) => {
    const t = q.y / H;
    return plan.r0 * (1 + 0.9 * Math.exp(-q.y * 3) + 0.15 * smooth(Math.max(0, (t - 0.9) / 0.1)) - 0.18 * t);
  });
  trunk.tube(path, radii, lod === 0 ? 12 : lod === 1 ? 7 : 4, (_i, t) => hsl(35, 10, 70 - t * 8).multiplyScalar(1.25), { sway: (i) => swayAt(path[i].y) }, 1, 0.4);
  if (lod === 0) {
    // the crown shaft: frond bases wrapped round the top, and a tangle of fibre
    for (let i = 0; i < 8; i++) {
      const d = dirAt(i * 2.4, 0.55 + r() * 0.2);
      trunk.tube([top.clone().add(V(0, -0.5, 0)), top.clone().addScaledVector(d, 0.45)], [plan.r0 * 0.9, plan.r0 * 0.35], 5, hsl(35, 25, 45).multiplyScalar(1.4), { sway: topSway }, 1, 0.5);
    }
  }
  const crown = top.clone().add(V(0, 0.15, 0));
  const segs = lod === 0 ? 10 : lod === 1 ? 6 : 3;
  const keep = lod === 0 ? plan.fronds.length : lod === 1 ? Math.ceil(plan.fronds.length * 0.65) : 9;
  const frondList = lod === 2 ? plan.fronds.filter((_, i) => i % 3 === 0).slice(0, keep) : plan.fronds.slice(0, keep);
  for (const f of frondList) {
    const flat = V(f.dir.x, 0, f.dir.z);
    if (flat.lengthSq() < 1e-4) flat.set(1, 0, 0);
    flat.normalize();
    const lateral = flat.clone().cross(V(0, 1, 0)).normalize();
    const spine: THREE.Vector3[] = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      spine.push(crown.clone().addScaledVector(f.dir, f.length * t).add(V(0, -f.length * f.sag * t * t, 0)));
    }
    const tans = spine.map((q, i) => (i < segs ? spine[i + 1].clone().sub(q) : q.clone().sub(spine[i - 1])).normalize());
    const k = lod === 2 ? 1.4 : 1;
    const widths = spine.map((_, i) => f.width * k * Math.pow(Math.sin(Math.PI * Math.min(1, (i / segs) * 1.05)), 0.6) + 0.02);
    const u = f.dead ? 0.5 : 0;
    // leaflets hang down either side of the rachis in an inverted V
    for (const side of [-1, 1]) {
      const sides = tans.map((tn) => {
        const across = tn.clone().cross(V(0, 1, 0));
        if (across.lengthSq() < 1e-4) across.copy(lateral);
        across.normalize().multiplyScalar(side);
        const down = across.clone().cross(tn).multiplyScalar(side).normalize();
        return across.multiplyScalar(0.72).addScaledVector(down, f.dead ? 0.3 : 0.6).normalize();
      });
      const nrm = sides.map((sd, i) => sd.clone().cross(tans[i]).multiplyScalar(side).normalize());
      nrm.forEach((nn) => { if (nn.y < 0) nn.negate(); });
      const col = f.dead ? hsl(36, 40, 70) : hsl(80 + r() * 15, 40, 62 + r() * 10);
      fronds.strip(spine, sides, spine.map(() => 0), widths, nrm, side < 0 ? [u + 0.25, 0, u, 1] : [u + 0.25, 0, u + 0.5, 1], (_i, t) => col.clone().multiplyScalar(0.8 + 0.4 * t),
        { sway: (_i, t) => topSway + 0.35 * f.length * t * t, flutter: (_i, t) => 0.09 * t }, [0.15, 1]);
    }
    if (lod < 2) trunk.tube(spine.filter((_, i) => i % 2 === 0), taper(Math.floor(segs / 2) + 1, 0.05, 0.012), lod === 0 ? 4 : 3, hsl(60, 35, 55).multiplyScalar(1.4), { sway: (i) => topSway + 0.35 * f.length * ((2 * i) / segs) ** 2 }, 1, 1);
  }
  // a bunch of coconuts under the crown
  if (lod < 2) {
    const nut = new THREE.IcosahedronGeometry(1, lod === 0 ? 1 : 0);
    const count = lod === 0 ? plan.nuts : Math.ceil(plan.nuts / 2);
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2, d = plan.r0 * (1.1 + r() * 0.6);
      const p = top.clone().add(V(Math.cos(a) * d, -0.35 - r() * 0.4, Math.sin(a) * d));
      const s = 0.13 + r() * 0.04;
      const m = new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(r(), r(), r())), V(s, s * 1.2, s));
      const ripe = r();
      const c = ripe < 0.55 ? hsl(85, 50, 40) : ripe < 0.85 ? hsl(48, 70, 50) : hsl(28, 45, 30);
      nuts.geometry(nut, m, c, { sway: topSway });
    }
  }
  return assemble('Coconut palm', lod, [{ geo: trunk, mat: trunkMat() }, { geo: fronds, mat: frondMat() }, { geo: nuts, mat: nutMat() }]);
}

// ---------------------------------------------------------------- coral materials

// Value noise in the coral's own frame; brain coral draws meandering grooves from its iso-lines, the others
// a skin of corallite cups. Both shade the normal from the pattern's screen-space slope.
const CORAL_HEAD = /* glsl */ `
varying vec3 vCoralP;
float cHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float cNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(cHash(i), cHash(i + vec3(1, 0, 0)), f.x), mix(cHash(i + vec3(0, 1, 0)), cHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(cHash(i + vec3(0, 0, 1)), cHash(i + vec3(1, 0, 1)), f.x), mix(cHash(i + vec3(0, 1, 1)), cHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
// -1 (deep groove or pore) to 1 (ridge or cup rim); flattened where the pattern is finer than a pixel
float coralHeight(vec3 p) {
#ifdef CORAL_BRAIN
  float n = cNoise(p * CORAL_FREQ) * 0.62 + cNoise(p * CORAL_FREQ * 2.1 + 7.0) * 0.28 + cNoise(p * CORAL_FREQ * 4.3) * 0.1;
  float f = n * 10.0;
  float h = cos(6.2832 * f);
  return h * (1.0 - smoothstep(0.2, 0.55, fwidth(f)));
#else
  float c = cNoise(p * CORAL_FREQ) * 0.75 + cNoise(p * CORAL_FREQ * 2.3 + 3.0) * 0.25;
  float h = smoothstep(0.5, 0.68, c) * 2.0 - 1.0 - 0.8 * smoothstep(0.72, 0.8, c);
  return h * (1.0 - smoothstep(0.08, 0.25, fwidth(c)));
#endif
}
vec3 coralBump(vec3 surf, vec3 n, float h, float k) {
  vec3 sx = dFdx(surf), sy = dFdy(surf);
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2) * k;
  return normalize(abs(det) * n - grad);
}
`;

function coralPatch(kind: 'brain' | 'polyp', freq: number, bump: number) {
  return (s: THREE.WebGLProgramParametersWithUniforms) => {
    s.defines = s.defines ?? {};
    s.defines.CORAL_FREQ = freq.toFixed(2);
    if (kind === 'brain') s.defines.CORAL_BRAIN = '';
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCoralP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCoralP = position;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\n' + CORAL_HEAD)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float cH = coralHeight(vCoralP);
        diffuseColor.rgb *= ${kind === 'brain' ? '0.78 + cH * 0.22' : '0.85 + cH * 0.15'};`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = coralBump(-vViewPosition, normal, cH, ${bump.toFixed(3)});`);
  };
}

const branchMat = () => plantMaterial('coralAtolls-branch', () => ({ roughness: 0.75, patch: coralPatch('polyp', 70, 0.004) }));
const brainMat = () => plantMaterial('coralAtolls-brain', () => ({ roughness: 0.7, patch: coralPatch('brain', 7, 0.012) }));
const plateMat = () => plantMaterial('coralAtolls-plate', () => ({ roughness: 0.75, doubleSide: true, patch: coralPatch('polyp', 55, 0.004) }));
const rubbleMat = () => plantMaterial('coralAtolls-rubble', () => {
  const map = scanTexture('coral_rubble_d.jpg', true), normalMap = scanTexture('coral_rubble_n.jpg', false);
  return { map, normalMap, roughness: 0.95 };
});

/** The sea fan's lattice: a trunk forking into fine branches, laced with cross-links, on a transparent ground. */
function fanTexture(): THREE.Texture {
  return paintedTexture('coralAtolls-seafan', 512, 512, (g, w, h) => {
    const r = rng(19);
    g.lineCap = 'round';
    const branch = (x: number, y: number, a: number, len: number, width: number, depth: number) => {
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      g.strokeStyle = css(30, 15, 82 + r() * 12);
      g.lineWidth = width;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo((x + x2) / 2 + (r() - 0.5) * len * 0.3, (y + y2) / 2, x2, y2);
      g.stroke();
      if (depth > 0) {
        branch(x2, y2, a - 0.35 - r() * 0.25, len * 0.78, width * 0.72, depth - 1);
        branch(x2, y2, a + 0.35 + r() * 0.25, len * 0.78, width * 0.72, depth - 1);
      }
    };
    branch(w / 2, h, -Math.PI / 2, h * 0.2, 10, 6);
    // the mesh between the branches, kept inside the fan's outline
    g.save();
    g.beginPath();
    g.ellipse(w / 2, h * 0.95, w * 0.48, h * 0.9, 0, Math.PI, 0);
    g.clip();
    g.strokeStyle = css(30, 15, 85, 0.85);
    g.lineWidth = 1.6;
    for (let i = 0; i < 900; i++) {
      const x = r() * w, y = r() * h, a = r() * Math.PI, l = 8 + r() * 14;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
    g.restore();
  });
}
const seaFanMat = () => plantMaterial('coralAtolls-seafan', () => ({ map: fanTexture(), roughness: 0.8, leaf: 0.25, surge: true }));

// pinks and oranges, with the odd lilac and ochre
const CORAL_COLOURS = [
  [338, 85, 62], [328, 80, 55], [8, 88, 62], [20, 95, 56], [28, 90, 64], [2, 80, 55], [348, 75, 70], [285, 45, 62], [38, 85, 55],
] as const;
const coralColour = (r: Rand): THREE.Color => {
  const [h, s, l] = CORAL_COLOURS[Math.floor(r() * CORAL_COLOURS.length)];
  return hsl(h + (r() - 0.5) * 10, s, l + (r() - 0.5) * 8);
};

// ---------------------------------------------------------------- the corals, each written into a Geo

/** Staghorn: forking cylinders reaching up and out, pale at the growing tips. */
function branching(geo: Geo, seed: number, lod: Lod): void {
  const r = rng(seed);
  const col = coralColour(r), tip = mix(col, hsl(40, 60, 92), 0.6);
  const size = 0.5 + r() * 0.7;
  const sides = lod === 0 ? 5 : lod === 1 ? 4 : 3;
  const maxDepth = lod === 0 ? 3 : lod === 1 ? 2 : 1;
  const limb = (from: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number) => {
    const path = grow(from, dir, len, 2, r, 0.25, V(0, 0.05, 0));
    const end = path[path.length - 1];
    const ends = depth >= maxDepth;
    geo.tube(path, taper(path.length, rad, rad * 0.75), sides, (_i, t) => mix(col, tip, ends ? t * t : 0), {}, 1, 3, ends);
    if (ends) return;
    const forks = 2 + (r() < 0.4 ? 1 : 0);
    for (let k = 0; k < forks; k++) {
      const d = dir.clone().add(V((r() - 0.5) * 1.2, 0.3 + r() * 0.3, (r() - 0.5) * 1.2)).normalize();
      limb(end, d, len * (0.65 + r() * 0.2), rad * 0.75, depth + 1);
    }
  };
  const n = 5 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const d = dirAt((i / n) * Math.PI * 2 + r() * 0.6, 0.35 + r() * 0.45);
    limb(V((r() - 0.5) * 0.1, -0.05, (r() - 0.5) * 0.1), d, size * (0.45 + r() * 0.2), 0.03 + r() * 0.01, 0);
  }
}

/** Brain coral: a lumpy dome; the grooves are drawn by its material. */
function brain(geo: Geo, seed: number, lod: Lod): void {
  const r = rng(seed);
  const R = 0.25 + r() * 0.45, flat = 0.55 + r() * 0.3;
  const g = new THREE.SphereGeometry(1, lod === 0 ? 28 : lod === 1 ? 14 : 8, lod === 0 ? 12 : lod === 1 ? 6 : 3, 0, Math.PI * 2, 0, Math.PI * 0.62);
  const P = g.getAttribute('position');
  const o = r() * 10;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const k = 1 + 0.1 * Math.sin(x * 3 + o) * Math.cos(z * 2.6 - o) + 0.06 * Math.sin(y * 5 + x * 2 + o);
    P.setXYZ(i, x * R * k, (y - 0.25) * R * flat * k, z * R * k);
  }
  g.computeVertexNormals();
  const col = r() < 0.5 ? hsl(28 + r() * 15, 75, 58) : coralColour(r);
  const rim = mix(col, hsl(20, 30, 40), 0.4);
  geo.geometry(g, new THREE.Matrix4(), (p) => mix(rim, col, Math.min(1, Math.max(0, (p.y + 0.05) / (R * flat * 0.6)))));
}

/** Plate coral: a few frilled, cupped plates stacked on a short stalk, rimmed paler. */
function plates(geo: Geo, seed: number, lod: Lod): void {
  const r = rng(seed);
  const col = coralColour(r), rim = mix(col, hsl(35, 70, 88), 0.55);
  const sectors = lod === 0 ? 28 : lod === 1 ? 14 : 7, rings = lod === 0 ? 4 : lod === 1 ? 2 : 1;
  const n = 1 + Math.floor(r() * 3);
  const stalkTop = V(0, 0.15 + r() * 0.15, 0);
  geo.tube([V(0, -0.05, 0), stalkTop], [0.06, 0.045], lod === 0 ? 6 : 4, mix(col, hsl(20, 20, 35), 0.5));
  for (let k = 0; k < n; k++) {
    const R = (0.35 + r() * 0.45) * (1 - k * 0.25);
    const c = stalkTop.clone().add(V((r() - 0.5) * 0.2 * k, k * (0.12 + r() * 0.08), (r() - 0.5) * 0.2 * k));
    const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.35, r() * 6.28, (r() - 0.5) * 0.35));
    const base = geo.count, ph = r() * 6.28, cup = 0.15 + r() * 0.15;
    for (let i = 0; i <= rings; i++) {
      const t = i / rings, rad = R * (0.08 + 0.92 * t);
      for (let s = 0; s <= sectors; s++) {
        const a = (s / sectors) * Math.PI * 2;
        const frill = Math.sin(a * 7 + ph) * 0.05 * R * t * t + Math.sin(a * 3 - ph) * 0.03 * R * t;
        const p = V(Math.cos(a) * rad, cup * rad * t + frill, Math.sin(a) * rad).applyQuaternion(tilt).add(c);
        const nn = V(-Math.cos(a) * cup * t, 1, -Math.sin(a) * cup * t).normalize().applyQuaternion(tilt);
        geo.vert(p, nn, s / sectors, t, mix(col, rim, smooth(Math.max(0, (t - 0.6) / 0.4))));
      }
    }
    for (let i = 0; i < rings; i++)
      for (let s = 0; s < sectors; s++) {
        const a = base + i * (sectors + 1) + s;
        geo.quad(a, a + sectors + 1, a + sectors + 2, a + 1);
      }
  }
}

/** A sea fan: a curved lattice standing across the current, rocking with the swell. */
function seaFan(geo: Geo, seed: number, lod: Lod): void {
  const r = rng(seed);
  const H = 0.5 + r() * 0.7, W = H * (0.9 + r() * 0.4), bow = 0.08 + r() * 0.1;
  const col = r() < 0.6 ? hsl(295 + r() * 25, 55, 60) : hsl(15 + r() * 15, 80, 58);
  const nu = lod === 0 ? 8 : lod === 1 ? 4 : 2, nv = lod === 0 ? 6 : lod === 1 ? 3 : 1;
  const a = r() * Math.PI, right = V(Math.cos(a), 0, Math.sin(a)), out = V(-Math.sin(a), 0, Math.cos(a));
  const base = geo.count;
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv, x = u - 0.5;
      const p = right.clone().multiplyScalar(x * W).add(V(0, v * H - 0.03, 0)).addScaledVector(out, bow * W * (1 - 4 * x * x) * v);
      const n = out.clone().addScaledVector(right, x * bow * 4).normalize();
      geo.vert(p, n, u, v, col, 0.07 * H * v * v, 0.01 * v);
    }
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const q = base + j * (nu + 1) + i;
      geo.quad(q, q + 1, q + nu + 2, q + nu + 1);
    }
}

// ---------------------------------------------------------------- the coral garden: a rubble mound planted with all of them

interface CoralSet { branch: Geo; brain: Geo; plate: Geo; fan: Geo; rubble: Geo }
const newSet = (): CoralSet => ({ branch: new Geo(), brain: new Geo(), plate: new Geo(), fan: new Geo(), rubble: new Geo() });
const coralParts = (s: CoralSet) => [
  { geo: s.rubble, mat: rubbleMat() }, { geo: s.branch, mat: branchMat() }, { geo: s.brain, mat: brainMat() }, { geo: s.plate, mat: plateMat() }, { geo: s.fan, mat: seaFanMat() },
];

function buildGarden(seed: number, lod: Lod): THREE.Object3D {
  const r = rng(seed);
  const set = newSet();
  const R = 2 + r() * 1.8, Hm = 0.3 + r() * 0.3;
  const mound = (x: number, z: number) => {
    const d = Math.min(1, Math.hypot(x, z * 1.2) / R);
    return Hm * Math.pow(1 - d * d, 1.4) * (1 + 0.15 * Math.sin(x * 2.3 + seed) * Math.cos(z * 1.9));
  };
  // the mound, its uvs laid flat so the rubble scan tiles across it
  const segs = lod === 0 ? 24 : lod === 1 ? 12 : 6;
  const base = set.rubble.count;
  for (let j = 0; j <= segs; j++)
    for (let i = 0; i <= segs; i++) {
      const x = (i / segs - 0.5) * 2.3 * R, z = (j / segs - 0.5) * 2.3 * R / 1.2;
      const y = mound(x, z) - 0.04, e = 0.05;
      const n = V(mound(x - e, z) - mound(x + e, z), 2 * e, mound(x, z - e) - mound(x, z + e)).normalize();
      set.rubble.vert(V(x, y, z), n, x / 1.5, z / 1.5, hsl(40, 20, 80).multiplyScalar(1.2));
    }
  for (let j = 0; j < segs; j++)
    for (let i = 0; i < segs; i++) {
      const a = base + j * (segs + 1) + i;
      set.rubble.quad(a, a + segs + 1, a + segs + 2, a + 1);
    }
  const place = (fill: (g: Geo, seed: number, lod: Lod) => void, target: Geo, count: number, spread: number, scale: number) => {
    for (let k = 0; k < count; k++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R * spread;
      const x = Math.cos(a) * d, z = Math.sin(a) * d / 1.2;
      const g = new Geo();
      fill(g, Math.floor(r() * 1e6), lod);
      const s = scale * (0.7 + r() * 0.5);
      target.append(g, new THREE.Matrix4().compose(V(x, mound(x, z), z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), r() * 6.28), V(s, s, s)));
    }
  };
  const k = lod === 2 ? 0.5 : 1;
  place(brain, set.brain, Math.round((3 + r() * 3) * k), 0.8, 1);
  place(brain, set.brain, Math.round((4 + r() * 4) * k), 0.95, 0.35);
  place(branching, set.branch, Math.round((4 + r() * 4) * k), 0.85, 0.9);
  place(plates, set.plate, Math.round((3 + r() * 3) * k), 0.85, 0.9);
  place(seaFan, set.fan, Math.round((2 + r() * 3) * k), 0.9, 1);
  return assemble('Coral garden', lod, coralParts(set));
}

const single = (name: string, fill: (g: Geo, seed: number, lod: Lod) => void, key: keyof CoralSet) => (seed: number, lod: Lod): THREE.Object3D => {
  const set = newSet();
  fill(set[key], seed, lod);
  return assemble(name, lod, coralParts(set));
};

// ---------------------------------------------------------------- the region's list

export const PLANTS: Plant[] = [
  {
    id: 'coconutPalm',
    name: 'Coconut palm',
    build: buildCoconut,
    // rings the islets, leaning out over the lagoon: the build leans along +x, so turn +x towards open water
    placement: { minHeight: 0.5, maxHeight: 12, maxSlope: 25, density: 0.9, cluster: 10 },
  },
  {
    id: 'coralGarden',
    name: 'Coral garden',
    build: buildGarden,
    // patches on the lagoon floor and reef flats, clear of the ship lanes' keels
    placement: { minHeight: -8, maxHeight: -1.6, maxSlope: 25, density: 0.5, cluster: 14 },
  },
  {
    id: 'branchingCoral',
    name: 'Staghorn coral',
    build: single('Staghorn coral', branching, 'branch'),
    placement: { minHeight: -9, maxHeight: -1.6, maxSlope: 30, density: 4, cluster: 4 },
  },
  {
    id: 'brainCoral',
    name: 'Brain coral',
    build: single('Brain coral', brain, 'brain'),
    placement: { minHeight: -12, maxHeight: -1.8, maxSlope: 30, density: 2.5, cluster: 6 },
  },
  {
    id: 'plateCoral',
    name: 'Plate coral',
    build: single('Plate coral', plates, 'plate'),
    placement: { minHeight: -14, maxHeight: -2, maxSlope: 35, density: 2.5, cluster: 5 },
  },
  {
    id: 'seaFan',
    name: 'Sea fan',
    build: single('Sea fan', seaFan, 'fan'),
    // on the reef's outer slopes, facing the swell
    placement: { minHeight: -16, maxHeight: -2.5, maxSlope: 60, density: 1.2, cluster: 4 },
  },
];
