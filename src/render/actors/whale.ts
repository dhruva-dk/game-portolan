// The whale, from the rewrite's leviathan: a long, pale-bellied moon-whale whose flanks glow with spots after dark.
// Whales on their routes rise, lie at the surface blowing now and then, and dive with their flukes up. The giant breach
// is the leviathan's event made huge: the sea churns, a whale more than twice the size bursts out nose first in a
// column of spray, hangs in the air rolling onto its side, and slams down in a wall of water with a shockwave.
import * as THREE from 'three';
import { SEA, TAU, frameAt, patch, rand, seaRadius, smooth, tangents } from './common.ts';
import { sharedUniforms } from '../planet.ts';
import type { Effects } from './effects.ts';
import { C, Mesher, type Ring } from './mesher.ts';
import { SPRITE } from './particles.ts';
import type { Juice, Vec3, WhaleView } from './view.ts';

/** Length in metres at scale 1; the breach is BREACH times bigger. */
export const WHALE_LENGTH = 28;
export const BREACH = 2.2;
const HALF = WHALE_LENGTH / 2;
const S = WHALE_LENGTH / 40; // the rewrite's leviathan was 40 m

const HEAD = /* glsl */ `
varying vec3 vLocal;
varying vec3 vWP;
`;

function whaleGeometry(): { body: THREE.BufferGeometry; flukes: THREE.BufferGeometry } {
  const m = new Mesher();
  const back = C(0x26354f), belly = C(0xc9d4e2), pale = C(0xbfd0e8);
  // nose at +z; s runs 0 tail .. 1 nose
  const prof = (s: number) => (s < 0.15 ? 0.6 + s * 14 : s < 0.75 ? 2.7 + Math.sin(((s - 0.15) / 0.6) * Math.PI * 0.5) * 2.4 : 5.1 - Math.pow((s - 0.75) / 0.25, 2) * 3.2);
  const rings: Ring[] = [];
  for (let i = 0; i <= 28; i++) {
    const s = i / 28, r = prof(s) * S;
    rings.push({ c: new THREE.Vector3(0, (s > 0.8 ? -(s - 0.8) * 3 : 0) * S, (s - 0.5) * 40 * S), rx: r * 1.05, ry: r * 0.82, col: belly, up: back });
  }
  m.loft(rings, 18);
  // long pectoral fins, the moon-whale's wings
  for (const sd of [-1, 1]) {
    const mt = new THREE.Matrix4().makeRotationZ(sd * -0.35).setPosition(sd * 4.2 * S, -1.6 * S, 7 * S).multiply(new THREE.Matrix4().makeScale(S, S, S));
    m.blade([[0, 2], [sd * 6, 0.5], [sd * 13, -3.5], [sd * 12, -5], [sd * 5, -3.5], [0, -2]], 0.25, (x) => (Math.abs(x) > 9 ? pale : back), mt);
  }
  // a low dorsal hump, standing up off the back
  const dm = new THREE.Matrix4().makeTranslation(0, 3.3 * S, -8 * S).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)).multiply(new THREE.Matrix4().makeScale(S, S, S));
  m.blade([[-0.3, 2.5], [1.6, -0.6], [1.2, -1.6], [-0.3, -3]], 0.2, () => back, dm);
  // eyes
  for (const sd of [-1, 1]) {
    const e = (z: number, r: number) => ({ c: new THREE.Vector3(sd * 4.95 * S, -0.9 * S, z * S), rx: r * S, ry: r * S, col: C(0x0b0d12) });
    m.loft([e(13.1, 0.01), e(13.35, 0.45), e(13.85, 0.45), e(14.1, 0.01)], 8);
  }
  const fm = new Mesher();
  fm.blade([[0, 0.5], [7, -1], [9.5, -3.5], [6, -3], [0, -1.5], [-6, -3], [-9.5, -3.5], [-7, -1]], 0.25, (x) => (Math.abs(x) > 7 ? pale : back), new THREE.Matrix4().makeScale(S, S, S));
  return { body: m.build(), flukes: fm.build() };
}

