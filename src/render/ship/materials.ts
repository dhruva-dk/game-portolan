import {
  DoubleSide,
  MeshBasicNodeMaterial,
  type StorageBufferNode,
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
  fract,
  fwidth,
  max,
  min,
  mix,
  normalize,
  positionWorld,
  faceDirection,
  int,
  luminance,
  select,
  sign,
  sin,
  smoothstep,
  storage,
  varying,
  vec3,
} from 'three/tsl';
import { read } from './instance.ts';
import type { Light } from '../sky/light.ts';
import {
  BELLY_UNIT,
  PENNANT_LENGTH,
  PIVOT_Z,
  RADIUS_UNIT,
  UV_RANGE,
} from './build.ts';
import { braced, bracedAbout, breath, type Cloth } from './cloth.ts';
import { CLOTH } from './kit.ts';
import { DYE_GLOW, MARKS, TAR } from '../palette.ts';
import { SAIL_MARKS } from '../snapshot.ts';
import { createWood, shaded } from './wood.ts';
import { line, type FloatNode, type Vec3Node } from '../tsl.ts';

export const THROUGH = 0.55;
const { arm: ARM, flare: FLARE, reach: REACH } = SAIL_MARKS,
  PAINTED = 0.35;
const CLOTHS = 26;
const { stripes: STRIPES, fringe: FRINGE, band: BAND } = SAIL_MARKS;
const UNSEEN = 0.06;
const ABACK = 0.3;
const FLAP = 2.2,
  WAVES = 1.6;
const RIPPLES = [2.6, 1.7] as const;
const ROPE_PIXELS = 0.75;

interface ShipMaterials {
  body: MeshBasicNodeMaterial;
  cloth: MeshBasicNodeMaterial;
  ropes: MeshBasicNodeMaterial;
}

