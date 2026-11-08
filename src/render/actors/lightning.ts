// Lightning: the simulation warns a ship in the open a second and a half before a bolt comes down where it was, and
// the warning is drawn as the bolt's own stepped leader, a faint forked channel creeping down from the cloud base in
// jerks toward the spot, with the cloud glowing over it; then the return strokes, two to four of them a tenth of a
// second apart down the channel the leader cut, the first lighting every branch and the later ones the trunk alone.
// Each stroke lights the cloud it came from, the sky's light over everything (P.flash, through STRIKE) and the sea
// and ships round it by a point light low on the channel.
//
// The channel is a midpoint-displaced line from the cloud base to the sea, forked by a few shorter channels that die
// out in the air. Each frame it is laid out as ribbons facing the eye, at least a few pixels wide so a far bolt holds
// its line, with a bright core and a soft halo across them.
import * as THREE from 'three';
import { onSea, rand } from './common.ts';
import { boltNodeMaterial } from './tsl/lightning.ts';
import { STRIKE } from '../gpu/uniforms.ts';
import type { Effects } from './effects.ts';

/** How high over the sea the cloud base is that the channel comes from, metres. */
const BASE = 46;
/** The longest a bolt lingers after its first stroke, seconds. */
const AFTER = 0.75;
/** The most quads the bolts can lay in a frame, each its own two triangles. */
const MAX_QUADS = 640;
const BOLT_COLOUR = new THREE.Color(0.78, 0.84, 1);

interface Channel {
  pts: THREE.Vector3[];
  /** How far down the bolt each point is, 0 at the cloud, 1 at the sea: how far the leader has to reach to show it. */
  reach: number[];
  /** Half the ribbon's width, metres, and how bright it burns against the trunk. */
  width: number;
  light: number;
  trunk: boolean;
}

interface Bolt {
  top: THREE.Vector3;
  foot: THREE.Vector3;
  channels: Channel[];
  /** Seconds since the warning (counting up to the strike), then since the strike. */
  age: number;
  struck: boolean;
  /** When each return stroke comes, seconds after the first. */
  strokes: number[];
  warn: number;
}

/** A line from a to b, displaced at its midpoints `levels` times over by `rough` of each segment's length. */
function crooked(a: THREE.Vector3, b: THREE.Vector3, levels: number, rough: number): THREE.Vector3[] {
  let pts = [a.clone(), b.clone()];
  const d = new THREE.Vector3(), r = new THREE.Vector3();
  for (let l = 0; l < levels; l++) {
    const next: THREE.Vector3[] = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i];
      d.subVectors(q, p);
      const len = d.length();
      r.set(rand(-1, 1), rand(-1, 1), rand(-1, 1));
      r.addScaledVector(d, -r.dot(d) / Math.max(len * len, 1e-6));
      next.push(new THREE.Vector3().addVectors(p, q).multiplyScalar(0.5).addScaledVector(r, len * rough), q);
    }
    pts = next;
  }
  return pts;
}

export class Lightning {
  readonly mesh: THREE.Mesh;
  /** What the strokes throw on the sea and the ships round them: out to 600 m, where it has fallen to a few
   *  thousandths of a lux (a light of unbounded reach would be culled from every cluster but its own). */
  readonly light = new THREE.PointLight(BOLT_COLOUR, 0, 600, 2);
  readonly #bolts: Bolt[] = [];
  readonly #fx: Effects;
  readonly #pos = new Float32Array(MAX_QUADS * 6 * 3);
  readonly #col = new Float32Array(MAX_QUADS * 6 * 3);
  readonly #uv = new Float32Array(MAX_QUADS * 6 * 2);
  readonly #geo = new THREE.BufferGeometry();
  /** One channel's points laid out across the ribbon: each side's position, its colour and its uv, before they are
   *  written out as quads. */
  readonly #row: { l: THREE.Vector3; r: THREE.Vector3; c: number; u: number }[] = [];

