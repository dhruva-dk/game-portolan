// The Basalt Stacks: the Moonbow Blowhole. A sheer stack of black hexagonal columns under green turf, with a blowhole
// at its foot. Every few seconds the swell booms into the cave below and a column of spray bursts up out of the hole,
// higher than the stack. The spray is phosphorescent, silver-white at night, and as its mist hangs a moonbow forms in
// it. By day it is a plume of white spray with a rainbow. From far off: a white burst that comes and goes.
import * as THREE from 'three';
import { Kit, disc, halo, lit, particles, strip, surface, tick } from '../kit.ts';
import type { BeaconLook } from '../look.ts';
import { abs, clamp, cos, exp, float, floor, length, mix, mod, select, sin, smoothstep, step, vec3 } from 'three/tsl';
import { bHue, bNoise, shapePuff, shapeSpark, type F, type V3 } from '../nodes.ts';

const HOLE = new THREE.Vector3(0, 0, 7);
const PERIOD = 8;
/** The same envelope as nodes. */
const age = (t: F): F => mod(t, PERIOD / 2);
const size = (t: F): F => select(mod(floor(t.div(PERIOD / 2)), 2).lessThan(0.5), float(1), float(0.55));
const env = (t: F): F => size(t).mul(smoothstep(0, 0.25, age(t))).mul(exp(age(t).mul(-0.7)));

function burstEnv(t: number): number {
  const h = PERIOD / 2, a = t % h, big = Math.floor(t / h) % 2 === 0 ? 1 : 0.55;
  return big * Math.min(1, a / 0.25) * Math.exp(-a * 0.7);
}

