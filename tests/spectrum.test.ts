import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coxMunk, initialSpectrum, meanSquareSlope, normalQuantile, seaState, spectrum, spread, whitecaps } from '../src/world/spectrum.ts';
import { BANDS, CASCADES, SIZE } from '../src/world/cascades.ts';

const near = (a: number, b: number, tol: number) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

/** The inverse FFT the GPU runs (waves.ts), step for step: radix-2 Stockham, thread i of N/2 at each stage p. */
function inverseFFT(re: Float64Array, im: Float64Array): [Float64Array, Float64Array] {
  const N = re.length;
  let xr = re.slice(), xi = im.slice();
  for (let p = 1; p < N; p *= 2) {
    const yr = new Float64Array(N), yi = new Float64Array(N);
    for (let i = 0; i < N / 2; i++) {
      const k = i & (p - 1), a = (Math.PI * k) / p, c = Math.cos(a), s = Math.sin(a);
      const u0r = xr[i], u0i = xi[i];
      const u1r = xr[i + N / 2] * c - xi[i + N / 2] * s, u1i = xr[i + N / 2] * s + xi[i + N / 2] * c;
      const j = 2 * i - k;
      yr[j] = u0r + u1r; yi[j] = u0i + u1i;
      yr[j + p] = u0r - u1r; yi[j + p] = u0i - u1i;
    }
    xr = yr; xi = yi;
  }
  return [xr, xi];
}

test('the FFT is the inverse DFT', () => {
  const N = 16, re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) { re[i] = Math.sin(i * 1.7) + i * 0.1; im[i] = Math.cos(i * 0.3); }
  const [fr, fi] = inverseFFT(re, im);
  for (let n = 0; n < N; n++) {
    let sr = 0, si = 0;
    for (let m = 0; m < N; m++) {
      const a = (2 * Math.PI * m * n) / N;
      sr += re[m] * Math.cos(a) - im[m] * Math.sin(a);
      si += re[m] * Math.sin(a) + im[m] * Math.cos(a);
    }
    near(fr[n], sr, 1e-9);
    near(fi[n], si, 1e-9);
  }
});

test('the spread sums to one over every direction', () => {
  for (const x of [0.5, 1, 1.3, 2, 4]) {
    let sum = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) sum += spread(x, 1, -Math.PI + ((i + 0.5) / n) * 2 * Math.PI) * ((2 * Math.PI) / n);
    near(sum, 1, 0.005);
  }
});

test('the spectrum holds the sea state\'s height', () => {
  const sea = { wind: 7.6, fetch: 300_000 };
  const { hs } = seaState(sea.wind, sea.fetch);
  const S = spectrum(sea), N = 1024, L = 4096, dk = (2 * Math.PI) / L;
  let m0 = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) m0 += S((x - N / 2) * dk, (y - N / 2) * dk) * dk * dk;
  near(4 * Math.sqrt(m0), hs, hs * 0.03);
});

test('a drawn sea is real, and the FFT keeps its energy', () => {
  const sea = { wind: 7.6, fetch: 300_000 };
  const N = 256, L = 256, data = initialSpectrum(N, L, sea, 7);
  // at t = 0 the spectrum of the height is h₀(k) + conj h₀(−k)
  const re = new Float64Array(N * N), im = new Float64Array(N * N);
  let drawn = 0;
  for (let i = 0; i < N * N; i++) {
    re[i] = data[i * 4] + data[i * 4 + 2];
    im[i] = data[i * 4 + 1] + data[i * 4 + 3];
    drawn += re[i] * re[i] + im[i] * im[i];
  }
  // rows, then columns, then undo the centred k with (−1)^(x+y)
  for (let y = 0; y < N; y++) {
    const [r, m] = inverseFFT(re.slice(y * N, y * N + N), im.slice(y * N, y * N + N));
    re.set(r, y * N); im.set(m, y * N);
  }
  for (let x = 0; x < N; x++) {
    const cr = new Float64Array(N), ci = new Float64Array(N);
    for (let y = 0; y < N; y++) { cr[y] = re[y * N + x]; ci[y] = im[y * N + x]; }
    const [r, m] = inverseFFT(cr, ci);
    for (let y = 0; y < N; y++) { re[y * N + x] = r[y]; im[y * N + x] = m[y]; }
  }
  let square = 0, imag = 0;
  for (let i = 0; i < N * N; i++) {
    const sign = ((i % N) + Math.floor(i / N)) % 2 ? -1 : 1;
    square += (re[i] * sign) ** 2;
    imag = Math.max(imag, Math.abs(im[i]));
  }
  square /= N * N;
  near(imag, 0, 1e-6); // Hermitian: the sea is real
  near(square, drawn, drawn * 1e-6); // Parseval: the FFT neither gains nor loses
});

test('drawn seas are as high as their spectrum, on average', () => {
  const sea = { wind: 7.6, fetch: 300_000 };
  const N = 256, L = 256, dk = (2 * Math.PI) / L, S = spectrum(sea), seeds = 64;
  let expected = 0, drawn = 0;
  for (let i = 0; i < N * N; i++) expected += S(((i % N) - N / 2) * dk, (Math.floor(i / N) - N / 2) * dk) * dk * dk;
  for (let seed = 1; seed <= seeds; seed++) {
    const data = initialSpectrum(N, L, sea, seed);
    for (let i = 0; i < N * N; i++) drawn += (data[i * 4] + data[i * 4 + 2]) ** 2 + (data[i * 4 + 1] + data[i * 4 + 3]) ** 2;
  }
  near(drawn / seeds, expected, expected * 0.05);
});

test('the cascades hold the sea between them, and fewer slopes than the whole sea has', () => {
  for (const wind of [5, 7.6, 12]) {
    const sea = { wind, fetch: 300_000 };
    const { hs } = seaState(wind, sea.fetch);
    let m0 = 0, slopes = 0;
    CASCADES.forEach((L, c) => {
      const S = spectrum(sea), dk = (2 * Math.PI) / L, [lo, hi] = BANDS[c];
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        const kx = (x - SIZE / 2) * dk, kz = (y - SIZE / 2) * dk, k = Math.hypot(kx, kz);
        if (k >= lo && k < hi) m0 += S(kx, kz) * dk * dk;
      }
      slopes += meanSquareSlope(SIZE, L, sea, BANDS[c]);
    });
    near(4 * Math.sqrt(m0), hs, hs * 0.05);
    assert.ok(slopes < coxMunk(wind), `${slopes} ≥ ${coxMunk(wind)}`);
  }
});

test('the normal quantile and the whitecaps', () => {
  near(normalQuantile(0.975), 1.959964, 1e-6);
  near(normalQuantile(0.5), 0, 1e-9);
  near(normalQuantile(0.001), -3.090232, 1e-6);
  near(whitecaps(10), 0.0099, 0.0003); // about 1% at 10 m/s
});
