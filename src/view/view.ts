// The planet as the eye sees it: the one place the shaders do the sphere's arithmetic (its CPU half is
// world/sphere.ts, which this mirrors). Every system that needs "up", a height, the sky's direction or a chart asks
// this, given to it by the frame.
//
//   up(p)        unit vector up at world position p (straight away from the planet's centre)
//   altitude(p)  metres above the sea's level at p
//   place(u, h)  the world position h metres above the sea over the unit vector u
//   toSky(dir)   a world direction as the eye's sky sees it (sky.ts's tables, the clouds, the reflection): in the
//                eye's frame, x east, y up, z south, its elevation stretched so the sky's horizon lies on the sea's
//                (world/sphere.ts, skyElevation)
//   fromSky(d)   the inverse: a sky direction back to the world, for the frame given
//   local(p)     where p lies on the eye's chart, metres east (x) and south (z) of the point under the eye
//   onEye(p)     the same, with the eye's chart's axes carried to p
//   under(d,m,h) how much of a ray from the eye lies under a height
//   rings(...)   a grid of rings round the point under the eye, laid on the sphere out to the horizon
//
// The eye is worked out once a frame from the camera (update), on the CPU and into uniforms: the one place outside
// the frame that reads the camera. The systems take the eye (Eye) instead: where it stands, what it sees (frustum),
// how wide a pixel is, and the camera's matrices for the clouds' reprojection.

import { BufferGeometry, Float32BufferAttribute, Frustum, Matrix4, Vector3, type PerspectiveCamera, type UniformNode } from 'three/webgpu';
import {
  asin, atan, clamp, cos, cross, dot, length, max, normalize, positionGeometry, select, sin, sqrt, uniform, vec2, vec3,
} from 'three/tsl';
import { R, frameAt, horizonDip, type Frame, type Vec3 } from '../world/sphere.ts';
import { toFloat, type FloatNode, type Vec2Node, type Vec3Node } from '../tsl.ts';

/** The eye, as the CPU sees it. */
export interface Eye {
  position: Vec3;
  frame: Frame;
  /** Metres above the sea's level. */
  height: number;
  /** How far below the level the sea's horizon lies, radians. */
  dip: number;
  /** How wide a pixel of the screen is at the middle of the view, per metre away. */
  pixel: number;
  /** What the eye sees. */
  frustum: Frustum;
  /** The camera's projection and its inverse; camera to world; and world to clip. */
  projection: Matrix4;
  projectionInverse: Matrix4;
  world: Matrix4;
  viewProjection: Matrix4;
}

/** A point's place on a chart (metres), the chart's x and z axes carried to it, up there, and its arc from the centre (radians). */
interface Charted { q: Vec2Node; e1: Vec3Node; e2: Vec3Node; up: Vec3Node; theta: FloatNode }

/**
 * A chart given by its centre `A` and axes `a1`, `a2` = a1 × A, as nodes (constants, uniforms or a uniform array's
 * elements): the one place the shaders work out where a point lies on a chart.
 */
export function chartNodes(A: Vec3Node, a1: Vec3Node, a2: Vec3Node) {
  return (p: Vec3Node): Charted => {
    const u = normalize(p);
    const c = dot(u, A);
    const d = u.sub(A.mul(c));
    const s = length(d);
    const dir = select(s.greaterThan(1e-7), d.div(max(s, 1e-7)), a1);
    const theta = atan(s, c);
    const cp = dot(dir, a1), sp = dot(dir, a2);
    // the radial direction carried to p, and the one across it, which the carrying leaves as it is
    const g = dir.mul(cos(theta)).sub(A.mul(sin(theta)));
    const t = cross(dir, A);
    return { q: vec2(cp, sp).mul(theta.mul(R)), e1: g.mul(cp).sub(t.mul(sp)), e2: g.mul(sp).add(t.mul(cp)), up: u, theta };
  };
}

const set = (u: UniformNode<'vec3'>, v: Vec3) => u.value.set(v[0], v[1], v[2]);

export type View = ReturnType<typeof createView>;

