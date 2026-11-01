// Blossom Run's plants: cherry trees in full bloom, the ancient Great Cherry on its hilltop, red maples,
// and the petals drifting off them onto the river.
import * as THREE from 'three';
import {
  Geo, STILL, V, assemble, atlasCells, emitTree, grow, hsl, lerp, material, painted, range, rng, scan, stamp, topOf, WIND,
  type GrowParams, type Lod, type PlantSpec, type Rgb,
} from './kitB.ts';

// ---------------------------------------------------------------- textures

/** A spray of cherry blossom: five-petalled flowers in clusters on dark twigs, packed to the card's edge. */
function blossomTexture(): THREE.Texture {
  return painted('blossom', 1024, 1024, ({ g, w, h }) => {
    const r = rng(77);
    const cx = w / 2, cy = h / 2;
    // twigs from the centre outward, so the card looks fixed to the branch it sits on
    g.lineCap = 'round';
    const tips: [number, number][] = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + r() * 0.5;
      const l = w * range(r, 0.3, 0.44);
      const mx = cx + Math.cos(a + 0.3) * l * 0.5, my = cy + Math.sin(a + 0.3) * l * 0.5;
      const ex = cx + Math.cos(a) * l, ey = cy + Math.sin(a) * l;
      g.strokeStyle = hsl(15, 18, 22 + r() * 8);
      g.lineWidth = 5 - i * 0.25;
      g.beginPath(); g.moveTo(cx, cy); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
      for (let k = 0; k < 4; k++) {
        const t = 0.35 + k * 0.2;
        const bx = lerp(cx, ex, t), by = lerp(cy, ey, t);
        const ba = a + (r() < 0.5 ? -1 : 1) * range(r, 0.5, 1.1), bl = l * 0.3;
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(ba) * bl, by + Math.sin(ba) * bl); g.stroke();
        tips.push([bx + Math.cos(ba) * bl, by + Math.sin(ba) * bl]);
      }
      tips.push([ex, ey]);
    }
    // a few young bronze leaves under the flowers
    for (let i = 0; i < 14; i++) {
      const [tx, ty] = tips[Math.floor(r() * tips.length)];
      const a = r() * Math.PI * 2, l = range(r, 30, 48);
      g.save(); g.translate(tx, ty); g.rotate(a);
      g.fillStyle = hsl(range(r, 25, 70), 35, range(r, 22, 34));
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(l * 0.5, -l * 0.28, l, 0); g.quadraticCurveTo(l * 0.5, l * 0.28, 0, 0); g.fill();
      g.restore();
    }
    // flowers, back to front: darker, smaller ones first so the clusters have depth
    const flower = (x: number, y: number, rad: number, light: number, hue: number, sat: number) => {
      const turn = r() * Math.PI * 2;
      for (let p = 0; p < 5; p++) {
        const a = turn + (p / 5) * Math.PI * 2 + (r() - 0.5) * 0.25;
        g.save(); g.translate(x, y); g.rotate(a);
        const grd = g.createLinearGradient(0, 0, rad, 0);
        grd.addColorStop(0, hsl(hue - 6, sat + 12, light - 14));
        grd.addColorStop(0.45, hsl(hue, sat, light));
        grd.addColorStop(1, hsl(hue + 4, sat - 10, Math.min(97, light + 6)));
        g.fillStyle = grd;
        // a rounded petal with the cherry's notch at its tip
        g.beginPath();
        g.moveTo(0, 0);
        g.bezierCurveTo(rad * 0.3, -rad * 0.62, rad * 0.95, -rad * 0.58, rad, -rad * 0.12);
        g.lineTo(rad * 0.82, 0);
        g.lineTo(rad, rad * 0.12);
        g.bezierCurveTo(rad * 0.95, rad * 0.58, rad * 0.3, rad * 0.62, 0, 0);
        g.fill();
        g.restore();
      }
      g.fillStyle = hsl(342, 65, Math.max(45, light - 22));
      g.beginPath(); g.arc(x, y, rad * 0.2, 0, Math.PI * 2); g.fill();
      g.strokeStyle = hsl(45, 70, 70, 0.8); g.lineWidth = 1;
      for (let s = 0; s < 8; s++) {
        const a = r() * Math.PI * 2;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * rad * 0.45, y + Math.sin(a) * rad * 0.45); g.stroke();
      }
    };
    // flowers come in umbels of three to five on short stalks; the umbels crowd the twigs and fill the card
    const N = 330;
    for (let i = 0; i < N; i++) {
      const depth = i / N;
      let x: number, y: number;
      if (r() < 0.6) {
        const [tx, ty] = tips[Math.floor(r() * tips.length)];
        x = tx + (r() - 0.5) * 80; y = ty + (r() - 0.5) * 80;
      } else {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * w * 0.42;
        x = cx + Math.cos(a) * d; y = cy + Math.sin(a) * d;
      }
      if ((x - cx) ** 2 + (y - cy) ** 2 > (w * 0.45) ** 2) continue;
      const n = 3 + Math.floor(r() * 3), hue = 336 + r() * 18, sat = 50 + r() * 35;
      for (let k = 0; k < n; k++) {
        const a = r() * Math.PI * 2, d = range(r, 8, 26);
        flower(x + Math.cos(a) * d, y + Math.sin(a) * d, range(r, 15, 22) * (0.85 + depth * 0.25), 74 + depth * 16 + r() * 6, hue, sat);
      }
    }
    // a few deeper-pink buds
    for (let i = 0; i < 60; i++) {
      const [tx, ty] = tips[Math.floor(r() * tips.length)];
      g.fillStyle = hsl(340, 50, range(r, 66, 76));
      g.beginPath(); g.ellipse(tx + (r() - 0.5) * 60, ty + (r() - 0.5) * 60, 5, 7, r() * 3, 0, Math.PI * 2); g.fill();
    }
    void h;
  });
}

