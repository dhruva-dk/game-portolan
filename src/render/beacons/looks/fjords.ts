// The Fjords: the Glowfall. A granite crag with a ribbon of glacial meltwater pouring off its lip. By day it is white
// water on grey rock; at night the water carries a cold turquoise light, as if the glacier's melt were alive, and the
// plunge pool and its mist glow at the foot. From far off it is a thin turquoise thread standing on a bright foot.
import * as THREE from 'three';
import { Kit, column, disc, fbm3, halo, lit, merge, noise3, particles, place, strip, surface, tick } from '../kit.ts';
import type { BeaconLook } from '../look.ts';
import { clamp, cos, exp, float, length, max, mix, mod, sin, smoothstep, step, vec3 } from 'three/tsl';
import { bFbm, bNoise, shapePuff, shapeSpark, type LitCtx, type V3 } from '../nodes.ts';

const TOP = 57, LIP_Z = 7, FOOT_Z = 13.5;
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const fjords: BeaconLook = {
  name: 'the Glowfall',
  what: 'A granite slab with a ribbon of glacial meltwater that glows turquoise at night, lighting its plunge pool and mist.',
  color: 0x38f2d8,
  lightHeight: 8,
  height: 60,
  radius: 22,
  ground: 'shore',
  update: tick,
  build(seed) {
    const k = new Kit(seed, 'beacon:fjords');

    // the slab: a wide crag of granite, its sides broken into strata that undercut and step back to mossy shelves and
    // split by vertical joints, a talus apron running down under the water at its back and sides, and a notch at the
    // lip where the water leaves
    const slab = column({
      height: 66, radial: 64, rings: 80, seed: seed + 3, bump: 2.4, bumpScale: 0.06, sx: 1.5, sz: 0.75,
      radius: (f) => 13.2 - 2.2 * f + (f > 0.95 ? -2.5 * (f - 0.95) * 20 : 0),
      shape: (x, y, z, _f, a) => {
        const h = y - 6, front = Math.max(0, Math.sin(a));
        const notch = h > 50 ? -2 * Math.exp(-(x * x) / 10) * front * Math.min(1, (h - 50) / 4) : 0;
        // vertical joints split the crag into blocks; in each block the strata sit at their own heights and depths,
        // each band leaning out as it climbs and stepping back at its top, so its top is a shelf
        const ja = a * 4 + Math.sin(h * 0.06) * 0.8 + seed, block = Math.floor(ja / Math.PI);
        const band = (h + 4 * noise3(block * 1.7, 0, 0, seed) + 2.2 * Math.sin(a * 2 + seed)) / (6 + 1.5 * noise3(block * 2.3, 1, 0, seed));
        const amp = 1.7 * (0.65 + 0.35 * noise3(block * 0.9, Math.floor(band) * 0.7, 0, seed + 3));
        const strata = -amp * (1 - (band - Math.floor(band))) ** 2.5 * (1 - 0.6 * front);
        const joint = -2 * (1 - smooth(0, 0.3, Math.abs(Math.sin(ja))));
        const apron = 5 * Math.exp(-Math.max(0, h + 4) / 4.5) * (1 - 0.9 * front);
        return notch + strata + joint * (1 - 0.5 * front) + apron + fbm3(x * 0.25, h * 0.25, z * 0.25, seed + 9) * 0.6;
      },
    });
    slab.translate(0, -6, 0);
    // a broken crown: the top rises and falls instead of standing flat
    const sp = slab.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < sp.count; i++) {
      const y = sp.getY(i);
      if (y > 52) sp.setY(i, y + fbm3(sp.getX(i) * 0.12, 0, sp.getZ(i) * 0.12, seed + 5) * 4 * smooth(52, 60, y));
    }
    slab.computeVertexNormals();
    const albedoNode = ({ local: L, ln }: LitCtx): V3 => {
      const n = bFbm(L.mul(0.09)), n2 = bFbm(L.mul(vec3(0.5, 0.18, 0.5)));
      const speck = smoothstep(0.62, 0.7, bNoise(L.mul(2.3)));
      let g: V3 = mix(vec3(0.19, 0.195, 0.2), vec3(0.42, 0.42, 0.4), clamp(n.mul(0.75).add(n2.mul(0.45)).sub(0.1), 0, 1));
      g = mix(g, vec3(0.1), speck.mul(0.3));
      // dark streaks where water has run down the faces from the shelves
      const stain = smoothstep(0.5, 0.8, bNoise(vec3(L.x.mul(0.7), L.y.mul(0.035), L.z.mul(0.7))));
      g = g.mul(float(1).sub(stain.mul(0.45).mul(float(1).sub(smoothstep(0.3, 0.6, ln.y)))));
      // wet and dark where the fall runs, and along the waterline
      const wet = exp(L.x.mul(L.x).div(-40)).mul(smoothstep(4, 9, L.z));
      g = mix(g, g.mul(0.35), wet);
      g = g.mul(mix(1, 0.5, smoothstep(1.5, -0.5, L.y)));
      // yellow-grey lichen on the dry faces, moss and heather on every shelf and over the top
      const lichen = smoothstep(0.58, 0.75, bNoise(L.mul(0.32).add(7))).mul(float(1).sub(wet)).mul(step(1.5, L.y));
      g = mix(g, vec3(0.5, 0.48, 0.3), lichen.mul(0.45));
      const shelf = smoothstep(0.45, 0.8, ln.y).mul(step(0.8, L.y));
      return mix(g, mix(vec3(0.11, 0.15, 0.08), vec3(0.2, 0.18, 0.11), n2), shelf.mul(smoothstep(20, 55, L.y).mul(0.3).add(0.7)));
    };
    const granite = lit(k, {
      color: 0x8a8a86, roughness: 0.9,
      albedoNode,
      roughNode: ({ local: L, rough }) => mix(rough, 0.25, exp(L.x.mul(L.x).div(-40)).mul(smoothstep(4, 9, L.z))),
      emissiveNode: ({ local: L, t, night }) => {
        // glowing algae streaks in the wet rock beside the fall
        const wet = exp(L.x.mul(L.x).div(-60)).mul(smoothstep(5, 9, L.z));
        const streak = smoothstep(0.55, 0.8, bNoise(vec3(L.x.mul(1.4), L.y.mul(0.08).add(t.mul(0.05)), L.z.mul(0.3))));
        const foot = exp(max(L.y, 0).div(-6));
        return vec3(0.1, 0.9, 0.78).mul(wet.mul(streak.mul(0.9).add(0.12)).add(foot.mul(0.35).mul(smoothstep(6, 12, L.z)))).mul(night);
      },
    });
    const rock = new THREE.Mesh(slab, granite);
    rock.castShadow = rock.receiveShadow = true;
    k.add(rock);

    // boulders fallen from the crag, half sunk round its foot, none in the plunge pool
    const stones: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 16; i++) {
      const a = Math.PI * 0.5 + 0.75 + (i / 16) * (Math.PI * 2 - 1.5) + k.r(-0.08, 0.08);
      const r = k.r(1.4, 4.2), d = k.r(0.95, 1.2);
      // faceted, not rounded: granite splits along its joints
      const g = new THREE.IcosahedronGeometry(1, 1);
      const gp = g.attributes.position as THREE.BufferAttribute;
      for (let j = 0; j < gp.count; j++) {
        const f = 1 + fbm3(gp.getX(j) * 1.3, gp.getY(j) * 1.3, gp.getZ(j) * 1.3, seed + 40 + i) * 0.45;
        gp.setXYZ(j, gp.getX(j) * f * k.r(0.95, 1.05), gp.getY(j) * f * 0.6, gp.getZ(j) * f);
      }
      g.computeVertexNormals();
      stones.push(place(g, { x: Math.cos(a) * 19.5 * d, y: r * k.r(-0.1, 0.3), z: Math.sin(a) * 10.5 * d }, new THREE.Euler(k.r(-0.3, 0.3), k.r(0, 6.28), k.r(-0.3, 0.3)), { x: r, y: r, z: r }));
    }
    const boulders = new THREE.Mesh(merge(stones), lit(k, { color: 0x8a8a86, roughness: 0.9, albedoNode }));
    boulders.castShadow = boulders.receiveShadow = true;
    k.add(boulders);

    // the ribbon: a parabola from the lip to the pool, widening as it falls
    const pts: THREE.Vector3[] = [], widths: number[] = [];
    for (let i = 0; i <= 40; i++) {
      const y = TOP - (i / 40) * (TOP + 0.5), drop = TOP - y;
      pts.push(new THREE.Vector3(Math.sin(i * 0.4) * 0.15, y, LIP_Z + 1.5 * Math.sqrt((2 * drop) / 9.8) + drop * 0.02));
      widths.push(4.2 + (drop / TOP) * 5.5);
    }
    const ribbon = surface(k, strip(pts, widths), {
      color: 0x38f2d8, day: 0, night: 2.8, blend: 'alpha', matter: 0xe6f2f2,
      paintNode: ({ uv: f, t }) => {
        const x = f.x, v = f.y;
        const edge = smoothstep(0, 0.2, x).mul(smoothstep(1, 0.8, x));
        const n1 = bNoise(vec3(x.mul(8), v.mul(0.22).sub(t.mul(2.4)), 0));
        const n2 = bNoise(vec3(x.mul(21), v.mul(0.55).sub(t.mul(4.3)), 3));
        const n3 = bNoise(vec3(x.mul(40), v.mul(1.4).sub(t.mul(7)), 9));
        const streak = smoothstep(0.35, 0.95, n1.mul(0.55).add(n2.mul(0.35)).add(n3.mul(0.25)));
        const body = edge.mul(streak.mul(0.6).add(0.4)).mul(smoothstep(0, 1.5, v));
        return {
          alpha: body.mul(n2.mul(0.5).add(0.5)),
          col: mix(vec3(0.55, 1, 0.92), vec3(1.25), streak.mul(streak).mul(0.7)),
          glow: body.mul(streak.mul(0.9).add(0.55)),
        };
      },
    });
    k.add(ribbon);

    // the plunge pool: rings of light spreading over the water
    const pool = surface(k, disc(16, 0.08), {
      color: 0x38f2d8, day: 0, night: 1.5,
      paintNode: ({ uv: f, t }) => {
        const p = f.sub(0.5).mul(2), r = length(p);
        const ring = sin(r.mul(26).sub(t.mul(3.2)).add(bNoise(vec3(p.mul(3), t.mul(0.3))).mul(3))).mul(0.5).add(0.5);
        return { glow: exp(r.mul(-3.2)).mul(ring.mul(0.5).add(0.5)).mul(smoothstep(1, 0.7, r)) };
      },
    });
    pool.position.set(0, 0, FOOT_Z);
    k.add(pool);

    // plunge mist: puffs rising and spreading from the foot, white by day and turquoise at night
    k.add(particles(k, {
      count: 110, color: 0x38f2d8, day: 0, night: 0.4, blend: 'alpha', matter: 0xdfe9ea,
      shapeNode: shapePuff,
      motionNode: ({ s, t }) => {
        const life = s.x.add(t.mul(s.y.mul(0.05).add(0.05))).fract(), a = s.z.mul(6.2831);
        const rr = life.mul(s.w.mul(7).add(6)).add(1.5);
        return {
          pos: vec3(cos(a).mul(rr), life.mul(s.y.mul(16).add(8)).add(0.6), sin(a).mul(rr).mul(0.8).add(FOOT_Z)),
          size: life.mul(4.5).add(1.6), alpha: sin(life.mul(Math.PI)).mul(0.2),
        };
      },
    }));
    // spray: droplets thrown out of the plunge
    k.add(particles(k, {
      count: 140, color: 0x7ffff0, day: 0.0, night: 3.0,
      shapeNode: shapeSpark,
      motionNode: ({ s, t }) => {
        const T = s.y.add(1.6), tt = mod(t.add(s.x.mul(T)), T), a = s.z.mul(6.2831), v = s.w.mul(7).add(4);
        const y = v.mul(tt).add(0.5).sub(tt.mul(tt).mul(4.9));
        return {
          pos: vec3(cos(a).mul(v).mul(0.6).mul(tt), y, sin(a).mul(v).mul(0.6).mul(tt).add(FOOT_Z)),
          size: s.w.mul(0.08).add(0.09), alpha: step(0, y).mul(float(1).sub(tt.div(T))),
        };
      },
    }));
    // falling sparks of light down the ribbon, the beacon's detail at 10 m
    k.add(particles(k, {
      count: 90, color: 0xb8fff4, day: 0.0, night: 4.0,
      shapeNode: shapeSpark,
      motionNode: ({ s, t }) => {
        const T = 3.4, tt = mod(t.mul(s.y.mul(0.3).add(0.9)).add(s.x.mul(T)), T), drop = tt.mul(tt).mul(4.9);
        const y = float(TOP).sub(drop);
        return {
          pos: vec3(s.z.sub(0.5).mul(drop.mul(0.09).add(4)), y, tt.mul(1.5).add(drop.mul(0.02)).add(LIP_Z + 0.3)),
          size: 0.12, stretch: tt.mul(3).add(3), alpha: step(0.5, y).mul(s.w.mul(0.6).add(0.4)),
        };
      },
    }));

    k.add(halo(k, [0, 4, FOOT_Z], 14, 0x38f2d8, 0, 0.55, 12, (c) => sin(c.t.mul(1.3)).mul(0.1).add(0.9)));
    k.add(halo(k, [0, 32, LIP_Z + 3], 28, 0x2fd8c4, 0, 0.12, 30));
    k.setPulse((t) => 0.9 + 0.1 * Math.sin(t * 1.3));
    return k.root;
  },
};
