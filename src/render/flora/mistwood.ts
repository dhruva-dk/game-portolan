// Mistwood's plants: giant cedars that tower 40–60 m with dark tops above the fog, sword ferns, hanging moss and the
// fallen giants lying half in the still water. Cedar bark is scanned (Japanese cedar, Poly Haven) with scanned moss
// (ambientCG) growing over roots, trunk bases and logs; sprays, fronds and moss strands are painted in code.
import * as THREE from 'three';
import {
  Atlas, Geo, V, assemble, barkMaterial, between, cardAlong, cardMaterial, hsl, leaf, lerp, lodOf, perpendicular, rng,
  seedFor, smooth, stroke, wander, type Plant, type VertexWind,
} from './kitA.ts';

// ---------------------------------------------------------------- the atlas

/** A flat western-red-cedar spray: an axis of scale leaves with alternate branchlets, all in one plane. */
function spray(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, ang: number, len: number, wid: number, depth: number, light: number): void {
  const steps = Math.max(3, Math.round(len / (wid * 0.7)));
  let a = ang, px = x, py = y;
  const pts: [number, number, number][] = [];
  for (let i = 0; i < steps; i++) {
    a += (r() - 0.5) * 0.06 + 0.012; // a slight droop to one side
    px += Math.cos(a) * (len / steps);
    py += Math.sin(a) * (len / steps);
    pts.push([px, py, a]);
  }
  if (depth > 0) {
    const n = 7 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const t = 0.08 + (0.84 * k) / n, [bx, by, ba] = pts[Math.floor(t * (pts.length - 1))];
      const side = k % 2 ? 1 : -1;
      spray(g, r, bx, by, ba + side * (0.5 + r() * 0.3), len * (0.52 - t * 0.34) * (0.8 + r() * 0.3), wid * 0.74, depth - 1, light);
    }
  }
  pts.forEach(([sx, sy, sa], i) => {
    const t = i / pts.length, w = wid * (1 - t * 0.55);
    const l = light + (r() - 0.5) * 8 + t * 6;
    g.fillStyle = hsl(156 + r() * 14, 26 + r() * 12, l);
    g.beginPath();
    g.ellipse(sx, sy, w * 0.95, w * 0.55, sa, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = hsl(128 + r() * 20, 30, l + 10, 0.7);
    g.lineWidth = Math.max(0.6, w * 0.16);
    g.beginPath();
    g.ellipse(sx, sy, w * 0.95, w * 0.55, sa, 0.2, 2.6);
    g.stroke();
  });
}

