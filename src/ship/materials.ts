// The galleon's three materials — the body, the cloth and the ropes — lit like everything else (land/light.ts: the
// sun through the air, the clouds' and the nearest island's shadows, the sky).
//
// Every ship is an instance (fleet.ts): its pose and look ride along as per-instance attributes, and each vertex is
// carried from her frame to the world here, in the vertex stage (no instance matrices: the brace and the wind act in
// her own frame first):
//   shipAt    position (world, metres), brace (radians: the square yards turned about their masts, the port
//             yardarm aft for positive)
//   shipFwd   forward (unit), and the wind across her frame's x …
//   shipUp    up (unit), … and along its z: the wind she feels, scaled to 0…1 by how hard it blows
//   shipPaint the strakes' and pennants' colour (linear), and 1 for a band of it across the sails
//   shipCloth the sails' colour (linear), and a phase that keeps her canvas from flapping in step with others'
//
// The body: wood.ts. The cloth: filled by the wind (sails.ts's belly scaled by it), shivering when it lies along them;
// lit on both sides with light through the canvas. The pennants stream down the wind. The ropes: widened to a pixel and a half across far off so the rigging stays a line rather than
// breaking into dashes, and blended over what is behind them by how much of that width the rope itself would cover —
// so a distant ship's rigging is the faint web it is, not a black one — their edges soft, as a round rope's are where
// it turns away from the eye.

import { DoubleSide, MeshBasicNodeMaterial } from 'three/webgpu';
import {
  Fn, abs, attribute, cameraPosition, clamp, cos, cross, dot, float, fract, fwidth, max, min, mix, normalize, positionWorld,
  faceDirection, select, sign, sin, smoothstep, time, varying, vec2, vec3,
} from 'three/tsl';
import { type Light, leafLight } from '../land/light';
import { BELLY_UNIT, PENNANT_LENGTH, PIVOT_Z, RADIUS_UNIT, UV_RANGE } from './build';
import { CLOTH } from './kit';
import { createWood } from './wood';

type N = any;

/** Tarred hemp, weathered grey. */
const ROPE = [0.13, 0.11, 0.085];
/** How much of the light on a sail's far side comes through the canvas. */
const THROUGH = 0.3;
/** A square sail's cloths: how many across it (each about 0.4 m), shown as faint seams. */
const CLOTHS = 26;
/** How far a sail may be blown aback (of its full belly), so it doesn't fold through its mast. */
const ABACK = 0.3;
/** A pennant flaps this many times a second in a fresh breeze, its waves this many to its length. */
const FLAP = 2.2, WAVES = 1.6;
/** A rope is widened to at least this many pixels in radius (below about a pixel and a half across, a line at a slant
 * breaks into dashes without multisampling), and drawn as faint as the rope it stands for is thin. */
const ROPE_PIXELS = 0.75;

export interface ShipMaterials { body: MeshBasicNodeMaterial; cloth: MeshBasicNodeMaterial; ropes: MeshBasicNodeMaterial }

