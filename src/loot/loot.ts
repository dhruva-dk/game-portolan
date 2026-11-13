// Loot on the water as it is seen: 0117's (render/actors/loot.ts). Each piece floats where the snapshot has it, on the
// waves, bobbing and slowly turning on its own: a crate for a gun, a cask for stores, each bound with a band of its
// rarity's ink (snapshot.ts RARITY). Over it stands its beacon, as a chart flags a mark: a staff of dark ink
// (12 + 3 × rarity) m tall, and from its head a swallow-tailed pennant, a solid block of the rarity's ink ruled round in
// dark ink, flying out to the side the eye sees it from and rippling. The pennant glows (the ink raised to its full
// brightness, EMIT times what the sun and the sky give a white surface), so the bloom catches it; it is never smaller on the screen than PENNANT_PIXELS across, so
// it reads to the haze's edge (about 250 m), where the haze takes it (drawn solid, it is hazed by its own distance like
// everything else: frame.ts). The beacons are drawn to BEACON m, the pieces themselves to SHAPE m.
//
// Four draws for all of it, each a single instanced mesh placed wholly in the vertex stage, from three buffers (the
// crates', the casks' and the beacons', staff and pennant reading the same) of a piece's place, id and rarity, written
// in place each frame and sent only as far as they hold pieces, and only when they changed. Lit by the sun and the sky
// as everything else is (sky/light.ts).

import {
  BoxGeometry, CylinderGeometry, DoubleSide, DynamicDrawUsage, InstancedBufferGeometry, InstancedInterleavedBuffer,
  InterleavedBufferAttribute, Mesh, MeshBasicNodeMaterial, PlaneGeometry, type BufferGeometry, type PerspectiveCamera,
} from 'three/webgpu';
import { Fn, abs, attribute, cameraPosition, cos, cross, float, max, min, mix, normalize, select, sin, smoothstep, uniform, varying, vec3 } from 'three/tsl';
import type { Light } from '../sky/light';
import { RARITY, type LootDraw } from '../snapshot';
import { pixelSize } from '../view/view';
import type { FloatNode, Vec3Node } from '../tsl';

/** The most pieces drawn at once. */
const PIECES = 512;
/** Metres out to which the beacon and the piece are drawn (past the haze's edge, both). */
const BEACON = 420, SHAPE = 320;
/** The staff: its height, m, for the commonest and more for each rarity up; its width, m, and fewest pixels across. */
const TALL = 12, TALLER = 3, STAFF = 0.3, STAFF_PIXELS = 2;
/** The pennant: how far it flies out and how deep it hangs at its hoist, m; the fewest pixels it flies out; how deep
 *  its tail's notch is cut, of its length; its ink rule, of its depth; how far it ripples (m) and how fast (rad/s). */
