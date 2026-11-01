// The living things: your gull, who flies with you and fetches parcels, and the leviathan, a moon-whale that rises twice a
// match with a hoard on its back. Both lofted in code.
import * as THREE from 'three';
import { patch } from './engine.ts';

// ---------------------------------------------------------------- a small mesh builder with vertex colours

class Mesher {
  pos: number[] = []; nor: number[] = []; col: number[] = []; idx: number[] = [];
  /** A lofted tube: rings of (center, radii, colour) joined in order. */
  loft(rings: { c: THREE.Vector3; rx: number; ry: number; col: THREE.Color; up?: THREE.Color }[], sides = 12): void {
    const base = this.pos.length / 3;
    for (const r of rings) {
      for (let i = 0; i <= sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        const x = Math.cos(a), y = Math.sin(a);
        this.pos.push(r.c.x + x * r.rx, r.c.y + y * r.ry, r.c.z);
        const n = new THREE.Vector3(x / Math.max(r.rx, 1e-3), y / Math.max(r.ry, 1e-3), 0).normalize();
        this.nor.push(n.x, n.y, n.z);
        const c = r.up && y > 0.15 ? r.up : r.col;
        this.col.push(c.r, c.g, c.b);
      }
    }
    for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < sides; i++) {
      const a = base + j * (sides + 1) + i, b = a + 1, c = a + sides + 1, d = c + 1;
      this.idx.push(a, b, c, b, d, c);
    }
  }
  /** A flat, slightly thick blade from a list of outline points (x,z) in its plane, coloured by a function. */
  blade(outline: [number, number][], thick: number, color: (x: number, z: number) => THREE.Color, m: THREE.Matrix4): void {
    const n = outline.length;
    const cx = outline.reduce((a, p) => a + p[0], 0) / n, cz = outline.reduce((a, p) => a + p[1], 0) / n;
    for (const side of [1, -1]) {
      const b0 = this.pos.length / 3;
      const nn = new THREE.Vector3(0, side, 0).transformDirection(m);
      const c0 = new THREE.Vector3(cx, side * thick, cz).applyMatrix4(m);
      this.pos.push(c0.x, c0.y, c0.z); this.nor.push(nn.x, nn.y, nn.z);
      const cc = color(cx, cz); this.col.push(cc.r, cc.g, cc.b);
      for (const [x, z] of outline) {
        const p = new THREE.Vector3(x, 0, z).applyMatrix4(m);
        this.pos.push(p.x, p.y, p.z); this.nor.push(nn.x, nn.y, nn.z);
        const c = color(x, z); this.col.push(c.r, c.g, c.b);
      }
      for (let i = 0; i < n; i++) {
        const a = b0 + 1 + i, b = b0 + 1 + ((i + 1) % n);
        if (side > 0) this.idx.push(b0, b, a); else this.idx.push(b0, a, b);
      }
    }
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g;
  }
}

const C = (h: number) => new THREE.Color(h);

// ---------------------------------------------------------------- the gull

export interface GullLook { scarf: number; hat: 'none' | 'crown' | 'flower' | 'cap' }

export class Gull {
  readonly root = new THREE.Group();
  private readonly wingL = new THREE.Group();
  private readonly wingR = new THREE.Group();
  private readonly handL = new THREE.Group();
  private readonly handR = new THREE.Group();
  private readonly scarf: THREE.Mesh;
  private readonly hats = new Map<string, THREE.Object3D>();
  readonly parcel: THREE.Mesh;
  private flapT = 0;
  // flight state
  pos = new THREE.Vector3(0, 30, 0);
  vel = new THREE.Vector3();
  heading = 0;
  bank = 0;