export const basaltStacks: BeaconLook = {
  name: 'the Moonbow Blowhole',
  what: 'A blowhole in black basalt columns that bursts phosphorescent spray higher than the stack, a moonbow hanging in its mist.',
  color: 0xe4f0ff,
  lightHeight: 20,
  height: 62,
  radius: 20,
  ground: 'sea',
  update: tick,
  build(seed) {
    const k = new Kit(seed, 'beacon:basaltStacks');

    // the columns: a hex grid, a sheer-faced stack at the back over a low causeway of broken columns round the blowhole.
    // The face and rim drop in a column or two, the top leans from one end to the other in lumps, and the columns snap
    // off in clusters of uneven width, so the stack neither steps down in rings nor shows an even, walled top. Each
    // column breaks off on its own slant with a corner chipped away, never square across, and the high top is under
    // a mantle of turf, so nothing along the skyline reads as a cut block.
    // the columns just meet, so no sky shows through the seams between them
    const s = 1.85, R0 = 1.07;
    const lump = (x: number, z: number) => Math.sin(x * 0.45 + 1.3) * Math.sin(z * 0.38 - 0.7) + 0.5 * Math.sin(x * 0.9 - z * 0.7 + 2.1);
    const stackAt = (x: number, z: number) =>
      THREE.MathUtils.smoothstep(-z, -1.5, 1.5) * (1 - THREE.MathUtils.smoothstep(Math.hypot(x * 0.9, z * 1.1), 13.5, 16));
    const topAt = (x: number, z: number) => 15 + 10 * THREE.MathUtils.smoothstep(-x, -12, 14) + 3.5 * lump(x, z);
    const verts: number[] = [];
    const ring = (x: number, z: number, y: (cx: number, cz: number, i: number) => number) =>
      Array.from({ length: 6 }, (_, i) => {
        const cx = R0 * Math.sin(i * Math.PI / 3), cz = R0 * Math.cos(i * Math.PI / 3);
        return [x + cx, y(cx, cz, i), z + cz];
      });
    for (let q = -10; q <= 10; q++) {
      for (let r = -10; r <= 10; r++) {
        const x = s * (q + r / 2), z = s * r * 0.866;
        const d = Math.hypot(x * 0.9, z * 1.1);
        if (d > 17 + k.r(-1.5, 1.5)) continue;
        const toHole = Math.hypot(x - HOLE.x, z - HOLE.z);
        if (toHole < 2.6) continue;
        const stack = stackAt(x, z);
        const top = topAt(x, z) + k.r(-0.6, 0.6);
        const low = 1.2 + 1.2 * lump(x * 1.7, z * 1.7) + k.r(0, 1.4);
        let h = low + (top - low) * stack;
        // clusters of columns snapped off along the face and the rim
        const snap = lump(x * 2.1 + 4, z * 2.1 - 3);
        if (stack < 0.9 && snap > 0.55) h = Math.max(low, h - (snap - 0.55) * 14 - k.r(0, 1.5));
        if (toHole < 5) h = Math.min(h, 2.5 + toHole * 0.6 + k.r(0, 1));
        h = Math.max(0.8, h);
        // the break: a slant across the column, one corner chipped lower, the middle a little proud
        const lean = k.r(0.08, 0.42), dir = k.r(0, Math.PI * 2), chip = Math.floor(k.r(0, 6)), chipBy = k.r(0.15, 0.55);
        const slant = (cx: number, cz: number) => lean * (cx * Math.cos(dir) + cz * Math.sin(dir));
        const bot = ring(x, z, () => -1);
        const rim = ring(x, z, (cx, cz, i) => h + slant(cx, cz) - (i === chip ? chipBy : 0));
        const mid = [x, h + k.r(0.04, 0.18), z];
        for (let i = 0; i < 6; i++) {
          const j = (i + 1) % 6;
          verts.push(...bot[i], ...rim[j], ...rim[i], ...bot[i], ...bot[j], ...rim[j]);
          verts.push(...mid, ...rim[i], ...rim[j]);
        }
      }
    }
    const colGeo = new THREE.BufferGeometry();
    colGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    colGeo.computeVertexNormals();
    const basalt = lit(k, {
      color: 0x1d1e20, roughness: 0.72, flat: true,
      albedoNode: ({ local: L, ln }) => {
        let c: V3 = mix(vec3(0.06, 0.065, 0.07), vec3(0.15, 0.15, 0.16), bNoise(L.mul(1.4)));
        // turf on the high tops, wet weed low down
        const top = smoothstep(0.85, 0.95, ln.y).mul(smoothstep(9, 13, L.y));
        c = mix(c, vec3(0.16, 0.32, 0.08).mul(bNoise(L.mul(3)).mul(0.4).add(0.8)), top);
        return mix(c, vec3(0.05, 0.08, 0.04), smoothstep(1.5, 0, L.y).mul(0.8));
      },
      roughNode: ({ local: L, rough }) => mix(0.25, rough, smoothstep(0, 2.5, L.y)),
      emissiveNode: ({ local: L, t, night }) => {
        // the burst lights the columns round the hole, and the wet rock keeps a faint shine
        const d = length(L.sub(vec3(HOLE.x, 6, HOLE.z)));
        return vec3(0.7, 0.85, 1).mul(exp(d.div(-6))).mul(env(t).mul(1.4).add(0.15)).mul(night);
      },
    });
    const cols = new THREE.Mesh(colGeo, basalt);
    cols.castShadow = cols.receiveShadow = true;
    k.add(cols);

    // the turf: soil and grass draped over the stack's high top, following its lean and lumps, so from off the water
    // the skyline is a rounded green brow. At its edge it tucks down among the column ends of the rim.
    const STEP = 0.8, NX = Math.round(34 / STEP), NZ = Math.round(18 / STEP);
    const tp: number[] = [], ti: number[] = [];
    const cover: number[] = [];
    for (let iz = 0; iz <= NZ; iz++) {
      for (let ix = 0; ix <= NX; ix++) {
        const x = -17 + ix * STEP, z = -17 + iz * STEP;
        const c = THREE.MathUtils.smoothstep(stackAt(x, z), 0.97, 0.995);
        cover.push(c);
        tp.push(x, topAt(x, z) + 0.75 + 0.25 * Math.sin(x * 1.7 + z * 0.9) * Math.sin(z * 2.3 - x) - (1 - c) * 2.6, z);
      }
    }
    for (let iz = 0; iz < NZ; iz++) {
      for (let ix = 0; ix < NX; ix++) {
        const a = iz * (NX + 1) + ix, b = a + 1, c = a + NX + 1, d = c + 1;
        if (Math.max(cover[a], cover[b], cover[c], cover[d]) <= 0) continue;
        ti.push(a, c, b, b, c, d);
      }
    }
    const turfGeo = new THREE.BufferGeometry();
    turfGeo.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
    turfGeo.setIndex(ti);
    turfGeo.computeVertexNormals();
    const turf = k.add(new THREE.Mesh(turfGeo, lit(k, {
      color: 0x2e4a18, roughness: 0.95,
      albedoNode: ({ local: L, ln }) => {
        const c = mix(vec3(0.12, 0.24, 0.06), vec3(0.24, 0.36, 0.1), bNoise(L.mul(0.6))).mul(bNoise(L.mul(3.1)).mul(0.35).add(0.75));
        // bare peat where the brow rolls over
        return mix(vec3(0.05, 0.055, 0.035), c, smoothstep(0.55, 0.85, ln.y));
      },
    })));
    turf.castShadow = turf.receiveShadow = true;

    // the blowhole's water and the pools caught in the columns, glowing
    const pool = surface(k, disc(4, 0.3), {
      color: 0xbfe4ff, day: 0, night: 1.6,
      paintNode: ({ uv: f, t }) => {
        const p = f.sub(0.5).mul(2), r = length(p);
        return { glow: env(t).mul(2.5).add(0.4).mul(bNoise(vec3(p.mul(4), t.mul(2))).mul(0.4).add(0.6)).mul(smoothstep(1, 0.4, r)) };
      },
    });
    pool.position.copy(HOLE);
    k.add(pool);

    const sprayN = vec3(HOLE.x, 1, HOLE.z);
    k.add(particles(k, {
      count: 360, color: 0xe8f4ff, day: 0.55, night: 3.2,
      shapeNode: shapeSpark,
      motionNode: ({ s, t }) => {
        const tt = age(t).sub(s.x.mul(0.5)), v = s.y.mul(15).add(20).mul(size(t));
        const a = s.z.mul(6.2831), sp = s.w.mul(s.w).mul(3.2);
        const pos = sprayN.add(vec3(cos(a).mul(sp).mul(tt), v.mul(tt).sub(tt.mul(tt).mul(4.9)), sin(a).mul(sp).mul(tt)));
        const up = v.sub(tt.mul(9.8));
        return {
          pos, size: s.w.mul(0.25).add(0.18), stretch: clamp(abs(up).div(20), 0, 1).mul(2.5), dir: vec3(cos(a).mul(sp), up, sin(a).mul(sp)),
          alpha: step(0, tt).mul(step(0, pos.y)).mul(smoothstep(4, 1, tt)), col: mix(vec3(1), bHue(s.w.add(t.mul(0.05))).mul(1.2), 0.18),
        };
      },
    }));
    k.add(particles(k, {
      count: 120, color: 0xd6eaff, day: 0, night: 0.55, blend: 'alpha', matter: 0xeef3f6,
      shapeNode: shapePuff,
      motionNode: ({ s, t }) => {
        const tt = age(t).sub(0.2).sub(s.x.mul(0.6)), top = s.y.mul(30).add(24).mul(size(t));
        const rise = float(1).sub(exp(tt.mul(-1.6))), a = s.z.mul(6.2831), out = tt.mul(1.6).add(1);
        return {
          pos: sprayN.add(vec3(cos(a).mul(out).add(tt.mul(1.2)), top.mul(rise).sub(tt.mul(tt).mul(0.35)), sin(a).mul(out))),
          size: tt.mul(2.4).add(2), alpha: step(0, tt).mul(smoothstep(3.9, 1, tt)).mul(0.3).mul(size(t)),
        };
      },
    }));
    // the moonbow: a spectral arc in the hanging mist, after each big burst
    const arcPts: THREE.Vector3[] = [], arcW: number[] = [];
    for (let i = 0; i <= 40; i++) {
      const a = Math.PI * (0.05 + 0.9 * (i / 40));
      arcPts.push(new THREE.Vector3(Math.cos(a) * 20, 6 + Math.sin(a) * 26, HOLE.z + 4));
      arcW.push(3.2);
    }
    k.add(surface(k, strip(arcPts, arcW), {
      color: 0xffffff, day: 0.35, night: 0.7,
      paintNode: ({ uv: f, t, night }) => {
        const x = f.x, a = age(t);
        const edge = smoothstep(0, 0.25, x).mul(smoothstep(1, 0.75, x));
        const show = select(size(t).greaterThan(0.9), smoothstep(0.8, 1.8, a).mul(smoothstep(3.95, 2.6, a)), float(0));
        return {
          col: mix(vec3(0.85), bHue(x.mul(0.72).add(0.02)), mix(0.85, 0.45, night)),
          glow: edge.mul(show).mul(bNoise(vec3(f.y.mul(0.2), t.mul(0.5), 0)).mul(0.4).add(0.6)),
        };
      },
    }));

    k.add(halo(k, [HOLE.x, 26, HOLE.z], 30, 0xdfeeff, 0, 0.22, 30, ({ t }) => env(t).mul(1.4).add(0.08)));
    k.add(halo(k, [HOLE.x, 3, HOLE.z], 9, 0xcfe6ff, 0, 0.5, 8, ({ t }) => env(t).add(0.3)));
    k.setPulse((t) => 0.25 + burstEnv(t));
    return k.root;
  },
};
