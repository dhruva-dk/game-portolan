// The title, frame by frame on each device: the blank sheet inking itself in, the needle swinging while the world loads
// and settling north once it is ready, then one press anywhere (a real tap), the rose's flight and the sheet rolling off
// the lobby. The chart's clock is held and stepped a frame at a time, so every run shows the same instants. Fails unless
// the tap reaches the lobby.
import { log, openApp, Shots, type Rig } from './common.ts';
import { DEVICES, type DeviceName, type Game } from '../harness.ts';

/** Milliseconds from the title's opening: the ink, then the needle while the world is held loading. */
const INK = [0, 250, 500, 800, 1200, 1700, 2300, 3000, 3700, 4500];
const LOADING = [5200, 5900, 6600, 7300];
/** After the world is let be ready, and after the press. */
const SETTLE = [300, 700, 1200, 2000, 3000];
const LEAVE = [0, 120, 250, 400, 550, 700, 850, 1000, 1300, 1700, 2200];

/** Steps the held clock to `ms` a frame at a time, drawing the world with it, so whatever is stepped by the frames (the
 *  needle, the camera's flight to the lobby) moves as it would. */
async function to(game: Game, from: number, ms: number): Promise<number> {
  await game.page.evaluate(({ a, b }) => {
    const h = (window as unknown as { __portolan: { scrubUi(ms: number): void; app: { loop: { drawNow(dt: number): void } } } }).__portolan;
    for (let t = a; t < b; t += 1000 / 30) {
      h.app.loop.drawNow(1 / 30);
      h.scrubUi(t);
    }
    h.scrubUi(b);
  }, { a: from, b: ms });
  return ms;
}

export async function title(r: Rig, o: { dpr: number; device?: string }): Promise<void> {
  const devices = (o.device?.split(',') ?? ['ipad', 'iphone']) as DeviceName[];
  for (const device of devices) {
    if (!(device in DEVICES)) throw new Error(`--device must be among ${Object.keys(DEVICES).join(', ')}`);
    const game = await openApp(r, { device, dpr: o.dpr });
    const shots = await Shots.create(`title-${device}`);
    await game.hook((h) => h.holdTitle(0.15));
    await game.hook((h) => { h.go('title'); h.freezeUi(true); });
    let at = 0;
    for (const ms of INK) {
      at = await to(game, at, ms);
      await shots.shot(game, `ink ${ms} ms`);
    }
    for (const ms of LOADING) {
      at = await to(game, at, ms);
      await shots.shot(game, `loading ${ms} ms`);
    }
    // the world is ready: the needle swings to north and settles
    await game.hook((h) => h.holdTitle(null));
    const ready = at;
    for (const ms of SETTLE) {
      at = await to(game, at, ready + ms);
      await shots.shot(game, `ready +${ms} ms`);
    }
    // one press anywhere, as a finger would: its sound and haptic go in effects.json
    await game.hook((h) => h.clearEffects());
    const { width, height } = DEVICES[device];
    await game.page.mouse.move(width * 0.62, height * 0.55);
    await game.page.mouse.down();
    at = await to(game, at, at + 90);
    await shots.shot(game, 'pressed');
    await game.page.mouse.up();
    const pressed = at;
    for (const ms of LEAVE) {
      at = await to(game, at, pressed + ms);
      await shots.shot(game, `leaving +${ms} ms`);
    }
    const screen = await game.hook((h) => h.screen);
    await shots.json('effects.json', await game.hook((h) => h.effects()));
    await game.hook((h) => h.freezeUi(false));
    await game.hook((h) => h.settle(3));
    await game.page.waitForTimeout(600);
    await shots.shot(game, `after: ${screen}`);
    await shots.sheet(r.browser, 6);
    log(`title ${device}: the press reached the ${screen}`);
    game.assertClean();
    await game.close();
    if (screen !== 'lobby') throw new Error(`title ${device}: the press left the title for "${screen}", not the lobby`);
  }
}
