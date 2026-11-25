import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SOUNDS } from '../src/audio/bank.ts';
import { CUES, CUE_NAMES, soundOf, type Cue } from '../src/audio/cues.ts';
import { db } from '../src/audio/dsp.ts';
import { BUS, GAIN } from '../src/audio/mixer.ts';
import { BEATS } from '../src/ui/base/beat.ts';
import { outDir, writeJson } from './out.ts';

const RATE = 48000,
  SHORT = 0.4,
  LONG: readonly Cue[] = ['slam', 'salute', 'launch', 'lost', 'open'],
  CEILING = -3,
  OVER_TAP = 4,
  WINDOW = 0.05,
  SLIGHT = 1e-3,
  OFFSET = db(-50);

const argv = process.argv.slice(2);
const to = argv.includes('--to') ? argv[argv.indexOf('--to') + 1] : null;

const dbOf = (v: number) => (v > 0 ? 20 * Math.log10(v) : -Infinity);

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
    const a = (-2 * Math.PI) / len,
      wr = Math.cos(a),
      wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1,
        ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k],
          ui = im[i + k],
          xr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci,
          xi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + xr;
        im[i + k] = ui + xi;
        re[i + k + len / 2] = ur - xr;
        im[i + k + len / 2] = ui - xi;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}

function centroid(x: Float32Array) {
  let n = 1;
  while (n < x.length) n <<= 1;
  const re = new Float64Array(n),
    im = new Float64Array(n);
  re.set(x);
  fft(re, im);
  let w = 0,
    m = 0;
  for (let k = 1; k < n / 2; k++) {
    const mag = Math.hypot(re[k], im[k]);
    w += mag * ((k * RATE) / n);
    m += mag;
  }
  return m > 0 ? w / m : 0;
}

function measure(x: Float32Array) {
  let peak = 0,
    sum = 0,
    mean = 0,
    loud = 0;
  const win = Math.round(WINDOW * RATE);
  let run = 0;
  for (let i = 0; i < x.length; i++) {
    peak = Math.max(peak, Math.abs(x[i]));
    sum += x[i] * x[i];
    mean += x[i];
    run += x[i] * x[i];
    if (i >= win) run -= x[i - win] * x[i - win];
    loud = Math.max(loud, run / Math.min(i + 1, win));
  }
  return {
    seconds: x.length / RATE,
    top: peak,
    peak: dbOf(peak),
    rms: dbOf(Math.sqrt(sum / x.length)),
    loudest: dbOf(Math.sqrt(loud)),
    centroid: centroid(x),
    dc: mean / x.length,
    first: x[0],
    last: x[x.length - 1],
  };
}

function wav(x: Float32Array): Buffer {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + x.length * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(RATE, 24);
  b.writeUInt32LE(RATE * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++)
    b.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, x[i])) * 32767),
      44 + i * 2
    );
  return b;
}

const heard = CUE_NAMES.filter((c) => CUES[c].bus === 'ui');
const dir = outDir('sounds', { rate: RATE, cues: heard });
const rendered = heard.map((cue) => {
  const c = CUES[cue],
    name = soundOf(c, null),
    s = SOUNDS[name],
    gain = db(s.level + c.level + BUS.ui + GAIN),
    x = s.make(RATE, 1).map((v) => v * gain);
  const file = join(dir, `${cue}.wav`);
  writeFileSync(file, wav(x));
  return { cue, file, ...measure(x) };
});
const tap = rendered.find((r) => r.cue === 'tap')!;
const fresh = new Set<string>(BEATS);
const flagsOf = (r: (typeof rendered)[number]) => {
  const flags: string[] = [];
  if (r.seconds > SHORT && !LONG.includes(r.cue)) flags.push('long');
  if (r.peak > CEILING) flags.push('hot');
  if (Math.abs(r.dc) > OFFSET * r.top) flags.push('dc');
  if (Math.abs(r.first) > SLIGHT * r.top || Math.abs(r.last) > SLIGHT * r.top)
    flags.push('click');
  if (fresh.has(r.cue) && r.loudest > tap.loudest + OVER_TAP)
    flags.push('loud');
  return flags;
};
const f1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '-inf');
console.log(
  `${'cue'.padEnd(10)} ${'ms'.padStart(5)} ${'peak'.padStart(6)} ${'rms'.padStart(6)} ${'50ms'.padStart(6)} ${'vs tap'.padStart(6)} ${'centroid'.padStart(8)}  flags`
);
for (const r of rendered)
  console.log(
    `${r.cue.padEnd(10)} ${String(Math.round(r.seconds * 1000)).padStart(5)} ${f1(r.peak).padStart(6)} ${f1(r.rms).padStart(6)} ${f1(r.loudest).padStart(6)} ${f1(r.loudest - tap.loudest).padStart(6)} ${String(Math.round(r.centroid)).padStart(8)}  ${flagsOf(r).join(' ')}`
  );
writeJson(
  join(dir, 'sounds.json'),
  rendered.map((r) => ({ ...r, flags: flagsOf(r) }))
);
if (to) {
  mkdirSync(to, { recursive: true });
  for (const r of rendered) copyFileSync(r.file, join(to, `${r.cue}.wav`));
}
console.log(
  `→ ${dir}${to ? ` and ${to}` : ''}  (levels as the interface bus hears them at full Sound; peak, rms and the loudest 50 ms in dBFS)`
);