/** One fallen petal, notched at the tip. */
function petalTexture(): THREE.Texture {
  return painted('petal', 64, 64, ({ g }) => {
    const grd = g.createLinearGradient(32, 60, 32, 4);
    grd.addColorStop(0, hsl(338, 70, 74));
    grd.addColorStop(0.5, hsl(345, 75, 88));
    grd.addColorStop(1, hsl(350, 60, 94));
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(32, 62);
    g.bezierCurveTo(6, 44, 6, 10, 24, 4);
    g.lineTo(32, 12);
    g.lineTo(40, 4);
    g.bezierCurveTo(58, 10, 58, 44, 32, 62);
    g.fill();
  });
}

/** Red maple leaves recoloured from the scan: luminance mapped onto crimson, scarlet and orange-red. */
function reddened(img: HTMLCanvasElement, ramp: [Rgb, Rgb, Rgb]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, c.width, c.height);
  const d = px.data;
  for (let i = 0; i < d.length; i += 4) {
    const L = (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255;
    const t = Math.min(1, L * 1.5);
    const [a, b, e] = ramp;
    const lo = t < 0.5 ? a : b, hi = t < 0.5 ? b : e, k = t < 0.5 ? t * 2 : t * 2 - 1;
    d[i] = lerp(lo[0], hi[0], k); d[i + 1] = lerp(lo[1], hi[1], k); d[i + 2] = lerp(lo[2], hi[2], k);
  }
  g.putImageData(px, 0, 0);
  return c;
}

