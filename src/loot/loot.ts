import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  OctahedronGeometry,
  Vector2,
} from 'three/webgpu';
import {
  Fn,
  abs,
  attribute,
  cameraPosition,
  clamp,
  cos,
  cross,
  dot,
  float,
  max,
  mix,
  normalize,
  pow,
  select,
  sin,
  smoothstep,
  uniform,
  varying,
  vec3,
} from 'three/tsl';
import { GILDING, GLINT, ICE, RARITY_GLOW, TAR, TIMBER } from '../palette.ts';
import type { Light } from '../sky/light.ts';
import { KINDS, gunOrder, type GunKind, type LootKind } from '../kinds.ts';
import { gunSurface } from '../ship/gun.ts';
import { gunShape } from '../ship/gun-shape.ts';
import type { LootDraw } from '../snapshot.ts';
import type { Eye } from '../view/view.ts';
import { additive } from '../gpu.ts';
import { tangentFrame, type Vec3Node } from '../tsl.ts';

const PIECES = 512;
const BEAM = 520,
  SHAPE = 320,
  HALO = 140;
const RIDE = 2.2,
  BOB = 0.25,
  BOB_RATE = 2,
  SPIN = 1.4,
  ROCK = 0.15,
  SINK = 2,
  RISE = 2.5;
const SHAPE_PIXELS = 22,
  BEAM_PIXELS = 3,
  SHAPE_ACROSS = 3.5;
const TALL = 14,
  TALLER = 7,
  FOOT = 0.3,
  HEAD = 0.18;
const EMIT = 1.3,
  BEAM_EMIT = 3,
  HALO_EMIT = 1.2,
  RIM = 0.62;
const SIZE: Record<LootKind, number> = {
  cannon: 2.3,
  scatter: 2.1,
  repeater: 2.2,
  harpoon: 2.4,
  mortar: 2.1,
  smallShield: 1.7,
  bigShield: 2.25,
  repairKit: 1.6,
  fullRepair: 2.1,
};

const CRYSTALS = KINDS.length,
  CASKS = KINDS.length + 1,
  BEAMS = KINDS.length + 2;
const GROUP: Record<LootKind, number> = {
  cannon: gunOrder('cannon'),
  scatter: gunOrder('scatter'),
  repeater: gunOrder('repeater'),
  harpoon: gunOrder('harpoon'),
  mortar: gunOrder('mortar'),
  smallShield: CRYSTALS,
  bigShield: CRYSTALS,
  repairKit: CASKS,
  fullRepair: CASKS,
};

let changed = false;
function put(
  array: InstancedInterleavedBuffer['array'],
  i: number,
  value: number
) {
  const f = Math.fround(value);
  if (array[i] === f) return;
  array[i] = f;
  changed = true;
}

const STRIDE = 12;

function instanced(
  shape: BufferGeometry,
  buffer: InstancedInterleavedBuffer
): InstancedBufferGeometry {
  const g = new InstancedBufferGeometry();
  if (shape.getIndex()) g.setIndex(shape.getIndex());
  for (const name of ['position', 'normal', 'uv', 'part', 'metal']) {
    if (shape.getAttribute(name))
      g.setAttribute(name, shape.getAttribute(name));
  }
  g.setAttribute('lootAt', new InterleavedBufferAttribute(buffer, 4, 0));
  g.setAttribute('lootGlow', new InterleavedBufferAttribute(buffer, 4, 4));
  g.setAttribute('lootLife', new InterleavedBufferAttribute(buffer, 4, 8));
  g.instanceCount = 0;
  return g;
}

function gun(kind: GunKind): BufferGeometry {
  const s = gunShape(kind),
    g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(s.position, 3));
  g.setAttribute('normal', new BufferAttribute(s.normal, 3));
  g.setAttribute('metal', new BufferAttribute(s.metal, 1));
  g.setIndex(new BufferAttribute(s.index, 1));
  g.applyMatrix4(new Matrix4().makeRotationX(kind === 'mortar' ? -0.1 : -0.4));
  g.computeBoundingBox();
  const box = g.boundingBox!,
    mid = box.min.clone().add(box.max).multiplyScalar(0.5);
  return g.translate(-mid.x, -mid.y, -mid.z);
}

const cask = () => {
  const profile = [
    [0, -0.5],
    [0.3, -0.5],
    [0.38, -0.33],
    [0.43, -0.17],
    [0.46, 0],
    [0.43, 0.17],
    [0.38, 0.33],
    [0.3, 0.5],
    [0, 0.5],
  ];
  return new LatheGeometry(
    profile.map(([r, y]) => new Vector2(r, y)),
    12
  );
};

