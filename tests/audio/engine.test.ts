// WP28: the audio engine in headless Chromium, rendered offline through the full graph (buses, glue compression,
// limiter, soft-clip ceiling): every sound alone; a ten-ship broadside storm over every ambience bed (the voice limit
// holds, nothing clips, the audio-thread render and main-thread scheduling costs stay in budget); every match event.
// With WP28_SHOTS=<dir>: a demo reel WAV into that dir (never committed) and the sheet progress/shots/wp28-sounds.png.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright';
import { launch, root, serve, type Launched, type Server } from '../harness.ts';
import type * as Mod from './audio.page.ts';

let server: Server, launched: Launched, page: Page;

before(async () => {
  server = await serve();
  launched = await launch();
  page = await launched.browser.newPage();
  await page.goto(`${server.url}package.json`); // any page of the server's origin: the module is imported into it
});

after(async () => {
  await launched?.browser.close();
  await server?.close();
});

type Name = 'each' | 'storm' | 'events' | 'reel';
async function call<K extends Name>(k: K): Promise<Awaited<ReturnType<(typeof Mod)[K]>>> {
  return page.evaluate(async (name) => {
    const m = await import(/* @vite-ignore */ '/tests/audio/audio.page.ts' as string);
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
  const s = await call('storm');
  console.log(`storm: ${JSON.stringify(s)}`);
  assert.ok(s.finite, 'not finite');
  assert.ok(s.peak > 0.1 && s.peak <= s.ceiling + 1e-4, `peak ${s.peak}`);
  assert.ok(s.maxSfx <= s.cap, `${s.maxSfx} sfx voices at once, cap ${s.cap}`);
  assert.ok(s.stolen + s.dropped > 0, 'the voice limit was never exercised');
  assert.ok(s.nodesPeak <= 4 * (24 + 14 + 4) + 17, `${s.nodesPeak} nodes`);
  assert.ok(s.renderMsPerSecond < 150, `audio thread ${s.renderMsPerSecond.toFixed(1)} ms per second of audio`);
  assert.ok(s.playUs < 500, `main thread ${s.playUs.toFixed(0)} µs per sound started`);
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
  writeFileSync(join(root, 'progress/shots/wp28-sounds.png'), Buffer.from(r.png.split(',')[1], 'base64'));
  console.log(`reel: ${r.seconds.toFixed(1)} s`);
});