  constructor(fx: Effects) {
    this.#fx = fx;
    const g = this.#geo;
    g.setAttribute('position', new THREE.BufferAttribute(this.#pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.#col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(this.#uv, 2).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    const m = boltNodeMaterial();
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.name = 'lightning';
    // (an empty draw range is still drawn, and WebGPU warns of a draw of no vertices: hidden instead)
    this.mesh.visible = false;
    this.light.name = 'lightning-light';
    this.light.visible = false;
  }

  /** The warning over `at`: the leader starts down toward it. */
  warn(at: THREE.Vector3, seconds = 1.5): void {
    this.#bolts.push(this.#make(at, seconds));
  }

  /** The strike at `at`: down the leader that warned of it, or a channel of its own if none did. */
  strike(at: THREE.Vector3): void {
    const foot = onSea(at, 0);
    let b = this.#bolts.find((k) => !k.struck && k.foot.distanceTo(foot) < 6);
    if (!b) this.#bolts.push((b = this.#make(at, 0)));
    b.struck = true;
    b.age = 0;
    const n = 2 + Math.floor(Math.random() * 3);
    b.strokes = [0];
    for (let i = 1; i < n; i++) b.strokes.push(b.strokes[i - 1] + rand(0.06, 0.16));
    // the sea where it lands flashes up in spray and sparks
    this.#fx.splash(foot, 0.9);
    this.#fx.sparkle(onSea(at, 1), BOLT_COLOUR.clone().multiplyScalar(3), 26, 5);
  }

  clear(): void {
    this.#bolts.length = 0;
    STRIKE.light = 0;
    this.light.intensity = 0;
    this.light.visible = false;
    this.#geo.setDrawRange(0, 0);
    this.mesh.visible = false;
  }

  #make(at: THREE.Vector3, warn: number): Bolt {
    const foot = onSea(at, 0);
    const up = foot.clone().normalize();
    // it comes out of the cloud a little to one side of where it lands
    const side = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1));
    side.addScaledVector(up, -side.dot(up)).setLength(rand(4, 14));
    const top = foot.clone().addScaledVector(up, BASE + rand(-4, 6)).add(side);
    const height = top.distanceTo(foot);
    const trunk = crooked(top, foot, 6, 0.32);
    const channels: Channel[] = [{ pts: trunk, reach: trunk.map((_, i) => i / (trunk.length - 1)), width: 0.12, light: 1, trunk: true }];
    // forks, from the upper two-thirds of the trunk, leaning down and away, dying out in the air
    const forks = 3 + Math.floor(Math.random() * 4);
    const out = new THREE.Vector3();
    for (let f = 0; f < forks; f++) {
      const i = Math.floor(rand(0.08, 0.7) * (trunk.length - 1));
      const from = trunk[i];
      const left = from.distanceTo(foot);
      out.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).addScaledVector(up, -out.dot(up)).normalize();
      const len = left * rand(0.25, 0.55);
      const end = from.clone().addScaledVector(out, len * rand(0.4, 0.8)).addScaledVector(up, -len * rand(0.6, 0.9));
      const pts = crooked(from, end, 4, 0.3);
      const r0 = i / (trunk.length - 1);
      channels.push({ pts, reach: pts.map((p) => r0 + p.distanceTo(from) / height), width: 0.06, light: rand(0.3, 0.55), trunk: false });
      // and now and then a fork of the fork
      if (Math.random() < 0.5) {
        const j = Math.floor(pts.length * rand(0.3, 0.6));
        const e2 = pts[j].clone().addScaledVector(out, len * 0.3).addScaledVector(up, -len * 0.35);
        e2.x += rand(-3, 3); e2.z += rand(-3, 3);
        const sub = crooked(pts[j], e2, 3, 0.3);
        const r1 = channels[channels.length - 1].reach[j];
        channels.push({ pts: sub, reach: sub.map((p) => r1 + p.distanceTo(pts[j]) / height), width: 0.04, light: rand(0.2, 0.35), trunk: false });
      }
    }
    return { top, foot, channels, age: 0, struck: false, strokes: [], warn };
  }

  update(dt: number, camera: THREE.Camera): void {
    const cam = camera as THREE.PerspectiveCamera;
    const eye = cam.position;
    // a pixel's width a metre off
    const pixel = (2 * Math.tan(((cam.fov ?? 58) * Math.PI) / 360)) / 900;
    let quads = 0, light = 0;
    const lit = new THREE.Vector3();
    const P = this.#pos, C = this.#col, U = this.#uv;
    const t = new THREE.Vector3(), v = new THREE.Vector3(), s = new THREE.Vector3();
    for (let k = this.#bolts.length - 1; k >= 0; k--) {
      const b = this.#bolts[k];
      b.age += dt;
      if (b.struck ? b.age > AFTER : b.age > b.warn + 1) {
        this.#bolts.splice(k, 1);
        continue;
      }
      // how far down it shows, and how bright the trunk and the forks burn
      let reach: number, trunkLight: number, forkLight: number;
      if (!b.struck) {
        // the leader steps down in jerks, faint and flickering
        const f = Math.min(1, b.age / Math.max(b.warn, 0.01));
        reach = Math.floor(Math.pow(f, 1.25) * 0.93 * 18) / 18;
        trunkLight = forkLight = 0.012 + Math.random() * 0.02;
        if (b.age > b.warn) trunkLight = forkLight = 0;
      } else {
        reach = 1;
        let stroke = 0, first = 0;
        b.strokes.forEach((at, i) => {
          const a = b.age - at;
          if (a < 0) return;
          const e = Math.exp(-a * 24);
          stroke = Math.max(stroke, e);
          if (i === 0) first = e;
        });
        // the channel keeps a dull glow between strokes, fading out
        const glow = 0.1 * Math.exp(-b.age * 6);
        trunkLight = Math.max(stroke, glow);
        forkLight = Math.max(first, glow * 0.5);
        if (stroke > light) {
          light = stroke;
          lit.lerpVectors(b.foot, b.top, 0.3);
          STRIKE.top.copy(b.top);
          STRIKE.foot.copy(b.foot);
        }
      }
      if (!b.struck && trunkLight > 0) {
        // the cloud over the spot glows as the leader comes down out of it
        const warnGlow = 0.12 + Math.random() * 0.1;
        if (warnGlow > light) {
          light = Math.max(light, warnGlow * 0.6);
          STRIKE.top.copy(b.top);
          STRIKE.foot.copy(b.foot);
        }
      }
      for (const ch of b.channels) {
        const bright = ch.light * (ch.trunk ? trunkLight : forkLight);
        if (bright <= 0.002) continue;
        const pts = ch.pts;
        let shown = 0;
        while (shown < pts.length && ch.reach[shown] <= reach + 1e-4) shown++;
        if (shown < 2 || quads + shown - 1 > MAX_QUADS) continue;
        const row = this.#row;
        while (row.length < shown) row.push({ l: new THREE.Vector3(), r: new THREE.Vector3(), c: 0, u: 0 });
        for (let i = 0; i < shown; i++) {
          const p = pts[i];
          t.subVectors(pts[Math.min(i + 1, shown - 1)], pts[Math.max(i - 1, 0)]).normalize();
          v.subVectors(eye, p);
          const dist = v.length();
          s.crossVectors(t, v).normalize();
          // the core as wide as the channel, or a pixel or so where it is far, thinned by what the widening added; the
          // ribbon round it wide enough for the halo
          const core = Math.max(ch.width, dist * pixel * 1.3);
          const half = Math.max(ch.width * 9, dist * pixel * 7);
          const fade = bright * (ch.width / core) ** 0.5 * (i === shown - 1 && shown < pts.length ? 0.4 : 1);
          row[i].l.copy(p).addScaledVector(s, -half);
          row[i].r.copy(p).addScaledVector(s, half);
          row[i].c = fade;
          row[i].u = core / half;
        }
        for (let i = 1; i < shown; i++) {
          const a = row[i - 1], b = row[i];
          // two triangles: a.l a.r b.l, a.r b.r b.l
          const corners: [THREE.Vector3, number, number, number][] = [
            [a.l, 0, a.c, a.u], [a.r, 1, a.c, a.u], [b.l, 0, b.c, b.u], [a.r, 1, a.c, a.u], [b.r, 1, b.c, b.u], [b.l, 0, b.c, b.u],
          ];
          corners.forEach(([q, across, c, u], j) => {
            const o = quads * 6 + j;
            P[o * 3] = q.x; P[o * 3 + 1] = q.y; P[o * 3 + 2] = q.z;
            C[o * 3] = BOLT_COLOUR.r * c; C[o * 3 + 1] = BOLT_COLOUR.g * c; C[o * 3 + 2] = BOLT_COLOUR.b * c;
            U[o * 2] = across; U[o * 2 + 1] = u;
          });
          quads++;
        }
      }
    }
    STRIKE.light = light;
    this.light.intensity = light * 2500;
    // shown only while it has light: it reaches every cluster in view, so every lit fragment would light itself by it
    this.light.visible = light > 0;
    if (light > 0) this.light.position.copy(lit);
    this.#geo.setDrawRange(0, quads * 6);
    this.mesh.visible = quads > 0;
    if (quads === 0) return;
    for (const k of ['position', 'color', 'uv']) {
      const a = this.#geo.getAttribute(k) as THREE.BufferAttribute;
      a.clearUpdateRanges();
      a.addUpdateRange(0, quads * 6 * a.itemSize);
      a.needsUpdate = true;
    }
  }
}