/** A spray of red maple leaves on fine twigs, from the scanned leaves (painted stand-ins until they load). */
function mapleTexture(): THREE.Texture {
  const twigs = (g: CanvasRenderingContext2D, r: () => number, w: number) => {
    const cx = w / 2, cy = w / 2, tips: [number, number, number][] = [];
    g.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + r() * 0.4;
      const l = w * range(r, 0.28, 0.4);
      g.strokeStyle = hsl(10, 30, 16); g.lineWidth = 5;
      const ex = cx + Math.cos(a) * l, ey = cy + Math.sin(a) * l;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(ex, ey); g.stroke();
      for (let k = 1; k <= 4; k++) {
        const t = k / 4, bx = lerp(cx, ex, t), by = lerp(cy, ey, t);
        for (const s of [-1, 1]) {
          const ba = a + s * range(r, 0.5, 1.0);
          const bl = w * 0.07;
          g.lineWidth = 2;
          g.strokeStyle = hsl(355, 45, 28);
          g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(ba) * bl, by + Math.sin(ba) * bl); g.stroke();
          tips.push([bx + Math.cos(ba) * bl, by + Math.sin(ba) * bl, ba]);
        }
      }
    }
    return tips;
  };
  return painted('maple', 1024, 1024, ({ g, w }) => {
    const r = rng(41);
    for (const [x, y, a] of twigs(g, r, w)) {
      const l = range(r, 60, 90);
      g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2);
      g.fillStyle = hsl(range(r, 352, 368) % 360, 70, range(r, 30, 44));
      // a five-lobed leaf, roughly
      g.beginPath();
      for (let k = 0; k <= 10; k++) {
        const ang = Math.PI + (k / 10) * Math.PI * 2;
        const rr = (k % 2 ? 0.45 : 1) * l * 0.5;
        g.lineTo(Math.sin(ang) * rr, -l * 0.5 + Math.cos(ang) * rr);
      }
      g.fill();
      g.restore();
    }
  }, {
    scans: [['maple_leaves_c.jpg', 'maple_leaves_a.jpg']],
    paint: ({ g, w }, [atlas]) => {
      const r = rng(41);
      const cells = atlasCells(atlas, 3, 3);
      const reds = [
        reddened(atlas, [[40, 2, 6], [150, 12, 18], [215, 45, 35]]),
        reddened(atlas, [[60, 6, 4], [190, 30, 16], [240, 90, 40]]),
        reddened(atlas, [[50, 4, 10], [170, 18, 30], [225, 60, 60]]),
      ];
      const tips = twigs(g, r, w);
      for (let pass = 0; pass < 2; pass++) for (const [x, y, a] of tips) {
        if (pass === 1 && r() < 0.4) continue;
        const cell = cells[Math.floor(r() * cells.length)];
        const img = reds[Math.floor(r() * reds.length)];
        g.globalAlpha = 1;
        g.filter = pass === 0 ? 'brightness(0.75)' : 'none';
        stamp(g, img, cell, x, y, a + Math.PI / 2 + (r() - 0.5) * 0.9 + (pass ? 0.4 : 0), range(r, 90, 130), r() < 0.5);
      }
      g.filter = 'none';
    },
  });
}

// ---------------------------------------------------------------- materials

const cherryBark = () => material('cherry-bark', { map: scan('cherry_bark_d.jpg', true), normalMap: scan('cherry_bark_n.jpg', false), normalScale: 1.4, roughness: 0.9 });
const mapleBark = () => material('maple-bark', { map: scan('maple_bark_d.jpg', true), normalMap: scan('maple_bark_n.jpg', false), normalScale: 1.2, roughness: 0.88 });
const blossom = () => material('blossom', { map: blossomTexture(), alphaTest: 0.45, translucency: 0.5, roughness: 0.75 });
const mapleLeaf = () => material('maple-leaf', { map: mapleTexture(), alphaTest: 0.45, translucency: 0.6, roughness: 0.7 });
const solid = () => material('blossom-solid', { roughness: 0.92 });

// ---------------------------------------------------------------- the cherry