const LONG = 5.5, DEEP = 2.8, PENNANT_PIXELS = 16, NOTCH = 0.3, RULE = 0.11, RIPPLE = 0.35, RIPPLE_RATE = 3.2;
/** The pennant glows this many times what the sun and the sky give a white surface. */
const EMIT = 1.3;
/** The dark ink of the staff and the pennant's rule (linear). */
const INK: [number, number, number] = [0.025, 0.018, 0.012];
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

  // the beacon: a staff standing on the piece and a pennant from its head, both turned to face the eye about the up,
  // the pennant flying out to the side; each never smaller on the screen than its fewest pixels
  const toEye = cameraPosition.sub(at.xyz), side = normalize(cross(up, toEye)), facing = normalize(cross(side, up));
  const tall = float(TALL).add(ink.w.mul(TALLER)), drawn = select(far.lessThan(BEACON), float(1), float(0));
  const beacon = (shape: BufferGeometry, buffer: InstancedInterleavedBuffer) => {
    const m = new MeshBasicNodeMaterial({ side: DoubleSide });
    const mesh = new Mesh(instanced(shape, buffer), m);
    mesh.frustumCulled = false;
    mesh.visible = false;
    return { mesh, geometry: mesh.geometry, m };
  };
  const beacons = new InstancedInterleavedBuffer(new Float32Array(PIECES * STRIDE), STRIDE).setUsage(DynamicDrawUsage);

  // the staff: x across (−½…½), y up (0…1), its foot in the water
  const staff = beacon(new PlaneGeometry(1, 1).translate(0, 0.5, 0), beacons);
  const thick = max(float(STAFF), far.mul(pixel).mul(STAFF_PIXELS));
  staff.m.positionNode = at.xyz.add(side.mul(local.x.mul(thick)).add(up.mul(local.y.mul(tall).sub(1)))).mul(drawn);
  staff.m.colorNode = vec3(...INK);

  // the pennant: u along it from the hoist (0…1), v down it (0…1); its tail notched, its edge ruled, rippling
  const pennant = beacon(new PlaneGeometry(1, 1, 12, 1).translate(0.5, -0.5, 0), beacons);
  const grow = max(float(1), far.mul(pixel).mul(PENNANT_PIXELS / LONG));
  const u = local.x, v = local.y.negate();
  const ripple = sin(u.mul(5).sub(now.mul(RIPPLE_RATE)).add(seed)).mul(u).mul(RIPPLE).mul(grow);
  const head = at.xyz.add(up.mul(tall.sub(1)));
  pennant.m.positionNode = head.add(side.mul(u.mul(LONG).mul(grow))).add(up.mul(v.mul(-DEEP).mul(grow).add(ripple))).add(facing.mul(ripple)).mul(drawn);
  const uu = varying(u), vv = varying(v), p = varying(head), tint = varying(ink.rgb);
  // the notch: cut in from the fly, deepest at the middle; the rule: near any edge, the notch's included
  const cut = Fn(() => float(1).sub(abs(vv.mul(2).sub(1))).mul(NOTCH))();
  pennant.m.opacityNode = select(uu.greaterThan(float(1).sub(cut)), float(0), float(1));
  pennant.m.alphaTest = 0.5;
  pennant.m.colorNode = Fn(() => {
    const edge = min(min(vv, float(1).sub(vv)).div(RULE), min(uu.mul(LONG / DEEP), float(1).sub(cut).sub(uu).mul(LONG / DEEP)).div(RULE));
    // the ink at its full brightness, its hue kept: the map's dark inks would glow dull
    const bright = tint.div(max(tint.r, max(tint.g, tint.b)).max(1e-3));
    const glow = bright.mul(light(p, normalize(p)).mul(EMIT));
    return mix(vec3(...INK), glow, smoothstep(0.7, 1, edge));
  })();

  /** Fills a buffer in place from the pieces that pass `keep` and shows its meshes' instances; sends it, as far as it
   *  holds pieces, if anything in it changed. */
  const counts = new Map<InstancedInterleavedBuffer, number>();
  const fill = (buffer: InstancedInterleavedBuffer, drawn: readonly { mesh: Mesh; geometry: InstancedBufferGeometry }[], pieces: readonly LootDraw[], keep: (l: LootDraw) => boolean) => {
    const a = buffer.array as Float32Array;
    let n = 0, changed = false, o = 0;
    const put = (k: number, v: number) => {
      const f = Math.fround(v);
      if (a[o + k] === f) return;
      a[o + k] = f;
      changed = true;
    };
    for (const l of pieces) {
      if (n >= PIECES) break;
      if (!keep(l)) continue;
      const ink = INKS[l.rarity];
      o = n++ * STRIDE;
      put(0, l.at[0]), put(1, l.at[1]), put(2, l.at[2]), put(3, l.id);
      put(4, ink[0]), put(5, ink[1]), put(6, ink[2]), put(7, l.rarity);
    }
    if (changed) {
      buffer.clearUpdateRanges();
      buffer.addUpdateRange(0, n * STRIDE);
      buffer.needsUpdate = true;
    }
    if (counts.get(buffer) === n) return;
    counts.set(buffer, n);
    for (const { mesh, geometry } of drawn) {
      geometry.instanceCount = n;
      mesh.visible = n > 0;
    }
  };

  return {
    meshes: [crate.mesh, cask.mesh, staff.mesh, pennant.mesh],
    /** Each frame: the world's clock now (s), and the pieces near the eye. */
    draw(time: number, pieces: readonly LootDraw[]) {
      now.value = time;
      fill(crates, [crate], pieces, (l) => l.gun);
      fill(casks, [cask], pieces, (l) => !l.gun);
      fill(beacons, [staff, pennant], pieces, () => true);
    },
    /** Each frame, after the camera has moved: the drawing buffer's height, pixels. */
    update(camera: PerspectiveCamera, height: number) {
      pixel.value = pixelSize(camera, height);
    },
  };
}
