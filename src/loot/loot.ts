// Loot on the water as it is seen. Each piece is the thing itself, hanging RIDE m over the waves where the snapshot
// has it, bobbing, slowly turning and rocking: a gun the gun of its kind a ship carries (ship/gun.ts), its muzzle
// cocked up; a shield a crystal of ice, the big one taller; a repair a cask, the full one bigger. Each is lit as
// everything is (sky/light.ts: two flat tones, and a hard highlight on a gun's gilding and on ice), with a flat rim of
// its rarity's light (palette.ts RARITY_GLOW) where it turns from the eye. A piece put on the water during the match
// rises up out of it as it comes (born).
//
// Over each stands its beam: a thin column of gold light, (14 + 7 × rarity) m tall, fading up its height and
// pulsing upward, with a ring of its rarity's light on the water about it within HALO m; never narrower than
// BEAM_PIXELS, and never fainter near than it should be (it fades in past the first tens of metres, so the piece
// beside her is not lost in it). Drawn to BEAM m; the pieces to SHAPE m, never smaller on the screen than
// SHAPE_PIXELS across, so they read to the haze's edge (about 250 m), where the haze takes them as everything else
// (frame.ts).
//
// A draw for each kind of gun, one for the shields, one for the casks and one for the beams: eight at most, each a
// single instanced mesh placed wholly in the vertex stage, from a buffer of a piece's place, id, light, rarity, birth
// and size, written in place each frame and sent only as far as it holds pieces, and only when it changed; a kind of
// gun with none near isn't drawn at all.

import {
  BufferAttribute, BufferGeometry, CylinderGeometry, DoubleSide, DynamicDrawUsage, InstancedBufferGeometry, InstancedInterleavedBuffer,
  InterleavedBufferAttribute, LatheGeometry, Matrix4, Mesh, MeshBasicNodeMaterial, OctahedronGeometry, Vector2,
} from 'three/webgpu';
import {
  Fn, abs, attribute, cameraPosition, clamp, cos, cross, dot, float, max, mix, normalize, pow, select, sin, smoothstep, uniform, varying,
  vec3,
} from 'three/tsl';
import { GILDING, GLINT, ICE, RARITY_GLOW, TAR, TIMBER } from '../palette.ts';
import type { Light } from '../sky/light.ts';
import { KINDS, gunOrder, type GunKind, type LootKind } from '../kinds.ts';
import { gunShape, gunSurface } from '../ship/gun.ts';
import type { LootDraw } from '../snapshot.ts';
import type { Eye } from '../view/view.ts';
import { additive } from '../gpu.ts';
import { tangentFrame, type Vec3Node } from '../tsl.ts';

/** The most pieces drawn at once. */
const PIECES = 512;
/** Metres out to which the beams and the pieces are drawn, and the rings on the water about them. */
const BEAM = 520, SHAPE = 320, HALO = 140;
/** A piece hangs this high over the water at its mean, bobbing this much at this rate (rad/s); turns at this rate
 *  (rad/s) and rocks this far (rad); rises this far up out of the water as it comes, over 1/RISE s. */
const RIDE = 2.2, BOB = 0.25, BOB_RATE = 2, SPIN = 1.4, ROCK = 0.15, SINK = 2, RISE = 2.5;
/** The fewest pixels across a piece and a beam are drawn; a piece's size, m, it grows from. */
const SHAPE_PIXELS = 22, BEAM_PIXELS = 3, SHAPE_ACROSS = 3.5;
/** The beam: its height for the commonest and more for each rarity up, m; its radius at the foot and the head. */
const TALL = 14, TALLER = 7, FOOT = 0.3, HEAD = 0.18;
/** How bright a piece's rim, a beam and its ring glow, of what the sun and the sky give a white surface; and how far
 *  a face must turn from the eye (0 facing it … 1 edge on) to be in the rim. */
const EMIT = 1.3, BEAM_EMIT = 3, HALO_EMIT = 1.2, RIM = 0.62;
/** Each kind's size: the guns', the shields' and repairs' small and big. */
const SIZE: Record<LootKind, number> = {
  cannon: 2.3, scatter: 2.1, repeater: 2.2, harpoon: 2.4, mortar: 2.1, smallShield: 1.7, bigShield: 2.25, repairKit: 1.6, fullRepair: 2.1,
};

/** The draws a piece belongs to: a gun's is its kind's place in KINDS, then the crystals, the casks and the beams (which
 *  every piece also has). */
