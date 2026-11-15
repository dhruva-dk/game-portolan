// The sound, rendered and measured headless: Vite and headless Chromium (tools/launch.ts), the game's own sound engine
// on an OfflineAudioContext (tools/audio-page.ts) rendering each sound once (close, through the whole mix at full
// level), a gun of another's at three distances, and a 30 s scripted passage of play. Each is written to
// captures/audio/<name>.wav (32-bit float) with its spectrogram (<name>.png: log frequency 30 Hz–20 kHz up the side,
// lines at 100 Hz, 1 kHz and 10 kHz; a tick each second), and measured: peak (dBFS), RMS (dBFS), loudness (LUFS,
// ITU-R BS.1770: integrated, and the loudest 400 ms), spectral centroid (Hz), the share of energy under 150 Hz (what a
// phone's speaker loses), duration (to the last moment over −60 dBFS), DC offset, and clipping (any sample at or over
// full scale; none is allowed: exit 1).
//   node tools/audio.ts            (npm run audio)
//   node tools/audio.ts --cpu      also: the meter's cpu in a busy scene, sound off and then on

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEVICE, launch } from './launch.ts';
import { png } from './png.ts';
import type { Rendered } from './audio-page.ts';

const OUT = resolve(import.meta.dirname, '../captures/audio');
const RATE = 48000;

const decode = (b64: string) => {
  const buf = Buffer.from(b64, 'base64');
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
};

/** A 32-bit float WAV of the channels. */
function wav(channels: Float32Array[]): Buffer {
  const n = channels[0].length, c = channels.length, data = Buffer.alloc(n * c * 4), head = Buffer.alloc(44);
  for (let i = 0; i < n; i++) for (let k = 0; k < c; k++) data.writeFloatLE(channels[k][i], (i * c + k) * 4);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(3, 20);
  head.writeUInt16LE(c, 22);
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * c * 4, 28);
  head.writeUInt16LE(c * 4, 32);
  head.writeUInt16LE(32, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

/** Filters `x` through a biquad (b0 b1 b2 a1 a2). */
function biquad(x: Float64Array, [b0, b1, b2, a1, a2]: readonly number[]): Float64Array {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
    y[i] = v;
  }
  return y;
}
/** BS.1770's K-weighting at 48 kHz: its high shelf, then its highpass. */
const SHELF = [1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585];
const RLB = [1, -2, 1, -1.99004745483398, 0.99007225036621];

/** BS.1770 loudness: integrated (gated, LUFS) and the loudest 400 ms block's. */
function loudness(channels: Float32Array[]): { integrated: number; momentary: number } {
  const weighted = channels.map((c) => biquad(biquad(Float64Array.from(c), SHELF), RLB));
  const block = Math.round(0.4 * RATE), hop = Math.round(0.1 * RATE), n = weighted[0].length;
  const blocks: number[] = [];
  for (let s = 0; s + block <= Math.max(n, block); s += hop) {
    let z = 0;
    for (const w of weighted) {
      let e = 0;
      const end = Math.min(n, s + block);
      for (let i = s; i < end; i++) e += w[i] * w[i];
      z += e / block;
    }
    blocks.push(z);
  }
  const lufs = (z: number) => -0.691 + 10 * Math.log10(Math.max(z, 1e-12));
  const abs = blocks.filter((z) => lufs(z) > -70);
  const mean = (zs: number[]) => zs.reduce((a, b) => a + b, 0) / Math.max(1, zs.length);
  const rel = lufs(mean(abs)) - 10, gated = abs.filter((z) => lufs(z) > rel);
  return { integrated: gated.length ? lufs(mean(gated)) : -Infinity, momentary: lufs(Math.max(...blocks)) };
}

/** An in-place radix-2 FFT of (re, im). */
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(a * k), wi = Math.sin(a * k), p = i + k, q = p + len / 2;
        const tr = re[q] * wr - im[q] * wi, ti = re[q] * wi + im[q] * wr;
        re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti;
      }
    }
  }
}

