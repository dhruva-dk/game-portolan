// The Ice Crown: the Heart-light. A cage of tall blue ice shards on a snow floe, leaning together over a faceted heart
// of cold light that beats slowly. Diamond dust hangs in the air around it, and the dust stands the light up into a
// pillar far above the crown: the thin white-blue column that marks the pole from anywhere in the north.
import * as THREE from 'three';
import { Kit, column, halo, heartbeat, instances, lit, mat4, merge, mound, particles, pillar, place, tick, SHAPE_SPARK } from '../kit.ts';
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
    const heart = `vec3(${HEART.x.toFixed(1)}, ${HEART.y.toFixed(1)}, ${HEART.z.toFixed(1)})`;
    const beat = 'bBeat(uTime, 3.2)';

    // the floe: snow over blue ice, lit from the heart
    const floe = new THREE.Mesh(mound(26, 2.4, { seed: seed + 1, bump: 0.5, bumpScale: 0.12, segs: 72 }), lit(k, {
      color: 0xeef5fb, roughness: 0.85,
      albedo: /* glsl */ `float edge = smoothstep(18.0, 25.0, length(vLocal.xz));
        float n = bFbm(vLocal * 0.35);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.78, 0.95), edge * 0.7 + n * 0.12);`,
      emissive: /* glsl */ `float d = length(vLocal - ${heart});
        totalEmissiveRadiance += vec3(0.45, 0.75, 1.0) * exp(-d / 9.0) * (0.7 + 0.5 * ${beat}) * mix(0.03, 1.0, uNight);`,
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
      albedo: /* glsl */ `float n = bFbm(vLocal * vec3(0.25, 0.06, 0.25));
        diffuseColor.rgb = mix(vec3(0.42, 0.72, 0.93), vec3(0.86, 0.95, 1.0), n * 0.8 + smoothstep(20.0, 50.0, vLocal.y) * 0.3);`,
      emissive: /* glsl */ `float d = length(vLocal - ${heart});
        float pulse = 0.65 + 0.55 * ${beat};
        float inner = exp(-d / 7.0) * 2.0 + exp(-d / 22.0) * 0.3;
        // light runs up the shards like glass fibres to the tips of the crown
        float tip = smoothstep(26.0, 50.0, vLocal.y) * 0.9;
        float vein = smoothstep(0.6, 0.75, bNoise(vLocal * vec3(0.5, 0.07, 0.5) + vec3(0.0, -uTime * 0.25, 0.0)));
        vec3 cold = vec3(0.16, 0.5, 1.0);
        vec3 e = cold * (inner * pulse + tip * (0.6 + 0.4 * pulse) + vein * 0.8 * exp(-d / 26.0)) + vec3(0.7, 0.9, 1.0) * fres * inner * 0.5;
        // by day: a faint inner blue, the look of thick ice in sun
        totalEmissiveRadiance += e * mix(0.035, 1.0, uNight) + cold * fres * 0.12 * (1.0 - uNight);`,
    });
    const crown = new THREE.Mesh(merge(shards), ice);
    crown.castShadow = true;
    k.add(crown);

    // the heart: a faceted crystal turning slowly in the cage, with a ring of smaller facets round it
    const heartMat = lit(k, {
      color: 0xdff2ff, roughness: 0.05, flat: true,
      emissive: /* glsl */ `float b = ${beat};
        totalEmissiveRadiance += mix(vec3(0.55, 0.8, 1.0), vec3(1.0), fres) * (4.0 + 6.0 * b) * mix(0.06, 1.0, uNight);`,
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
    k.add(halo(k, [HEART.x, HEART.y, HEART.z], 8, 0xd8eeff, 0.04, 1.0, `0.7 + 0.5 * ${beat}`));
    k.add(halo(k, [0, 24, 0], 30, 0x9fd0ff, 0.0, 0.18, `0.85 + 0.2 * ${beat}`, 30));
    k.add(halo(k, [0, 60, 0], 26, 0xa8d4ff, 0.0, 0.12, '1.0', 40));

    // the light pillar: diamond dust standing the heart's light up into a column
    k.add(pillar(k, 6, 150, 6, {
      color: 0xd6ecff, day: 0, night: 1.6,
      paint: /* glsl */ `float x = abs(vUv.x - 0.5) * 2.0, h = vUv.y;
        float core = exp(-x * x * 26.0) + 0.25 * exp(-x * x * 4.0);
        float fade = smoothstep(0.0, 0.08, h) * pow(1.0 - h, 1.4);
        float shimmer = 0.7 + 0.3 * bNoise(vec3(x * 4.0, h * 40.0 - uTime * 1.2, uTime * 0.2));
        glow = core * fade * shimmer * (0.75 + 0.35 * ${beat});`,
    }));

    // diamond dust: glints falling slowly through the light
    k.add(particles(k, {
      count: 220, color: 0xe6f4ff, day: 0.9, night: 3.0, shape: SHAPE_SPARK,
      base: (_i, r) => { const a = r() * Math.PI * 2, d = 3 + r() * 24; return [Math.cos(a) * d, 0, Math.sin(a) * d]; },
      motion: /* glsl */ `float H = 72.0;
        float y = mod(s.y * H - t * (0.5 + s.z * 0.7), H);
        pos = vec3(pos.x + sin(t * 0.3 + s.w * 6.28) * 1.6, y + 1.0, pos.z + cos(t * 0.27 + s.x * 6.28) * 1.6);
        float tw = pow(max(0.0, sin(t * (1.5 + s.z * 3.5) + s.w * 40.0)), 14.0);
        size = 0.16 + 0.3 * tw;
        float near = exp(-length(pos - ${heart}) / 16.0);
        alpha = (0.15 + 2.5 * tw) * (0.3 + 1.7 * near) * smoothstep(0.0, 4.0, y) * smoothstep(H, H - 8.0, y);`,
    }));

    k.setPulse((t) => 0.7 + 0.3 * heartbeat(t, 3.2));
    return k.root;
  },
};