export function createShipMaterials(
  light: Light,
  pixel: FloatNode,
  canvas: Cloth
): ShipMaterials {
  const wood = createWood(light);
  const particles = storage(
    canvas.positions,
    'vec4',
    canvas.positions.count
  ).toReadOnly();
  const particleNormals = storage(
    canvas.normals,
    'vec4',
    canvas.normals.count
  ).toReadOnly();

  const ship = read();
  const port = cross(ship.up, ship.forward);
  const turn = (v: Vec3Node): Vec3Node =>
    port.mul(v.x).add(ship.up.mul(v.y)).add(ship.forward.mul(v.z));
  const wind = ship.wind;

  const local = attribute('position', 'vec3');
  const nrm = attribute('nrm', 'vec4');
  const part = attribute('part', 'vec4');
  const kind = part.x.mul(255).round();
  const pivot = part.y.mul(255).round();
  const angle = ship.brace
    .mul(part.z)
    .mul(select(pivot.greaterThan(0.5), float(1), float(0)));
  const pivotZ = select(
    pivot.greaterThan(1.5),
    float(PIVOT_Z[2]),
    float(PIVOT_Z[1])
  );
  const point = (v: Vec3Node): Vec3Node => bracedAbout(v, angle, pivotZ);
  const direction = (v: Vec3Node): Vec3Node => braced(v, angle);

  const body = new MeshBasicNodeMaterial();
  body.positionNode = ship.position.add(turn(point(local)));
  const bodyNormal = varying(turn(direction(nrm.xyz)));
  const height = varying(local.y);
  const bodyKind = varying(kind);
  body.colorNode = Fn(() =>
    wood(
      bodyKind,
      attribute('uv', 'vec2').mul(UV_RANGE),
      height,
      normalize(bodyNormal),
      nrm.w,
      ship.paint
    )
  )();

  const clothMaterial = new MeshBasicNodeMaterial({ side: DoubleSide });
  const isPennant = kind.greaterThan(CLOTH.pennant - 0.5);
  const isLateen = kind.greaterThan(CLOTH.lateen - 0.5).and(isPennant.not());
  const uvCloth = attribute('uv', 'vec2').mul(UV_RANGE);
  const phase = ship.phase;
  const out = select(isLateen, vec3(1, 0, 0), vec3(0, 0, 1));
  const square = wind.x.mul(sin(ship.brace)).add(wind.y.mul(cos(ship.brace)));
  const strength = max(abs(wind.x), abs(wind.y)).mul(
    breath(canvas.clock, phase)
  );
  const through = select(isLateen, wind.x, square).mul(
    breath(canvas.clock, phase)
  );
  const fill = select(
    isLateen,
    clamp(through, -1, 1),
    clamp(through, -ABACK, 1)
  );
  const belly = part.w.mul(BELLY_UNIT);
  const a = select(isLateen, local.z, local.x),
    b = local.y;
  const lee = select(isLateen, sign(wind.y).negate(), sign(wind.x).negate());
  const clew = smoothstep(0.7, 1, uvCloth.y).mul(
    smoothstep(0.25, 0, min(uvCloth.x, float(1).sub(uvCloth.x)))
  );
  const free = smoothstep(0, 0.5, uvCloth.y).mul(
    select(isLateen, smoothstep(1, 0.75, uvCloth.y), float(1).sub(clew))
  );
  const luff = strength.sub(abs(fill)).max(0).mul(free);
  const ripple = belly.mul(abs(fill)).mul(0.045);
  const [k1, k2] = RIPPLES.map((l) => (2 * Math.PI) / l);
  const w1 = a
    .mul(lee)
    .mul(k1)
    .add(b.mul(0.8))
    .sub(canvas.clock.mul(strength.mul(9).add(4)))
    .add(phase);
  const w2 = a
    .mul(lee)
    .mul(k2)
    .sub(b.mul(1.3))
    .sub(canvas.clock.mul(strength.mul(13).add(5)))
    .add(phase.mul(1.7));
  const shake = luff.mul(0.22).add(ripple);
  const lift = sin(w1).mul(shake).add(sin(w2).mul(shake).mul(0.45));
  const liftA = cos(w1)
    .mul(k1)
    .add(cos(w2).mul(k2 * 0.45))
    .mul(shake)
    .mul(lee);
  const liftB = cos(w1)
    .mul(0.8)
    .sub(cos(w2).mul(1.3 * 0.45))
    .mul(shake);
  const sail = local.add(out.mul(belly.mul(fill.sub(1)).add(lift)));
  const along = uvCloth.x.mul(PENNANT_LENGTH);
  const blow = normalize(
    vec3(
      wind.x,
      float(-0.15).sub(float(1).sub(strength.mul(1.4)).max(0).mul(1.2)),
      wind.y
    )
  );
  const across = normalize(cross(vec3(0, 1, 0), blow).add(vec3(1e-4, 0, 0)));
  const flap = sin(
    canvas.clock
      .mul(FLAP * 2 * Math.PI)
      .mul(strength.add(0.4))
      .sub(uvCloth.x.mul(WAVES * 2 * Math.PI))
      .add(phase)
  )
    .mul(uvCloth.x)
    .mul(0.12 * PENNANT_LENGTH);
  const pennant = local
    .add(vec3(0, 0, along))
    .add(blow.mul(along))
    .add(across.mul(flap));
  const n0 = nrm.xyz,
    lean = dot(n0, out);
  const plane = select(isLateen, vec3(0, 0, 1), vec3(1, 0, 0));
  const filled = n0
    .sub(out.mul(lean))
    .mul(fill)
    .add(out.mul(sign(lean).mul(max(abs(lean), 0.05))))
    .sub(
      plane
        .mul(liftA)
        .add(vec3(0, 1, 0).mul(liftB))
        .mul(sign(lean))
    );
  const share = ship.share;
  const g = canvas.grids.element(int(nrm.w.mul(127).round()));
  const fu = clamp(uvCloth.x, 0, 1).mul(g.y),
    fv = clamp(uvCloth.y, 0, 1).mul(g.z);
  const i0 = min(fu.floor(), g.y.sub(1)),
    j0 = min(fv.floor(), g.z.sub(1));
  const fx = fu.sub(i0),
    fy = fv.sub(j0);
  const row = int(g.y.add(1));
  const first = int(
    ship.berth
      .mul(canvas.count)
      .add(g.x)
      .add(i0)
      .add(j0.mul(g.y.add(1)))
  );
  const bilinear = (B: StorageBufferNode<'vec4'>): Vec3Node =>
    mix(
      mix(B.element(first).xyz, B.element(first.add(1)).xyz, fx),
      mix(
        B.element(first.add(row)).xyz,
        B.element(first.add(row).add(1)).xyz,
        fx
      ),
      fy
    );
  const simulated = bilinear(particles),
    simulatedNormal = bilinear(particleNormals);
  const shaped = mix(select(isPennant, pennant, sail), simulated, share);
  clothMaterial.positionNode = ship.position.add(turn(point(shaped)));
  const drawn = select(isPennant, across, filled),
    drawnNormal = normalize(drawn);
  const clothNormal = varying(
    turn(direction(mix(drawnNormal, simulatedNormal, share)))
  );
  const clothKind = varying(kind);
  clothMaterial.colorNode = Fn(() => {
    const uvs = attribute('uv', 'vec2').mul(UV_RANGE);
    const seams = select(
      clothKind.lessThan(CLOTH.lateen + 0.5),
      line(uvs.x, CLOTHS).mul(0.12),
      float(0)
    );
    const edge = max(
      smoothstep(0.02, 0, min(uvs.x, float(1).sub(uvs.x))),
      smoothstep(0.03, 0, min(uvs.y, float(1).sub(uvs.y)))
    ).mul(0.25);
    const banded = select(
      abs(ship.pattern.sub(1)).lessThan(0.5),
      float(1),
      float(0)
    );
    const band = banded
      .mul(smoothstep(BAND[0], BAND[0] + 0.01, uvs.y))
      .mul(smoothstep(BAND[1], BAND[1] - 0.01, uvs.y));
    const s = uvs.x.sub(0.5).mul(STRIPES),
      wave = abs(fract(s.mul(0.5).add(0.5)).sub(0.5)).mul(2),
      ws = max(fwidth(s), 1e-4);
    const square = clothKind.lessThan(CLOTH.lateen - 0.5);
    const stripe = select(
      ship.pattern.greaterThan(1.5).and(square),
      smoothstep(ws.negate(), ws, float(0.5).sub(wave)),
      float(0)
    );
    const c = abs(uvs.sub(0.5)).mul(2).div(REACH);
    const pattee = (d: number) => {
      const armX = c.y
        .lessThan(mix(float(ARM + d), float(FLARE + d), c.x))
        .and(c.x.lessThan(1 + d));
      const armY = c.x
        .lessThan(mix(float(ARM + d), float(FLARE + d), c.y))
        .and(c.y.lessThan(1 + d));
      return select(square.and(armX.or(armY)), float(1), float(0));
    };
    const mark = pattee(0);
    const marked = max(
      band,
      max(mark, stripe.mul(float(1).sub(pattee(FRINGE))))
    );
    const ink = select(
      abs(luminance(ship.paint).sub(luminance(ship.sail))).lessThan(UNSEEN),
      select(
        luminance(ship.sail).greaterThan(MARKS.turn),
        vec3(...MARKS.dark),
        vec3(...MARKS.light)
      ),
      ship.paint
    );
    let albedo = mix(ship.sail, ink, marked);
    albedo = select(
      clothKind.greaterThan(CLOTH.pennant - 0.5),
      ship.paint,
      albedo.mul(float(1).sub(seams).sub(edge))
    );
    const n = normalize(clothNormal).mul(faceDirection);
    const side = light.sides(positionWorld, n);
    const dyed = albedo.mul(albedo).div(max(luminance(albedo), 0.05));
    const glow = mix(albedo, dyed, DYE_GLOW.deepen).mul(
      mix(float(DYE_GLOW.gain), float(DYE_GLOW.gain * PAINTED), marked)
    );
    return mix(mix(shaded(albedo), glow, side.back), albedo, side.front).mul(
      light.level(positionWorld)
    );
  })();
  const ropes = new MeshBasicNodeMaterial({ transparent: true });
  const ropeNormal = turn(direction(nrm.xyz));
  const ropeAt = ship.position.add(turn(point(local)));
  const radius = nrm.w.mul(RADIUS_UNIT);
  const wide = max(
    cameraPosition.distance(ropeAt).mul(pixel).mul(ROPE_PIXELS),
    radius
  );
  ropes.positionNode = ropeAt.add(ropeNormal.mul(wide.sub(radius)));
  const ropeN = varying(ropeNormal),
    cover = varying(radius.div(wide));
  ropes.colorNode = Fn(() =>
    light.toon(
      positionWorld,
      normalize(ropeN),
      vec3(...TAR.lit),
      vec3(...TAR.shadow)
    )
  )();
  const facing = abs(
    dot(normalize(ropeN), normalize(cameraPosition.sub(positionWorld)))
  );
  ropes.opacityNode = cover.mul(smoothstep(0, 0.6, facing));

  return { body, cloth: clothMaterial, ropes };
}
