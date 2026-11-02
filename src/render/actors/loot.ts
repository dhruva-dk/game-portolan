// Loot on the water: each item floats as a token of itself (the gun, the shield crystal, the repair cask, the coin),
// turning slowly and bobbing on the swell, glowing in its rarity's colour (grey, green, blue, purple, gold) over a
// halo on the water and under a column of light that rises higher the rarer it is.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { onSea, patch, tangents } from './common.ts';
import { RARITY_GLOW, type Effects } from './effects.ts';
import { SPRITE } from './particles.ts';
import { WEAPONS, type LootKind, type LootView, type Weapon } from './view.ts';

const KINDS: readonly LootKind[] = [...WEAPONS, 'smallShield', 'bigShield', 'repairKit', 'fullRepair', 'coin'];
const CAP = 200;

/** A cask on its side: bellied staves, a hoop near each end and one round each side of the belly. */
function cask(r: number, len: number): THREE.BufferGeometry {
  // u runs from the belly (0) to an end (1)
  const us = [0, 0.2, 0.4, 0.44, 0.56, 0.6, 0.82, 0.86, 0.96, 1];
  const rad = (u: number) => r * (0.84 + 0.16 * Math.cos((u * Math.PI) / 2)) * ((u >= 0.44 && u <= 0.56) || (u >= 0.86 && u <= 0.96) ? 1.05 : 1);
  const pts = [new THREE.Vector2(0, -len / 2)];
  for (const u of [...us].reverse()) pts.push(new THREE.Vector2(rad(u), (-u * len) / 2));
  for (const u of us.slice(1)) pts.push(new THREE.Vector2(rad(u), (u * len) / 2));
  pts.push(new THREE.Vector2(0, len / 2));
  return new THREE.LatheGeometry(pts, 14).rotateZ(Math.PI / 2);
}

/** A ship's gun as it stands on deck: its mount, and its barrel on the pivot. */
export interface GunShape { base: THREE.BufferGeometry; barrel: THREE.BufferGeometry; pivot: number }

function tokenGeometry(kind: LootKind, guns: Map<Weapon, GunShape>): THREE.BufferGeometry {
  switch (kind) {
    case 'smallShield': return new THREE.OctahedronGeometry(0.6, 0).scale(0.8, 1.3, 0.8);
    case 'bigShield': return new THREE.OctahedronGeometry(0.85, 0).scale(0.85, 1.45, 0.85);
    case 'repairKit': return cask(0.46, 1.0);
    case 'fullRepair': return cask(0.64, 1.3);
    case 'coin': return new THREE.CylinderGeometry(0.55, 0.55, 0.12, 20).rotateX(Math.PI / 2);
    default: {
      // the gun on its mount with the barrel cocked up, so it reads as a gun and not a length of pipe on the water;
      // the broadside's mount is only a sighting post, so its short gun sits on a truck carriage of its own
      const gun = guns.get(kind)!;
      if (kind === 'broadside') return centred(mergeGeometries([...truck(), plain(gun.barrel.clone().rotateX(-0.15).translate(0, 0.62, -0.1))]));
      const barrel = gun.barrel.clone().rotateX(-0.4).translate(0, gun.pivot, 0);
      return centred(mergeGeometries([gun.base.clone(), barrel]));
    }
  }
}

/** A ship's gun carriage: two cheeks on a bed, on four small wheels, in the barrel's frame (along +z). */
function truck(): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [new THREE.BoxGeometry(0.6, 0.1, 1.0).translate(0, 0.24, 0)];
  for (const x of [-0.3, 0.3]) parts.push(new THREE.BoxGeometry(0.12, 0.4, 1.05).translate(x, 0.44, 0));
  for (const z of [-0.36, 0.38]) {
    parts.push(new THREE.CylinderGeometry(0.05, 0.05, 0.84, 6).rotateZ(Math.PI / 2).translate(0, 0.17, z));
    for (const x of [-0.4, 0.4]) parts.push(new THREE.CylinderGeometry(0.17, 0.17, 0.1, 12).rotateZ(Math.PI / 2).translate(x, 0.17, z));
  }
  return parts;
}

/** The ship builder's extra attributes dropped, so its parts merge with plain shapes. */
function plain(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  return g;
}

/** Centred on its bounding box and scaled up a little to read on the water. */
function centred(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.computeBoundingBox();
  const c = g.boundingBox!.getCenter(new THREE.Vector3());
  return g.translate(-c.x, -c.y, -c.z).scale(1.15, 1.15, 1.15);
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

  constructor(fx: Effects, guns: Map<Weapon, GunShape>) {
    this.fx = fx;
    for (const k of KINDS) {
      const shieldy = k === 'smallShield' || k === 'bigShield';
      const base = shieldy ? { color: 0x9fe8ff, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.88 }
        : k === 'coin' ? { color: 0xffc843, roughness: 0.25, metalness: 0.95 }
          : k === 'repairKit' || k === 'fullRepair' ? { color: 0x8b6a48, roughness: 0.75 }
            // iron with enough of a matt skin for the sun to model it: fully metal, with no sky in the scene for it to
            // mirror, it showed only its glow, a flat grey cutout on the water
            : { color: 0x58534c, roughness: 0.5, metalness: 0.45 };
      const m = patch(new THREE.MeshStandardMaterial({ ...base, emissive: 0xffffff, emissiveIntensity: shieldy ? 0.6 : k === 'coin' ? 0.35 : 0.28 }), 'actor-token', (s) => {
        s.fragmentShader = s.fragmentShader
          .replace('#include <color_fragment>', '')
          // the rarity's glow gathers at the edges, so it rims the token's shape instead of filling it in flat
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\ntotalEmissiveRadiance *= vColor;\n#endif\ntotalEmissiveRadiance *= 0.3 + 1.4 * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.0);');
      });
      const mesh = new THREE.InstancedMesh(tokenGeometry(k, guns), m, CAP);
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
