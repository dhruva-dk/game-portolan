// Loot on the water as it is seen: 0117's before its crates (render/actors/loot.ts and tsl/loot.ts at c79ef49^). Each
// piece is the thing itself, hanging RIDE m over the waves where the snapshot has it, bobbing, slowly turning and
// rocking: a gun the gun a ship carries (ship/gun.ts), its muzzle cocked up; a shield a crystal of ice, the big one
// taller; a repair a cask, the full one bigger. Each is lit as everything is (sky/light.ts) and glows round its
// outline in its rarity's light (rarity.ts GLOW), the more where it turns from the eye, so the bloom catches it. A
// piece put on the water during the match rises up out of it as it comes (born).
//
// Over each stands its beam: a column of its rarity's light, (14 + 7 × rarity) m tall, fading up its height and
// pulsing upward, with a ring of the same light on the water about it within HALO m; never narrower than
// BEAM_PIXELS, and never fainter near than it should be (it fades in past the first tens of metres, so the piece
// beside her is not lost in it). Drawn to BEAM m; the pieces to SHAPE m, never smaller on the screen than
// SHAPE_PIXELS across, so they read to the haze's edge (about 250 m), where the haze takes them as everything else
// (frame.ts).
//
// Four draws for all of it, each a single instanced mesh placed wholly in the vertex stage, from four buffers of a
// piece's place, id, light, rarity, birth and size, written in place each frame and sent only as far as they hold
// pieces, and only when they changed.

import {
  AddEquation, BufferAttribute, BufferGeometry, CustomBlending, CylinderGeometry, DoubleSide, DynamicDrawUsage,
  InstancedBufferGeometry, InstancedInterleavedBuffer, InterleavedBufferAttribute, LatheGeometry, Matrix4, Mesh,
  MeshBasicNodeMaterial, OctahedronGeometry, OneFactor, Vector2, type PerspectiveCamera,
} from 'three/webgpu';
import { Fn, abs, attribute, cameraPosition, clamp, cos, cross, dot, float, max, mix, normalize, pow, select, sin, smoothstep, uniform, varying, vec3 } from 'three/tsl';
import type { Light } from '../sky/light';
import { GLOW } from '../rarity';
import { gunShape } from '../ship/gun';
import type { LootDraw, LootKind } from '../snapshot';
import { pixelSize } from '../view/view';
import type { FloatNode, Vec3Node } from '../tsl';

/** The most pieces drawn at once. */
const PIECES = 512;
/** Metres out to which the beams and the pieces are drawn, and the rings on the water about them. */
const BEAM = 520, SHAPE = 320, HALO = 140;
/** A piece hangs this high over the water at its mean, bobbing this much at this rate (rad/s); turns at this rate
 *  (rad/s) and rocks this far (rad); rises this far up out of the water as it comes, over 1/RISE s. */
const RIDE = 1.5, BOB = 0.25, BOB_RATE = 2, SPIN = 1.4, ROCK = 0.15, SINK = 2, RISE = 2.5;
/** The fewest pixels across a piece and a beam are drawn; a piece's size, m, it grows from. */
const SHAPE_PIXELS = 12, BEAM_PIXELS = 3, SHAPE_ACROSS = 1.8;
/** The beam: its height for the commonest and more for each rarity up, m; its radius at the foot and the head. */
const TALL = 14, TALLER = 7, FOOT = 0.8, HEAD = 0.5;
/** How bright a piece's rim, a beam and its ring glow, of what the sun and the sky give a white surface. */
const EMIT = 2.2, BEAM_EMIT = 1.6, HALO_EMIT = 1.2;
/** Each kind's size: the shields' and repairs' small and big, the gun's. */
const SIZE: Record<LootKind, number> = { gun: 1.25, smallShield: 1, bigShield: 1.35, repairKit: 1, fullRepair: 1.35 };
/** Surfaces (linear albedo): bronze, ice, weathered wood and the iron of its hoops. */
const BRONZE: [number, number, number] = [0.32, 0.2, 0.08], ICE: [number, number, number] = [0.33, 0.78, 0.95];
const WOOD: [number, number, number] = [0.26, 0.15, 0.08], HOOP: [number, number, number] = [0.05, 0.045, 0.04];

