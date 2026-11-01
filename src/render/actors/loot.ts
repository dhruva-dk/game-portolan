// Loot on the water: each item floats as a token of itself (the gun, the shield crystal, the repair cask, the coin),
// turning slowly and bobbing on the swell, glowing in its rarity's colour (grey, green, blue, purple, gold) over a
// halo on the water and under a column of light that rises higher the rarer it is.
import * as THREE from 'three';
import { onSea, patch, tangents } from './common.ts';
import { RARITY_GLOW, type Effects } from './effects.ts';
import { SPRITE } from './particles.ts';
import { WEAPONS, type LootKind, type LootView, type Weapon } from './view.ts';

const KINDS: readonly LootKind[] = [...WEAPONS, 'smallShield', 'bigShield', 'repairKit', 'fullRepair', 'coin'];
const CAP = 200;

function tokenGeometry(kind: LootKind, barrels: Map<Weapon, THREE.BufferGeometry>): THREE.BufferGeometry {
  switch (kind) {
    case 'smallShield': return new THREE.OctahedronGeometry(0.6, 0).scale(0.8, 1.3, 0.8);
    case 'bigShield': return new THREE.OctahedronGeometry(0.85, 0).scale(0.85, 1.45, 0.85);
    case 'repairKit': return new THREE.CylinderGeometry(0.42, 0.42, 1.0, 12).rotateZ(Math.PI / 2);
    case 'fullRepair': return new THREE.CylinderGeometry(0.6, 0.6, 1.3, 14).rotateZ(Math.PI / 2);
    case 'coin': return new THREE.CylinderGeometry(0.55, 0.55, 0.12, 20).rotateX(Math.PI / 2);
    default: {
      const g = barrels.get(kind)!.clone();
      g.computeBoundingBox();
      const c = g.boundingBox!.getCenter(new THREE.Vector3());
      return g.translate(-c.x, -c.y, -c.z).scale(1.15, 1.15, 1.15);
    }
  }
}

const BEAM_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vC;
varying vec3 vWp;
varying vec3 vN;
varying vec3 vAxis;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWp = wp.xyz;
  vN = normalize(mat3(instanceMatrix) * vec3(position.x, 0.0, position.z));
  vAxis = normalize(mat3(instanceMatrix) * vec3(0.0, 1.0, 0.0));
  vC = instanceColor;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const BEAM_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying vec3 vC;
