// WP27 part B: the first voyage sailed by touch alone through the running app (real GPU; CDP touch emulation): the
// title, the harbour's seal, then the match the new career begins with: its prompts come in order, each at most once,
// and fold as the player does each thing (leave the current, steer, close a loop on head home, call the gull, choose
// from the chest after stowing it with "Later" and opening it again from its chip); the match plays on to its end
// (paced by setSpeed, never steered by the hooks); sunk, the camera rises, the match plays out on the chart and the
// skip card goes straight to the results; the results page, the next voyage's nine captains, the harbour opening on
// the chart as it inks the new seas, and a second voyage with no prompts. Console clean. Shots progress/shots/wp27b-*.png.
//   node tests/ui/results.touch.ts            (WP27_DEVS=iphone|ipad|iphone,ipad, default both)
import { join } from 'node:path';
import { DEVICES, launch, openGame, root, serve, type DeviceName, type Game, type Point } from '../harness.ts';
import { harbourLayout } from '../../src/ui/cards.ts';
import { LESSON } from '../../src/career/voyage.ts';

interface R { x: number; y: number; width: number; height: number }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Win = any;

const server = await serve();
const { browser, gpu, renderer } = await launch();
if (!gpu) { console.error(`results.touch: FAIL: no GPU WebGL (${renderer})`); await browser.close(); await server.close(); process.exit(2); }
console.log(`renderer: ${renderer}`);
let failed = 0;
const check = (name: string, ok: boolean, info = ''): void => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ` (${info})` : ''}`); if (!ok) failed++; };
const mid = (r: R): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const shot = (game: Game, dev: string, name: string): Promise<Buffer> => game.screenshot(join(root, 'progress/shots', `wp27b-${dev}-${name}.png`));
const p27 = <T>(game: Game, fn: string): Promise<T> => game.page.evaluate((f) => { const p = (window as Win).__wp27; return p[f] ? p[f]() : null; }, fn);
/** Wait until the probe's `fn` gives something truthy (polling each frame), or `ms` passes; the value or null. */
async function waitFor<T>(game: Game, fn: string, ms: number): Promise<T | null> {
  const h = await game.page.waitForFunction((f) => { const p = (window as Win).__wp27; return p[f] ? p[f]() : null; }, fn, { timeout: ms, polling: 'raf' }).catch(() => null);
  return h ? ((await h.jsonValue()) as T) : null;
}
const lessons = (game: Game): Promise<number[]> => p27<number[]>(game, 'lessons').then((l) => l ?? []);
const screen = (game: Game): Promise<string> => game.hook((g) => g.screen);
const tick = (game: Game): Promise<number> => game.hook((g) => g.tick);
/** Ticks of match time the test spends on a step: what `wall` ms gives at setSpeed(3) and 60 frames a second, so a
 *  slow machine (fewer frames) is given the same sea, not the same clock. */
const budget = (wall: number): number => Math.round((wall / 1000) * 60 * 3);

/** The match plays on to its end at speed; sunk (the pace back to the clock's the frame she goes), the camera rises,
 *  the chart opens on the match playing out, and the skip card goes straight to the results. True when she sank. */
async function sinking(game: Game, dev: string): Promise<boolean> {
  await game.hook((g) => g.setSpeed(12));
  const end = await game.page.waitForFunction(() => {
    const w = window as Win, p = w.__wp27;
    if (w.__portolan.screen === 'results') return true;
    if (p.sunk && p.sunk() >= 0) { w.__portolan.setSpeed(null); return true; }
    return null;
  }, null, { timeout: 600_000, polling: 'raf' }).then(() => true).catch(() => false);
  check(`${dev} the match came to its end or sank her`, end);
  // sunk, or the end with her afloat (she won: the caller tests the flow on the next voyage)
  const sank = (await screen(game)) === 'match' && (await p27<number>(game, 'sunk')) >= 0;
  if (sank) {
    await game.page.waitForTimeout(1200);
    await shot(game, dev, 'sinking'); // the camera rising to watch the sea close over her
  }
  // the skip card comes up once the chart has opened whole on the match playing out (the rise and the zoom take ~6 s
  // of the rig's clock, longer in wall time when frames are slow)
  const skipAt = sank ? await waitFor<R>(game, 'skip', 40_000) : null;
  check(`${dev} sunk: the skip card comes up over the chart`, !sank || skipAt !== null);
  const opened = skipAt !== null && (await game.page.evaluate(() => (window as Win).__wp25.chartOpen?.() === true));
  if (skipAt) {
    check(`${dev} sunk: the camera rises and the chart opens on the match`, opened);
    await game.page.waitForTimeout(700);
    if ((await screen(game)) === 'match') await shot(game, dev, 'skip');
    // ticks a second while the match plays on (up to 1 s, or to the tick it ended): the clock's pace is 30
    const rate = await game.page.evaluate(() => new Promise<{ rate: number; ms: number }>((done) => {
      const h = (window as Win).__portolan, t0 = performance.now(), k0 = h.tick;
      let k1 = k0, t1 = t0;
      const look = (): void => {
        const k = h.tick, now = performance.now();
        if (k > k1) { k1 = k; t1 = now; }
        if (k < 0 || now - t0 >= 1000) { done({ rate: t1 > t0 ? ((k1 - k0) * 1000) / (t1 - t0) : 0, ms: t1 - t0 }); return; }
        requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    }));
    check(`${dev} sunk: the match plays out on the chart, faster than the clock`, rate.rate > 45 && rate.ms >= 250, `${rate.rate.toFixed(0)} ticks a second over ${rate.ms.toFixed(0)} ms`);
    if ((await screen(game)) === 'match') await shot(game, dev, 'sunk-chart');
    if ((await screen(game)) === 'match') {
      await game.tap(mid(skipAt));
      await game.until((g) => g.screen === 'results', undefined, 120_000);
      check(`${dev} skip: the rest resolved, the results up`, true);
    }
  }
  await game.until((g) => g.screen === 'results', undefined, 120_000);
  return sank;
}

async function voyage(dev: DeviceName): Promise<void> {
  const d = DEVICES[dev], s = d.safeArea, view = { width: d.width, height: d.height, dpr: d.dpr, safe: s };
  const game = await openGame(browser, server.url, { device: dev });
  await game.page.addInitScript(() => { (window as Win).__wp25 = { touches: [], ticks: [] }; (window as Win).__wp27 = {}; });
  await game.page.reload();
  await game.until((g) => g.ready, undefined, 300_000);
  const t0 = Date.now();
  // the title, then the harbour's seal at the safe area's centre, 0.42 down
  await game.page.waitForTimeout(1500);
  await game.tap({ x: d.width / 2, y: d.height / 2 });
  await game.until((g) => g.screen === 'harbour');
  await game.page.waitForTimeout(600);
  await game.tap({ x: s.left + (d.width - s.left - s.right) / 2, y: s.top + (d.height - s.top - s.bottom) * 0.42 });
  await game.until((g) => g.screen === 'match' && g.tick > 0, undefined, 60_000);
  const L = await game.page.evaluate(() => (window as Win).__wp25.layout);
  /** A HUD button where the HUD has it now (its cluster relays out as the ship's slots fill). */
  const btn = async (k: string): Promise<Point> => {
    const b = await game.page.evaluate((kind) => (window as Win).__wp25.layout.buttons.find((q: { kind: string }) => q.kind === kind), k);
    return { x: b.x, y: b.y };
  };
  const stick: Point = { x: L.stick.x + L.stick.width * 0.3, y: L.stick.y + L.stick.height * 0.62 };
  check(`${dev} the first voyage has its prompts`, (await p27(game, 'tutorial')) !== null);
  await game.hook((g) => g.setSpeed(3));

  // leave the current: its prompt, then a flick up on the stick
  await game.page.waitForFunction((k) => (window as Win).__wp27.lesson?.() === k, LESSON.breakOff, { timeout: 30_000, polling: 'raf' }).catch(() => null);
  check(`${dev} prompt: leave the current`, (await p27<number>(game, 'lesson')) === LESSON.breakOff);
  await game.page.waitForTimeout(1600);
  await shot(game, dev, 'prompt-breakoff');
  for (let k = 0; k < 4 && (await lessons(game))[LESSON.breakOff] < 0; k++) { await game.drag(stick, { x: stick.x, y: stick.y - 70 }, 110); await game.page.waitForTimeout(700); }
  check(`${dev} broke off the current by touch`, (await lessons(game))[LESSON.breakOff] >= 0);
  // steer out a while to lay a trail, then hold head home until the loop closes; at the clock's own pace, as a player
  // would meet these prompts (each waits TUTORIAL.wait s of match time for its moment)
  await game.hook((g) => g.setSpeed(null));
  await game.gesture([[stick, { x: stick.x + 60, y: stick.y }, { x: stick.x + 60, y: stick.y }]], 2500);
  check(`${dev} steered by touch`, (await lessons(game))[LESSON.steer] >= 0);
  await game.gesture([[stick, { x: stick.x - 45, y: stick.y }, { x: stick.x - 45, y: stick.y }]], 2500);
  // the loop's prompt comes once head home can close one (S-019: she is out of her waters, a trail open behind her);
  // then one hold of head home sails her back and closes it: the first press works, as the first voyage promises
  const homeFrom = await tick(game);
  while ((await p27<number>(game, 'lesson')) !== LESSON.loop && (await lessons(game))[LESSON.loop] < 0 && (await tick(game)) - homeFrom < budget(20_000)) await game.page.waitForTimeout(250);
  const prompted = (await p27<number>(game, 'lesson')) === LESSON.loop;
  check(`${dev} prompt: close a loop, once head home can`, prompted, `${(await tick(game)) - homeFrom} ticks after the steering${prompted ? '' : `; ${JSON.stringify({ ...(await p27<object>(game, 'moment')), lessons: undefined, showing: await p27<number>(game, 'lesson'), tutorial: await p27(game, 'tutorial') })}`}`);
  if (prompted) {
    await game.page.waitForTimeout(900);
    await shot(game, dev, 'prompt-loop');
    const held = await tick(game);
    await game.touch([{ id: 7, ...(await btn('home')) }]);
    while ((await lessons(game))[LESSON.loop] < 0 && (await tick(game)) - held < budget(20_000)) await game.page.waitForTimeout(250);
    await game.touch([]);
    check(`${dev} closed a loop on the first hold of head home`, (await lessons(game))[LESSON.loop] >= 0, `${(await tick(game)) - held} ticks held`);
  }
  await game.hook((g) => g.setSpeed(3));
  // call the gull (its price comes with the sea claimed), then the chest: "Later", the chip, a card
  const gullFrom = await tick(game);
  for (let k = 0; k < 100 && (await lessons(game))[LESSON.gull] < 0 && (await tick(game)) - gullFrom < budget(20 * 1200); k++) { await game.tap(await btn('gull')); await game.page.waitForTimeout(1200); }
  check(`${dev} called the gull`, (await lessons(game))[LESSON.gull] >= 0);
  let chest = await waitFor<{ cards: R[]; later: R }>(game, 'chest', 90_000);
  check(`${dev} the chest choice comes up on deck`, chest !== null);
  if (chest) {
    await game.page.waitForTimeout(2600); // written in
    await shot(game, dev, 'chest');
    await game.tap(mid(chest.later));
    const chip = await waitFor<R>(game, 'chip', 5000);
    check(`${dev} "Later" stows the chest on its chip`, chip !== null && (await p27(game, 'chest')) === null);
    if (chip) {
      await shot(game, dev, 'chip');
      await game.tap(mid(chip));
      chest = await waitFor<{ cards: R[]; later: R }>(game, 'chest', 5000);
      check(`${dev} the chip opens the chest again`, chest !== null);
    }
    for (let k = 0; chest && k < chest.cards.length && (await lessons(game))[LESSON.chest] < 0; k++) { await game.tap(mid(chest.cards[k]!)); await game.page.waitForTimeout(1500); }
    check(`${dev} chose from the chest by touch (ShipInput.chestPick)`, (await lessons(game))[LESSON.chest] >= 0);
  }
  const t = await p27<{ shown: number[]; closed: number[] }>(game, 'tutorial');
  const order = (t?.shown ?? []).map((tk, k) => [tk, k] as const).filter(([tk]) => tk >= 0).sort((a, b) => a[0] - b[0]).map(([, k]) => k);
  check(`${dev} each prompt shown at most once, in the order of its moment`, !!t && order.every((k, i) => i === 0 || t.shown[order[i - 1]!]! <= t.shown[k]!), `shown ${order.join(',')}`);

  // the match plays on to its end; the sinking flow is tested on every run: a voyage she wins hands it to the second
  const sankFirst = await sinking(game, dev);
  if (!sankFirst) console.log(`     ${dev}: she won the first voyage; the sinking flow is tested on the second`);
  await game.until((g) => g.screen === 'results', undefined, 120_000);
  await game.page.waitForTimeout(2500);
  await shot(game, dev, 'results-writing');
  const res = (): Promise<{ page: number; button: R | null }> => p27(game, 'results');
  await game.tap({ x: d.width / 2, y: d.height / 2 }); // a tap finishes the writing
  await game.page.waitForTimeout(800);
  await shot(game, dev, 'results');
  await game.tap(mid((await res()).button!));
  await game.page.waitForTimeout(3000);
  check(`${dev} the next voyage's nine captains`, (await res()).page === 1);
  await shot(game, dev, 'next-nine');
  await game.tap(mid((await res()).button!));
  await game.until((g) => g.screen === 'harbour', undefined, 30_000);
  await game.page.waitForTimeout(2000);
  await shot(game, dev, 'harbour-unroll');
  await game.page.waitForTimeout(4000);
  await shot(game, dev, 'harbour-chart');
  // back to the quay, and a second voyage: on its own now
  const back = harbourLayout(view, 'chart').targets.find((q) => q.kind === 'back')!;
  await game.tap(mid(back));
  await game.page.waitForTimeout(900);
  await game.tap({ x: s.left + (d.width - s.left - s.right) / 2, y: s.top + (d.height - s.top - s.bottom) * 0.42 });
  await game.until((g) => g.screen === 'match' && g.tick > 300, undefined, 60_000);
  check(`${dev} the second voyage has no prompts`, (await p27(game, 'tutorial')) === null && (await p27<number>(game, 'lesson')) === -1);
  if (!sankFirst) check(`${dev} she sank in one of two voyages: the sinking flow ran`, await sinking(game, dev));
  console.log(`     ${dev}: first voyage by touch in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  const problems = game.problems();
  check(`${dev} console clean`, problems.length === 0, problems.slice(0, 3).join(' | '));
  await game.close();
}

try {
  for (const dev of (process.env.WP27_DEVS ?? 'iphone,ipad').split(',') as DeviceName[]) await voyage(dev);
} finally {
  console.log(failed ? `${failed} FAILED` : 'the first voyage completes by touch');
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