function cherry(seed: number, lod: Lod): THREE.Object3D {
  const r = rng(seed);
  const weeping = seed % 5 === 3;
  const P: GrowParams = {
    root: V(0, 0, 0),
    dir: V((r() - 0.5) * 0.25, 1, (r() - 0.5) * 0.25),
    length: range(r, 1.6, 2.4),
    radius: range(r, 0.22, 0.3),
    children: [Math.floor(range(r, 3, 5.99)), 5, 4],
    spread: [[0.75, 1], [0.25, 1], [0.3, 1]],
    angle: [0.62, 0.75, 0.7],
    lengthRatio: [2.1, 0.55, 0.45],
    radiusRatio: 0.72,
    tropism: weeping ? [0.03, 0.02, -0.2, -0.45] : [0.03, 0.01, -0.02, -0.04],
    wiggle: 0.42,
    segments: [5, 6, 4, 3],
    flex: [0, 0.03, 0.07, 0.12],
    tipRatio: 0.42,
    steer: (d, level) => {
      // leaders reach outward into a vase; their branches flatten into layers
      if (level === 1) { d.x *= 1.06; d.z *= 1.06; }
      if (level === 2) d.y *= 0.82;
    },
  };
  const limbs = grow(r, P);
  const pink = r();
  return emitTree('cherry', seed, lod, limbs, {
    bark: cherryBark, leaf: blossom, far: solid,
    tint: [1.06, lerp(1.04, 0.92, pink), lerp(1.06, 0.98, pink)],
    farColor: [1.0, lerp(0.62, 0.5, pink), lerp(0.72, 0.62, pink)],
    barkTint: [1.0, 0.92, 0.9],
    bend: 0.3, hz: 0.42, card: 1.6, perTwig: 3, barkScale: 0.5, sides: [9, 6, 4],
  }, topOf(limbs));
}

// ---------------------------------------------------------------- the Great Cherry

/** The ancient tree on the hilltop: a buttressed trunk three metres thick, huge low limbs, a crown 40 m across. */
function greatCherry(seed: number, lod: Lod): THREE.Object3D {
  const r = rng(seed + 9001);
  const P: GrowParams = {
    root: V(0, 0, 0),
    dir: V(0.05, 1, -0.03),
    length: 6.5,
    radius: 1.55,
    children: [7, 6, 5, 4],
    spread: [[0.55, 1], [0.2, 1], [0.25, 1], [0.3, 1]],
    angle: [0.95, 0.7, 0.75, 0.7],
    lengthRatio: [2.6, 0.5, 0.45, 0.45],
    radiusRatio: 0.66,
    tropism: [0.0, 0.035, 0.0, -0.05, -0.12],
    wiggle: 0.38,
    segments: [6, 9, 6, 4, 3],
    flex: [0, 0.005, 0.02, 0.05, 0.1],
    tipRatio: 0.38,
    steer: (d, level, t) => {
      // the old limbs run out low and long, then turn up at their ends
      if (level === 1) d.y += t < 0.5 ? -0.03 : 0.07;
    },
  };
  const limbs = grow(r, P);
  const g = emitTree('great-cherry', seed, lod, limbs, {
    bark: cherryBark, leaf: blossom, far: solid,
    tint: [1.08, 0.96, 1.02], farColor: [1.0, 0.56, 0.68], barkTint: [0.85, 0.78, 0.76],
    bend: 0.35, hz: 0.25, card: 2.2, perTwig: 4, barkScale: 0.9, sides: [16, 8, 5], flare: 1.3,
  }, topOf(limbs));
  // buttress roots flaring into the hill
  const roots = new Geo();
  for (let i = 0; i < (lod === 2 ? 5 : 9); i++) {
    const a = (i / 9) * Math.PI * 2 + r() * 0.3;
    const dir = V(Math.cos(a), 0, Math.sin(a));
    const len = range(r, 3.5, 6.5);
    const pts = [0, 0.25, 0.5, 0.75, 1].map((t) => dir.clone().multiplyScalar(0.6 + t * len).add(V(0, 2.2 * (1 - t) ** 1.6 - 0.35, 0)));
    const radii = [0, 0.25, 0.5, 0.75, 1].map((t) => lerp(0.85, 0.12, t));
    roots.tube(pts, radii, lod === 0 ? 8 : 4, { uRepeat: 3, vPerMetre: 0.6, color: () => [0.7, 0.64, 0.62], wind: () => STILL });
  }
  g.add(...assemble('roots', [[roots, cherryBark()]]).children);
  return g;
}