export function createView() {
  const position = uniform(new Vector3(0, R + 10, 0));
  const up0 = uniform(new Vector3(0, 1, 0));
  const east = uniform(new Vector3(1, 0, 0));
  const south = uniform(new Vector3(0, 0, 1));
  const height = uniform(10);
  const dip = uniform(0);
  const eye: Eye = {
    position: [0, R + 10, 0], frame: frameAt([0, 1, 0]), height: 10, dip: 0, pixel: 0.001, frustum: new Frustum(),
    projection: new Matrix4(), projectionInverse: new Matrix4(), world: new Matrix4(), viewProjection: new Matrix4(),
  };
  /** The eye as the systems read it; and where the camera stands, worked out into this each frame. */
  const seen: Readonly<Eye> = eye, at = new Vector3();

  const up = (p: Vec3Node): Vec3Node => normalize(p);
  const altitude = (p: Vec3Node): FloatNode => length(p).sub(R);
  const place = (u: Vec3Node, h: FloatNode | number): Vec3Node => u.mul(toFloat(h).add(R));

  const toSky = (dir: Vec3Node): Vec3Node => {
    const d = normalize(dir);
    const x = dot(d, east), y = dot(d, up0), z = dot(d, south);
    const e = asin(clamp(y, -1, 1)).add(dip).div(dip.mul(2 / Math.PI).add(1));
    const h = vec2(x, z);
    const flat = h.div(max(length(h), 1e-6));
    return vec3(flat.x.mul(cos(e)), sin(e), flat.y.mul(cos(e)));
  };

  /** A sky direction back to a world direction, for a frame (east, up, south nodes) and its dip. */
  const fromSky = (d: Vec3Node, frame: { east: Vec3Node; up: Vec3Node; south: Vec3Node; dip: FloatNode }): Vec3Node => {
    const e = asin(clamp(d.y, -1, 1)).mul(frame.dip.mul(2 / Math.PI).add(1)).sub(frame.dip);
    const h = vec2(d.x, d.z);
    const flat = h.div(max(length(h), 1e-6)).mul(cos(e));
    return frame.east.mul(flat.x).add(frame.south.mul(flat.y)).add(frame.up.mul(sin(e)));
  };

  const eyeChart = chartNodes(up0, east, south);

  /**
   * A grid of rings round the point under the eye, on the sphere: a centre, then rings `first` metres out and each
   * `growth` times further than the last, with `spokes` spokes, out to the far side of the planet; only the rings out
   * to the horizon (and as far past it as something `crest` metres high stands over it) are drawn.
   * The geometry holds (arc distance, 0, bearing); `up` is the unit vector under each vertex and `arc` its distance.
   */
  function rings(first: number, growth: number, spokes: number) {
    const radii = [0];
    for (let r = first; ; r *= growth) {
      radii.push(Math.min(r, Math.PI * R));
      if (r >= Math.PI * R) break;
    }
    const positions: number[] = [0, 0, 0];
    for (let k = 1; k < radii.length; k++) for (let s = 0; s < spokes; s++) positions.push(radii[k], 0, (s / spokes) * 2 * Math.PI);
    const at = (k: number, s: number) => 1 + (k - 1) * spokes + (s % spokes);
    const index: number[] = [];
    // wound as seen from above
    for (let s = 0; s < spokes; s++) index.push(0, at(1, s + 1), at(1, s));
    for (let k = 1; k < radii.length - 1; k++) for (let s = 0; s < spokes; s++) {
      index.push(at(k, s), at(k, s + 1), at(k + 1, s), at(k, s + 1), at(k + 1, s + 1), at(k + 1, s));
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setIndex(index);

    const arc = positionGeometry.x;
    const bearing = positionGeometry.z;
    const theta = arc.div(R);
    const out = east.mul(cos(bearing)).add(south.mul(sin(bearing)));
    return {
      geometry,
      arc,
      up: up0.mul(cos(theta)).add(out.mul(sin(theta))),
      /** Draws only the rings that can be seen; returns how far out the last drawn ring lies, metres. */
      update(crest: number): number {
        const reach = Math.min(R * (horizonDip(eye.height) + horizonDip(crest)), Math.PI * R);
        let k = 1;
        while (k < radii.length - 1 && radii[k] < reach) k++;
        geometry.setDrawRange(0, 3 * spokes + 6 * spokes * k);
        return radii[Math.min(k + 1, radii.length - 1)];
      },
    };
  }

  return {
    up,
    altitude,
    place,
    toSky,
    fromSky,
    /** The eye's position (world, metres) and height, as nodes. */
    position,
    height,
    /** How many of the first `metres` along world direction dir from the eye lie under `top` metres over the sea. */
    under: (dir: Vec3Node, metres: FloatNode, top: number): FloatNode => {
      const od = dot(position, dir), h = od.mul(od).sub(dot(position, position).sub((R + top) * (R + top)));
      return max(metres.sub(max(od.negate().sub(sqrt(max(h, 0))), 0)), 0);
    },
    local: (p: Vec3Node): Vec2Node => eyeChart(p).q,
    onEye: (p: Vec3Node): Charted => eyeChart(p),
    rings,
    /** The eye on the CPU, as of the last update. */
    eye: seen,
    /**
     * Each frame, once the camera is placed: the eye it gives, on a screen `screen` CSS pixels high. Its position and
     * frame are new each frame, values the systems may keep (clouds.ts keeps the last position to find the eye's step).
     */
    update(camera: PerspectiveCamera, screen: number) {
      const p = camera.getWorldPosition(at);
      eye.pixel = (2 * Math.tan(((camera.fov / camera.zoom) * Math.PI) / 360)) / screen;
      eye.projection.copy(camera.projectionMatrix);
      eye.projectionInverse.copy(camera.projectionMatrixInverse);
      eye.world.copy(camera.matrixWorld);
      eye.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      eye.frustum.setFromProjectionMatrix(eye.viewProjection);
      eye.position = [p.x, p.y, p.z];
      eye.frame = frameAt(eye.position);
      eye.height = Math.hypot(p.x, p.y, p.z) - R;
      eye.dip = horizonDip(eye.height);
      position.value.copy(p);
      set(up0, eye.frame.up);
      set(east, eye.frame.east);
      south.value.set(-eye.frame.north[0], -eye.frame.north[1], -eye.frame.north[2]);
      height.value = eye.height;
      dip.value = eye.dip;
    },
  };
}