const CRYSTALS = KINDS.length, CASKS = KINDS.length + 1, BEAMS = KINDS.length + 2;
const GROUP: Record<LootKind, number> = {
  cannon: gunOrder('cannon'), scatter: gunOrder('scatter'), repeater: gunOrder('repeater'), harpoon: gunOrder('harpoon'),
  mortar: gunOrder('mortar'), smallShield: CRYSTALS, bigShield: CRYSTALS, repairKit: CASKS, fullRepair: CASKS,
};

/** Whether the last `put`s changed anything: a buffer is sent only when so. */
let changed = false;
/** Writes `value` (as a float32) at `array[i]`, noting if that changed it. */
function put(array: InstancedInterleavedBuffer['array'], i: number, value: number) {
  const f = Math.fround(value);
  if (array[i] === f) return;
  array[i] = f;
  changed = true;
}

/** The buffers: per piece a vec4 of its place (metres) and id, a vec4 of its rarity's light and the rarity, and a vec4
 *  of its birth (the world's clock, s) and its size. */
const STRIDE = 12;

/** An instanced mesh of `shape`, read from `buffer`. */
function instanced(shape: BufferGeometry, buffer: InstancedInterleavedBuffer): InstancedBufferGeometry {
  const g = new InstancedBufferGeometry();
  if (shape.getIndex()) g.setIndex(shape.getIndex());
  for (const name of ['position', 'normal', 'uv', 'part', 'metal']) {
    if (shape.getAttribute(name)) g.setAttribute(name, shape.getAttribute(name));
  }
  g.setAttribute('lootAt', new InterleavedBufferAttribute(buffer, 4, 0));
  g.setAttribute('lootGlow', new InterleavedBufferAttribute(buffer, 4, 4));
  g.setAttribute('lootLife', new InterleavedBufferAttribute(buffer, 4, 8));
  g.instanceCount = 0;
  return g;
}

/** The gun of `kind`, its muzzle cocked up 0.4 rad (the mortar's, already steep, less) and its middle at the origin. */
function gun(kind: GunKind): BufferGeometry {
  const s = gunShape(kind), g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(s.position, 3));
  g.setAttribute('normal', new BufferAttribute(s.normal, 3));
  g.setAttribute('metal', new BufferAttribute(s.metal, 1));
  g.setIndex(new BufferAttribute(s.index, 1));
  g.applyMatrix4(new Matrix4().makeRotationX(kind === 'mortar' ? -0.1 : -0.4));
  g.computeBoundingBox();
  const box = g.boundingBox!, mid = box.min.clone().add(box.max).multiplyScalar(0.5);
  return g.translate(-mid.x, -mid.y, -mid.z);
}

/** A cask, 1 m tall, bellied, its middle at the origin. */
const cask = () => {
  const profile = [[0, -0.5], [0.3, -0.5], [0.38, -0.33], [0.43, -0.17], [0.46, 0], [0.43, 0.17], [0.38, 0.33], [0.3, 0.5], [0, 0.5]];
  return new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), 12);
};

/** The beam, an open column 1 m tall from its foot (part 0, uv.y up it), and its ring's square on the water (part 1,
 *  −1…1 across), in one. */
