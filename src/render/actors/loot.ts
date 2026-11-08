// Loot on the water, drawn as the chart would draw it: a cask (shields, repairs, coin) or a crate (a gun) rides the
// swell inside an iron outline, and a column of hatching in its rarity's ink stands over it, scrolling upward, so a
// piece reads as a mark inked onto the sea and its colour as how good it is. The hatching is written on the screen
// in the chart's own inks, after the frame is exposed and toned, thins to a line of its colour far off, and fills in
// cross-hatched when the piece is in the player's reach. Five draw calls for all of it: two shapes, their outlines,
// and the hatching.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { onSea, tangents } from './common.ts';
import { hatchNodeMaterial, outlineNodeMaterial, woodNodeMaterial } from './tsl/loot.ts';
import { INKS, type InkName } from '../../chart/inks.ts';
import { WEAPONS, type LootKind, type LootView } from './view.ts';

/** Each rarity's ink, common to legendary, from the chart's pots: silver, verdigris, azurite, vermilion, shell gold.
 *  The interface takes its rarity colours from here too, so a mark on the water matches its slot in the hold. */
export const LOOT_INKS: readonly InkName[] = ['silver', 'green', 'blue', 'rubric', 'gold'];
/** The same as '#rrggbb', by rarity, for the interface's styles. */
export const LOOT_INK_HEX: readonly string[] = LOOT_INKS.map((n) => '#' + INKS[n].rgb.map((c) => c.toString(16).padStart(2, '0')).join(''));

/** A pot as a linear colour for the renderer. */
const linear = (n: InkName): THREE.Color => {
  const [r, g, b] = INKS[n].rgb;
  return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
};
const INK = LOOT_INKS.map(linear);
const IRON = linear('iron');

const CAP = 200;
/** How far a piece's shape is drawn; its column is drawn as far as it can be seen. */
const SHAPE_RANGE = 320;
const COLUMN_RANGE = 700;

type Shape = 'cask' | 'crate';
const shapeOf = (k: LootKind): Shape => ((WEAPONS as readonly string[]).includes(k) ? 'crate' : 'cask');

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

/** A crate: a box with a batten round it near each end. */
function crate(): THREE.BufferGeometry {
  const parts = [new THREE.BoxGeometry(1.15, 0.95, 0.95)];
  for (const x of [-0.4, 0.4]) parts.push(new THREE.BoxGeometry(0.1, 1.02, 1.02).translate(x, 0, 0));
  return mergeGeometries(parts);
}

/** The same shape with one normal a corner, so the outline's hull swells evenly instead of splitting at the edges. */
function hull(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const h = g.clone();
  h.deleteAttribute('normal');
  h.deleteAttribute('uv');
  const merged = mergeVertices(h);
  merged.computeVertexNormals();
  return merged;
}

interface Shapes { body: THREE.InstancedMesh; outline: THREE.InstancedMesh; n: number }

export class Loot {
  /** The pieces, in the world. */
  readonly group = new THREE.Group();
  /** The columns of hatching, written on the screen (the stage's overlay). */
  readonly marks: THREE.Mesh;
  private readonly shapes: Record<Shape, Shapes>;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly foot: THREE.InstancedBufferAttribute;
  private readonly ink: THREE.InstancedBufferAttribute;
  private readonly size: THREE.InstancedBufferAttribute;
  private readonly tmp = new THREE.Matrix4();
  private readonly rot = new THREE.Matrix4();
  private readonly sc = new THREE.Matrix4();
  private readonly up = new THREE.Vector3();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly sea = new THREE.Vector3();

  constructor(sceneDepth: THREE.Texture | null) {
    const make = (g: THREE.BufferGeometry, colour: number, roughness: number): Shapes => {
      const body = new THREE.InstancedMesh(g, woodNodeMaterial(colour, roughness), CAP);
      body.count = 0;
      body.frustumCulled = false;
      // the outline rides the same instance matrices, set once for both
      const outline = new THREE.InstancedMesh(hull(g), outlineNodeMaterial(IRON, 1.3), CAP);
      outline.instanceMatrix = body.instanceMatrix;
      outline.count = 0;
      outline.frustumCulled = false;
      this.group.add(body, outline);
      return { body, outline, n: 0 };
    };
    this.shapes = { cask: make(cask(0.55, 1.2), 0x8b6a48, 0.75), crate: make(crate(), 0xa08a5e, 0.8) };
    const geo = (this.geo = new THREE.InstancedBufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const attr = (k: number) => new THREE.InstancedBufferAttribute(new Float32Array(CAP * k), k).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iFoot', (this.foot = attr(4)));
    geo.setAttribute('iInk', (this.ink = attr(4)));
    geo.setAttribute('iSize', (this.size = attr(2)));
    geo.instanceCount = 0;
    this.marks = new THREE.Mesh(geo, hatchNodeMaterial(sceneDepth));
    this.marks.frustumCulled = false;
    this.marks.renderOrder = 10;
  }

  update(items: readonly LootView[], t: number, eye: THREE.Vector3): void {
    const F = this.foot.array as Float32Array, I = this.ink.array as Float32Array, S = this.size.array as Float32Array;
    for (const s of Object.values(this.shapes)) s.n = 0;
    let nh = 0;
    for (const l of items) {
      const d = eye.distanceTo(this.p.set(l.pos.x, l.pos.y, l.pos.z));
      if (d > COLUMN_RANGE) continue;
      this.up.copy(this.p).normalize();
      tangents(this.up, this.a, this.b);
      const sea = onSea(this.p, 0, this.sea);
      // pops up out of the water when it appears, then bobs and turns
      const pop = Math.min(1, l.age * 2.5);
      // the column, standing on the water, taller the rarer and shorter close to, where the piece itself is in view
      if (nh < CAP) {
        const h = (16 + l.rarity * 4) * pop * (0.5 + 0.5 * Math.min(1, Math.max(0, (d - 12) / 50)));
        const ink = INK[l.rarity];
        F[nh * 4] = sea.x + this.up.x * 0.4; F[nh * 4 + 1] = sea.y + this.up.y * 0.4; F[nh * 4 + 2] = sea.z + this.up.z * 0.4; F[nh * 4 + 3] = (l.id % 97) * 0.37;
        I[nh * 4] = ink.r; I[nh * 4 + 1] = ink.g; I[nh * 4 + 2] = ink.b; I[nh * 4 + 3] = l.near ? 1 : 0;
        S[nh * 2] = h; S[nh * 2 + 1] = 1.1;
        nh++;
      }
      if (d > SHAPE_RANGE) continue;
      const shape = shapeOf(l.kind), set = this.shapes[shape];
      if (set.n >= CAP) continue;
      const lift = 1.2 + Math.sin(t * 2 + l.id) * 0.25 - (1 - pop) * 2;
      this.tmp.makeBasis(this.a, this.up, this.b).setPosition(sea.addScaledVector(this.up, lift));
      this.rot.makeRotationY(t * 0.5 + l.id).multiply(this.sc.makeRotationX(shape === 'cask' ? 0.25 : 0.1));
      const k = 0.4 + pop * 0.6;
      this.tmp.multiply(this.rot).multiply(this.sc.makeScale(k, k, k));
      set.body.setMatrixAt(set.n++, this.tmp);
    }
    for (const s of Object.values(this.shapes)) {
      s.body.count = s.outline.count = s.n;
      s.body.instanceMatrix.needsUpdate = true;
    }
    this.geo.instanceCount = nh;
    for (const a of [this.foot, this.ink, this.size]) a.needsUpdate = true;
  }
}
