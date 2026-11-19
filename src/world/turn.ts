// Turns as unit quaternions, for the eyes the world is seen from: three's own arithmetic (Matrix4.lookAt with
// Quaternion.setFromRotationMatrix, Quaternion.slerp, Vector3.applyQuaternion) done on plain numbers, step for step,
// so the game and the UI turn an eye exactly as three would, without three (tests/turn.test.ts holds them to it).
//
// Pure arithmetic: no three, so it runs in node for the tests.

import { cross, type Vec3 } from './sphere.ts';

/** A unit quaternion (x, y, z, w). */
export type Turn = readonly [number, number, number, number];

const lengthSq = (a: Vec3) => a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
/** a made unit length (left as it is if it has none), as three's Vector3.normalize. */
const unit = (a: Vec3): Vec3 => {
  const k = 1 / (Math.sqrt(lengthSq(a)) || 1);
  return [a[0] * k, a[1] * k, a[2] * k];
};

/** The turn of an eye at `eye` looking at `at`, `up` up the screen: it looks down its −z, its y up. */
export function lookAt(eye: Vec3, at: Vec3, up: Vec3): Turn {
  let z: Vec3 = [eye[0] - at[0], eye[1] - at[1], eye[2] - at[2]];
  if (lengthSq(z) === 0) z = [z[0], z[1], 1];
  z = unit(z);
  let x = cross(up, z);
  if (lengthSq(x) === 0) {
    // up and z are parallel
    z = unit(Math.abs(up[2]) === 1 ? [z[0] + 0.0001, z[1], z[2]] : [z[0], z[1], z[2] + 0.0001]);
    x = cross(up, z);
  }
  x = unit(x);
  const y = cross(z, x);
  // the rotation whose columns are x, y and z, as a quaternion
  const [m11, m12, m13, m21, m22, m23, m31, m32, m33] = [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
  const trace = m11 + m22 + m33;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1.0);
    return [(m32 - m23) * s, (m13 - m31) * s, (m21 - m12) * s, 0.25 / s];
  }
  if (m11 > m22 && m11 > m33) {
    const s = 2.0 * Math.sqrt(1.0 + m11 - m22 - m33);
    return [0.25 * s, (m12 + m21) / s, (m13 + m31) / s, (m32 - m23) / s];
  }
  if (m22 > m33) {
    const s = 2.0 * Math.sqrt(1.0 + m22 - m11 - m33);
    return [(m12 + m21) / s, 0.25 * s, (m23 + m32) / s, (m13 - m31) / s];
  }
  const s = 2.0 * Math.sqrt(1.0 + m33 - m11 - m22);
  return [(m13 + m31) / s, (m23 + m32) / s, 0.25 * s, (m21 - m12) / s];
}

/** The turn t of the way from a to b (0–1), the short way round. */
export function slerp(a: Turn, b: Turn, t: number): Turn {
  let [x, y, z, w] = b;
  let d = a[0] * x + a[1] * y + a[2] * z + a[3] * w;
  if (d < 0) {
    [x, y, z, w] = [-x, -y, -z, -w];
    d = -d;
  }
  let s = 1 - t;
  if (d < 0.9995) {
    const theta = Math.acos(d), sin = Math.sin(theta);
    s = Math.sin(s * theta) / sin;
    t = Math.sin(t * theta) / sin;
    return [a[0] * s + x * t, a[1] * s + y * t, a[2] * s + z * t, a[3] * s + w * t];
  }
  // for small angles, straight between and made unit again
  const q: Turn = [a[0] * s + x * t, a[1] * s + y * t, a[2] * s + z * t, a[3] * s + w * t];
  const l = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
  if (l === 0) return [0, 0, 0, 1];
  const k = 1 / l;
  return [q[0] * k, q[1] * k, q[2] * k, q[3] * k];
}

/** The turn of `angle` radians about the unit vector `axis`, as three's Quaternion.setFromAxisAngle. */
export function axisAngle(axis: Vec3, angle: number): Turn {
  const s = Math.sin(angle / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}

/** a then b in a's own frame (a·b), as three's Quaternion.multiplyQuaternions(a, b): q.multiply(b) turns q about its
 *  own axes. */
export function multiply(a: Turn, b: Turn): Turn {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [
    ax * bw + aw * bx + ay * bz - az * by,
    ay * bw + aw * by + az * bx - ax * bz,
    az * bw + aw * bz + ax * by - ay * bx,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** The turn undone. */
export const inverse = (q: Turn): Turn => [-q[0], -q[1], -q[2], q[3]];

/** v turned by q. */
export function rotate(v: Vec3, q: Turn): Vec3 {
  const [vx, vy, vz] = v, [qx, qy, qz, qw] = q;
  const tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx);
  return [vx + qw * tx + qy * tz - qz * ty, vy + qw * ty + qz * tx - qx * tz, vz + qw * tz + qx * ty - qy * tx];
}