function beamAndRing(): BufferGeometry {
  const c = new CylinderGeometry(HEAD, FOOT, 1, 12, 1, true).translate(0, 0.5, 0).toNonIndexed();
  const n = c.getAttribute('position').count;
  const position = new Float32Array((n + 6) * 3), normal = new Float32Array((n + 6) * 3);
  const uv = new Float32Array((n + 6) * 2), part = new Float32Array(n + 6);
  position.set(c.getAttribute('position').array);
  normal.set(c.getAttribute('normal').array);
  uv.set(c.getAttribute('uv').array);
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
  const now = uniform(0);
  /** How wide a pixel is per metre away: the eye's, set by `update` each frame before anything is drawn. */
  const pixel = uniform(0);
  const buffer = () => new InstancedInterleavedBuffer(new Float32Array(PIECES * STRIDE), STRIDE).setUsage(DynamicDrawUsage);
  const guns = KINDS.map(buffer), crystals = buffer(), casks = buffer(), beams = buffer();

  // a piece's frame: up from the planet's centre; turned about it by its own spin, rocked about its across
  const at = attribute('lootAt', 'vec4'), glow = attribute('lootGlow', 'vec4'), life = attribute('lootLife', 'vec4');
  const up = normalize(at.xyz), id = at.w, seed = id.mul(0.618).fract().mul(6.283);
  const { e1, e2 } = tangentFrame(up);
  const a = now.mul(SPIN).add(id);
  const ahead = e1.mul(cos(a)).add(e2.mul(sin(a))), side = cross(up, ahead);
  const rock = sin(now.mul(1.3).add(seed)).mul(ROCK), cr = cos(rock), sr = sin(rock);
  const lift = up.mul(cr).add(ahead.mul(sr)), fore = ahead.mul(cr).sub(up.mul(sr));
  const pop = clamp(now.sub(life.x).mul(RISE), 0, 1);
  const far = cameraPosition.sub(at.xyz).length();
  const grow = max(float(1), far.mul(pixel).mul(SHAPE_PIXELS / SHAPE_ACROSS)).mul(life.y).mul(pop.mul(0.6).add(0.4));
  const height = float(RIDE).mul(grow.min(3)).add(sin(now.mul(BOB_RATE).add(id)).mul(BOB)).sub(float(1).sub(pop).mul(SINK));
  const centre = at.xyz.add(up.mul(height));
  const shown = select(far.lessThan(SHAPE), float(1), float(0));
  const local = attribute('position', 'vec3'), normal = attribute('normal', 'vec3');
  const turn = (v: Vec3Node) => side.mul(v.x).add(lift.mul(v.y)).add(fore.mul(v.z));

  /** A piece: its shape placed, lit by `surface` (given its world place, normal and local place), its outline glowing
   *  in its rarity's light. */
  const piece = (geometry: InstancedBufferGeometry, surface: (p: Vec3Node, n: Vec3Node, l: Vec3Node) => Vec3Node) => {
    const m = new MeshBasicNodeMaterial();
    m.positionNode = centre.add(turn(local).mul(grow)).mul(shown);
    const p = varying(centre.add(turn(local).mul(grow))), n = varying(turn(normal)), l = varying(local);
    const tint = varying(glow.rgb), base = varying(centre);
    m.colorNode = Fn(() => {
      const nn = normalize(n), eye = normalize(cameraPosition.sub(p));
      // a flat rim of its rarity's light where it turns from the eye
      const edge = smoothstep(RIM - 0.03, RIM + 0.03, float(1).sub(abs(dot(nn, eye))));
      return mix(surface(p, nn, l), tint.mul(light.level(base).mul(EMIT)), edge);
    })();
    const mesh = new Mesh(geometry, m);
    mesh.frustumCulled = false;
    return { mesh, geometry };
  };

  // each gun as a ship carries it: bronze, oak and iron (ship/gun.ts gunSurface)
  const made = varying(attribute('metal', 'float'));
  const gunMeshes = KINDS.map((kind, i) => piece(instanced(gun(kind), guns[i]), (p, n) => gunSurface(light, p, n, made)));
  const crystalMesh = piece(instanced(new OctahedronGeometry(0.6).scale(0.8, 1.3, 0.8), crystals),
    (p, n) => light.polished(p, n, vec3(...ICE.lit), vec3(...ICE.shadow), vec3(...GLINT)));
  const caskMesh = piece(instanced(cask(), casks), (p, n, l) => {
    const hoop = smoothstep(0.035, 0.015, abs(abs(l.y).sub(0.33))).max(smoothstep(0.035, 0.015, abs(abs(l.y).sub(0.47))));
    return light.toon(p, n, mix(vec3(...TIMBER.lit), vec3(...TAR.lit), hoop), mix(vec3(...TIMBER.shadow), vec3(...TAR.shadow), hoop));
  });

  // the beam, a column standing on the piece's water, and its ring about it on the water
  const beamGeometry = instanced(beamAndRing(), beams);
  const bm = additive(new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide }));
  const ring = attribute('part', 'float'), uv = attribute('uv', 'vec2');
  const tall = float(TALL).add(glow.w.mul(TALLER)), wide = max(float(1), far.mul(pixel).mul(BEAM_PIXELS / (2 * HEAD)));
  const beamAt = at.xyz.add(e1.mul(local.x.mul(wide))).add(e2.mul(local.z.mul(wide))).add(up.mul(local.y.mul(tall)));
  const halo = float(1.6).add(sin(now.mul(3).add(id)).mul(0.15));
  const ringAt = at.xyz.add(up.mul(0.12)).add(e1.mul(local.x.mul(halo))).add(e2.mul(local.z.mul(halo)));
  const beamShown = select(far.lessThan(BEAM), float(1), float(0)), ringShown = select(far.lessThan(HALO), float(1), float(0));
  bm.positionNode = select(ring.greaterThan(0.5), ringAt.mul(ringShown), beamAt.mul(beamShown).mul(pop));
  const v = varying(uv.y), xz = varying(local.xz), isRing = varying(ring);
  const tint = varying(glow.rgb), r = varying(glow.w), base = varying(at.xyz);
  const core = varying(abs(dot(normalize(e1.mul(normal.x).add(e2.mul(normal.z))), normalize(cameraPosition.sub(at.xyz)))));
  const near = varying(smoothstep(10, 55, far));
  bm.colorNode = Fn(() => {
    const lit = light.level(base);
    const column = pow(float(1).sub(v), 2.2).mul(sin(v.mul(40).sub(now.mul(6))).mul(0.25).add(0.75)).mul(core.mul(core)).mul(near);
    const d = xz.length(), band = smoothstep(0.55, 0.8, d).mul(smoothstep(1, 0.82, d));
    // the beam gold whatever the piece; its ring on the water in its rarity's light
    const isBeam = isRing.lessThanEqual(0.5);
    const brightness = select(isBeam, column.mul(BEAM_EMIT).mul(r.mul(0.18).add(0.35)), band.mul(HALO_EMIT));
    return select(isBeam, vec3(...GILDING.lit), tint).mul(lit).mul(brightness);
  })();
  const beamMesh = new Mesh(beamGeometry, bm);
  beamMesh.frustumCulled = false;
  // after the sea, which reads what was drawn before it (as the gunfire's puffs)
  beamMesh.renderOrder = 2;

  /** The draws, by group: each gun's kind (as KINDS orders them), the crystals, the casks, then the beams. */
  const drawn = [
    ...gunMeshes.map((g, i) => ({ buffer: guns[i], geometry: g.geometry })),
    { buffer: crystals, geometry: crystalMesh.geometry }, { buffer: casks, geometry: caskMesh.geometry },
    { buffer: beams, geometry: beamGeometry },
  ];
  /** How many pieces each draw held when last filled. */
  const counts = drawn.map(() => -1);

  /** Fills a group's buffer in place from the pieces of its kinds (the beams: all of them) within SHAPE m of the eye
   *  (the beams: any distance), and shows that many instances; sends the buffer, as far as it holds pieces, if anything
   *  in it changed. */
  const fill = (group: number, pieces: readonly LootDraw[], eye: readonly [number, number, number]) => {
    const { buffer, geometry } = drawn[group], array = buffer.array;
    let n = 0;
    changed = false;
    for (let i = 0; i < pieces.length && n < PIECES; i++) {
      const l = pieces[i];
      if (group !== BEAMS) {
        const dx = l.at[0] - eye[0], dy = l.at[1] - eye[1], dz = l.at[2] - eye[2];
        if (GROUP[l.kind] !== group || dx * dx + dy * dy + dz * dz >= SHAPE * SHAPE) continue;
      }
      const c = RARITY_GLOW[l.rarity], o = n++ * STRIDE;
      put(array, o, l.at[0]), put(array, o + 1, l.at[1]), put(array, o + 2, l.at[2]), put(array, o + 3, l.id);
      put(array, o + 4, c[0]), put(array, o + 5, c[1]), put(array, o + 6, c[2]), put(array, o + 7, l.rarity);
      put(array, o + 8, l.born), put(array, o + 9, SIZE[l.kind]);
    }
    if (changed) {
      buffer.clearUpdateRanges();
      buffer.addUpdateRange(0, n * STRIDE);
      buffer.needsUpdate = true;
    }
    if (counts[group] === n) return;
    counts[group] = n;
    geometry.instanceCount = n;
  };

  return {
    meshes: [...gunMeshes.map((g) => g.mesh), crystalMesh.mesh, caskMesh.mesh, beamMesh],
    /** Each frame: the world's clock now (s), the pieces near the eye, and where the eye is (those past SHAPE m of it
     *  sent as beams alone). */
    draw(time: number, pieces: readonly LootDraw[], eye: readonly [number, number, number]) {
      now.value = time;
      for (let group = 0; group < drawn.length; group++) fill(group, pieces, eye);
    },
    /** Each frame, once the eye has moved (view.ts). */
    update(eye: Readonly<Eye>) {
      pixel.value = eye.pixel;
    },
  };
}
