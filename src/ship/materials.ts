// The galleon's three materials — the body, the cloth and the ropes — lit like everything else (sky/light.ts: the
// sun through the air, the clouds' and the nearest island's shadows, the sky).
//
// Every ship is an instance (fleet.ts): its pose and look ride along as per-instance attributes, and each vertex is
// carried from her frame to the world here, in the vertex stage (no instance matrices: the brace and the wind act in
// her own frame first):
//   shipAt    position (world, metres), brace (radians: the square yards turned about their masts, the port
//             yardarm aft for positive)
//   shipFwd   forward (unit), and the wind across her frame's x …
//   shipUp    up (unit), … and along its z: her sails' wind (motion.ts), scaled to 0…1 by how hard it blows
//   shipPaint the strakes' and pennants' colour (linear), and 1 for a band of it across the sails
//   shipCloth the sails' colour (linear), and a phase that keeps her canvas from flapping in step with others'
//   shipBerth her berth in the cloth simulation (cloth.ts) and how much of her canvas it shapes (0…1)
//
// The body: wood.ts. The cloth, two ways blended by her berth's share, so a ship's canvas never pops between them:
// drawn, filled by her sails' wind (sails.ts's belly scaled by it, breathing with its gusts), with a ripple and, as the
// wind slackens or comes along the sail, a luff travelling across it to leeward, its normal tilted to match; and
// simulated, each vertex at its place on its sail's grid read from the particles (bilinearly, so every level samples
// the same sheet) with the particles' own normal. Lit on both sides with light through the canvas. The pennants stream
// down the same wind, drawn or simulated alike. The ropes: widened to a pixel and a half across far off so the rigging
// stays a line rather than breaking into dashes, and blended over what is behind them by how much of that width the
// rope itself would cover — so a distant ship's rigging is the faint web it is, not a black one — their edges soft, as
// a round rope's are where it turns away from the eye.

import { DoubleSide, MeshBasicNodeMaterial, type StorageBufferNode } from 'three/webgpu';
import {
  Fn, abs, attribute, cameraPosition, clamp, cos, cross, dot, float, fract, fwidth, max, min, mix, normalize, positionWorld,
  faceDirection, int, select, sign, sin, smoothstep, storage, varying, vec2, vec3,
} from 'three/tsl';
import type { Light } from '../sky/light';
import { BELLY_UNIT, PENNANT_LENGTH, PIVOT_Z, RADIUS_UNIT, UV_RANGE } from './build';
import { breath, type Cloth } from './cloth';
import { CLOTH } from './kit';
import { createWood } from './wood';
import type { FloatNode, Vec3Node } from '../tsl';

/** Tarred hemp, weathered grey. */
const ROPE = [0.13, 0.11, 0.085];
/** How much of the light on a sail's far side comes through the canvas. */
export const THROUGH = 0.3;
/** A square sail's cloths: how many across it (each about 0.4 m), shown as faint seams. */
const CLOTHS = 26;
/** How far a sail may be blown aback (of its full belly), so it doesn't fold through its mast. */
const ABACK = 0.3;
/** Inside a sail's bag, the most of the light on it that its own canvas takes, and how deep the bag is then, metres. */
const HOLLOW = 0.35, DEEP = 1.6;
/** A pennant flaps this many times a second in a fresh breeze, its waves this many to its length. */
const FLAP = 2.2, WAVES = 1.6;
/** A rope is widened to at least this many pixels in radius (below about a pixel and a half across, a line at a slant
 * breaks into dashes without multisampling), and drawn as faint as the rope it stands for is thin. */
const ROPE_PIXELS = 0.75;

export interface ShipMaterials { body: MeshBasicNodeMaterial; cloth: MeshBasicNodeMaterial; ropes: MeshBasicNodeMaterial }

