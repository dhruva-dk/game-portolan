import type { Vec3 } from './sphere.ts';

export const START = 80;

export interface Cover {
  grass: number;
  rubble: number;
  mottle: number;
  clump: number;
}

export interface Rise {
  at: Vec3;
  reach: number;
  top: number;
}

export interface Planet {
  rises: Rise[];
  start: { at: Vec3; bearing: number };
  heart: Vec3;
  height(p: Vec3): number;
  cover(p: Vec3): Cover;
  sample(p: Vec3, cover: Cover): number;
}

export function bakeFaces(
  planet: Planet,
  n: number
): { height: Float32Array[]; cover: Uint8Array[] } {
  const height: Float32Array[] = [],
    cover: Uint8Array[] = [];
  const t = Float64Array.from({ length: n }, (_, i) =>
    Math.tan(((2 * i) / (n - 1) - 1) * (Math.PI / 4))
  );
  const p: [number, number, number] = [0, 0, 0],
    cv: Cover = { grass: 0, rubble: 0, mottle: 0, clump: 0 };
  for (let face = 0; face < 6; face++) {
    const h = new Float32Array(n * n),
      c = new Uint8Array(n * n * 4);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const gu = t[i],
          gv = t[j];
        if (face === 0) {
          p[0] = 1;
          p[1] = gv;
          p[2] = -gu;
        } else if (face === 1) {
          p[0] = -1;
          p[1] = gv;
          p[2] = gu;
        } else if (face === 2) {
          p[0] = gu;
          p[1] = 1;
          p[2] = -gv;
        } else if (face === 3) {
          p[0] = gu;
          p[1] = -1;
          p[2] = gv;
        } else if (face === 4) {
          p[0] = gu;
          p[1] = gv;
          p[2] = 1;
        } else {
          p[0] = -gu;
          p[1] = gv;
          p[2] = -1;
        }
        const l = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
        p[0] /= l;
        p[1] /= l;
        p[2] /= l;
        const k = j * n + i;
        h[k] = planet.sample(p, cv);
        c[k * 4] = Math.round(cv.grass * 255);
        c[k * 4 + 1] = Math.round(cv.rubble * 255);
        c[k * 4 + 2] = Math.round(cv.mottle * 255);
        c[k * 4 + 3] = Math.round(cv.clump * 255);
      }
    height.push(h);
    cover.push(c);
  }
  return { height, cover };
}
