// Renders every sound and variant in Node and checks it: finite, audible, under full scale, in a sane loudness band,
// of a sane length; loops seamless and one-shots ending without a click. Also checks that nothing is music.
// Run: node dev/audio-check.ts [name...]   (VERBOSE=1 prints a line per render)
import { measure, render, SOUND_NAMES, SOUNDS, type SoundName } from '../src/audio/bank.ts';

const only = process.argv.slice(2) as SoundName[];
const names = only.length ? only : SOUND_NAMES;
const fails: string[] = [];
const t0 = performance.now();
const times: [string, number][] = [];
for (const name of names) {
  const d = SOUNDS[name];
  if (/music|score|melody|tune|song(?!bird)/i.test(name) && name !== 'whaleSong') fails.push(`${name}: no music, anywhere`);
  for (let v = 0; v < d.variants; v++) {
    const t1 = performance.now(), chs = render(name, v), ms = performance.now() - t1, m = measure(chs), id = `${name}:${v}`;
    times.push([id, ms]);
    if (!m.finite) fails.push(`${id} not finite`);
    if (!(m.peak > 0.15 && m.peak <= 1)) fails.push(`${id} peak ${m.peak.toFixed(3)}`);
    if (!(m.loudness > -40 && m.loudness < -3)) fails.push(`${id} loudness ${m.loudness.toFixed(1)} dBFS`);
    if (!(m.seconds >= 0.1 && m.seconds <= (d.loop ? 9 : 7))) fails.push(`${id} ${m.seconds.toFixed(2)} s`);
    for (const c of chs) {
      if (d.loop) {
        let step = 0;
        for (let i = 1; i < c.length; i++) step = Math.max(step, Math.abs(c[i] - c[i - 1]));
        if (Math.abs(c[c.length - 1] - c[0]) > step * 1.01 + 1e-6) fails.push(`${id}: the loop seam jumps`);
      } else if (Math.abs(c[c.length - 1]) > 1e-3) fails.push(`${id}: ends on ${c[c.length - 1]}`);
    }
    if (process.env.VERBOSE) console.log(`${id.padEnd(28)} ${m.seconds.toFixed(2)} s  peak ${m.peak.toFixed(2)}  ${m.loudness.toFixed(1)} dBFS  ${ms.toFixed(0)} ms`);
  }
}
times.sort((a, b) => b[1] - a[1]);
console.log(`${names.length} sounds, ${times.length} renders in ${(performance.now() - t0).toFixed(0)} ms; slowest: ${times.slice(0, 8).map(([k, ms]) => `${k} ${ms.toFixed(0)} ms`).join(', ')}`);
if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
console.log('all good');