/** A sword-fern frond, base at the bottom: a dark rachis with pairs of toothed, auricled pinnae. */
function frond(g: CanvasRenderingContext2D, w: number, h: number, r: () => number, cx: number, top: number, scale: number, hue: number): void {
  stroke(g, cx, h, -Math.PI / 2, h - top, 3 * scale, hsl(60, 25, 16), 0.02);
  const n = 32;
  for (let i = 0; i < n; i++) {
    const t = i / n, y = h - 10 - t * (h - top - 12);
    const L = w * 0.45 * scale * Math.pow(Math.sin(Math.PI * (0.1 + 0.9 * t)), 0.45) * (1 - t * 0.55);
    for (const side of [-1, 1]) {
      const a = side < 0 ? Math.PI + 0.42 + t * 0.25 : -0.42 - t * 0.25;
      const l = 20 + r() * 12 - t * 4;
      leaf(g, cx, y, a, L, L * 0.2, hsl(hue + r() * 14, 46 + r() * 12, l), hsl(hue - 10, 40, l + 14, 0.55));
      // the auricle: a small lobe on the upper side of the pinna's base
      leaf(g, cx + Math.cos(a) * L * 0.08, y + Math.sin(a) * L * 0.08 - 2, a - side * 0.9, L * 0.16, L * 0.07, hsl(hue, 46, l + 2));
      // teeth along the margin
      g.fillStyle = hsl(hue, 46, l - 2);
      for (let k = 2; k < 7; k++) {
        const s = k / 8, px = cx + Math.cos(a) * L * s, py = y + Math.sin(a) * L * s;
        g.beginPath();
        g.arc(px - Math.sin(a) * L * 0.17 * (1 - s * 0.7), py - 1.5, 1.4 * scale, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
}

const atlas = new Atlas('mistwood', 1024, {
  // a hanging spray, attached at the bottom edge and extending to the top
  spray: {
    x: 0, y: 0, w: 512, h: 512,
    paint: (g, w, h, r) => {
      spray(g, r, w * 0.5, h, -Math.PI / 2 + (r() - 0.5) * 0.1, h * 0.94, 15, 3, 25);
    },
  },
  // a dense mass of sprays, for far crowns
  far: {
    x: 512, y: 0, w: 512, h: 512,
    paint: (g, w, h, r) => {
      for (let k = 0; k < 9; k++) spray(g, r, w * (0.25 + r() * 0.5), h, -Math.PI / 2 + (r() - 0.5) * 1.2, h * (0.6 + r() * 0.35), 16, 2, 17 + k * 1.2);
    },
  },
  frond: {
    x: 0, y: 512, w: 256, h: 512,
    paint: (g, w, h, r) => frond(g, w, h, r, w / 2, 6, 1, 104),
  },
  // hanging moss strands, anchored at the bottom edge and hanging to the top
  moss: {
    x: 256, y: 512, w: 256, h: 512,
    paint: (g, w, h, r) => {
      for (let i = 0; i < 90; i++) {
        let x = w * (0.08 + r() * 0.84), y = h;
        const len = h * (0.35 + r() * 0.63), steps = 26;
        const l = 42 + r() * 26, col = hsl(78 + r() * 22, 14 + r() * 14, l, 0.95);
        for (let s = 0; s < steps; s++) {
          const t = s / steps, nx = x + (r() - 0.5) * 7, ny = y - len / steps;
          stroke(g, x, y, Math.atan2(ny - y, nx - x), Math.hypot(nx - x, ny - y), 2.8 * (1 - t * 0.7), col);
          if (r() < 0.25) stroke(g, nx, ny, -Math.PI / 2 + (r() - 0.5) * 1.6, 6 + r() * 14, 1.2, hsl(80, 16, l + 8, 0.9));
          x = nx;
          y = ny;
        }
      }
    },
  },
  // a whole fern from the side, for far ferns
  fernFar: {
    x: 512, y: 512, w: 512, h: 512,
    paint: (g, w, h, r) => {
      for (let i = 0; i < 16; i++) {
        const a0 = -Math.PI / 2 + (i / 15 - 0.5) * 2.6 + (r() - 0.5) * 0.2, len = h * (0.55 + r() * 0.35);
        let x = w / 2, y = h, a = a0;
        for (let s = 0; s < 20; s++) {
          const t = s / 20, nx = x + Math.cos(a) * len / 20, ny = y + Math.sin(a) * len / 20;
          stroke(g, x, y, a, len / 20, 2.5, hsl(70, 25, 18));
          const L = 26 * (1 - t * 0.7) + 6;
          for (const side of [-1, 1]) leaf(g, nx, ny, a + side * 1.2, L, L * 0.22, hsl(100 + r() * 16, 45, 18 + r() * 12));
          a += (a < -Math.PI / 2 ? -1 : 1) * 0.06;
          x = nx;
          y = ny;
        }
      }
    },
  },
});

const CEDAR = 'mistwood-giant-cedar', FERN = 'mistwood-sword-fern', MOSS = 'mistwood-hanging-moss', LOG = 'mistwood-fallen-giant';
const Y = V(0, 1, 0);

// ---------------------------------------------------------------- shared pieces

/** A sword fern from the origin: arching fronds in a fountain. size scales it (1 is about 1.2 m fronds). */
function swordFern(g: Geo, r: () => number, L: 0 | 1 | 2, size: number): void {
  if (L === 2) {
    const c = atlas.cell('fernFar');
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI + r() * 0.3;
      g.card(V(0, -0.05, 0), V(Math.cos(a), 0, Math.sin(a)), Y, 2.4 * size, 1.25 * size, c, { anchor: [0.5, 0], wind: { phase: a, branch: 0, flutter: 0.04 } });
    }
    return;
  }
  const n = Math.round([30, 12][L] * (0.75 + r() * 0.5)), segs = [5, 3][L];
  const cell = atlas.cell('frond');
  for (let i = 0; i < n; i++) {
    const az = i * 2.39996 + r() * 0.5, len = size * between(r, 0.75, 1.35), e0 = between(r, 0.85, 1.3) - (i % 3) * 0.16;
    const out = V(Math.cos(az), 0, Math.sin(az));
    const side0 = V(-Math.sin(az), 0, Math.cos(az));
    const path = [V(0, -0.02, 0)], sides = [side0], widths = [0.2 * size * (L ? 1.25 : 1)];
    let p = V(0, -0.02, 0);
    for (let s = 1; s <= segs; s++) {
      const t = s / segs, e = e0 - t * (e0 + 0.55);
      p = p.clone().addScaledVector(out, (Math.cos(e) * len) / segs).addScaledVector(Y, (Math.sin(e) * len) / segs);
      path.push(p);
      const roll = (r() - 0.5) * 0.5 * t;
      sides.push(side0.clone().multiplyScalar(Math.cos(roll)).addScaledVector(Y, Math.sin(roll)).normalize());
      widths.push(widths[0]);
    }
    const phase = az * 5 + i;
    g.ribbon(path, widths, sides, cell, {
      up: Y,
      shade: (t) => 0.5 + 0.5 * t,
      wind: (t): VertexWind => ({ phase, branch: 0.07 * t * len, flutter: 0.035 * t }),
    });
  }
}

/** Strands of hanging moss from a twig: from anchor, spread along `along` over `width`, hanging up to `length`. */
function mossCurtain(g: Geo, r: () => number, L: 0 | 1 | 2, anchor: THREE.Vector3, along: THREE.Vector3, width: number, length: number): void {
  const n = Math.max(1, Math.round([10, 4, 2][L] * Math.min(2, width + 0.4)));
  const segs = [4, 2, 1][L], cell = atlas.cell('moss');
  for (let i = 0; i < n; i++) {
    const start = anchor.clone().addScaledVector(along, (r() - 0.5) * width);
    const len = length * between(r, 0.45, 1);
    const yaw = r() * Math.PI;
    const side = along.clone().applyAxisAngle(Y, yaw - Math.PI / 2).setY(0).normalize();
    const path = [start], sides = [side], widths = [between(r, 0.3, 0.5) * (L ? 1.4 : 1)];
    for (let s = 1; s <= segs; s++) {
      path.push(start.clone().add(V((r() - 0.5) * 0.15, (-len * s) / segs, (r() - 0.5) * 0.15)));
      sides.push(side);
      widths.push(widths[0] * (1 - s / segs * 0.3));
    }
    const phase = r() * 6.28;
    g.ribbon(path, widths, sides, cell, {
      shade: (t) => 0.95 - t * 0.25,
      wind: (t): VertexWind => ({ phase, branch: 0.12 * t * len, flutter: 0.1 * t }),
    });
  }
}

// ---------------------------------------------------------------- the giant cedar

function giantCedar(seed: number, lod: number): THREE.Object3D {
  const r = rng(seedFor(CEDAR, seed)), L = lodOf(lod);
  const H = between(r, 40, 60), R = H * between(r, 0.032, 0.04);
  const bark = new Geo(), cards = new Geo();
  const bend = (p: THREE.Vector3) => 0.011 * H * Math.pow(Math.max(0, p.y) / H, 2);
  bark.bend = cards.bend = bend;
  cards.tint.setRGB(between(r, 0.72, 0.86), between(r, 0.84, 0.96), between(r, 0.86, 0.98));

  // the trunk: buttressed and fluted at the foot, tapering into a spire
  const rings = [30, 13, 6][L], sides = [16, 8, 5][L];
  const ph = r() * 6.28, sway = V((r() - 0.5) * 0.04, 0, (r() - 0.5) * 0.04);
  const path: THREE.Vector3[] = [], radii: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const t = Math.pow(i / rings, 1.25), y = H * t;
    path.push(V(Math.sin(t * 5 + ph) * 0.25 + sway.x * y, y, Math.cos(t * 4 + ph) * 0.25 + sway.z * y));
    radii.push(R * Math.pow(1 - 0.93 * t, 1.05) + R * 0.85 * Math.exp(-y / 2.2) + 0.04);
  }
  const axisAt = (y: number) => {
    const t = Math.pow(Math.min(1, y / H), 1 / 1.25) * rings, i = Math.min(rings - 1, Math.floor(t));
    return path[i].clone().lerp(path[i + 1], t - i);
  };
  const radiusAt = (y: number) => R * Math.pow(1 - 0.93 * Math.min(1, y / H), 1.05) + R * 0.85 * Math.exp(-y / 2.2);
  bark.tube(path, radii, {
    sides,
    uRepeat: Math.max(3, Math.round((2 * Math.PI * R) / 0.9)),
    vMetres: 2.0,
    shape: (a, t) => 1 + 0.2 * Math.exp(-t * H / 4) * Math.pow(Math.abs(Math.sin(a * 3 + ph)), 3) + 0.035 * Math.sin(a * 11 + ph * 2),
    shade: (t) => 0.68 + 0.32 * smooth(0, 0.35, t),
    cover: (t) => 0.92 * (1 - smooth(0, 9 / H, t)),
  });

  // buttress roots: they leave the flared foot inside the trunk and arch down into the moss
  if (L < 2) {
    const n = 6 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + r() * 0.5, out = V(Math.cos(a), 0, Math.sin(a));
      const h0 = R * between(r, 1.4, 2.4), len = between(r, 3, 6.5), pts: THREE.Vector3[] = [];
      for (let s = 0; s <= 5; s++) {
        const t = s / 5;
        pts.push(out.clone().multiplyScalar(R * 0.45 + t * (R * 0.9 + len)).add(V((r() - 0.5) * 0.25 * t, h0 * Math.pow(1 - t, 2.4) - 0.5 * t, (r() - 0.5) * 0.25 * t)));
      }
      bark.tube(pts, [R * 0.72, R * 0.55, R * 0.38, R * 0.25, 0.2, 0.1], { sides: [8, 5][L], uRepeat: 3, vMetres: 2.2, shade: (t) => 0.62 + 0.2 * t, cover: (t) => 0.5 + 0.4 * t });
    }
  }

  const crownBase = H * between(r, 0.4, 0.52);
  // dead stubs below the crown, some draped in hanging moss
  const stubs = [12, 5, 0][L];
  for (let k = 0; k < stubs; k++) {
    const y = lerp(H * 0.2, crownBase, r()), a = r() * 6.28, out = V(Math.cos(a), between(r, -0.35, 0.15), Math.sin(a)).normalize();
    const from = axisAt(y).addScaledVector(V(out.x, 0, out.z).normalize(), radiusAt(y) * 0.8);
    const pts = wander(from, out, between(r, 0.6, 2.6), 2, r, 0.3);
    bark.tube(pts, [0.13, 0.08, 0.035], { sides: 4, vMetres: 2.2, shade: () => 0.5, color: () => new THREE.Color(0.7, 0.7, 0.7), cover: () => 0.6 });
    if (r() < 0.6) mossCurtain(cards, r, L, pts[2], perpendicular(out).setY(0).normalize(), 0.8, between(r, 1.2, 3.2));
  }

  // the crown: J-shaped branches hung with drooping sprays, sparse and dark
  if (L < 2) {
    const nb = Math.round([44, 18][L] * (H / 50));
    const spray = atlas.cell('spray'), sz = L ? 1.6 : 1;
    for (let k = 0; k < nb; k++) {
      const t = k / (nb - 1), y = lerp(crownBase, H * 0.96, Math.pow(t, 0.9));
      const a = k * 2.39996 + r() * 0.6, out = V(Math.cos(a), 0, Math.sin(a));
      const len = H * 0.17 * Math.pow(1 - t, 0.8) * between(r, 0.75, 1.15) + 1.2;
      const from = axisAt(y).addScaledVector(out, radiusAt(y) * 0.7);
      const pts: THREE.Vector3[] = [];
      for (let s = 0; s <= 4; s++) {
        const u = s / 4;
        pts.push(from.clone().addScaledVector(out, len * u).add(V(0, -len * 0.32 * Math.sin(Math.PI * u * 0.8) * (1 - t * 0.5) + len * 0.2 * u * u * u, 0)));
      }
      const phase = a * 3 + k, bw = (u: number): VertexWind => ({ phase, branch: 0.045 * u * len, flutter: 0 });
      const rb = 0.05 + 0.022 * len;
      bark.tube(pts, [rb, rb * 0.75, rb * 0.5, rb * 0.32, 0.03], { sides: [5, 3][L], vMetres: 2.2, wind: bw, shade: () => 0.55, cover: () => 0.25 });
      const ns = Math.max(1, Math.round(len / [0.34, 1.0][L]));
      const crownC = axisAt(y - 1.5);
      for (let j = 0; j < ns; j++) {
        const u = 0.1 + (0.9 * (j + r() * 0.6)) / ns, i = Math.min(3, Math.floor(u * 4));
        const p = pts[i].clone().lerp(pts[i + 1], u * 4 - i);
        const shade = 0.62 + 0.38 * t + (r() - 0.5) * 0.12;
        const w = { phase, branch: 0.045 * u * len, flutter: 0.05 };
        // a spray hanging out and down from the branch
        const hang = out.clone().multiplyScalar(between(r, 0.25, 0.6)).add(V((r() - 0.5) * 0.5, -1, (r() - 0.5) * 0.5)).normalize();
        cardAlong(cards, p, hang, r() * Math.PI, between(r, 1.8, 2.6) * sz, between(r, 2.3, 3.2) * sz, spray, { crown: crownC, shade, wind: w });
        // and one lying along the top of the branch, so the crown is full from above
        if (j % 2 === 0) cardAlong(cards, p.clone().addScaledVector(out, -0.4), out.clone().add(V(0, 0.15, 0)), Math.PI / 2 + (r() - 0.5) * 0.4, 1.8 * sz, 2.4 * sz, spray, { crown: crownC, shade: shade * 1.05, wind: w });
      }
    }
    // the leader, and sometimes a dead spike above the crown (the candelabra top that shows above the fog)
    const top = axisAt(H * 0.97);
    if (r() < 0.4) {
      for (let k = 0; k < 2 + Math.floor(r() * 2); k++) {
        const pts = wander(top, V((r() - 0.5) * 0.5, 1, (r() - 0.5) * 0.5), between(r, 2.5, 6), 3, r, 0.25);
        bark.tube(pts, [0.12, 0.08, 0.05, 0.02], { sides: 4, vMetres: 2.2, color: () => new THREE.Color(0.62, 0.62, 0.64) });
      }
    } else {
      for (let k = 0; k < 4; k++) cardAlong(cards, top.clone().add(V(0, k * 0.4, 0)), V((r() - 0.5) * 0.6, 1, (r() - 0.5) * 0.6), r() * 3.14, 1.4, 2.4, spray, { anchor: [0.5, 0.1], shade: 1, wind: { phase: k, branch: 0.1, flutter: 0.05 } });
    }
  } else {
    // the far silhouette: tiers of big drooping masses up a narrow spire
    const far = atlas.cell('far'), tiers = 10;
    for (let k = 0; k < tiers; k++) {
      const t = k / (tiers - 1), y = lerp(crownBase, H * 0.97, t), w = H * 0.13 * Math.pow(1 - t, 0.8) + 1.2;
      for (let j = 0; j < 3; j++) {
        const a = j * 2.09 + k * 1.1 + r() * 0.4, out = V(Math.cos(a), 0, Math.sin(a));
        const hang = out.clone().multiplyScalar(0.7).add(V(0, -0.55, 0)).normalize();
        cardAlong(cards, axisAt(y).add(V(0, 1.5, 0)), hang, Math.PI / 2, w * 1.05, w * 0.95 + 3, far, { anchor: [0.5, 0], crown: axisAt(y - 2), shade: 0.6 + 0.4 * t, wind: { phase: a, branch: 0.1, flutter: 0 } });
      }
    }
  }
  return assemble(CEDAR, L, [{ geo: bark, mat: barkMaterial('cedar', 'moss') }, { geo: cards, mat: cardMaterial(atlas) }]);
}

// ---------------------------------------------------------------- the sword fern

function swordFernPlant(seed: number, lod: number): THREE.Object3D {
  const r = rng(seedFor(FERN, seed)), L = lodOf(lod);
  const cards = new Geo();
  cards.bend = (p) => 0.03 * Math.max(0, p.y);
  cards.tint.setRGB(between(r, 0.85, 1.0), between(r, 0.92, 1.05), between(r, 0.8, 0.95));
  swordFern(cards, r, L, between(r, 0.85, 1.35));
  return assemble(FERN, L, [{ geo: cards, mat: cardMaterial(atlas) }]);
}

// ---------------------------------------------------------------- hanging moss

/** A curtain of hanging moss on a dead twig. Its origin is the point it hangs from. */
function hangingMoss(seed: number, lod: number): THREE.Object3D {
  const r = rng(seedFor(MOSS, seed)), L = lodOf(lod);
  const bark = new Geo(), cards = new Geo();
  const along = V(1, 0, (r() - 0.5) * 0.4).normalize(), width = between(r, 1.2, 2.6);
  if (L < 2) {
    const pts = wander(along.clone().multiplyScalar(-width * 0.6), along, width * 1.2, 3, r, 0.3);
    bark.tube(pts, [0.07, 0.06, 0.045, 0.03], { sides: [5, 3][L], vMetres: 2.2, color: () => new THREE.Color(0.7, 0.7, 0.7), cover: () => 0.7 });
  }
  cards.tint.setRGB(between(r, 0.9, 1.05), 1, between(r, 0.88, 1.0));
  mossCurtain(cards, r, L, V(), along, width, between(r, 1.6, 3.4));
  return assemble(MOSS, L, [{ geo: bark, mat: barkMaterial('cedar', 'moss') }, { geo: cards, mat: cardMaterial(atlas) }]);
}

// ---------------------------------------------------------------- the fallen giant

/** A fallen cedar along local X, its root plate at -X and its splintered top at +X, sloping down so +X can lie in water. */
function fallenGiant(seed: number, lod: number): THREE.Object3D {
  const r = rng(seedFor(LOG, seed)), L = lodOf(lod);
  const len = between(r, 20, 36), R = between(r, 1.4, 2.3), sink = 0.5;
  const bark = new Geo(), cards = new Geo();
  const rings = [20, 9, 4][L], sides = [16, 9, 5][L], bow = (r() - 0.5) * 1.2;
  const slope = between(r, 0.03, 0.07);
  const path: THREE.Vector3[] = [], radii: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings, x = -len / 2 + len * t;
    const rad = lerp(R * 1.08, R * 0.72, t);
    path.push(V(x, rad * sink - x * slope, Math.sin(t * Math.PI) * bow));
    radii.push(rad);
  }
  bark.tube(path, radii, {
    sides,
    uRepeat: Math.max(3, Math.round((2 * Math.PI * R) / 0.9)),
    vMetres: 2.2,
    shape: (a) => 1 + 0.04 * Math.sin(a * 9) - 0.06 * Math.max(0, -Math.sin(a)),
    shade: () => 0.8,
    cover: (_, n) => Math.min(0.95, Math.max(0, 0.35 + n.y * 0.7)),
    cap: { length: R * 1.4, r, color: new THREE.Color(1.5, 1.15, 0.85) },
  });

  // the upturned root plate: a mossy disc of earth with roots clawing out of it
  const rootX = -len / 2 - 0.2, rootY = R * 1.08 * sink + (len / 2) * slope;
  const plateR = R * between(r, 1.7, 2.3);
  bark.blob(V(rootX, rootY + plateR * 0.25, 0), V(R * 0.55, plateR, plateR * 0.95), {
    r, segs: [[10, 7], [7, 5], [5, 3]][L] as [number, number], rough: 0.35, cover: 0.75, shade: 0.6, uvScale: 4,
  });
  if (L < 2) {
    const nr = [12, 6][L];
    for (let k = 0; k < nr; k++) {
      const a = (k / nr) * Math.PI * 2 + r() * 0.4, d = V(0, Math.cos(a), Math.sin(a));
      const from = V(rootX - 0.2, rootY + plateR * 0.25, 0).addScaledVector(d, plateR * 0.8);
      const pts = wander(from, d.clone().add(V(-0.4, 0, 0)), between(r, 1.2, 3.5), 3, r, 0.5, V(0, d.y < 0 ? -0.1 : 0, 0));
      bark.tube(pts, [0.28, 0.18, 0.1, 0.035], { sides: [5, 3][L], vMetres: 2.2, shade: () => 0.6, color: () => new THREE.Color(0.75, 0.7, 0.65) });
    }
  }

  // broken branch stubs along the top, some draped in moss; ferns rooted in the moss on the log's back
  if (L < 2) {
    const ns = [5, 3][L];
    for (let k = 0; k < ns; k++) {
      const t = 0.2 + r() * 0.7, i = Math.floor(t * rings), c = path[i], rad = radii[i];
      const a = between(r, 0.3, 2.8), out = V((r() - 0.5) * 0.6, Math.sin(a), Math.cos(a)).normalize();
      const pts = wander(c.clone().addScaledVector(out, rad * 0.85), out, between(r, 0.6, 2.4), 2, r, 0.4);
      bark.tube(pts, [0.22, 0.14, 0.06], { sides: [5, 3][L], vMetres: 2.2, cover: () => 0.6, color: () => new THREE.Color(0.8, 0.78, 0.75) });
      if (r() < 0.5) mossCurtain(cards, r, L, pts[2], V(1, 0, 0), 0.7, between(r, 0.8, 1.8));
    }
    const nf = [4, 2][L];
    const m = new THREE.Matrix4();
    for (let k = 0; k < nf; k++) {
      const t = 0.15 + r() * 0.7, i = Math.floor(t * rings), c = path[i];
      m.compose(c.clone().add(V((r() - 0.5) * 2, radii[i] * 0.92, (r() - 0.5) * radii[i] * 0.6)), new THREE.Quaternion().setFromAxisAngle(Y, r() * 6.28), V(1, 1, 1));
      cards.setTransform(m);
      swordFern(cards, r, L, between(r, 0.5, 0.8));
    }
    cards.setTransform(null);
  }
  return assemble(LOG, L, [{ geo: bark, mat: barkMaterial('cedar', 'moss') }, { geo: cards, mat: cardMaterial(atlas) }]);
}

// ---------------------------------------------------------------- the list

export const ATLAS = atlas;

export const PLANTS: Plant[] = [
  {
    id: CEDAR,
    name: 'Giant cedar',
    build: giantCedar,
    placement: { minHeight: 0.4, maxHeight: 45, maxSlope: 28, density: 0.25, cluster: 0.35 },
    lodDistances: [70, 240, 1400],
  },
  {
    id: FERN,
    name: 'Sword fern',
    build: swordFernPlant,
    placement: { minHeight: 0.2, maxHeight: 35, maxSlope: 40, density: 10, cluster: 0.7 },
    lodDistances: [18, 45, 110],
  },
  {
    id: MOSS,
    name: 'Hanging moss',
    build: hangingMoss,
    placement: { minHeight: 0.5, maxHeight: 25, maxSlope: 90, density: 0.6, cluster: 0.8 },
    lodDistances: [20, 50, 120],
  },
  {
    id: LOG,
    name: 'Fallen giant',
    build: fallenGiant,
    placement: { minHeight: -1.5, maxHeight: 2.5, maxSlope: 12, density: 0.04, cluster: 0.3 },
    lodDistances: [60, 200, 900],
  },
];