const SIZE = 2048;
/** The magnitude spectra of the mono mix, every `hop` samples (Hann window). */
function spectra(mono: Float32Array, hop: number): Float64Array[] {
  const out: Float64Array[] = [], win = Float64Array.from({ length: SIZE }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / SIZE));
  for (let s = 0; s + SIZE <= mono.length; s += hop) {
    const re = new Float64Array(SIZE), im = new Float64Array(SIZE);
    for (let i = 0; i < SIZE; i++) re[i] = mono[s + i] * win[i];
    fft(re, im);
    out.push(Float64Array.from({ length: SIZE / 2 }, (_, k) => Math.hypot(re[k], im[k])));
  }
  return out;
}

/** A colour for a level 0…1: black through deep blue, red and amber to white. */
const ink = (v: number): [number, number, number] => {
  const stops: [number, number, number][] = [[0, 0, 0], [20, 10, 80], [150, 20, 90], [235, 110, 30], [255, 230, 150], [255, 255, 255]];
  const f = Math.max(0, Math.min(1, v)) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(f)), t = f - i;
  const c = (k: number) => Math.round(stops[i][k] + (stops[i + 1][k] - stops[i][k]) * t);
  return [c(0), c(1), c(2)];
};

/** The spectrogram as a PNG: time across (some 900 px), log frequency up, 70 dB of range under the loudest. */
function spectrogram(mono: Float32Array): Buffer {
  const hop = Math.max(128, Math.ceil(mono.length / 900)), frames = spectra(mono, hop), H = 300, W = Math.max(1, frames.length);
  const lo = Math.log(30), hi = Math.log(20000), top = Math.max(1e-9, ...frames.map((f) => Math.max(...f)));
  const rgb = new Uint8Array(W * H * 3);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      const f = Math.exp(lo + ((H - 1 - y) / (H - 1)) * (hi - lo)), k = Math.min(SIZE / 2 - 1, Math.round((f * SIZE) / RATE));
      const level = 1 + (20 * Math.log10(frames[x][k] / top + 1e-12)) / 70;
      rgb.set(ink(level), (y * W + x) * 3);
    }
  }
  const mark = (x: number, y: number) => rgb.set([90, 200, 120], (y * W + x) * 3);
  for (const f of [100, 1000, 10000]) {
    const y = Math.round(H - 1 - ((Math.log(f) - lo) / (hi - lo)) * (H - 1));
    for (let x = 0; x < W; x += 4) mark(x, y);
  }
  for (let s = 1; (s * RATE) / hop < W; s++) for (let y = H - 8; y < H; y++) mark(Math.round((s * RATE) / hop), y);
  return png(W, H, rgb);
}

interface Measure { name: string; start: number; peak: number; rms: number; lufs: number; max: number; centroid: number; low: number; seconds: number; dc: number; clipped: number }

function measure(name: string, channels: Float32Array[]): Measure {
  const n = channels[0].length, mono = new Float32Array(n);
  let peak = 0, dc = 0, clipped = 0, last = 0, first = -1;
  for (let i = 0; i < n; i++) {
    for (const c of channels) {
      const v = c[i];
      peak = Math.max(peak, Math.abs(v));
      dc += v;
      if (Math.abs(v) >= 1) clipped++;
      if (Math.abs(v) > 0.001) last = i;
      if (first < 0 && Math.abs(v) > 0.01) first = i;
    }
    mono[i] = channels.reduce((a, c) => a + c[i], 0) / channels.length;
  }
  const active = Math.max(1, last + 1);
  let rms = 0;
  for (let i = 0; i < active; i++) for (const c of channels) rms += c[i] * c[i];
  const frames = spectra(mono.subarray(0, Math.max(SIZE, active)), 512);
  let weight = 0, centre = 0, under = 0;
  for (const f of frames) {
    for (let k = 1; k < f.length; k++) {
      const e = f[k] * f[k], hz = (k * RATE) / SIZE;
      weight += e;
      centre += e * hz;
      if (hz < 150) under += e;
    }
  }
  const l = loudness(channels.map((c) => c.subarray(0, active)));
  return {
    name, start: Math.max(0, first) / RATE, peak: 20 * Math.log10(peak + 1e-12), rms: 10 * Math.log10(rms / (active * channels.length) + 1e-12), lufs: l.integrated, max: l.momentary,
    centroid: centre / Math.max(1e-12, weight), low: under / Math.max(1e-12, weight), seconds: active / RATE, dc: dc / (n * channels.length), clipped,
  };
}