  constructor() {
    const mat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }), 'gull');
    const white = C(0xf4f2ec), grey = C(0xb9c0c8), dark = C(0x2a2c30), beak = C(0xf2c230);
    // body and head, nose along +z
    const b = new Mesher();
    const ring = (z: number, y: number, rx: number, ry: number, col = white, up?: THREE.Color) => ({ c: new THREE.Vector3(0, y, z), rx, ry, col, up });
    b.loft([ring(-0.75, 0.05, 0.02, 0.02), ring(-0.6, 0.04, 0.12, 0.06, white, grey), ring(-0.3, 0, 0.2, 0.17, white, grey), ring(0, 0, 0.24, 0.22, white, grey), ring(0.28, 0.04, 0.2, 0.2), ring(0.42, 0.14, 0.15, 0.16), ring(0.56, 0.2, 0.13, 0.13), ring(0.66, 0.2, 0.08, 0.08)], 10);
    b.loft([ring(0.66, 0.19, 0.045, 0.04, beak), ring(0.8, 0.17, 0.03, 0.028, beak), ring(0.86, 0.15, 0.012, 0.016, C(0xd84020))], 6);
    const body = new THREE.Mesh(b.build(), mat);
    body.castShadow = true;
    // eyes
    const eyeM = patch(new THREE.MeshBasicMaterial({ color: 0x111111 }), 'gull-eye');
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), eyeM); e.position.set(s * 0.1, 0.25, 0.58); body.add(e); }
    // tail fan
    const tail = new Mesher();
    tail.blade([[0, -0.55], [-0.14, -0.85], [0, -0.9], [0.14, -0.85]], 0.01, () => white, new THREE.Matrix4());
    body.add(new THREE.Mesh(tail.build(), mat));
    // wings: an arm and a hand, hinged so they can fold and flap
    const wingColor = (x: number, z: number) => (Math.abs(x) > 0.55 && z < 0.05 ? dark : z < -0.12 ? C(0xa8b0b8) : grey);
    for (const s of [-1, 1] as const) {
      const arm = new Mesher(), hand = new Mesher();
      arm.blade([[0, 0.12], [s * 0.62, 0.1], [s * 0.62, -0.18], [0, -0.22]], 0.012, (x, z) => wingColor(x, z), new THREE.Matrix4());
      hand.blade([[0, 0.1], [s * 0.5, 0.02], [s * 0.78, -0.08], [s * 0.4, -0.2], [0, -0.18]], 0.01, (x, z) => (Math.abs(x) > 0.25 ? (Math.abs(x) > 0.6 && z > -0.08 && z < -0.02 ? white : dark) : wingColor(x + s * 0.6, z)), new THREE.Matrix4());
      const wing = s < 0 ? this.wingL : this.wingR, h = s < 0 ? this.handL : this.handR;
      wing.position.set(s * 0.14, 0.1, 0.05);
      const am = new THREE.Mesh(arm.build(), mat), hm = new THREE.Mesh(hand.build(), mat);
      am.castShadow = hm.castShadow = true;
      wing.add(am);
      h.position.set(s * 0.6, 0, 0);
      h.add(hm);
      wing.add(h);
      body.add(wing);
    }
    // the little things you can dress your gull in
    this.scarf = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.045, 6, 14).rotateY(Math.PI / 2).rotateZ(Math.PI / 2), patch(new THREE.MeshStandardMaterial({ color: 0xd8402a, roughness: 0.8 }), 'gull-bit'));
    this.scarf.position.set(0, 0.12, 0.38);
    this.scarf.rotation.x = -0.6;
    body.add(this.scarf);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.08, 7, 1, true), patch(new THREE.MeshStandardMaterial({ color: 0xffc843, metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide }), 'gull-bit'));
    crown.position.set(0, 0.36, 0.56);
    const flower = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), patch(new THREE.MeshStandardMaterial({ color: 0xff8fb8, roughness: 0.6 }), 'gull-bit'));
    flower.position.set(0.09, 0.33, 0.55);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), patch(new THREE.MeshStandardMaterial({ color: 0x2b4a8a, roughness: 0.8 }), 'gull-bit'));
    cap.position.set(0, 0.29, 0.55);
    this.hats.set('crown', crown).set('flower', flower).set('cap', cap);
    for (const h of this.hats.values()) { h.visible = false; body.add(h); }
    // the parcel it carries home: a bundle of kelp tied round something bright
    this.parcel = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 1), patch(new THREE.MeshStandardMaterial({ color: 0x4b6b3a, roughness: 0.9, emissive: 0xffc860, emissiveIntensity: 0.6 }), 'parcel'));
    this.parcel.position.set(0, -0.35, 0.05);
    this.parcel.visible = false;
    body.add(this.parcel);
    this.root.add(body);
    this.root.scale.setScalar(2.4);
  }

  setLook(l: GullLook): void {
    (this.scarf.material as THREE.MeshStandardMaterial).color.setHex(l.scarf);
    this.scarf.visible = l.scarf !== 0;
    for (const [k, h] of this.hats) h.visible = k === l.hat;
  }

  /** Flap hard, glide, or fold to perch; `bank` rolls into turns. */
  pose(mode: 'flap' | 'glide' | 'perch', dt: number): void {
    const rate = mode === 'flap' ? 9 : mode === 'glide' ? 1.2 : 0;
    this.flapT += dt * rate;
    const amp = mode === 'flap' ? 0.65 : mode === 'glide' ? 0.08 : 0;
    const f = Math.sin(this.flapT) * amp;
    const fold = mode === 'perch' ? 1 : 0;
    this.wingL.rotation.set(0, fold * 1.2, -f + fold * 0.3);
    this.wingR.rotation.set(0, -fold * 1.2, f - fold * 0.3);
    this.handL.rotation.set(0, fold * 2.2, -Math.sin(this.flapT - 0.8) * amp * 0.8);
    this.handR.rotation.set(0, -fold * 2.2, Math.sin(this.flapT - 0.8) * amp * 0.8);
    this.root.position.copy(this.pos);
    this.root.rotation.set(-Math.atan2(this.vel.y, Math.max(1, Math.hypot(this.vel.x, this.vel.z))) * 0.6, this.heading, this.bank, 'YXZ');
  }
}

