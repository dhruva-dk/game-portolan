// Profiles as data: the device's console read into a profile, and a run compared with a baseline.
//   node --test tests/profile.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diff, metrics, parseConsole } from '../tools/profile.ts';

const window = (screen: string, p50: number, gpu: number) => `⚡️  [info] - perfjson ${JSON.stringify({
  screen, region: 'mistwood', fps: 30, p50, p95: p50 + 2, p99: p50 + 4, worst: p50 + 10, cpu: 6, tick: 0.4, gpu,
  systems: { sea: gpu / 2, scene: gpu / 2 }, passes: 30, submits: 2, mb: 400,
})}`;

const CONSOLE = [
  '⚡️  [info] - boot page: 0.20 s (at 0.4 s)',
  '⚡️  [info] - boot renderer 0.50 s, stage built 1.25 s',
  '⚡️  [info] - prepare title: 3.10 s',
  '⚡️  [info] - prepare site beacon: 0.05 s',
  '⚡️  [info] - boot planet: 4.00 s (at 6.3 s)',
  '⚡️  [info] - perf match in mistwood, fair, day: 30.0 fps, …',
  window('match', 40, 20),
  window('match', 33.3, 18),
  window('match', 33.4, 18.5),
  '⚡️  [error] - something broke',
];

test('the console is read into boot steps, preparation, perf windows and errors', () => {
  const p = parseConsole(CONSOLE, 'iPad');
  assert.equal(p.boot.page, 0.2);
  assert.equal(p.boot.renderer, 0.5);
  assert.equal(p.boot.stage, 1.25);
  assert.equal(p.boot['ready at'], 6.3);
  assert.deepEqual(p.prepare, { title: 3.1, 'site beacon': 0.05 });
  assert.equal(p.windows.length, 3);
  assert.equal(p.errors.length, 1);
});

test("a screen's first window is left out of its steady state", () => {
  const m = metrics(parseConsole(CONSOLE));
  assert.equal(m['match p50 ms'], 33.4);
  assert.equal(m['match gpu ms'], 18.5);
  assert.equal(m['boot ready s'], 6.3);
});

test('a metric is worse only past the tolerance and the noise floor', () => {
  const changes = diff({ 'a ms': 10, 'b ms': 1, 'c ms': 10, 'd s': 1 }, { 'a ms': 12, 'b ms': 1.2, 'c ms': 10.5, 'd s': 1.1 }, 0.1);
  const worse = Object.fromEntries(changes.map((c) => [c.metric, c.worse]));
  assert.deepEqual(worse, { 'a ms': true, 'b ms': false, 'c ms': false, 'd s': false });
});

test('fight and perf runs come down to the same metrics', () => {
  const fight = metrics({ total: 12, systems: { sea: { gpu: 4 } }, rows: {}, cpu: { frameMs: 16, p95Ms: 17, calls: 300 } });
  assert.equal(fight['fight gpu ms'], 12);
  assert.equal(fight['fight gpu sea ms'], 4);
  const perf = metrics({ rows: [{ region: 'match', frameMs: 16.5, p95Ms: 17, calls: 400 }] });
  assert.equal(perf['match frame ms'], 16.5);
});