const row = (m: Measure) =>
  `${m.name.padEnd(13)} ${m.start.toFixed(2).padStart(5)} ${m.peak.toFixed(1).padStart(6)} ${m.rms.toFixed(1).padStart(6)} ${m.lufs.toFixed(1).padStart(6)} ${m.max.toFixed(1).padStart(6)}` +
  ` ${Math.round(m.centroid).toString().padStart(6)} ${(m.low * 100).toFixed(0).padStart(4)}% ${m.seconds.toFixed(2).padStart(6)} ${m.dc.toExponential(1).padStart(9)} ${m.clipped ? `CLIPPED ${m.clipped}` : 'ok'}`;

mkdirSync(OUT, { recursive: true });
const { browser, url, close } = await launch();
let bad = false;
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error(`[page] ${e.message}`));
  await page.goto(`${url}package.json`);
  const all = await page.evaluate(async (path): Promise<Rendered[]> => {
    const m: typeof import('./audio-page.ts') = await import(path);
    return [...(await m.sounds()), ...(await m.beds()), await m.passage()];
  }, '/tools/audio-page.ts');
  await page.close();
  const lines = [`${'sound'.padEnd(13)} start   peak    rms   LUFS  max400  centroid <150  secs        dc`];
  for (const r of all) {
    const channels = r.channels.map(decode), m = measure(r.name, channels);
    writeFileSync(resolve(OUT, `${r.name}.wav`), wav(channels));
    const mono = new Float32Array(channels[0].length);
    for (let i = 0; i < mono.length; i++) mono[i] = (channels[0][i] + channels[1][i]) / 2;
    writeFileSync(resolve(OUT, `${r.name}.png`), spectrogram(mono.subarray(0, Math.max(SIZE * 2, Math.ceil(m.seconds * RATE) + RATE / 10))));
    bad ||= m.clipped > 0 || Math.abs(m.dc) > 1e-3;
    lines.push(row(m));
  }
  const report = lines.join('\n');
  console.log(report);
  writeFileSync(resolve(OUT, 'report.txt'), `${report}\n`);
  console.log(`written to ${OUT}`);

  if (process.argv.includes('--cpu')) {
    // the meter's cpu (ms a frame, the whole of a frame's game, sound and drawing) in a busy scene: a dozen ships about
    // her firing, the sound not yet begun (no touch); then begun by a touch
    const cpu = await browser.newPage({ viewport: { width: DEVICE.width, height: DEVICE.height } });
    cpu.on('console', (m) => m.text().startsWith('sound') && console.log(`  [${m.text()}]`));
    await cpu.goto(`${url}?screen=match&ships=12&gun=0&meter&ahead=2`);
    await cpu.waitForFunction(() => document.getElementById('meter')?.textContent?.includes('cpu'), null, { timeout: 60000 });
    const read = async (seconds: number) => {
      const seen: number[] = [];
      for (let s = 0; s < seconds; s++) {
        const before = await cpu.textContent('#meter');
        await cpu.waitForFunction((t) => document.getElementById('meter')?.textContent !== t, before, { timeout: 10000 });
        const m = /cpu ([\d.]+)/.exec((await cpu.textContent('#meter')) ?? '');
        if (m) seen.push(Number(m[1]));
      }
      seen.sort((a, b) => a - b);
      return seen[Math.floor(seen.length / 2)];
    };
    await read(3);
    const off = await read(8);
    await cpu.mouse.click(DEVICE.width / 2, 200);
    await read(3);
    const on = await read(8);
    console.log(`cpu a frame (median of 8 s): sound off ${off} ms, on ${on} ms`);
    await cpu.close();
  }
} finally {
  await close();
}
process.exit(bad ? 1 : 0);