// ---------------------------------------------------------------- the leviathan

const LEV_HEAD = /* glsl */ `
varying vec3 vLocal;
`;

export class Leviathan {
  readonly root = new THREE.Group();
  private readonly body: THREE.Mesh;
  private readonly tail = new THREE.Group();
  private readonly u = { uGlow: { value: 1 } };
  constructor() {
    const m = new Mesher();
    const back = C(0x1d2a4a), belly = C(0xc9d4e2);
    // nose at +z, 40 m long
    const prof = (s: number) => {
      // s 0 tail .. 1 nose
      const r = s < 0.15 ? 0.6 + s * 14 : s < 0.75 ? 2.7 + Math.sin(((s - 0.15) / 0.6) * Math.PI * 0.5) * 2.4 : 5.1 - Math.pow((s - 0.75) / 0.25, 2) * 3.2;
      return r;
    };
    const rings: { c: THREE.Vector3; rx: number; ry: number; col: THREE.Color; up?: THREE.Color }[] = [];
    for (let i = 0; i <= 28; i++) {
      const s = i / 28, r = prof(s);
      rings.push({ c: new THREE.Vector3(0, s > 0.8 ? -(s - 0.8) * 3 : 0, (s - 0.5) * 40), rx: r * 1.05, ry: r * 0.82, col: belly, up: back });
    }
    m.loft(rings, 18);
    // long pectoral fins, the moon-whale's wings
    for (const sd of [-1, 1]) {
      const mt = new THREE.Matrix4().makeRotationZ(sd * -0.35).setPosition(sd * 4.2, -1.6, 7);
      m.blade([[0, 2], [sd * 6, 0.5], [sd * 13, -3.5], [sd * 12, -5], [sd * 5, -3.5], [0, -2]], 0.25, (x) => (Math.abs(x) > 9 ? C(0xbfd0e8) : back), mt);
    }
    // dorsal ridge
    m.blade([[0, 0], [0, -4]], 0.1, () => back, new THREE.Matrix4());
    const geo = m.build();
    const mat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.1, emissive: 0x6fe6ff, emissiveIntensity: 1 }), 'leviathan', (s) => {
      Object.assign(s.uniforms, this.u);
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\n' + LEV_HEAD).replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\n' + LEV_HEAD + 'uniform float uGlow;')
        .replace('#include <emissivemap_fragment>', /* glsl */ `
          // bioluminescent spots and stripes along the flanks
          float spots = smoothstep(0.62, 0.7, texture(uNoise, vLocal.xz * 0.06 + vLocal.y * 0.02).r);
          float stripe = smoothstep(0.92, 1.0, sin(vLocal.z * 0.9) * 0.5 + 0.5) * smoothstep(0.5, 2.5, abs(vLocal.x)) * step(vLocal.y, 0.5);
          totalEmissiveRadiance *= (spots * 1.5 + stripe * 0.8) * uGlow * (0.7 + 0.3 * sin(uTime * 2.0 + vLocal.z * 0.3));`);
    });
    this.body = new THREE.Mesh(geo, mat);
    this.body.castShadow = true;
    // flukes on their own pivot, to beat
    const fm = new Mesher();
    fm.blade([[0, 0.5], [7, -1], [9.5, -3.5], [6, -3], [0, -1.5], [-6, -3], [-9.5, -3.5], [-7, -1]], 0.25, (x) => (Math.abs(x) > 7 ? C(0xbfd0e8) : back), new THREE.Matrix4());
    const fl = new THREE.Mesh(fm.build(), mat);
    fl.castShadow = true;
    this.tail.position.set(0, 0, -20);
    this.tail.add(fl);
    this.root.add(this.body, this.tail);
    this.root.visible = false;
  }

  /** Places it along the breach: k runs 0 (still below) .. 1 (back under), the arc rising and falling. */
  breach(x: number, z: number, yaw: number, k: number, t: number): void {
    this.root.visible = k > 0 && k < 1;
    if (!this.root.visible) return;
    // a ballistic arc: out of the water nose first, rolling, then a crash on its back
    const y = -24 + Math.sin(k * Math.PI) * 44;
    this.root.position.set(x + Math.sin(yaw) * (k - 0.5) * 30, y, z + Math.cos(yaw) * (k - 0.5) * 30);
    this.root.rotation.set(-(1.1 - k * 2.2) * 0.9, yaw, Math.sin(k * Math.PI) * 0.9, 'YXZ');
    this.tail.rotation.x = Math.sin(t * 4) * 0.25;
    this.u.uGlow.value = 1.2;
  }
}
