// Loot on the water as it is seen: 0117's (render/actors/loot.ts). Each piece floats where the snapshot has it, on the
// waves, bobbing and slowly turning on its own: a crate for a gun, a cask for stores, each bound with a band of its
// rarity's ink (snapshot.ts RARITY). Over it stands a column of hatching in that ink, as a chartmaker hatches a mark,
// (16 + 4 × rarity) m tall and a few pixels wide at the least, so a piece is seen from far off; the column is drawn to
// COLUMN m, the piece itself to SHAPE m.
//
// Three draws for all of it, each a single instanced mesh placed wholly in the vertex stage from one buffer written
// each frame (a piece's place, id and rarity). Lit by the sun and the sky as everything else is (sky/light.ts); the
// columns blended over the sea after it.

import {
  BoxGeometry, CylinderGeometry, DoubleSide, DynamicDrawUsage, InstancedBufferGeometry, InstancedInterleavedBuffer,
  InterleavedBufferAttribute, Mesh, MeshBasicNodeMaterial, type BufferGeometry, type PerspectiveCamera, BufferAttribute,
} from 'three/webgpu';
import { Fn, abs, attribute, cameraPosition, cos, cross, float, fract, max, mix, normalize, select, sin, smoothstep, uniform, varying, vec3 } from 'three/tsl';
import type { Light } from '../sky/light';
import { RARITY, type LootDraw } from '../snapshot';
import { pixelSize } from '../view/view';
import type { FloatNode, Vec3Node } from '../tsl';

/** The most pieces drawn at once. */
const PIECES = 512;
/** Metres out to which the column and the piece are drawn. */
const COLUMN = 700, SHAPE = 320;
/** The column: its height, m, for the commonest and more for each rarity up; its width, m, and fewest pixels across;
 *  its hatching's lines a metre, and their ink's opacity. */
const TALL = 16, TALLER = 4, WIDE = 1.1, WIDE_PIXELS = 3, HATCH = 1.6, INKED = 0.85;
/** The piece rides this high over the water at its mean, bobbing this much at this rate (rad/s), and turns at this
 *  rate. */
const RIDE = 0.35, BOB = 0.18, BOB_RATE = 1.7, SPIN = 0.4;
/** Wood, weathered; and the rarity's band. */
const WOOD: [number, number, number] = [0.32, 0.21, 0.12];

/** Linear rgb of 0xrrggbb. */
const linear = (hex: number): [number, number, number] => {
  const c = (byte: number) => Math.pow(byte / 255, 2.2);
  return [c((hex >> 16) & 255), c((hex >> 8) & 255), c(hex & 255)];
};
const INKS = RARITY.map(linear);

/** The pieces' buffers: each a vec4 of its place (metres) and id, and a vec4 of its rarity's ink and the rarity. */
const STRIDE = 8;

/** An instanced mesh of `shape`, read from the shared buffer. */
function instanced(shape: BufferGeometry, buffer: InstancedInterleavedBuffer): InstancedBufferGeometry {
  const g = new InstancedBufferGeometry();
  g.setIndex(shape.getIndex());
  g.setAttribute('position', shape.getAttribute('position'));
  if (shape.getAttribute('normal')) g.setAttribute('normal', shape.getAttribute('normal'));
  g.setAttribute('lootAt', new InterleavedBufferAttribute(buffer, 4, 0));
  g.setAttribute('lootInk', new InterleavedBufferAttribute(buffer, 4, 4));
  g.instanceCount = 0;
  return g;
}