// ---------------------------------------------------------------- the red maple

function redMaple(seed: number, lod: Lod): THREE.Object3D {
  const r = rng(seed + 333);
  const H = range(r, 8, 11);
  const P: GrowParams = {
    root: V(0, 0, 0),
    dir: V((r() - 0.5) * 0.1, 1, (r() - 0.5) * 0.1),
    length: H * 0.85,
    radius: range(r, 0.18, 0.24),
    children: [8, 4, 3],
    spread: [[0.3, 0.92], [0.25, 1], [0.35, 1]],
    angle: [0.7, 0.62, 0.6],
    lengthRatio: [0.45, 0.55, 0.5],
    radiusRatio: 0.6,
    tropism: [0.02, 0.06, 0.02, 0.0],
    wiggle: 0.3,
    segments: [6, 5, 4, 3],
    flex: [0, 0.04, 0.08, 0.13],
    tipRatio: 0.3,
  };
  const limbs = grow(r, P);
  const hue = r();
  return emitTree('red-maple', seed, lod, limbs, {
    bark: mapleBark, leaf: mapleLeaf, far: solid,
    tint: [lerp(1.05, 1.25, hue), lerp(0.9, 1.1, hue), 0.95],
    farColor: [lerp(0.42, 0.55, hue), lerp(0.035, 0.08, hue), lerp(0.04, 0.03, hue)],
    barkTint: [1.1, 1.08, 1.05],
    bend: 0.4, hz: 0.5, card: 1.35, perTwig: 3, barkScale: 0.45, sides: [8, 5, 4],
  }, topOf(limbs));
}

// ---------------------------------------------------------------- drifting petals

export interface PetalOptions {
  /** How many petals in the box. */
  count?: number;
  /** The box they fall through, in metres: width, height, depth. Its floor is the object's origin. */
  box?: [number, number, number];
  /** Metres per second they fall. */
  fall?: number;
  /** Seconds a petal floats on the water after it lands before it fades. */
  float?: number;
}

/**
 * Cherry petals falling through a box and drifting on the water at its floor, carried by the shared wind.
 * One draw call. Place it round the camera or under the cherries; its floor (local y = 0) is the water or ground.
 */
