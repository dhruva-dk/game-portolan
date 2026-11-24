import { put, type Out3, type Vec3 } from './sphere.ts';

export type Turn = readonly [number, number, number, number];
export type Out4 = [number, number, number, number];

function put4(
  out: Out4 | undefined,
  x: number,
  y: number,
  z: number,
  w: number
): Turn {
  if (!out) return [x, y, z, w];
  out[0] = x;
  out[1] = y;
  out[2] = z;
  out[3] = w;
  return out;
}

export function lookAt(eye: Vec3, at: Vec3, up: Vec3, out?: Out4): Turn {
  let zx = eye[0] - at[0],
    zy = eye[1] - at[1],
    zz = eye[2] - at[2];
  if (zx * zx + zy * zy + zz * zz === 0) zz = 1;
  let k = 1 / (Math.sqrt(zx * zx + zy * zy + zz * zz) || 1);
  zx *= k;
  zy *= k;
  zz *= k;
  const ux = up[0],
    uy = up[1],
    uz = up[2];
  let xx = uy * zz - uz * zy,
    xy = uz * zx - ux * zz,
    xz = ux * zy - uy * zx;
  if (xx * xx + xy * xy + xz * xz === 0) {
    if (Math.abs(uz) === 1) zx += 0.0001;
    else zz += 0.0001;
    k = 1 / (Math.sqrt(zx * zx + zy * zy + zz * zz) || 1);
    zx *= k;
    zy *= k;
    zz *= k;
    xx = uy * zz - uz * zy;
    xy = uz * zx - ux * zz;
    xz = ux * zy - uy * zx;
  }
  k = 1 / (Math.sqrt(xx * xx + xy * xy + xz * xz) || 1);
  xx *= k;
  xy *= k;
  xz *= k;
  const yx = zy * xz - zz * xy,
    yy = zz * xx - zx * xz,
    yz = zx * xy - zy * xx;
  const m11 = xx,
    m12 = yx,
    m13 = zx,
    m21 = xy,
    m22 = yy,
    m23 = zy,
    m31 = xz,
    m32 = yz,
    m33 = zz;
  const trace = m11 + m22 + m33;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1.0);
    return put4(
      out,
      (m32 - m23) * s,
      (m13 - m31) * s,
      (m21 - m12) * s,
      0.25 / s
    );
  }
  if (m11 > m22 && m11 > m33) {
    const s = 2.0 * Math.sqrt(1.0 + m11 - m22 - m33);
    return put4(
      out,
      0.25 * s,
      (m12 + m21) / s,
      (m13 + m31) / s,
      (m32 - m23) / s
    );
  }
  if (m22 > m33) {
    const s = 2.0 * Math.sqrt(1.0 + m22 - m11 - m33);
    return put4(
      out,
      (m12 + m21) / s,
      0.25 * s,
      (m23 + m32) / s,
      (m13 - m31) / s
    );
  }
  const s = 2.0 * Math.sqrt(1.0 + m33 - m11 - m22);
  return put4(out, (m13 + m31) / s, (m23 + m32) / s, 0.25 * s, (m21 - m12) / s);
}

export function slerp(a: Turn, b: Turn, t: number, out?: Out4): Turn {
  let x = b[0],
    y = b[1],
    z = b[2],
    w = b[3];
  let d = a[0] * x + a[1] * y + a[2] * z + a[3] * w;
  if (d < 0) {
    x = -x;
    y = -y;
    z = -z;
    w = -w;
    d = -d;
  }
  let s = 1 - t;
  if (d < 0.9995) {
    const theta = Math.acos(d),
      sin = Math.sin(theta);
    s = Math.sin(s * theta) / sin;
    t = Math.sin(t * theta) / sin;
    return put4(
      out,
      a[0] * s + x * t,
      a[1] * s + y * t,
      a[2] * s + z * t,
      a[3] * s + w * t
    );
  }
  const qx = a[0] * s + x * t,
    qy = a[1] * s + y * t,
    qz = a[2] * s + z * t,
    qw = a[3] * s + w * t;
  const l = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw);
  if (l === 0) return put4(out, 0, 0, 0, 1);
  const k = 1 / l;
  return put4(out, qx * k, qy * k, qz * k, qw * k);
}

export function axisAngle(axis: Vec3, angle: number, out?: Out4): Turn {
  const s = Math.sin(angle / 2);
  return put4(out, axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2));
}

export function multiply(a: Turn, b: Turn, out?: Out4): Turn {
  const ax = a[0],
    ay = a[1],
    az = a[2],
    aw = a[3],
    bx = b[0],
    by = b[1],
    bz = b[2],
    bw = b[3];
  return put4(
    out,
    ax * bw + aw * bx + ay * bz - az * by,
    ay * bw + aw * by + az * bx - ax * bz,
    az * bw + aw * bz + ax * by - ay * bx,
    aw * bw - ax * bx - ay * by - az * bz
  );
}

export const inverse = (q: Turn): Turn => [-q[0], -q[1], -q[2], q[3]];

export function rotate(v: Vec3, q: Turn, out?: Out3): Vec3 {
  const vx = v[0],
    vy = v[1],
    vz = v[2],
    qx = q[0],
    qy = q[1],
    qz = q[2],
    qw = q[3];
  const tx = 2 * (qy * vz - qz * vy),
    ty = 2 * (qz * vx - qx * vz),
    tz = 2 * (qx * vy - qy * vx);
  return put(
    out,
    vx + qw * tx + qy * tz - qz * ty,
    vy + qw * ty + qz * tx - qx * tz,
    vz + qw * tz + qx * ty - qy * tx
  );
}