/** light: how the world is lit (sky/light.ts). */
export function createLoot(light: Light) {
  const now = uniform(0), pixel = uniform(0.0026);
  const crates = new InstancedInterleavedBuffer(new Float32Array(PIECES * STRIDE), STRIDE).setUsage(DynamicDrawUsage);
  const casks = new InstancedInterleavedBuffer(new Float32Array(PIECES * STRIDE), STRIDE).setUsage(DynamicDrawUsage);
  const columns = new InstancedInterleavedBuffer(new Float32Array(PIECES * STRIDE), STRIDE).setUsage(DynamicDrawUsage);

  // a piece's frame: up from the planet's centre, turned about it by its own spin, bobbing
  const at = attribute('lootAt', 'vec4'), ink = attribute('lootInk', 'vec4');
  const up = normalize(at.xyz), seed = at.w.mul(0.618).fract().mul(6.283);
  const ref = select(abs(up.y).lessThan(0.9), vec3(0, 1, 0), vec3(1, 0, 0));
  const e1 = normalize(cross(ref, up)), e2 = cross(up, e1);
  const a = now.mul(SPIN).add(seed);
  const across = e1.mul(cos(a)).add(e2.mul(sin(a))), along = cross(up, across);
  const centre = at.xyz.add(up.mul(float(RIDE).add(sin(now.mul(BOB_RATE).add(seed)).mul(BOB))));
  const far = cameraPosition.sub(at.xyz).length();
  const shown = select(far.lessThan(SHAPE), float(1), float(0));
  const local = attribute('position', 'vec3'), normal = attribute('normal', 'vec3');
  const turn = (v: Vec3Node) => across.mul(v.x).add(up.mul(v.y)).add(along.mul(v.z));

  /** A solid piece: its shape placed and lit, wood with its rarity's band where `band` says. */
  const solid = (geometry: InstancedBufferGeometry, band: (p: Vec3Node) => FloatNode) => {
    const m = new MeshBasicNodeMaterial();
    m.positionNode = centre.add(turn(local).mul(shown));
    const p = varying(centre.add(turn(local))), n = varying(turn(normal)), b = varying(band(local)), tint = varying(ink.rgb);
    m.colorNode = Fn(() => {
      const albedo = mix(vec3(...WOOD), tint, b);
      return albedo.mul(light(p, normalize(n)));
    })();
    const mesh = new Mesh(geometry, m);
    mesh.frustumCulled = false;
    mesh.visible = false;
    return { mesh, geometry };
  };

  // a crate 1.3 m a side, banded round its middle; a cask 1.2 m tall, hooped near each end
  const crate = solid(instanced(new BoxGeometry(1.3, 1.3, 1.3), crates), (p) => smoothstep(0.2, 0.17, abs(p.y)));
  const cask = solid(instanced(new CylinderGeometry(0.5, 0.5, 1.2, 12), casks), (p) => smoothstep(0.06, 0.03, abs(abs(p.y).sub(0.38))));

  // the column: a quad standing on the piece, turned to face the eye about the up, hatched across in its ink
  const quad = new BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0]), 3);
  const g = new InstancedBufferGeometry();
  g.setAttribute('position', quad);
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute('lootAt', new InterleavedBufferAttribute(columns, 4, 0));
  g.setAttribute('lootInk', new InterleavedBufferAttribute(columns, 4, 4));
  g.instanceCount = 0;
  const column = (() => {
    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
    const toEye = cameraPosition.sub(at.xyz), side = normalize(cross(up, toEye));
    const tall = float(TALL).add(ink.w.mul(TALLER));
    const half = max(float(WIDE / 2), far.mul(pixel).mul(WIDE_PIXELS / 2));
    const fade = smoothstep(COLUMN, COLUMN * 0.8, far);
    m.positionNode = at.xyz.add(side.mul(local.x.mul(half)).add(up.mul(local.y.mul(tall))).mul(select(far.lessThan(COLUMN), float(1), float(0))));
    const h = varying(local.y.mul(tall)), x = varying(local.x.mul(half)), p = varying(at.xyz.add(up.mul(tall.mul(0.5)))), tint = varying(ink.rgb);
    const f = varying(fade), wide = varying(half);
    // diagonal hatching, with the column's edges ruled; fading out toward its top
    const alpha = Fn(() => {
      const lines = smoothstep(0.3, 0.12, abs(fract(h.add(x).div(HATCH)).sub(0.5)));
      const edge = smoothstep(wide.mul(0.7), wide, abs(x));
      return max(lines, edge).mul(smoothstep(1, 0.6, h.div(tall))).mul(INKED).mul(f);
    })();
    m.colorNode = Fn(() => tint.mul(light(p, normalize(cameraPosition.sub(p)))).mul(alpha))();
    m.opacityNode = alpha;
    m.premultipliedAlpha = true;
    const mesh = new Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    mesh.visible = false;
    return { mesh, geometry: g };
  })();

  /** Fills a buffer from the pieces that pass `keep`, and shows its mesh's instances. */
  const fill = (buffer: InstancedInterleavedBuffer, { mesh, geometry }: { mesh: Mesh; geometry: InstancedBufferGeometry }, pieces: readonly LootDraw[], keep: (l: LootDraw) => boolean) => {
    const a = buffer.array as Float32Array;
    let n = 0;
    for (const l of pieces) {
      if (n >= PIECES || !keep(l)) continue;
      a.set([...l.at, l.id, ...INKS[l.rarity], l.rarity], n++ * STRIDE);
    }
    buffer.needsUpdate = n > 0;
    geometry.instanceCount = n;
    mesh.visible = n > 0;
  };

  return {
    meshes: [crate.mesh, cask.mesh, column.mesh],
    /** Each frame: the world's clock now (s), and the pieces near the eye. */
    draw(time: number, pieces: readonly LootDraw[]) {
      now.value = time;
      fill(crates, crate, pieces, (l) => l.gun);
      fill(casks, cask, pieces, (l) => !l.gun);
      fill(columns, column, pieces, () => true);
    },
    /** Each frame, after the camera has moved: the drawing buffer's height, pixels. */
    update(camera: PerspectiveCamera, height: number) {
      pixel.value = pixelSize(camera, height);
    },
  };
}
