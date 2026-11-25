const FAR = 1e20;

function line(f: Float64Array, n: number, d: Float64Array) {
  const v = new Int32Array(n),
    z = new Float64Array(n + 1);
  let k = 0;
  v[0] = 0;
  z[0] = -FAR;
  z[1] = FAR;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = FAR;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) ** 2 + f[v[k]];
  }
}

function squared(seeds: (i: number) => boolean, w: number, h: number) {
  const grid = new Float64Array(w * h),
    n = Math.max(w, h),
    f = new Float64Array(n),
    d = new Float64Array(n);
  for (let i = 0; i < w * h; i++) grid[i] = seeds(i) ? 0 : FAR;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    line(f, h, d);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    line(f, w, d);
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x];
  }
  return grid;
}

export function signedField(
  inside: Uint8Array,
  w: number,
  h: number
): Float32Array {
  const toInside = squared((i) => inside[i] > 0, w, h),
    toOutside = squared((i) => inside[i] === 0, w, h),
    field = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++)
    field[i] =
      inside[i] > 0
        ? 0.5 - Math.sqrt(toOutside[i])
        : Math.sqrt(toInside[i]) - 0.5;
  return field;
}