/** pixel: the angle a pixel spans, radians — a uniform the fleet keeps. */
export function createShipMaterials(light: Light, pixel: N): ShipMaterials {
  const wood = createWood(light);

  // ---- her frame, per instance
  const at: N = attribute('shipAt', 'vec4'), fwd: N = attribute('shipFwd', 'vec4'), up: N = attribute('shipUp', 'vec4');
  const paint: N = attribute('shipPaint', 'vec4'), cloth: N = attribute('shipCloth', 'vec4');
  const port: N = cross(up.xyz, fwd.xyz);
  const turn = (v: N): N => port.mul(v.x).add(up.xyz.mul(v.y)).add(fwd.xyz.mul(v.z));
  const wind: N = vec2(fwd.w, up.w);

  // ---- each vertex's own data
  const local: N = attribute('position', 'vec3');
  const nrm: N = attribute('nrm', 'vec4');
  const part: N = attribute('part', 'vec4');
  const kind: N = part.x.mul(255).round();
  const pivot: N = part.y.mul(255).round();
  const angle: N = at.w.mul(part.z).mul(select(pivot.greaterThan(0.5), float(1), float(0)));
  const pivotZ: N = select(pivot.greaterThan(1.5), float(PIVOT_Z[2]), float(PIVOT_Z[1]));
  /** Turned about the vertical through the pivot's mast (a direction: about the vertical through the origin). */
  const brace = (v: N, point: boolean): N => {
    const c = cos(angle), s = sin(angle), z = point ? v.z.sub(pivotZ) : v.z;
    const x = v.x.mul(c).add(z.mul(s)), zz = v.x.negate().mul(s).add(z.mul(c));
    return vec3(x, v.y, point ? zz.add(pivotZ) : zz);
  };

  // ---- the body
  const body = new MeshBasicNodeMaterial();
  body.positionNode = at.xyz.add(turn(brace(local, true)));
  const bodyNormal: N = varying(turn(brace(nrm.xyz, false)));
  const height: N = varying(local.y);
  const bodyKind: N = varying(kind);
  body.colorNode = Fn(() => wood(bodyKind, attribute('uv', 'vec2').mul(UV_RANGE), height, normalize(bodyNormal), nrm.w, paint.rgb))();

  // ---- the cloth
  const clothMaterial = new MeshBasicNodeMaterial({ side: DoubleSide });
  const isPennant: N = kind.greaterThan(CLOTH.pennant - 0.5);
  const isLateen: N = kind.greaterThan(CLOTH.lateen - 0.5).and(isPennant.not());
  const uvCloth: N = attribute('uv', 'vec2').mul(UV_RANGE);
  // which way a sail bellies, before bracing; and how hard the wind fills it, along that (aback is negative)
  const out: N = select(isLateen, vec3(1, 0, 0), vec3(0, 0, 1));
  const square: N = wind.x.mul(sin(at.w)).add(wind.y.mul(cos(at.w)));
  const fill: N = select(isLateen, clamp(wind.x, -1, 1), clamp(square, -ABACK, 1));
  const belly: N = part.w.mul(BELLY_UNIT);
  // where the wind lies along the sail, the canvas shivers
  const strength: N = max(abs(wind.x), abs(wind.y));
  const shiver: N = sin(time.mul(9).add(uvCloth.x.mul(11)).add(uvCloth.y.mul(5)).add(cloth.w)).mul(part.w).mul(strength.sub(abs(fill)).max(0)).mul(0.05);
  const sail: N = local.add(out.mul(belly.mul(fill.sub(1)).add(shiver)));
  // the pennant: from its root down the wind (hanging when there is none), flapping across it
  const along: N = uvCloth.x.mul(PENNANT_LENGTH);
  const blow: N = normalize(vec3(wind.x, float(-0.15).sub(float(1).sub(strength.mul(1.4)).max(0).mul(1.2)), wind.y));
  const across: N = normalize(cross(vec3(0, 1, 0), blow).add(vec3(1e-4, 0, 0)));
  const flap: N = sin(time.mul(FLAP * 2 * Math.PI).mul(strength.add(0.4)).sub(uvCloth.x.mul(WAVES * 2 * Math.PI)).add(cloth.w))
    .mul(uvCloth.x).mul(0.12 * PENNANT_LENGTH);
  const pennant: N = local.add(vec3(0, 0, along)).add(blow.mul(along)).add(across.mul(flap));
  clothMaterial.positionNode = at.xyz.add(turn(brace(select(isPennant, pennant, sail), true)));
  // the filled sail's normal: its slope across the flat scaled with the belly
  const n0: N = nrm.xyz, lean: N = dot(n0, out);
  const filled: N = n0.sub(out.mul(lean)).mul(fill).add(out.mul(sign(lean).mul(max(abs(lean), 0.05))));
  const clothNormal: N = varying(turn(brace(select(isPennant, across, filled), false)));
  const clothKind: N = varying(kind);
  clothMaterial.colorNode = Fn(() => {
    const uvs = attribute('uv', 'vec2').mul(UV_RANGE);
    // seams between the cloths, and the boltrope round the edges, each about a pixel wide and fading out once too
    // fine to draw
    const line = (t: N, every: number) => {
      const f = t.mul(every), w = fwidth(f);
      const d = min(fract(f), float(1).sub(fract(f))).div(max(w, 1e-4));
      return float(1).sub(clamp(d, 0, 1)).mul(clamp(float(1).sub(w.mul(2)), 0, 1));
    };
    const seams = select(clothKind.lessThan(CLOTH.lateen + 0.5), line(uvs.x, CLOTHS).mul(0.12), float(0));
    const edge = max(smoothstep(0.02, 0, min(uvs.x, float(1).sub(uvs.x))), smoothstep(0.03, 0, min(uvs.y, float(1).sub(uvs.y)))).mul(0.25);
    const band = paint.w.mul(smoothstep(0.36, 0.37, uvs.y)).mul(smoothstep(0.64, 0.63, uvs.y));
    let albedo: N = mix(cloth.rgb, paint.rgb, band);
    albedo = select(clothKind.greaterThan(CLOTH.pennant - 0.5), paint.rgb, albedo.mul(float(1).sub(seams).sub(edge)));
    return albedo.mul(leafLight(light, positionWorld, normalize(clothNormal).mul(faceDirection), THROUGH));
  })();
  // ---- the ropes: blended, so drawn after the sea (fleet.ts)
  const ropes = new MeshBasicNodeMaterial({ transparent: true });
  const ropeNormal: N = turn(brace(nrm.xyz, false));
  const ropeAt: N = at.xyz.add(turn(brace(local, true)));
  const radius: N = nrm.w.mul(RADIUS_UNIT);
  const wide: N = max(cameraPosition.distance(ropeAt).mul(pixel).mul(ROPE_PIXELS), radius);
  ropes.positionNode = ropeAt.add(ropeNormal.mul(wide.sub(radius)));
  const ropeN: N = varying(ropeNormal), cover: N = varying(radius.div(wide));
  ropes.colorNode = Fn(() => vec3(...ROPE).mul(light(positionWorld, normalize(ropeN))))();
  // across the rope, how squarely its surface faces the eye: the edges, seen edge on, cover less of their pixels
  const facing: N = abs(dot(normalize(ropeN), normalize(cameraPosition.sub(positionWorld))));
  ropes.opacityNode = cover.mul(smoothstep(0, 0.6, facing));

  return { body, cloth: clothMaterial, ropes };
}
