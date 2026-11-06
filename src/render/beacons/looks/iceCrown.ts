// The Ice Crown: the Heart-light. A cage of tall blue ice shards on a snow floe, leaning together over a faceted heart
// of cold light that beats slowly. Diamond dust hangs in the air around it, and the dust stands the light up into a
// pillar far above the crown: the thin white-blue column that marks the pole from anywhere in the north.
import * as THREE from 'three';
import { Kit, column, halo, heartbeat, instances, lit, mat4, merge, mound, particles, pillar, place, tick } from '../kit.ts';
import { abs, cos, exp, float, length, max, mix, mod, pow, sin, smoothstep, vec3 } from 'three/tsl';
import { bBeat, bFbm, bNoise, shapeSpark, type Clocked } from '../nodes.ts';
import type { BeaconLook } from '../look.ts';

const HEART = new THREE.Vector3(0, 17, 0);
const ICE = 0xbfe4ff;

export const iceCrown: BeaconLook = {
  name: 'the Heart-light',
  what: 'A cage of blue ice shards over a beating heart of cold light, standing a light pillar into the polar sky.',
  color: ICE,
  lightHeight: HEART.y,
  height: 150,
  radius: 24,
  ground: 'sea',
  update: tick,
  build(seed) {
    const k = new Kit(seed, 'beacon:iceCrown');
    const heartN = vec3(HEART.x, HEART.y, HEART.z), beatN = (c: Clocked) => bBeat(c.t, 3.2);

    // the floe: snow over blue ice, lit from the heart
    const floe = new THREE.Mesh(mound(26, 2.4, { seed: seed + 1, bump: 0.5, bumpScale: 0.12, segs: 72 }), lit(k, {
      color: 0xeef5fb, roughness: 0.85,
      albedoNode: (c) => {
        const edge = smoothstep(18, 25, length(c.local.xz)), n = bFbm(c.local.mul(0.35));
        return mix(c.colour, vec3(0.55, 0.78, 0.95), edge.mul(0.7).add(n.mul(0.12)));
      },
      emissiveNode: (c) => vec3(0.45, 0.75, 1).mul(exp(length(c.local.sub(heartN)).div(-9))).mul(beatN(c).mul(0.5).add(0.7)).mul(mix(0.03, 1, c.night)),
    }));
    floe.receiveShadow = true;
    k.add(floe);

    // the shards: three tall ones leaning together into a cage, a ring of lower points around them
    const shards: THREE.BufferGeometry[] = [];
    const tall = [53, 47, 43];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + k.r(-0.2, 0.2), d = k.r(5.5, 7);
      const g = column({
        height: tall[i], radius: (f) => 2.8 * (1 - f) ** 0.9 + 0.15, radial: 6, rings: 14,
        bump: 0.35, bumpScale: 0.2, seed: seed + 10 + i, lean: -d * 1.45,
      });
      shards.push(place(g, { x: Math.cos(a) * d, y: 0.5, z: Math.sin(a) * d }, new THREE.Euler(0, -a, 0)));
    }
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + k.r(-0.15, 0.15), d = k.r(11, 17), h = k.r(10, 30);
      const g = column({
        height: h, radius: (f) => k.r(1.4, 2.2) * (1 - f) + 0.1, radial: 6, rings: 8,
        bump: 0.25, bumpScale: 0.3, seed: seed + 20 + i, lean: h * k.r(0.08, 0.28),
      });
      shards.push(place(g, { x: Math.cos(a) * d, y: 0.8, z: Math.sin(a) * d }, new THREE.Euler(0, -a, 0)));
    }
    const ice = lit(k, {
      color: 0x8fc8ee, roughness: 0.08, metalness: 0.05, flat: true,
      albedoNode: (c) => {
        const n = bFbm(c.local.mul(vec3(0.25, 0.06, 0.25)));
        return mix(vec3(0.42, 0.72, 0.93), vec3(0.86, 0.95, 1), n.mul(0.8).add(smoothstep(20, 50, c.local.y).mul(0.3)));
      },
      emissiveNode: (c) => {
        const d = length(c.local.sub(heartN)), pulse = beatN(c).mul(0.55).add(0.65);
        const inner = exp(d.div(-7)).mul(2).add(exp(d.div(-22)).mul(0.3));
        // light runs up the shards like glass fibres to the tips of the crown
        const tip = smoothstep(26, 50, c.local.y).mul(0.9);
        const vein = smoothstep(0.6, 0.75, bNoise(c.local.mul(vec3(0.5, 0.07, 0.5)).add(vec3(0, c.t.mul(-0.25), 0))));
        const cold = vec3(0.16, 0.5, 1);
        const e = cold.mul(inner.mul(pulse).add(tip.mul(pulse.mul(0.4).add(0.6))).add(vein.mul(0.8).mul(exp(d.div(-26)))))
          .add(vec3(0.7, 0.9, 1).mul(c.fres).mul(inner).mul(0.5));
        // by day: a faint inner blue, the look of thick ice in sun
        return e.mul(mix(0.035, 1, c.night)).add(cold.mul(c.fres).mul(0.12).mul(float(1).sub(c.night)));
      },
    });
    const crown = new THREE.Mesh(merge(shards), ice);
    crown.castShadow = true;
    k.add(crown);

    // the heart: a faceted crystal turning slowly in the cage, with a ring of smaller facets round it
    const heartMat = lit(k, {
      color: 0xdff2ff, roughness: 0.05, flat: true,
      emissiveNode: (c) => mix(vec3(0.55, 0.8, 1), vec3(1), c.fres).mul(beatN(c).mul(6).add(4)).mul(mix(0.06, 1, c.night)),
    });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(2.3, 0), heartMat);
    core.position.copy(HEART);
    k.add(core);
    const shardRing = new THREE.Group();
    shardRing.position.copy(HEART);
    const bits: THREE.Matrix4[] = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      bits.push(mat4(Math.cos(a) * 4.2, k.r(-1.2, 1.2), Math.sin(a) * 4.2, k.r(0, 3), k.r(0, 3), k.r(0, 3), k.r(0.35, 0.6)));
    }
    shardRing.add(instances(new THREE.OctahedronGeometry(1, 0), heartMat, bits));
    k.add(shardRing);
    k.onTick((t) => {
      core.rotation.set(t * 0.13, t * 0.21, 0);
      shardRing.rotation.set(0.25 * Math.sin(t * 0.2), -t * 0.35, 0);
      const s = 1 + 0.06 * heartbeat(t, 3.2);
      core.scale.setScalar(s);
    });

    // glow: the heart's halo, the cage's glow and a wide sky glow for distance
    k.add(halo(k, [HEART.x, HEART.y, HEART.z], 8, 0xd8eeff, 0.04, 1.0, 0, (c) => beatN(c).mul(0.5).add(0.7)));
    k.add(halo(k, [0, 24, 0], 30, 0x9fd0ff, 0.0, 0.18, 30, (c) => beatN(c).mul(0.2).add(0.85)));
    k.add(halo(k, [0, 60, 0], 26, 0xa8d4ff, 0.0, 0.12, 40));

    // the light pillar: diamond dust standing the heart's light up into a column
    k.add(pillar(k, 6, 150, 6, {
      color: 0xd6ecff, day: 0, night: 1.6,
      paintNode: (c) => {
        const x = abs(c.uv.x.sub(0.5)).mul(2), h = c.uv.y, x2 = x.mul(x);
        const core = exp(x2.mul(-26)).add(exp(x2.mul(-4)).mul(0.25));
        const fade = smoothstep(0, 0.08, h).mul(pow(float(1).sub(h), 1.4));
        const shimmer = bNoise(vec3(x.mul(4), h.mul(40).sub(c.t.mul(1.2)), c.t.mul(0.2))).mul(0.3).add(0.7);
        return { glow: core.mul(fade).mul(shimmer).mul(beatN(c).mul(0.35).add(0.75)) };
      },
    }));

    // diamond dust: glints falling slowly through the light
    k.add(particles(k, {
      count: 220, color: 0xe6f4ff, day: 0.9, night: 3.0,
      base: (_i, r) => { const a = r() * Math.PI * 2, d = 3 + r() * 24; return [Math.cos(a) * d, 0, Math.sin(a) * d]; },
      shapeNode: shapeSpark,
      motionNode: ({ s, pos, t }) => {
        const H = 72, y = mod(s.y.mul(H).sub(t.mul(s.z.mul(0.7).add(0.5))), H);
        const p = vec3(pos.x.add(sin(t.mul(0.3).add(s.w.mul(6.28))).mul(1.6)), y.add(1), pos.z.add(cos(t.mul(0.27).add(s.x.mul(6.28))).mul(1.6)));
        const tw = pow(max(0, sin(t.mul(s.z.mul(3.5).add(1.5)).add(s.w.mul(40)))), 14);
        const near = exp(length(p.sub(heartN)).div(-16));
        return {
          pos: p, size: tw.mul(0.3).add(0.16),
          alpha: tw.mul(2.5).add(0.15).mul(near.mul(1.7).add(0.3)).mul(smoothstep(0, 4, y)).mul(smoothstep(H, H - 8, y)),
        };
      },
    }));

    k.setPulse((t) => 0.7 + 0.3 * heartbeat(t, 3.2));
    return k.root;
  },
};
