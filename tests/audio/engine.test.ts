import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { join } from 'node:path';
import type { CDPSession, Page } from 'playwright';
import { launch, root, serve, type Launched, type Server } from '../harness.ts';
import type * as Mod from './audio.page.ts';

let server: Server, launched: Launched, page: Page, cdp: CDPSession;

before(async () => {
  server = await serve();
  launched = await launch();
  page = await launched.browser.newPage();
  await page.goto(`${server.url}package.json`);
  cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
});

async function cpu(): Promise<{ process: number; main: number }> {
  const m = new Map((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
  return { process: m.get('ProcessTime') ?? NaN, main: m.get('ThreadTime') ?? NaN };
}

after(async () => {
  await launched?.browser.close();
  await server?.close();
});

type Name = 'each' | 'storm' | 'ahead' | 'listener' | 'events' | 'reel';
async function call<K extends Name>(k: K): Promise<Awaited<ReturnType<(typeof Mod)[K]>>> {
  return page.evaluate(async (name) => {
    const m = await import( '/tests/audio/audio.page.ts' as string);
    return m[name]();
  }, k);
}

test('every sound through the full graph: finite, audible, never above the ceiling', async () => {
  const rows = await call('each');
  assert.ok(rows.length > 50);
  for (const r of rows) {
    assert.ok(r.finite, `${r.name} not finite`);
    assert.ok(r.peak > 0.01, `${r.name} silent (${r.peak})`);
    assert.ok(r.peak <= 0.97 + 1e-4, `${r.name} peak ${r.peak}`);
  }
});

test('a ten-ship broadside storm over every bed: the voice limit holds, nothing clips, the cost stays in budget', async () => {
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const a = await cpu(), s = await call('storm'), b = await cpu();
    runs.push({ ...s, audioMsPerSecond: ((b.process - a.process - (b.main - a.main)) * 1000) / s.seconds });
  }
  const s = runs[0], audio = Math.min(...runs.map((r) => r.audioMsPerSecond)), playUs = Math.min(...runs.map((r) => r.playUs));
  console.log(`storm: ${JSON.stringify({ ...s, audioMsPerSecond: audio, playUs })}, load ${loadavg()[0].toFixed(1)}`);
  assert.ok(s.finite, 'not finite');
  assert.ok(s.peak > 0.1 && s.peak <= s.ceiling + 1e-4, `peak ${s.peak}`);
  assert.ok(s.maxSfx <= s.cap, `${s.maxSfx} sfx voices at once, cap ${s.cap}`);
  assert.ok(s.stolen + s.dropped > 0, 'the voice limit was never exercised');
  assert.ok(s.nodesPeak <= 4 * (24 + 14 + 4) + 17, `${s.nodesPeak} nodes`);
  assert.ok(audio < 60, `audio thread ${audio.toFixed(1)} ms CPU per second of audio`);
  assert.ok(playUs < 80, `main thread ${playUs.toFixed(0)} µs per sound started`);
});

test('a sound scheduled ahead holds no nodes until it is about to sound, and is heard on time', async () => {
  const r = await call('ahead');
  assert.equal(r.nodesBefore, 17, 'nodes built ahead of time');
  assert.ok(Math.abs(r.onset - 1.3) < 0.004, `onset at ${r.onset} s, asked for 1.3`);
  assert.ok(r.stoppedPeak < 0.01, `a stopped voice still sounded (${r.stoppedPeak})`);
});

test('the listener rides the camera: her own sounds whole from its stand-off, the world heard from its eye', async () => {
  const r = await call('listener');
  console.log(`listener: ${JSON.stringify(r)}`);
  assert.ok(r.bare.every((x) => Math.abs(x) < 1e-6), 'without a camera the ear is on the ship');
  assert.ok(r.ear.every((x) => Math.abs(x) < 1e-6), 'the ear is not at the camera');
  assert.ok(Math.abs(r.near - Math.hypot(8.5, 2.6)) < 0.05, `stand-off ${r.near}`);
  assert.equal(r.own, 1, 'her own sounds are whole at the deck camera');
  assert.ok(r.rival > r.rivalDeck && r.rival < 0.5, `a ship 30 u ahead: ${r.rival} from the camera, ${r.rivalDeck} from the deck`);
  assert.ok(r.highOwn === 0 && r.high > 0.99, `at orbit: own ${r.highOwn}, high ${r.high}`);
});

test('every match event sounds without throwing', async () => {
  const r = await call('events');
  assert.deepEqual(r.errors, []);
  assert.ok(r.started > r.kinds, `${r.started} sounds for ${r.kinds} kinds`);
});

test('demo reel and sheet (WP28_SHOTS)', { skip: !process.env.WP28_SHOTS }, async () => {
  const r = await call('reel'), dir = process.env.WP28_SHOTS!;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'wp28-reel.wav'), Buffer.from(r.wav, 'base64'));
  writeFileSync(join(root, 'out/shots/wp28-sounds.png'), Buffer.from(r.png.split(',')[1], 'base64'));
  console.log(`reel: ${r.seconds.toFixed(1)} s`);
});