/** pixel: the angle a pixel spans, radians — a uniform the fleet keeps; canvas: the near ships' cloth. */
export function createShipMaterials(light: Light, pixel: FloatNode, canvas: Cloth): ShipMaterials {
  const wood = createWood(light);
  const particles = storage(canvas.positions, 'vec4', canvas.positions.count).toReadOnly();
  const particleNormals = storage(canvas.normals, 'vec4', canvas.normals.count).toReadOnly();

  // ---- her frame, per instance
  const at = attribute('shipAt', 'vec4'), fwd = attribute('shipFwd', 'vec4'), up = attribute('shipUp', 'vec4');
  const paint = attribute('shipPaint', 'vec4'), cloth = attribute('shipCloth', 'vec4');
  const port = cross(up.xyz, fwd.xyz);
  const turn = (v: Vec3Node): Vec3Node => port.mul(v.x).add(up.xyz.mul(v.y)).add(fwd.xyz.mul(v.z));
  const wind = vec2(fwd.w, up.w);

  // ---- each vertex's own data
  const local = attribute('position', 'vec3');
  const nrm = attribute('nrm', 'vec4');
  const part = attribute('part', 'vec4');
  const kind = part.x.mul(255).round();
  const pivot = part.y.mul(255).round();
  const angle = at.w.mul(part.z).mul(select(pivot.greaterThan(0.5), float(1), float(0)));
  const pivotZ = select(pivot.greaterThan(1.5), float(PIVOT_Z[2]), float(PIVOT_Z[1]));
  /** Turned about the vertical through the pivot's mast (a direction: about the vertical through the origin). */
  const brace = (v: Vec3Node, point: boolean): Vec3Node => {
    const c = cos(angle), s = sin(angle), z = point ? v.z.sub(pivotZ) : v.z;
    const x = v.x.mul(c).add(z.mul(s)), zz = v.x.negate().mul(s).add(z.mul(c));
    return vec3(x, v.y, point ? zz.add(pivotZ) : zz);
  };

  // ---- the body
  const body = new MeshBasicNodeMaterial();
  body.positionNode = at.xyz.add(turn(brace(local, true)));
  const bodyNormal = varying(turn(brace(nrm.xyz, false)));
  const height = varying(local.y);
  const bodyKind = varying(kind);
  body.colorNode = Fn(() => wood(bodyKind, attribute('uv', 'vec2').mul(UV_RANGE), height, normalize(bodyNormal), nrm.w, paint.rgb))();

  // ---- the cloth
  const clothMaterial = new MeshBasicNodeMaterial({ side: DoubleSide });
  const isPennant = kind.greaterThan(CLOTH.pennant - 0.5);
  const isLateen = kind.greaterThan(CLOTH.lateen - 0.5).and(isPennant.not());
  const uvCloth = attribute('uv', 'vec2').mul(UV_RANGE);
  const phase = cloth.w;
  // which way a sail bellies, before bracing; and how hard the wind fills it, along that (aback is negative), as it
  // breathes with the gusts
  const out = select(isLateen, vec3(1, 0, 0), vec3(0, 0, 1));
  const square = wind.x.mul(sin(at.w)).add(wind.y.mul(cos(at.w)));
  const strength = max(abs(wind.x), abs(wind.y)).mul(breath(canvas.clock, phase));
  const through = select(isLateen, wind.x, square).mul(breath(canvas.clock, phase));
  const fill = select(isLateen, clamp(through, -1, 1), clamp(through, -ABACK, 1));
  const belly = part.w.mul(BELLY_UNIT);
  // Across the sail's plane (metres: along its yard, and up), the canvas ripples: a little where it is full, the
  // wind's eddies running over it; and where the wind lies along it rather than through it, it lifts and shakes, the
  // shiver running off its weather edge to leeward, hardest along its free edges and foot and none at its lashings.
  const a = select(isLateen, local.z, local.x), b = local.y;
  const lee = select(isLateen, sign(wind.y).negate(), sign(wind.x).negate());
  const clew = smoothstep(0.7, 1, uvCloth.y).mul(smoothstep(0.25, 0, min(uvCloth.x, float(1).sub(uvCloth.x))));
  const free = smoothstep(0, 0.5, uvCloth.y).mul(select(isLateen, smoothstep(1, 0.75, uvCloth.y), float(1).sub(clew)));
  const luff = strength.sub(abs(fill)).max(0).mul(free);
  const ripple = belly.mul(abs(fill)).mul(0.045);
  const k1 = 2 * Math.PI / 2.6, k2 = 2 * Math.PI / 1.7;
  const w1 = a.mul(lee).mul(k1).add(b.mul(0.8)).sub(canvas.clock.mul(strength.mul(9).add(4))).add(phase);
  const w2 = a.mul(lee).mul(k2).sub(b.mul(1.3)).sub(canvas.clock.mul(strength.mul(13).add(5))).add(phase.mul(1.7));
  const shake = luff.mul(0.22).add(ripple);
  const lift = sin(w1).mul(shake).add(sin(w2).mul(shake).mul(0.45));
  // its slope across the plane, for the normal
  const liftA = cos(w1).mul(k1).add(cos(w2).mul(k2 * 0.45)).mul(shake).mul(lee);
  const liftB = cos(w1).mul(0.8).sub(cos(w2).mul(1.3 * 0.45)).mul(shake);
  const sail = local.add(out.mul(belly.mul(fill.sub(1)).add(lift)));
  // the pennant: from its root down the wind (hanging when there is none), flapping across it
  const along = uvCloth.x.mul(PENNANT_LENGTH);
  const blow = normalize(vec3(wind.x, float(-0.15).sub(float(1).sub(strength.mul(1.4)).max(0).mul(1.2)), wind.y));
  const across = normalize(cross(vec3(0, 1, 0), blow).add(vec3(1e-4, 0, 0)));
  const flap = sin(canvas.clock.mul(FLAP * 2 * Math.PI).mul(strength.add(0.4)).sub(uvCloth.x.mul(WAVES * 2 * Math.PI)).add(phase))
    .mul(uvCloth.x).mul(0.12 * PENNANT_LENGTH);
  const pennant = local.add(vec3(0, 0, along)).add(blow.mul(along)).add(across.mul(flap));
  // the filled sail's normal: its slope across the flat scaled with the belly, tilted by the ripples
  const n0 = nrm.xyz, lean = dot(n0, out);
  const plane = select(isLateen, vec3(0, 0, 1), vec3(1, 0, 0));
  const filled = n0.sub(out.mul(lean)).mul(fill).add(out.mul(sign(lean).mul(max(abs(lean), 0.05))))
    .sub(plane.mul(liftA).add(vec3(0, 1, 0).mul(liftB)).mul(sign(lean)));
  // A ship in a berth: her canvas as the cloth has it, at this vertex's place on its grid (the finest level's
  // vertices are the particles themselves), drawn as much as the berth's share says.
  const shipBerth = attribute('shipBerth', 'vec4'), share = shipBerth.y;
  const g = canvas.grids.element(int(nrm.w.mul(127).round()));
  const fu = clamp(uvCloth.x, 0, 1).mul(g.y), fv = clamp(uvCloth.y, 0, 1).mul(g.z);
  const i0 = min(fu.floor(), g.y.sub(1)), j0 = min(fv.floor(), g.z.sub(1));
  const fx = fu.sub(i0), fy = fv.sub(j0);
  const row = int(g.y.add(1));
  const first = int(shipBerth.x.mul(canvas.count).add(g.x).add(i0).add(j0.mul(g.y.add(1))));
  const bilinear = (B: StorageBufferNode<'vec4'>): Vec3Node => mix(
    mix(B.element(first).xyz, B.element(first.add(1)).xyz, fx),
    mix(B.element(first.add(row)).xyz, B.element(first.add(row).add(1)).xyz, fx), fy);
  const simulated = bilinear(particles), simulatedNormal = bilinear(particleNormals);
  const shaped = mix(select(isPennant, pennant, sail), simulated, share);
  clothMaterial.positionNode = at.xyz.add(turn(brace(shaped, true)));
  const drawn = select(isPennant, across, filled), drawnNormal = normalize(drawn);
  const clothNormal = varying(turn(brace(mix(drawnNormal, simulatedNormal, share), false)));
  const clothKind = varying(kind);
  // how far the canvas here stands out of its flat, metres (the side it bellies to: +), and which way that is
  const standOff = varying(select(isPennant, float(0), dot(shaped.sub(local), out)));
  const outward = varying(turn(brace(out, false)));
  clothMaterial.colorNode = Fn(() => {
    const uvs = attribute('uv', 'vec2').mul(UV_RANGE);
    // seams between the cloths, and the boltrope round the edges, each about a pixel wide and fading out once too
    // fine to draw
    const line = (t: FloatNode, every: number) => {
      const f = t.mul(every), w = fwidth(f);
      const d = min(fract(f), float(1).sub(fract(f))).div(max(w, 1e-4));
      return float(1).sub(clamp(d, 0, 1)).mul(clamp(float(1).sub(w.mul(2)), 0, 1));
    };
    const seams = select(clothKind.lessThan(CLOTH.lateen + 0.5), line(uvs.x, CLOTHS).mul(0.12), float(0));
    const edge = max(smoothstep(0.02, 0, min(uvs.x, float(1).sub(uvs.x))), smoothstep(0.03, 0, min(uvs.y, float(1).sub(uvs.y)))).mul(0.25);
    const band = paint.w.mul(smoothstep(0.36, 0.37, uvs.y)).mul(smoothstep(0.64, 0.63, uvs.y));
    let albedo = mix(cloth.rgb, paint.rgb, band);
    albedo = select(clothKind.greaterThan(CLOTH.pennant - 0.5), paint.rgb, albedo.mul(float(1).sub(seams).sub(edge)));
    // Seen from inside its bag, a sail's own canvas hides some of the sky and the sun from it, the more the deeper
    // the bag; what comes through the canvas comes through all the same.
    const n = normalize(clothNormal).mul(faceDirection);
    const inside = dot(n, outward).mul(standOff).lessThan(0);
    const hollow = select(inside, smoothstep(0.1, DEEP, abs(standOff)).mul(HOLLOW), float(0));
    const lit = light(positionWorld, n).mul(float(1).sub(hollow)).add(light(positionWorld, n.negate()).mul(THROUGH));
    return albedo.mul(lit);
  })();
  // ---- the ropes: blended, so drawn after the sea (fleet.ts)
  const ropes = new MeshBasicNodeMaterial({ transparent: true });
  const ropeNormal = turn(brace(nrm.xyz, false));
  const ropeAt = at.xyz.add(turn(brace(local, true)));
  const radius = nrm.w.mul(RADIUS_UNIT);
  const wide = max(cameraPosition.distance(ropeAt).mul(pixel).mul(ROPE_PIXELS), radius);
  ropes.positionNode = ropeAt.add(ropeNormal.mul(wide.sub(radius)));
  const ropeN = varying(ropeNormal), cover = varying(radius.div(wide));
  ropes.colorNode = Fn(() => vec3(...ROPE).mul(light(positionWorld, normalize(ropeN))))();
  // across the rope, how squarely its surface faces the eye: the edges, seen edge on, cover less of their pixels
  const facing = abs(dot(normalize(ropeN), normalize(cameraPosition.sub(positionWorld))));
  ropes.opacityNode = cover.mul(smoothstep(0, 0.6, facing));

  return { body, cloth: clothMaterial, ropes };
}
