// Interface transition strips, at the smallest and largest iPad (1180×820, 1376×1032) and iPhone (852×393, 956×440). Each transition is driven through the
// app's real flow, then every running animation on the page is paused and scrubbed through fixed times, so each strip
// shows the same instants on every run. A last frame shows the screen after everything has settled.
import { log, openApp, Shots, type Rig } from './common.ts';
import { DEVICES, type DeviceName, type Game } from '../harness.ts';

export interface Transition {
  name: string;
  /** Hook calls, in the page, that set up the screen the transition starts from. */
  from: string;
  /** The hook call that makes the change. */
  to: string;
  /** Milliseconds into the transition for each frame, when it runs longer than most. */
  times?: readonly number[];
  /** The world moves under it (the camera flying to the Gale under the lobby's paper): it is drawn a frame at a time as
   *  the clock is scrubbed. */
  world?: boolean;
}

/** The result sheet coming down and inking in, beat by beat, to the gold's climb and the seal. */
const INK_RESULT = [0, 150, 300, 450, 600, 900, 1300, 1800, 2400, 3000, 3800, 4600, 5500];
/** The title's leaving, into the lobby inking in once its sheet is off; and the lobby inking in. */
const LEAVE_TITLE = [0, 120, 250, 400, 550, 700, 850, 1000, 1300, 1700, 2200, 2800, 3400];
const INK_LOBBY = [0, 150, 300, 500, 700, 900, 1200, 1500, 1800, 2200];

// The flow, title to lobby to every menu and back, then a match's screens to the results and home.
export const TRANSITIONS: readonly Transition[] = [
  // the title is drawn on the chart: it inks itself in over seconds, and leaves (from its inked sheet) as the sheet rolls off
  { name: 'boot-title', from: 'h.go("boot")', to: 'h.go("title")', times: [0, 250, 500, 800, 1200, 1700, 2300, 3000, 3700, 4500] },
  {
    name: 'title-lobby', from: 'h.go("title"); h.freezeUi(true); h.scrubUi(6000); h.freezeUi(false)', to: 'h.go("lobby")',
    times: LEAVE_TITLE,
  },
  // the lobby's folios unroll over it and roll back
  ...['abilities', 'locker', 'rivals', 'rank', 'settings'].flatMap((s) => [
    { name: `lobby-${s}`, from: 'h.go("lobby")', to: `h.go("${s}")` },
    { name: `${s}-lobby`, from: `h.go("${s}")`, to: 'h.go("lobby")', times: INK_LOBBY },
  ]),
  // Play stamps, paper comes down over her ship and thins on the flight to the Gale, and the drop inks in; the dive
  // runs to the landing, where the HUD inks in
  {
    name: 'lobby-gale', from: 'h.go("lobby")', to: 'await h.draw(); h.press("lobby:play")', world: true,
    times: [0, 150, 300, 450, 600, 750, 900, 1050, 1200, 1350, 1500, 1700, 2000, 2600],
  },
  {
    name: 'gale-match', from: 'h.play({ seed: 11 })', to: 'h.dive(); for (let i = 0; i < 900 && h.screen !== "match"; i++) await h.draw()',
    times: [0, 100, 200, 300, 450, 600, 800],
  },
  // the match's own screens follow the sim, which only moves here when a frame is drawn
  { name: 'match-spectate', from: 'h.play({ seed: 11, skipGale: true }); h.step(90)', to: 'h.sinkPlayer(3, "cannon"); await h.draw()' },
  { name: 'spectate-results', from: 'h.play({ seed: 11, skipGale: true }); h.step(90); h.sinkPlayer(3, "cannon"); await h.draw(); await h.draw()', to: 'h.finish()', times: INK_RESULT },
  { name: 'match-victory', from: 'h.play({ seed: 11, skipGale: true }); h.step(90)', to: 'h.winPlayer(); await h.draw()' },
  { name: 'victory-results', from: 'h.play({ seed: 11, skipGale: true }); h.step(90); h.winPlayer(); h.step(60)', to: 'h.finish()', times: INK_RESULT },
  // the sheet lifts, and her ship at anchor and the lobby are under it
  { name: 'results-lobby', from: 'h.play({ seed: 11, skipGale: true }); h.step(90); h.winPlayer(); h.step(60); h.finish(); for (let i = 0; i < 30; i++) await h.draw()', to: 'h.go("lobby")', times: INK_LOBBY, world: true },
];

/** Milliseconds into the transition for each frame of the strip. */
const TIMES = [0, 50, 100, 150, 200, 275, 350, 450, 600, 800];

async function run(game: Game, code: string): Promise<void> {
  await game.page.evaluate(async (src) => {
    const h = (window as unknown as { __portolan: unknown }).__portolan;
    await (0, eval)(`(async (h) => { ${src}; })`)(h);
  }, code);
}

async function strip(game: Game, r: Rig, t: Transition, device: string): Promise<void> {
  const shots = await Shots.create(`ui-${device}/${t.name}`);
  await run(game, t.from);
  await game.hook((h) => h.settle(3));
  await game.page.waitForTimeout(900); // let the starting screen finish arriving
  await game.hook((h) => h.clearEffects());
  await run(game, t.to);
  // one frame for the change to take hold and its animations to start, then freeze them all
  await game.page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await game.hook((h) => h.freezeUi(true));
  let at = 0;
  for (const ms of t.times ?? TIMES) {
    if (t.world) {
      await game.page.evaluate(({ a, b }) => {
        const h = (window as unknown as { __portolan: { scrubUi(ms: number): void; app: { loop: { drawNow(dt: number): void } } } }).__portolan;
        for (let s = a + 1000 / 30; s < b; s += 1000 / 30) {
          h.scrubUi(s);
          h.app.loop.drawNow(1 / 30);
        }
        h.scrubUi(b);
        h.app.loop.drawNow(1 / 30);
      }, { a: at, b: ms });
      at = ms;
    } else await game.hook((h, m) => h.scrubUi(m), ms);
    await shots.shot(game, `${ms} ms`);
  }
  await game.hook((h) => h.freezeUi(false));
  await game.page.waitForTimeout(1200);
  // the screen flashes and vignettes run on drawn frames, which nothing draws here unless asked
  await game.hook((h) => h.run(3));
  await game.hook((h) => h.settle(2));
  await shots.shot(game, 'settled');
  await shots.json('effects.json', await game.hook((h) => h.effects()));
  await shots.sheet(r.browser, 6);
}

export async function ui(r: Rig, o: { dpr: number; device?: string; only?: string }): Promise<void> {
  const devices = o.device ? o.device.split(',') : ['ipad', 'ipadSmall', 'iphone', 'iphoneSmall'];
  const only = o.only?.split(',');
  const list = only ? TRANSITIONS.filter((t) => only.includes(t.name)) : TRANSITIONS;
  for (const device of devices) {
    if (!(device in DEVICES)) throw new Error(`--device must be among ${Object.keys(DEVICES).join(', ')}`);
    const game = await openApp(r, { device: device as DeviceName, dpr: o.dpr });
    for (const t of list) {
      await strip(game, r, t, device);
      log(`ui ${device}: ${t.name}`);
    }
    game.assertClean();
    await game.close();
  }
}
