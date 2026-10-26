import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openGame, serve, type DeviceName, type Launched, type Server } from '../harness.ts';

let server: Server, launched: Launched;
before(async () => {
  server = await serve();
  launched = await launch();
});
after(async () => {
  await launched.browser.close();
  await server.close();
});

function correlation(a: number[], b: number[]): number {
  const n = a.length, ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < n; i++) {
    ab += (a[i] - ma) * (b[i] - mb);
    aa += (a[i] - ma) ** 2;
    bb += (b[i] - mb) ** 2;
  }
  return ab / Math.sqrt(aa * bb);
}

for (const device of ['iphone', 'ipad'] as DeviceName[]) {
  test(`style gallery on ${device}: paper fixed to the world, clean console, within budget`, async () => {
    const game = await openGame(launched.browser, `${server.url}tests/pages/style.html`, {
      device, hook: '__style', query: { view: 'high', hour: 12, ui: 0 },
    });
    await game.until((g) => g.ready);
    const r = await game.hook((g) => {
      const points = g.seaPoints(400, 70, 40);
      const before = g.probe(points), pixels = g.project(points);
      g.turn(0.012, 0.012);
      return { before, world: g.probe(points), screen: g.probePixels(pixels), stats: g.stats() };
    });
    const keep = r.before.map((v: number, i: number) => Number.isFinite(v) && Number.isFinite(r.world[i]) && Number.isFinite(r.screen[i]));
    const pick = (xs: number[]) => xs.filter((_, i) => keep[i]);
    const world = correlation(pick(r.before), pick(r.world)), screen = correlation(pick(r.before), pick(r.screen));
    console.log(`${device}: ${pick(r.before).length} points; grain correlation at the same world points ${world.toFixed(3)}, at the same pixels ${screen.toFixed(3)}; ${JSON.stringify(r.stats)}`);
    assert.ok(pick(r.before).length >= 250);
    assert.ok(world >= 0.8, `paper slid with the camera: correlation ${world.toFixed(3)}`);
    assert.ok(screen <= 0.3, `the swing did not move the picture: control correlation ${screen.toFixed(3)}`);
    assert.ok(r.stats.textureBytes + r.stats.targetBytes <= 150 * 2 ** 20);
    assert.ok(r.stats.calls <= 200);
    game.assertClean();
    await game.close();
  });
}