varying vec3 vWp;
varying vec3 vN;
varying vec3 vAxis;
void main() {
  float a = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 2.2);
  a *= 0.75 + 0.25 * sin(vUv.y * 40.0 - uTime * 6.0);
  // a soft column: bright down the core, nothing at the rim
  vec3 vd = normalize(cameraPosition - vWp);
  vd = normalize(vd - vAxis * dot(vd, vAxis));
  float core = abs(dot(normalize(vN), vd));
  a *= core * core * 1.6;
  // a marker for the distance; up close the token itself speaks
  a *= smoothstep(10.0, 55.0, distance(cameraPosition, vWp));
  gl_FragColor = vec4(vC * a, 0.0);
}`;

export class Loot {
  readonly group = new THREE.Group();
  private readonly tokens = new Map<LootKind, THREE.InstancedMesh>();
  private readonly beams: THREE.InstancedMesh;
  private readonly fx: Effects;
  private readonly tmp = new THREE.Matrix4();
  private readonly rot = new THREE.Matrix4();
  private readonly sc = new THREE.Matrix4();
  private readonly up = new THREE.Vector3();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly beamU = { uTime: { value: 0 } };

  constructor(fx: Effects, barrels: Map<Weapon, THREE.BufferGeometry>) {
    this.fx = fx;
    for (const k of KINDS) {
      const shieldy = k === 'smallShield' || k === 'bigShield';
      const base = shieldy ? { color: 0x9fe8ff, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.88 }
        : k === 'coin' ? { color: 0xffc843, roughness: 0.25, metalness: 0.95 }
          : k === 'repairKit' || k === 'fullRepair' ? { color: 0x8b6a48, roughness: 0.75 }
            : { color: 0x3c3a3a, roughness: 0.35, metalness: 0.85 };
      const m = patch(new THREE.MeshStandardMaterial({ ...base, emissive: 0xffffff, emissiveIntensity: shieldy ? 0.6 : k === 'coin' ? 0.35 : 0.28 }), 'actor-token', (s) => {
        s.fragmentShader = s.fragmentShader
          .replace('#include <color_fragment>', '')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\ntotalEmissiveRadiance *= vColor;\n#endif');
      });
      const mesh = new THREE.InstancedMesh(tokenGeometry(k, barrels), m, CAP);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.tokens.set(k, mesh);
      this.group.add(mesh);
    }
    const bc = new THREE.CylinderGeometry(0.5, 0.8, 1, 12, 1, true).translate(0, 0.5, 0);
    const bm = new THREE.ShaderMaterial({
      vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, uniforms: this.beamU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    this.beams = new THREE.InstancedMesh(bc, bm, CAP);
    this.beams.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
    this.beams.count = 0;
    this.beams.frustumCulled = false;
    this.beams.renderOrder = 6;
    this.group.add(this.beams);
  }

  update(items: readonly LootView[], t: number, eye: THREE.Vector3): void {
    this.beamU.uTime.value = t;
    const counts = new Map<LootKind, number>();
    let nb = 0;
    const col = new THREE.Color();
    for (const l of items) {
      const d = eye.distanceTo(this.p.set(l.pos.x, l.pos.y, l.pos.z));
      if (d > 520) continue;
      const c = RARITY_GLOW[l.rarity];
      this.up.copy(this.p).normalize();
      tangents(this.up, this.a, this.b);
      // the beam, standing up from the water
      const sea = onSea(this.p, 0, new THREE.Vector3());
      if (nb < CAP) {
        const h = 14 + l.rarity * 7, w = d > 300 ? 1.5 : 1;
        this.tmp.makeBasis(this.a, this.up, this.b).setPosition(sea);
        this.sc.makeScale(w, h, w);
        this.beams.setMatrixAt(nb, this.tmp.multiply(this.sc));
        this.beams.setColorAt(nb, col.copy(c).multiplyScalar(1.6 * (0.35 + l.rarity * 0.18) * w));
        nb++;
      }
      if (d > 260) continue;
      const mesh = this.tokens.get(l.kind)!;
      const i = counts.get(l.kind) ?? 0;
      if (i >= CAP) continue;
      counts.set(l.kind, i + 1);
      // pops up out of the water when it appears, then bobs and turns
      const pop = Math.min(1, l.age * 2.5);
      const lift = 1.5 + Math.sin(t * 2 + l.id) * 0.25 - (1 - pop) * 2;
      this.tmp.makeBasis(this.a, this.up, this.b).setPosition(sea.clone().addScaledVector(this.up, lift));
      this.rot.makeRotationY(t * 1.4 + l.id).multiply(this.sc.makeRotationX(l.kind === 'repairKit' || l.kind === 'fullRepair' ? 0.3 : 0.15));
      this.tmp.multiply(this.rot).multiply(this.sc.makeScale(0.4 + pop * 0.6, 0.4 + pop * 0.6, 0.4 + pop * 0.6));
      mesh.setMatrixAt(i, this.tmp);
      mesh.setColorAt(i, c);
      // a halo on the water under it
      if (d < 140) {
        const r = onSea(this.p, 0.12, this.p);
        this.fx.glow.emit({ x: r.x, y: r.y, z: r.z, life: 0, size: 1.6 + Math.sin(t * 3 + l.id) * 0.15, r: c.r * 1.2, g: c.g * 1.2, b: c.b * 1.2, a: 0.7, frame: SPRITE.ring, mode: 2, rot: 0 });
      }
    }
    for (const [k, mesh] of this.tokens) {
      mesh.count = counts.get(k) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.beams.count = nb;
    this.beams.instanceMatrix.needsUpdate = true;
    if (this.beams.instanceColor) this.beams.instanceColor.needsUpdate = true;
  }
}
