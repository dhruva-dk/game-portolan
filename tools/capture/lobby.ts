// The lobby, frame by frame on each device: the chart inking in over the planet and staggering in, a finger dragging
// the planet round and letting it run on, a press on the settings' dividers (and the way back), and a press on the
// Play seal: its stamp, the rhumb lines swinging to the Gale's course, the vellum turning opaque and the sheet rolling
// up into the Gale. The chart's clock is held and stepped a frame at a time with the world drawn each step, so every
// run shows the same instants. Fails unless the Play seal's press reaches the Gale.
import { log, openApp, Shots, type Rig } from './common.ts';
import { DEVICES, type DeviceName, type Game } from '../harness.ts';

/** Milliseconds into the lobby's ink, and from each press. */
const INK = [0, 150, 300, 500, 700, 900, 1200, 1500, 1800, 2200];
const DRY = [0, 150, 300, 600];
const PLAY = [0, 150, 300, 450, 600, 750, 900, 1050, 1200, 1400, 1650];

/** Steps the held clock to `ms` a frame at a time, drawing the world with it. */
async function to(game: Game, from: number, ms: number): Promise<number> {
  await game.page.evaluate(({ a, b }) => {
    const h = (window as unknown as { __portolan: { scrubUi(ms: number): void; app: { loop: { drawNow(dt: number): void } } } }).__portolan;
    for (let t = a + 1000 / 30; t < b; t += 1000 / 30) {
      h.scrubUi(t);
      h.app.loop.drawNow(1 / 30);
    }
    h.scrubUi(b);
    h.app.loop.drawNow(1 / 30);
  }, { a: from, b: ms });
  return ms;
}

/** Where a pressable on the chart is, by its id. */
async function where(game: Game, id: string): Promise<{ x: number; y: number }> {
  const hit = await game.hook((h, i) => h.app.chart.presses.list.find((p: { id: string }) => p.id === i)?.hit, id);
  if (!hit) throw new Error(`lobby: nothing on the chart called ${id}`);
  return { x: hit.x, y: hit.y };
}

/** Presses at (x, y) as a finger would: down, a few frames held, and up. */
async function press(game: Game, shots: Shots, at: number, p: { x: number; y: number }, label: string): Promise<number> {
  await game.page.mouse.move(p.x, p.y);
  await game.page.mouse.down();
  at = await to(game, at, at + 100);
  await shots.shot(game, `${label} pressed`);
  await game.page.mouse.up();
  return at;
}

export async function lobby(r: Rig, o: { dpr: number; device?: string }): Promise<void> {
  const devices = (o.device?.split(',') ?? ['ipad', 'iphone']) as DeviceName[];
  for (const device of devices) {
    if (!(device in DEVICES)) throw new Error(`--device must be among ${Object.keys(DEVICES).join(', ')}`);
    const game = await openApp(r, { device, dpr: o.dpr });
    const shots = await Shots.create(`lobby-${device}`);
    const { width, height } = DEVICES[device];
    // a captain some way into her career, so the cartouche has its marks
    await game.hook((h) => {
      const c = h.app.career;
      c.career = { ...c.career, xp: 5200, matches: 37, wins: 4, bestTier: 3 };
    });
    await game.hook((h) => { h.freezeUi(true); h.go('lobby'); });
    let at = 0;
    for (const ms of INK) {
      at = await to(game, at, ms);
      await shots.shot(game, `ink ${ms} ms`);
    }
    // a finger drags the planet a third of the way across the screen and lets go while it is still moving
    const cx = width / 2, cy = height / 2;
    await game.page.mouse.move(cx + width * 0.15, cy);
    await game.page.mouse.down();
    for (let k = 1; k <= 8; k++) {
      await game.page.mouse.move(cx + width * 0.15 - k * width * 0.04, cy + k * height * 0.01);
      at = await to(game, at, at + 34);
      if (k === 4) await shots.shot(game, 'dragging');
    }
    await game.page.mouse.up();
    const released = at;
    for (const ms of [100, 500, 1500]) {
      at = await to(game, at, released + ms);
      await shots.shot(game, `let go +${ms} ms`);
    }
    // the settings' dividers: pressed, the chart dries off the settings, and back
    await game.hook((h) => h.clearEffects());
    at = await press(game, shots, at, await where(game, 'lobby:settings'), 'settings');
    const set = at;
    for (const ms of DRY) {
      at = await to(game, at, set + ms);
      await shots.shot(game, `to the settings +${ms} ms`);
    }
    const onSettings = await game.hook((h) => h.screen);
    await game.hook((h) => h.go('lobby'));
    const back = at;
    for (const ms of [300, 1000, 2200]) {
      at = await to(game, at, back + ms);
      await shots.shot(game, `back +${ms} ms`);
    }
    // Play: the seal stamps, the web swings, the sheet comes up and rolls into the Gale
    at = await press(game, shots, at, await where(game, 'lobby:play'), 'play');
    const played = at;
    for (const ms of PLAY) {
      at = await to(game, at, played + ms);
      await shots.shot(game, `play +${ms} ms`);
    }
    const screen = await game.hook((h) => h.screen);
    await shots.json('effects.json', await game.hook((h) => h.effects()));
    await game.hook((h) => h.freezeUi(false));
    await game.hook((h) => h.settle(2));
    await shots.shot(game, `after: ${screen}`);
    await shots.sheet(r.browser, 6);
    log(`lobby ${device}: the dividers opened the ${onSettings}, the Play seal reached the ${screen}`);
    game.assertClean();
    await game.close();
    if (onSettings !== 'settings') throw new Error(`lobby ${device}: the dividers opened "${onSettings}", not the settings`);
    if (screen !== 'gale') throw new Error(`lobby ${device}: the Play seal left the lobby for "${screen}", not the Gale`);
  }
}