/** Linear rgb of 0xrrggbb. */
const linear = (hex: number): [number, number, number] => {
  const c = (byte: number) => Math.pow(byte / 255, 2.2);
  return [c((hex >> 16) & 255), c((hex >> 8) & 255), c(hex & 255)];
};
const LIGHTS = GLOW.map(linear);

/** The buffers: per piece a vec4 of its place (metres) and id, a vec4 of its rarity's light and the rarity, and a vec4
 *  of its birth (the world's clock, s) and its size. */
const STRIDE = 12;

/** An instanced mesh of `shape`, read from `buffer`. */
function instanced(shape: BufferGeometry, buffer: InstancedInterleavedBuffer): InstancedBufferGeometry {
  const g = new InstancedBufferGeometry();
  if (shape.getIndex()) g.setIndex(shape.getIndex());
  for (const name of ['position', 'normal', 'uv', 'part']) if (shape.getAttribute(name)) g.setAttribute(name, shape.getAttribute(name));
  g.setAttribute('lootAt', new InterleavedBufferAttribute(buffer, 4, 0));
  g.setAttribute('lootGlow', new InterleavedBufferAttribute(buffer, 4, 4));
  g.setAttribute('lootLife', new InterleavedBufferAttribute(buffer, 4, 8));
  g.instanceCount = 0;
  return g;
}

/** The gun, its muzzle cocked up 0.4 rad and its middle at the origin. */
function gun(): BufferGeometry {
  const s = gunShape(), g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(s.position, 3));
  g.setAttribute('normal', new BufferAttribute(s.normal, 3));
  g.setIndex(new BufferAttribute(s.index, 1));
  g.applyMatrix4(new Matrix4().makeRotationX(-0.4));
  g.computeBoundingBox();
  const box = g.boundingBox!, mid = box.min.clone().add(box.max).multiplyScalar(0.5);
  return g.translate(-mid.x, -mid.y, -mid.z);
}

/** A cask, 1 m tall, bellied, its middle at the origin. */
const cask = () =>
  new LatheGeometry([[0, -0.5], [0.3, -0.5], [0.38, -0.33], [0.43, -0.17], [0.46, 0], [0.43, 0.17], [0.38, 0.33], [0.3, 0.5], [0, 0.5]].map(([r, y]) => new Vector2(r, y)), 12);

/** The beam, an open column 1 m tall from its foot (part 0, uv.y up it), and its ring's square on the water (part 1,
 *  −1…1 across), in one. */