function beamAndRing(): BufferGeometry {
  const c = new CylinderGeometry(HEAD, FOOT, 1, 12, 1, true)
    .translate(0, 0.5, 0)
    .toNonIndexed();
  const n = c.getAttribute('position').count;
  const position = new Float32Array((n + 6) * 3),
    normal = new Float32Array((n + 6) * 3);
  const uv = new Float32Array((n + 6) * 2),
    part = new Float32Array(n + 6);
  position.set(c.getAttribute('position').array);
  normal.set(c.getAttribute('normal').array);
  uv.set(c.getAttribute('uv').array);
  [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, -1],
    [1, 1],
    [-1, 1],
  ].forEach(([x, z], i) => {
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

export function createLoot(light: Light) {
  const now = uniform(0);
  const pixel = uniform(0);
  const buffer = () =>
    new InstancedInterleavedBuffer(
      new Float32Array(PIECES * STRIDE),
      STRIDE
    ).setUsage(DynamicDrawUsage);
  const guns = KINDS.map(buffer),
    crystals = buffer(),
    casks = buffer(),
    beams = buffer();

  const at = attribute('lootAt', 'vec4'),
    glow = attribute('lootGlow', 'vec4'),
    life = attribute('lootLife', 'vec4');
  const up = normalize(at.xyz),
    id = at.w,
    seed = id.mul(0.618).fract().mul(6.283);
  const { e1, e2 } = tangentFrame(up);
  const a = now.mul(SPIN).add(id);
  const ahead = e1.mul(cos(a)).add(e2.mul(sin(a))),
    side = cross(up, ahead);
  const rock = sin(now.mul(1.3).add(seed)).mul(ROCK),
    cr = cos(rock),
    sr = sin(rock);
  const lift = up.mul(cr).add(ahead.mul(sr)),
    fore = ahead.mul(cr).sub(up.mul(sr));
  const pop = clamp(now.sub(life.x).mul(RISE), 0, 1);
  const far = cameraPosition.sub(at.xyz).length();
  const grow = max(float(1), far.mul(pixel).mul(SHAPE_PIXELS / SHAPE_ACROSS))
    .mul(life.y)
    .mul(pop.mul(0.6).add(0.4));
  const height = float(RIDE)
    .mul(grow.min(3))
    .add(sin(now.mul(BOB_RATE).add(id)).mul(BOB))
    .sub(float(1).sub(pop).mul(SINK));
  const centre = at.xyz.add(up.mul(height));
  const shown = select(far.lessThan(SHAPE), float(1), float(0));
  const local = attribute('position', 'vec3'),
    normal = attribute('normal', 'vec3');
  const turn = (v: Vec3Node) =>
    side.mul(v.x).add(lift.mul(v.y)).add(fore.mul(v.z));

  const piece = (
    geometry: InstancedBufferGeometry,
    surface: (p: Vec3Node, n: Vec3Node, l: Vec3Node) => Vec3Node
  ) => {
    const m = new MeshBasicNodeMaterial();
    m.positionNode = centre.add(turn(local).mul(grow)).mul(shown);
    const p = varying(centre.add(turn(local).mul(grow))),
      n = varying(turn(normal)),
      l = varying(local);
    const tint = varying(glow.rgb),
      base = varying(centre);
    m.colorNode = Fn(() => {
      const nn = normalize(n),
        eye = normalize(cameraPosition.sub(p));
      const edge = smoothstep(
        RIM - 0.03,
        RIM + 0.03,
        float(1).sub(abs(dot(nn, eye)))
      );
      return mix(
        surface(p, nn, l),
        tint.mul(light.level(base).mul(EMIT)),
        edge
      );
    })();
    const mesh = new Mesh(geometry, m);
    mesh.frustumCulled = false;
    return { mesh, geometry };
  };

  const made = varying(attribute('metal', 'float'));
  const gunMeshes = KINDS.map((kind, i) =>
    piece(instanced(gun(kind), guns[i]), (p, n) =>
      gunSurface(light, p, n, made)
    )
  );
  const crystalMesh = piece(
    instanced(new OctahedronGeometry(0.6).scale(0.8, 1.3, 0.8), crystals),
    (p, n) =>
      light.polished(
        p,
        n,
        vec3(...ICE.lit),
        vec3(...ICE.shadow),
        vec3(...GLINT)
      )
  );
  const caskMesh = piece(instanced(cask(), casks), (p, n, l) => {
    const hoop = smoothstep(0.035, 0.015, abs(abs(l.y).sub(0.33))).max(
      smoothstep(0.035, 0.015, abs(abs(l.y).sub(0.47)))
    );
    return light.toon(
      p,
      n,
      mix(vec3(...TIMBER.lit), vec3(...TAR.lit), hoop),
      mix(vec3(...TIMBER.shadow), vec3(...TAR.shadow), hoop)
    );
  });

  const beamGeometry = instanced(beamAndRing(), beams);
  const bm = additive(
    new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    })
  );
  const ring = attribute('part', 'float'),
    uv = attribute('uv', 'vec2');
  const tall = float(TALL).add(glow.w.mul(TALLER)),
    wide = max(float(1), far.mul(pixel).mul(BEAM_PIXELS / (2 * HEAD)));
  const beamAt = at.xyz
    .add(e1.mul(local.x.mul(wide)))
    .add(e2.mul(local.z.mul(wide)))
    .add(up.mul(local.y.mul(tall)));
  const halo = float(1.6).add(sin(now.mul(3).add(id)).mul(0.15));
  const ringAt = at.xyz
    .add(up.mul(0.12))
    .add(e1.mul(local.x.mul(halo)))
    .add(e2.mul(local.z.mul(halo)));
  const beamShown = select(far.lessThan(BEAM), float(1), float(0)),
    ringShown = select(far.lessThan(HALO), float(1), float(0));
  bm.positionNode = select(
    ring.greaterThan(0.5),
    ringAt.mul(ringShown),
    beamAt.mul(beamShown).mul(pop)
  );
  const v = varying(uv.y),
    xz = varying(local.xz),
    isRing = varying(ring);
  const tint = varying(glow.rgb),
    r = varying(glow.w),
    base = varying(at.xyz);
  const core = varying(
    abs(
      dot(
        normalize(e1.mul(normal.x).add(e2.mul(normal.z))),
        normalize(cameraPosition.sub(at.xyz))
      )
    )
  );
  const near = varying(smoothstep(10, 55, far));
  bm.colorNode = Fn(() => {
    const lit = light.level(base);
    const column = pow(float(1).sub(v), 2.2)
      .mul(
        sin(v.mul(40).sub(now.mul(6)))
          .mul(0.25)
          .add(0.75)
      )
      .mul(core.mul(core))
      .mul(near);
    const d = xz.length(),
      band = smoothstep(0.55, 0.8, d).mul(smoothstep(1, 0.82, d));
    const isBeam = isRing.lessThanEqual(0.5);
    const brightness = select(
      isBeam,
      column.mul(BEAM_EMIT).mul(r.mul(0.18).add(0.35)),
      band.mul(HALO_EMIT)
    );
    return select(isBeam, vec3(...GILDING.lit), tint)
      .mul(lit)
      .mul(brightness);
  })();
  const beamMesh = new Mesh(beamGeometry, bm);
  beamMesh.frustumCulled = false;
  beamMesh.renderOrder = 2;

  const drawn = [
    ...gunMeshes.map((g, i) => ({ buffer: guns[i], geometry: g.geometry })),
    { buffer: crystals, geometry: crystalMesh.geometry },
    { buffer: casks, geometry: caskMesh.geometry },
    { buffer: beams, geometry: beamGeometry },
  ];
  const counts = drawn.map(() => -1);

  const fill = (
    group: number,
    pieces: readonly LootDraw[],
    eye: readonly [number, number, number]
  ) => {
    const { buffer, geometry } = drawn[group],
      array = buffer.array;
    let n = 0;
    changed = false;
    for (let i = 0; i < pieces.length && n < PIECES; i++) {
      const l = pieces[i];
      if (group !== BEAMS) {
        const dx = l.at[0] - eye[0],
          dy = l.at[1] - eye[1],
          dz = l.at[2] - eye[2];
        if (
          GROUP[l.kind] !== group ||
          dx * dx + dy * dy + dz * dz >= SHAPE * SHAPE
        )
          continue;
      }
      const c = RARITY_GLOW[l.rarity],
        o = n++ * STRIDE;
      (put(array, o, l.at[0]),
        put(array, o + 1, l.at[1]),
        put(array, o + 2, l.at[2]),
        put(array, o + 3, l.id));
      (put(array, o + 4, c[0]),
        put(array, o + 5, c[1]),
        put(array, o + 6, c[2]),
        put(array, o + 7, l.rarity));
      (put(array, o + 8, l.born), put(array, o + 9, SIZE[l.kind]));
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
    meshes: [
      ...gunMeshes.map((g) => g.mesh),
      crystalMesh.mesh,
      caskMesh.mesh,
      beamMesh,
    ],
    draw(
      time: number,
      pieces: readonly LootDraw[],
      eye: readonly [number, number, number]
    ) {
      now.value = time;
      for (let group = 0; group < drawn.length; group++)
        fill(group, pieces, eye);
    },
    update(eye: Readonly<Eye>) {
      pixel.value = eye.pixel;
    },
  };
}