export function createPetals(o: PetalOptions = {}): THREE.Mesh {
  const count = o.count ?? 3000;
  const [bw, bh, bd] = o.box ?? [60, 18, 60];
  const r = rng(1234);
  const quad = new THREE.PlaneGeometry(0.045, 0.06, 1, 2);
  // cup the petal a little
  const qp = quad.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < qp.count; i++) qp.setZ(i, Math.abs(qp.getX(i)) * 0.25);
  quad.computeVertexNormals();
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  for (const k of ['position', 'normal', 'uv'] as const) geo.setAttribute(k, quad.getAttribute(k));
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count * 4; i++) seeds[i] = r();
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  geo.instanceCount = count;
  geo.boundingSphere = new THREE.Sphere(V(0, bh / 2, 0), Math.hypot(bw, bh, bd) / 2);

  const box = { value: V(bw, bh, bd) };
  const fall = { value: o.fall ?? 0.9 };
  const floatS = { value: o.float ?? 25 };
  const m = new THREE.MeshStandardMaterial({ map: petalTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7, color: 0xffffff });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, { uTime: WIND.uTime, uWindDir: WIND.uWindDir, uWindStrength: WIND.uWindStrength, uBox: box, uFall: fall, uFloat: floatS });
    s.vertexShader = s.vertexShader
      .replace('#include <common>', /* glsl */ `#include <common>
        attribute vec4 aSeed;
        uniform float uTime, uWindStrength, uFall, uFloat;
        uniform vec3 uWindDir, uBox;
        mat3 rotAxis(vec3 a, float t) {
          float c = cos(t), s = sin(t), k = 1.0 - c;
          return mat3(c + a.x*a.x*k, a.y*a.x*k + a.z*s, a.z*a.x*k - a.y*s,
                      a.x*a.y*k - a.z*s, c + a.y*a.y*k, a.z*a.y*k + a.x*s,
                      a.x*a.z*k + a.y*s, a.y*a.z*k - a.x*s, c + a.z*a.z*k);
        }`)
      .replace('#include <beginnormal_vertex>', /* glsl */ `
        vec3 wl = transpose(mat3(modelMatrix)) * uWindDir; wl.y = 0.0;
        wl = length(wl) > 1e-5 ? normalize(wl) : vec3(1.0, 0.0, 0.0);
        float y0 = aSeed.y * uBox.y;
        float tLand = y0 / uFall;
        float life = tLand + uFloat * (0.6 + 0.8 * aSeed.w);
        float t = mod(uTime + aSeed.w * 517.0, life);
        float landed = step(tLand, t);
        float tf = min(t, tLand), tw = max(t - tLand, 0.0);
        float speed = 0.6 + 2.2 * uWindStrength;
        // drift: fast in the air, slow on the water
        vec2 drift = wl.xz * (tf * speed + tw * speed * 0.12);
        drift += vec2(sin(t * 1.3 + aSeed.x * 40.0), cos(t * 1.1 + aSeed.z * 40.0)) * 0.35 * (1.0 - landed);
        vec2 xz = (aSeed.xz - 0.5) * uBox.xz + drift;
        xz = mod(xz + 0.5 * uBox.xz, uBox.xz) - 0.5 * uBox.xz;
        float y = mix(y0 - tf * uFall, 0.02 + 0.03 * sin(uTime * 1.4 + aSeed.x * 30.0), landed);
        vec3 pc = vec3(xz.x, y, xz.y);
        // shrink at the box's sides, at birth and as a floating petal sinks
        vec2 e = abs(xz / uBox.xz) * 2.0;
        float sc = (1.0 - smoothstep(0.82, 1.0, max(e.x, e.y))) * smoothstep(0.0, 0.6, t) * (1.0 - smoothstep(life - 3.0, life, t));
        sc *= 0.75 + 0.5 * fract(aSeed.w * 13.0);
        vec3 ax = normalize(vec3(aSeed.x - 0.5, aSeed.z - 0.5 + 0.2, aSeed.w - 0.5) + 1e-3);
        mat3 tumble = rotAxis(ax, t * (2.0 + 3.0 * aSeed.y) + aSeed.x * 6.0);
        mat3 lie = rotAxis(vec3(1.0, 0.0, 0.0), -1.5708) * rotAxis(vec3(0.0, 0.0, 1.0), aSeed.z * 6.2832);
        mat3 pR = landed > 0.5 ? lie : tumble;
        vec3 objectNormal = pR * normal;
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3( tangent.xyz );
        #endif`)
      .replace('#include <begin_vertex>', 'vec3 transformed = pR * position * sc + pc;');
  };
  m.customProgramCacheKey = () => 'floraB-petals';
  const petals = new THREE.Mesh(geo, m);
  petals.frustumCulled = false;
  petals.name = 'petals';
  return petals;
}

// ---------------------------------------------------------------- the region's list

export const PLANTS: PlantSpec[] = [
  {
    id: 'cherry',
    name: 'Cherry in bloom',
    build: cherry,
    placement: { minHeight: 0.8, maxHeight: 60, maxSlope: 28, density: 0.5, cluster: 0.6 },
    lodDistances: [45, 140],
    cullDistance: 650,
  },
  {
    id: 'great-cherry',
    name: 'The Great Cherry',
    build: greatCherry,
    // one tree, placed by hand on its hilltop
    placement: { minHeight: 15, maxHeight: 200, maxSlope: 12, density: 0, cluster: 1 },
    lodDistances: [90, 260],
    cullDistance: 5000,
  },
  {
    id: 'red-maple',
    name: 'Red maple',
    build: redMaple,
    placement: { minHeight: 1.5, maxHeight: 80, maxSlope: 30, density: 0.25, cluster: 0.45 },
    lodDistances: [45, 140],
    cullDistance: 650,
  },
];