function beamAndRing(): BufferGeometry {
  const c = new CylinderGeometry(HEAD, FOOT, 1, 12, 1, true).translate(0, 0.5, 0).toNonIndexed();
  const n = c.getAttribute('position').count;
  const position = new Float32Array((n + 6) * 3), normal = new Float32Array((n + 6) * 3), uv = new Float32Array((n + 6) * 2), part = new Float32Array(n + 6);
  position.set(c.getAttribute('position').array as Float32Array);
  normal.set(c.getAttribute('normal').array as Float32Array);
  uv.set(c.getAttribute('uv').array as Float32Array);
  [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]].forEach(([x, z], i) => {
    position.set([x, 0, z], (n + i) * 3);
    normal.set([0, 1, 0], (n + i) * 3);
    part[n + i] = 1;
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(position, 3));
  g.setAttribute('normal', new BufferAttribute(normal, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setAttribute('part', new BufferAttribute(part, 1));
  return g;
}

/** light: how the world is lit (sky/light.ts). */
export function createLoot(light: Light) {
  const now = uniform(0), pixel = uniform(0.0026);
  const buffer = () => new InstancedInterleavedBuffer(new Float32Array(PIECES * STRIDE), STRIDE).setUsage(DynamicDrawUsage);
  const guns = buffer(), crystals = buffer(), casks = buffer(), beams = buffer();

  // a piece's frame: up from the planet's centre; turned about it by its own spin, rocked about its across
  const at = attribute('lootAt', 'vec4'), glow = attribute('lootGlow', 'vec4'), life = attribute('lootLife', 'vec4');
  const up = normalize(at.xyz), id = at.w, seed = id.mul(0.618).fract().mul(6.283);
  const ref = select(abs(up.y).lessThan(0.9), vec3(0, 1, 0), vec3(1, 0, 0));
  const e1 = normalize(cross(ref, up)), e2 = cross(up, e1);
  const a = now.mul(SPIN).add(id);
  const ahead = e1.mul(cos(a)).add(e2.mul(sin(a))), side = cross(up, ahead);
  const rock = sin(now.mul(1.3).add(seed)).mul(ROCK), cr = cos(rock), sr = sin(rock);
  const lift = up.mul(cr).add(ahead.mul(sr)), fore = ahead.mul(cr).sub(up.mul(sr));
  const pop = clamp(now.sub(life.x).mul(RISE), 0, 1);
  const far = cameraPosition.sub(at.xyz).length();
  const grow = max(float(1), far.mul(pixel).mul(SHAPE_PIXELS / SHAPE_ACROSS)).mul(life.y).mul(pop.mul(0.6).add(0.4));
  const centre = at.xyz.add(up.mul(float(RIDE).mul(grow.min(3)).add(sin(now.mul(BOB_RATE).add(id)).mul(BOB)).sub(float(1).sub(pop).mul(SINK))));
  const shown = select(far.lessThan(SHAPE), float(1), float(0));
  const local = attribute('position', 'vec3'), normal = attribute('normal', 'vec3');
  const turn = (v: Vec3Node) => side.mul(v.x).add(lift.mul(v.y)).add(fore.mul(v.z));

  /** A piece: its shape placed, lit by `surface` (given its world place, normal and local place), its outline glowing
   *  in its rarity's light. */
  const piece = (geometry: InstancedBufferGeometry, surface: (p: Vec3Node, n: Vec3Node, l: Vec3Node) => Vec3Node) => {
    const m = new MeshBasicNodeMaterial();
    m.positionNode = centre.add(turn(local).mul(grow)).mul(shown);
    const p = varying(centre.add(turn(local).mul(grow))), n = varying(turn(normal)), l = varying(local), tint = varying(glow.rgb), base = varying(centre);
    m.colorNode = Fn(() => {
      const nn = normalize(n), eye = normalize(cameraPosition.sub(p));
      const edge = pow(float(1).sub(abs(dot(nn, eye))), 2).mul(1.4).add(0.3);
      return surface(p, nn, l).add(tint.mul(edge).mul(light(base, normalize(base)).mul(EMIT)));
    })();
    const mesh = new Mesh(geometry, m);
    mesh.frustumCulled = false;
    mesh.visible = false;
    return { mesh, geometry };
  };

  const gunMesh = piece(instanced(gun(), guns), (p, n) => {
    const g = light.glossy(p, n, float(0.45), vec3(...BRONZE).mul(2.2));
    return vec3(...BRONZE).mul(g.diffuse).add(g.specular);
  });
  const crystalMesh = piece(instanced(new OctahedronGeometry(0.6).scale(0.8, 1.3, 0.8), crystals), (p, n) => {
    const g = light.glossy(p, n, float(0.12), vec3(0.06, 0.06, 0.06));
    return vec3(...ICE).mul(g.diffuse).add(g.specular.mul(2));
  });
  const caskMesh = piece(instanced(cask(), casks), (p, n, l) => {
    const hoop = smoothstep(0.035, 0.015, abs(abs(l.y).sub(0.33))).max(smoothstep(0.035, 0.015, abs(abs(l.y).sub(0.47))));
    return mix(vec3(...WOOD), vec3(...HOOP), hoop).mul(light(p, n));
  });

  // the beam, a column standing on the piece's water, and its ring about it on the water
  const beamGeometry = instanced(beamAndRing(), beams);
  const bm = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
  bm.blending = CustomBlending;
  bm.blendEquation = AddEquation;
  bm.blendSrc = OneFactor;
  bm.blendDst = OneFactor;
  const ring = attribute('part', 'float'), uv = attribute('uv', 'vec2');
  const tall = float(TALL).add(glow.w.mul(TALLER)), wide = max(float(1), far.mul(pixel).mul(BEAM_PIXELS / (2 * HEAD)));
  const beamAt = at.xyz.add(e1.mul(local.x.mul(wide))).add(e2.mul(local.z.mul(wide))).add(up.mul(local.y.mul(tall)));
  const halo = float(1.6).add(sin(now.mul(3).add(id)).mul(0.15));
  const ringAt = at.xyz.add(up.mul(0.12)).add(e1.mul(local.x.mul(halo))).add(e2.mul(local.z.mul(halo)));
  const beamShown = select(far.lessThan(BEAM), float(1), float(0)), ringShown = select(far.lessThan(HALO), float(1), float(0));
  bm.positionNode = select(ring.greaterThan(0.5), ringAt.mul(ringShown), beamAt.mul(beamShown).mul(pop));
  const v = varying(uv.y), xz = varying(local.xz), isRing = varying(ring), tint = varying(glow.rgb), r = varying(glow.w), base = varying(at.xyz);
  const core = varying(abs(dot(normalize(e1.mul(normal.x).add(e2.mul(normal.z))), normalize(cameraPosition.sub(at.xyz)))));
  const near = varying(smoothstep(10, 55, far));
  bm.colorNode = Fn(() => {
    const lit = light(base, normalize(base));
    const column = pow(float(1).sub(v), 2.2).mul(sin(v.mul(40).sub(now.mul(6))).mul(0.25).add(0.75)).mul(core.mul(core)).mul(near);
    const d = xz.length(), band = smoothstep(0.55, 0.8, d).mul(smoothstep(1, 0.82, d));
    const brightness = select(isRing.greaterThan(0.5), band.mul(HALO_EMIT), column.mul(BEAM_EMIT).mul(r.mul(0.18).add(0.35)));
    return tint.mul(lit).mul(brightness);
  })();
  const beamMesh = new Mesh(beamGeometry, bm);
  beamMesh.frustumCulled = false;
  beamMesh.visible = false;
  // after the sea, which reads what was drawn before it (as the gunfire's puffs)
  beamMesh.renderOrder = 2;

  /** Fills a buffer in place from the pieces that pass `keep` and shows its mesh's instances; sends it, as far as it
   *  holds pieces, if anything in it changed. */
  const counts = new Map<InstancedInterleavedBuffer, number>();
  const fill = (buffer: InstancedInterleavedBuffer, drawn: { mesh: Mesh; geometry: InstancedBufferGeometry }, pieces: readonly LootDraw[], keep: (l: LootDraw) => boolean) => {
    const array = buffer.array as Float32Array;
    let n = 0, changed = false, o = 0;
    const put = (k: number, value: number) => {
      const f = Math.fround(value);
      if (array[o + k] === f) return;
      array[o + k] = f;
      changed = true;
    };
    for (const l of pieces) {
      if (n >= PIECES) break;
      if (!keep(l)) continue;
      const c = LIGHTS[l.rarity];
      o = n++ * STRIDE;
      put(0, l.at[0]), put(1, l.at[1]), put(2, l.at[2]), put(3, l.id);
      put(4, c[0]), put(5, c[1]), put(6, c[2]), put(7, l.rarity);
      put(8, l.born), put(9, SIZE[l.kind]);
    }
    if (changed) {
      buffer.clearUpdateRanges();
      buffer.addUpdateRange(0, n * STRIDE);
      buffer.needsUpdate = true;
    }
    if (counts.get(buffer) === n) return;
    counts.set(buffer, n);
    drawn.geometry.instanceCount = n;
    drawn.mesh.visible = n > 0;
  };
  const shields = (l: LootDraw) => l.kind === 'smallShield' || l.kind === 'bigShield';

  return {
    meshes: [gunMesh.mesh, crystalMesh.mesh, caskMesh.mesh, beamMesh],
    /** Each frame: the world's clock now (s), and the pieces near the eye. */
    draw(time: number, pieces: readonly LootDraw[]) {
      now.value = time;
      fill(guns, gunMesh, pieces, (l) => l.kind === 'gun');
      fill(crystals, crystalMesh, pieces, shields);
      fill(casks, caskMesh, pieces, (l) => l.kind === 'repairKit' || l.kind === 'fullRepair');
      fill(beams, { mesh: beamMesh, geometry: beamGeometry }, pieces, () => true);
    },
    /** Each frame, after the camera has moved: the drawing buffer's height, pixels. */
    update(camera: PerspectiveCamera, height: number) {
      pixel.value = pixelSize(camera, height);
    },
  };
}