interface Rig { root: THREE.Group; pose: THREE.Group; tail: THREE.Group }

interface Swimmer { rig: Rig; state: WhaleView['state']; k: number; blow: number; seen: number; splashed: boolean; dove: boolean }

interface Breach { rig: Rig; frame: THREE.Matrix4; at: THREE.Vector3; t: number; erupted: boolean; crashed: boolean }

const OMEN = 1.0, ARC = 3.8, AFTER = 4;

export class Whales {
  readonly group = new THREE.Group();
  private readonly body: THREE.BufferGeometry;
  private readonly flukes: THREE.BufferGeometry;
  private readonly mat: THREE.MeshStandardMaterial;
  private readonly u = { uGlow: { value: 1 }, uSeaR: { value: 554 } };
  private readonly fx: Effects;
  private readonly swimmers = new Map<number, Swimmer>();
  private readonly breaches: Breach[] = [];
  private readonly spare: Rig[] = [];
  private readonly v = new THREE.Vector3();
  private readonly w = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private frame = 0;

  constructor(fx: Effects) {
    this.fx = fx;
    const g = whaleGeometry();
    this.body = g.body;
    this.flukes = g.flukes;
    this.mat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.05, emissive: 0x6fe6ff, emissiveIntensity: 1 }), 'actor-whale', (s) => {
      Object.assign(s.uniforms, this.u);
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\n' + HEAD)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\n' + HEAD + 'uniform float uGlow, uSeaR;\n' + sharedUniforms('float', 'uTime') + '\n' + sharedUniforms('sampler2D', 'uNoise') + '\n' + sharedUniforms('vec3', 'uSunDir'))
        .replace('#include <emissivemap_fragment>', /* glsl */ `
          // bioluminescent spots and stripes along the flanks, strong at night, faint by day
          vec3 lp = vLocal / ${S.toFixed(4)};
          float spots = smoothstep(0.62, 0.7, texture2D(uNoise, lp.xz * 0.06 + lp.y * 0.02).r);
          float stripe = smoothstep(0.92, 1.0, sin(lp.z * 0.9) * 0.5 + 0.5) * smoothstep(0.5, 2.5, abs(lp.x)) * step(lp.y, 0.5);
          float night = 1.0 - smoothstep(-0.14, 0.12, dot(normalize(vWP), uSunDir));
          totalEmissiveRadiance *= (spots * 1.5 + stripe * 0.8) * uGlow * (0.12 + 0.88 * night) * (0.7 + 0.3 * sin(uTime * 2.0 + lp.z * 0.3));`)
        .replace('#include <dithering_fragment>', /* glsl */ `#include <dithering_fragment>
          // under the surface it fades into the water's blue
          float depth = uSeaR - length(vWP);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.03, 0.12, 0.17), smoothstep(0.0, 9.0, depth) * 0.85);`);
    });
  }

  private rig(): Rig {
    const r = this.spare.pop();
    if (r) { r.root.visible = true; this.group.add(r.root); return r; }
    const root = new THREE.Group(), pose = new THREE.Group(), tail = new THREE.Group();
    root.matrixAutoUpdate = false;
    const body = new THREE.Mesh(this.body, this.mat), fl = new THREE.Mesh(this.flukes, this.mat);
    body.castShadow = fl.castShadow = true;
    tail.position.set(0, 0, -HALF);
    tail.add(fl);
    pose.add(body, tail);
    root.add(pose);
    this.group.add(root);
    return { root, pose, tail };
  }

  private free(r: Rig): void {
    this.group.remove(r.root);
    this.spare.push(r);
  }

  /** A point on the rig in world space, from whale-local coordinates (before its scale). */
  private world(r: Rig, x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    r.pose.updateWorldMatrix(true, false);
    return out.set(x, y, z).applyMatrix4(r.pose.matrixWorld);
  }

  /** The giant breach at `at`, swimming along `head` (any way, if omitted). */
  breach(at: Vec3, head?: Vec3): void {
    const p = new THREE.Vector3(at.x, at.y, at.z), up = p.clone().normalize();
    let h: THREE.Vector3;
    if (head) h = new THREE.Vector3(head.x, head.y, head.z);
    else {
      const a = new THREE.Vector3(), b = new THREE.Vector3(), ang = rand(0, TAU);
      tangents(up, a, b);
      h = a.multiplyScalar(Math.cos(ang)).addScaledVector(b, Math.sin(ang));
    }
    const rig = this.rig();
    rig.root.visible = false;
    rig.pose.scale.setScalar(BREACH);
    this.breaches.push({ rig, frame: frameAt(p, h, SEA.radius + SEA.level, new THREE.Matrix4()), at: up.multiplyScalar(SEA.radius + SEA.level), t: 0, erupted: false, crashed: false });
  }

  /** One frame of whales; returns juice from the breach for the camera at `eye`. */
  update(views: readonly WhaleView[], dt: number, t: number, eye: THREE.Vector3): Juice | null {
    this.u.uSeaR.value = SEA.radius + SEA.level;
    this.frame++;
    let juice: Juice | null = null;
    for (const w of views) {
      let s = this.swimmers.get(w.id);
      if (!s) {
        s = { rig: this.rig(), state: w.state, k: w.k, blow: t - 4, seen: 0, splashed: false, dove: false };
        this.swimmers.set(w.id, s);
      }
      s.seen = this.frame;
      if (s.state !== w.state) {
        if (w.state === 'surface') s.blow = t - 5.2; // a first breath soon after it comes up
        s.splashed = s.dove = false;
      }
      s.state = w.state;
      s.k = w.k;
      this.swim(s, w, dt, t);
    }
    for (const [id, s] of this.swimmers) if (s.seen !== this.frame) { this.free(s.rig); this.swimmers.delete(id); }
    for (let i = this.breaches.length - 1; i >= 0; i--) {
      const j = this.leap(this.breaches[i], dt, eye);
      if (j) juice = j;
      if (this.breaches[i].t > OMEN + ARC + AFTER) { this.free(this.breaches[i].rig); this.breaches.splice(i, 1); }
    }
    return juice;
  }

  // ---------------------------------------------------------------- on its route

  private swim(s: Swimmer, w: WhaleView, dt: number, t: number): void {
    const r = s.rig, k = s.k;
    r.root.visible = w.state !== 'deep';
    if (!r.root.visible) return;
    frameAt(w.pos, w.head, SEA.radius + SEA.level, r.root.matrix);
    r.root.matrixWorldNeedsUpdate = true;
    let y = -1.6, pitch = 0, flukes = Math.sin(t * 1.2) * 0.15;
    if (w.state === 'rising') {
      // up from the deep, nose first
      const e = 1 - (1 - k) * (1 - k);
      y = -18 + e * 16.4;
      pitch = -0.28 * (1 - k);
      flukes = Math.sin(t * 2.2) * 0.3;
    } else if (w.state === 'surface') {
      y = -1.6 + Math.sin(t * 0.6) * 0.25;
      pitch = Math.sin(t * 0.5) * 0.04;
    } else if (w.state === 'diving') {
      // the arch: head down, the tail stock rising, the flukes lifting clear and sliding under
      pitch = 1.2 * smooth(0, 0.6, k);
      const tailY = -1.5 + 7.5 * Math.sin(Math.PI * k * 0.95) - 8 * k * k * k;
      y = tailY - HALF * Math.sin(pitch);
      flukes = 0.4 * Math.sin(Math.PI * k);
    }
    r.pose.position.set(0, y, 0);
    r.pose.rotation.set(pitch, 0, 0);
    r.tail.rotation.x = flukes;
    // spray, breath and drips
    if (w.state === 'rising' && k > 0.85 && !s.splashed) {
      s.splashed = true;
      this.fx.splash(this.world(r, 0, 2, 4, this.v), 0.8);
    }
    if (w.state === 'surface' && t - s.blow > 6.5) {
      s.blow = t;
      this.blow(this.world(r, 0, 2.3, HALF * 0.62, this.v), 1);
    }
    if (w.state === 'diving') {
      if (k > 0.25 && !s.dove) { s.dove = true; this.fx.splash(this.world(r, 0, 1, HALF * 0.4, this.v), 0.7); }
      // water streams off the flukes while they are up
      const tip = this.world(r, rand(-8, 8) * S, 0, -HALF - 2.5 * S, this.w);
      if (tip.length() > seaRadius(tip) + 0.5 && Math.random() < dt * 40) {
        this.up.copy(tip).normalize();
        this.fx.smoke.emit({ x: tip.x, y: tip.y, z: tip.z, vx: -this.up.x, vy: -this.up.y, vz: -this.up.z, life: rand(0.6, 1), size: rand(0.3, 0.6), grow: 1.5, r: 1.25, g: 1.3, b: 1.38, a: 0.6, frame: SPRITE.spray, grav: 12, float: true });
      }
      if (k > 0.82 && k < 0.9 && Math.random() < dt * 8) this.fx.splash(this.world(r, 0, 0, -HALF, this.v), 0.6);
    }
  }

  /** The blow: a column of spray from the blowhole, drifting into mist. */
  private blow(at: THREE.Vector3, big: number): void {
    const up = this.up.copy(at).normalize(), a = new THREE.Vector3(), b = new THREE.Vector3();
    tangents(up, a, b);
    for (let i = 0; i < 46 * big; i++) {
      const ang = rand(0, TAU), out = rand(0, 1.6) * big, sp = rand(11, 19) * Math.sqrt(big);
      const vx = up.x * sp + (a.x * Math.cos(ang) + b.x * Math.sin(ang)) * out;
      const vy = up.y * sp + (a.y * Math.cos(ang) + b.y * Math.sin(ang)) * out;
      const vz = up.z * sp + (a.z * Math.cos(ang) + b.z * Math.sin(ang)) * out;
      this.fx.smoke.emit({ x: at.x, y: at.y, z: at.z, vx, vy, vz, life: rand(1.1, 1.8), size: rand(0.4, 0.9) * big, grow: 3, r: 1.25, g: 1.3, b: 1.36, a: 0.55, frame: SPRITE.spray, grav: 9, drag: 1.4, float: true });
    }
    for (let i = 0; i < 8 * big; i++) {
      const h = rand(6, 10) * big, p = this.w.copy(at).addScaledVector(up, h);
      this.fx.smoke.emit({ x: p.x, y: p.y, z: p.z, vx: up.x * 0.6 + a.x * rand(-1, 1), vy: up.y * 0.6 + a.y * rand(-1, 1), vz: up.z * 0.6 + a.z * rand(-1, 1), life: rand(2.5, 4), size: rand(1.5, 2.5) * big, grow: 2.5, r: 1.2, g: 1.25, b: 1.3, a: 0.22, frame: SPRITE.smoke, drag: 0.6, fadeIn: 0.25 });
    }
  }

  // ---------------------------------------------------------------- the giant breach

  private leap(b: Breach, dt: number, eye: THREE.Vector3): Juice | null {
    b.t += dt;
    const r = b.rig, fx = this.fx, up = this.up.copy(b.at).normalize(), L = WHALE_LENGTH * BREACH;
    const near = THREE.MathUtils.clamp(1 - b.at.distanceTo(eye) / 700, 0.15, 1);
    let juice: Juice | null = null;
    const a = new THREE.Vector3(), c = new THREE.Vector3();
    tangents(up, a, c);
    const ring = (rad: number, lift: number, out: THREE.Vector3) => {
      const ang = rand(0, TAU);
      return out.copy(b.at).addScaledVector(a, Math.cos(ang) * rad).addScaledVector(c, Math.sin(ang) * rad).addScaledVector(up, lift);
    };
    if (b.t < OMEN) {
      // the omen: the sea boils, a glow wells up from below
      const k = b.t / OMEN;
      for (let i = 0; i < 6; i++) {
        const p = ring(rand(0, 10 + k * 18), 0.3, this.v);
        fx.smoke.emit({ x: p.x, y: p.y, z: p.z, vx: up.x * rand(1, 4), vy: up.y * rand(1, 4), vz: up.z * rand(1, 4), life: rand(0.5, 0.9), size: rand(0.8, 1.6), grow: 2, r: 1.25, g: 1.3, b: 1.36, a: 0.55, frame: SPRITE.spray, grav: 9, float: true });
      }
      if (Math.random() < dt * 6) {
        const p = ring(rand(0, 12), 0.15, this.v);
        fx.smoke.emit({ x: p.x, y: p.y, z: p.z, life: 1.2, size: 3, grow: 4, r: 1.3, g: 1.35, b: 1.4, a: 0.6, frame: SPRITE.ring, mode: 2, fadeIn: 0 });
      }
      fx.light(this.v.copy(b.at).addScaledVector(up, 0.5), 18 + k * 20, AQUA, 0.4 + k * 0.8);
      if (b.t < dt * 1.5) juice = { shake: 0.15 * near, haptic: 'light' };
      return juice;
    }
    const k = Math.min(1, (b.t - OMEN) / ARC);
    r.root.visible = k < 1;
    r.root.matrix.copy(b.frame);
    r.root.matrixWorldNeedsUpdate = true;
    // a ballistic arc: out nose first and steep, level at the top, rolling onto its side to slam down flat
    const pitch = -1.15 * (1 - smooth(0, 0.55, k)) + 0.45 * smooth(0.5, 1, k);
    const roll = smooth(0.15, 0.9, k) * 1.7;
    const y = -0.47 * L + Math.sin(k * Math.PI) * 0.82 * L;
    r.pose.position.set(0, y, (k - 0.5) * 0.55 * L);
    r.pose.rotation.set(pitch, 0, roll, 'YXZ');
    r.tail.rotation.x = Math.sin(b.t * 3) * 0.3 * (1 - k);
    // where the body crosses the water it throws spray; above it, water streams off
    if (k < 1) {
      for (let i = 0; i <= 12; i++) {
        const p = this.world(r, rand(-2, 2), rand(-2, 2), -HALF + (i / 12) * WHALE_LENGTH, this.v);
        const h = p.length() - seaRadius(p);
        this.w.copy(p).normalize();
        if (Math.abs(h) < 3 && (k < 0.4 || k > 0.72)) {
          for (let n = 0; n < 3; n++) {
            const o = ring(rand(0, 3), 0, c.clone()).sub(b.at).multiplyScalar(rand(1, 4));
            const s = rand(8, 22);
            fx.smoke.emit({ x: p.x, y: p.y, z: p.z, vx: this.w.x * s + o.x, vy: this.w.y * s + o.y, vz: this.w.z * s + o.z, life: rand(1, 1.8), size: rand(1, 2.4), grow: 2.5, r: 1.25, g: 1.3, b: 1.38, a: 0.7, frame: SPRITE.spray, grav: 14, drag: 0.5, float: true });
          }
        } else if (h > 3 && Math.random() < 0.6) {
          fx.smoke.emit({ x: p.x, y: p.y, z: p.z, vx: -this.w.x * 2, vy: -this.w.y * 2, vz: -this.w.z * 2, life: rand(0.8, 1.4), size: rand(0.5, 1.1), grow: 1.6, r: 1.25, g: 1.3, b: 1.38, a: 0.55, frame: SPRITE.spray, grav: 12, float: true });
        }
      }
    }
    if (!b.erupted) {
      // the eruption: a column of white water as it bursts out
      b.erupted = true;
      for (let i = 0; i < 140; i++) {
        const p = ring(rand(0, 9), 0.5, this.v), s = rand(18, 42);
        const o = this.w.copy(p).sub(b.at).multiplyScalar(rand(0.3, 1));
        fx.smoke.emit({ x: p.x, y: p.y, z: p.z, vx: up.x * s + o.x, vy: up.y * s + o.y, vz: up.z * s + o.z, life: rand(1.8, 2.8), size: rand(1.4, 3.2), grow: 2.6, r: 1.28, g: 1.33, b: 1.4, a: 0.75, frame: SPRITE.spray, grav: 15, drag: 0.35, float: true });
      }
      fx.splash(b.at, 3);
      juice = { shake: 0.45 * near, kick: 2 * near, haptic: 'medium' };
    }
    if (!b.crashed && k > 0.8) {
      // the slam: a wall of water, a shockwave out across the sea, mist hanging after
      b.crashed = true;
      const centre = this.world(r, 0, 0, 0, new THREE.Vector3());
      const ground = centre.clone().normalize().multiplyScalar(seaRadius(centre));
      for (let i = -2; i <= 2; i++) fx.splash(this.world(r, 0, 0, i * HALF * 0.4, this.v), 3.5);
      const cu = ground.clone().normalize(), ca = new THREE.Vector3(), cb = new THREE.Vector3();
      tangents(cu, ca, cb);
      for (let i = 0; i < 220; i++) {
        const ang = rand(0, TAU), rad = rand(6, 26), out = rand(6, 22), lift = rand(14, 38);
        const dx = Math.cos(ang), dz = Math.sin(ang);
        const p = this.v.copy(ground).addScaledVector(ca, dx * rad).addScaledVector(cb, dz * rad);
        fx.smoke.emit({ x: p.x, y: p.y, z: p.z, vx: ca.x * dx * out + cb.x * dz * out + cu.x * lift, vy: ca.y * dx * out + cb.y * dz * out + cu.y * lift, vz: ca.z * dx * out + cb.z * dz * out + cu.z * lift, life: rand(2, 3.2), size: rand(1.8, 4), grow: 2.4, r: 1.3, g: 1.35, b: 1.42, a: 0.8, frame: SPRITE.spray, grav: 15, drag: 0.4, float: true });
      }
      const g = ground.clone().addScaledVector(cu, 0.2);
      fx.smoke.emit({ x: g.x, y: g.y, z: g.z, life: 2.4, size: 10, grow: 16, r: 1.4, g: 1.42, b: 1.46, a: 0.85, frame: SPRITE.ring, mode: 2, fadeIn: 0 });
      fx.smoke.emit({ x: g.x, y: g.y, z: g.z, life: 3.4, size: 8, grow: 11, r: 1.3, g: 1.34, b: 1.4, a: 0.6, frame: SPRITE.ring, mode: 2, fadeIn: 0 });
      fx.glow.emit({ x: g.x, y: g.y, z: g.z, life: 1.4, size: 12, grow: 12, r: 0.5, g: 1.4, b: 1.8, a: 1, frame: SPRITE.ring, mode: 2, fadeIn: 0 });
      for (let i = 0; i < 36; i++) {
        const p = this.v.copy(ground).addScaledVector(ca, rand(-30, 30)).addScaledVector(cb, rand(-30, 30)).addScaledVector(cu, rand(2, 14));
        fx.smoke.emit({ x: p.x, y: p.y, z: p.z, vx: cu.x * rand(0.5, 2), vy: cu.y * rand(0.5, 2), vz: cu.z * rand(0.5, 2), life: rand(4, 6.5), size: rand(6, 11), grow: 2.2, r: 1.2, g: 1.24, b: 1.3, a: 0.3, frame: SPRITE.smoke, drag: 0.5, fadeIn: 0.15 });
      }
      juice = { shake: 0.95 * near, kick: 5 * near, flash: 0.22 * near, flashColor: 0xdff4ff, hitStop: 0.06 * near, haptic: 'heavy' };
    }
    if (k >= 1 && Math.random() < dt * 3) {
      // the foam it leaves
      const p = ring(rand(0, 30), 0.12, this.v);
      fx.smoke.emit({ x: p.x, y: p.y, z: p.z, life: 2.5, size: rand(4, 8), grow: 3, r: 1.3, g: 1.34, b: 1.4, a: 0.45, frame: SPRITE.ring, mode: 2, fadeIn: 0.1 });
    }
    return juice;
  }

  /** Is a breach under way (for the dev page and the camera)? */
  get breaching(): boolean { return this.breaches.length > 0; }

  dispose(): void {
    this.body.dispose();
    this.flukes.dispose();
    this.mat.dispose();
  }
}

const AQUA = new THREE.Color(0.35, 0.95, 1.1);
