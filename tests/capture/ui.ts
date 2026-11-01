// Interface transition strips, at iPad (1376×1032) and iPhone (956×440) sizes. Each transition is driven through the
// app's real flow, then every running animation on the page is paused and scrubbed through fixed times, so each strip
// shows the same instants on every run. A last frame shows the screen after everything has settled.
import { log, openApp, Shots, type Rig } from './common.ts';
import type { Game } from '../harness.ts';

export interface Transition {
  name: string;
  /** Hook calls, in the page, that set up the screen the transition starts from. */
  from: string;
  /** The hook call that makes the change. */
  to: string;
}

// The flow, title to lobby to every menu and back, then a match's screens to the results and home.
export const TRANSITIONS: readonly Transition[] = [
  { name: 'boot-title', from: 'h.go("boot")', to: 'h.go("title")' },
  { name: 'title-lobby', from: 'h.go("title")', to: 'h.go("lobby")' },
  ...['abilities', 'locker', 'rivals', 'career', 'rank', 'settings'].flatMap((s) => [
    { name: `lobby-${s}`, from: 'h.go("lobby")', to: `h.go("${s}")` },
    { name: `${s}-lobby`, from: `h.go("${s}")`, to: 'h.go("lobby")' },
  ]),
  { name: 'lobby-gale', from: 'h.go("lobby")', to: 'h.play({ seed: 11 })' },
  { name: 'gale-match', from: 'h.play({ seed: 11 })', to: 'h.dive()' },
  { name: 'match-death', from: 'h.play({ seed: 11, skipGale: true }); h.step(90)', to: 'h.sinkPlayer()' },
  { name: 'death-spectate', from: 'h.play({ seed: 11, skipGale: true }); h.step(90); h.sinkPlayer(); h.step(60)', to: 'h.go("spectate")' },
  { name: 'spectate-results', from: 'h.play({ seed: 11, skipGale: true }); h.step(90); h.sinkPlayer(); h.step(60); h.go("spectate")', to: 'h.go("results")' },
  { name: 'match-victory', from: 'h.play({ seed: 11, skipGale: true }); h.step(90)', to: 'h.winPlayer()' },
  { name: 'victory-results', from: 'h.play({ seed: 11, skipGale: true }); h.step(90); h.winPlayer(); h.step(60)', to: 'h.go("results")' },
  { name: 'results-lobby', from: 'h.play({ seed: 11, skipGale: true }); h.step(90); h.winPlayer(); h.step(60); h.go("results")', to: 'h.go("lobby")' },
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
  for (const ms of TIMES) {
    await game.hook((h, at) => h.scrubUi(at), ms);
    await shots.shot(game, `${ms} ms`);
  }
  await game.hook((h) => h.freezeUi(false));
  await game.page.waitForTimeout(1200);
  await game.hook((h) => h.settle(2));
  await shots.shot(game, 'settled');
  await shots.json('effects.json', await game.hook((h) => h.effects()));
  await shots.sheet(r.browser, 6);
}

export async function ui(r: Rig, o: { dpr: number; device?: string }): Promise<void> {
  const devices = o.device ? [o.device] : ['ipad', 'iphone'];
  for (const device of devices) {
    if (device !== 'ipad' && device !== 'iphone') throw new Error('--device must be ipad or iphone');
    const game = await openApp(r, { device, dpr: o.dpr });
    for (const t of TRANSITIONS) {
      await strip(game, r, t, device);
      log(`ui ${device}: ${t.name}`);
    }
    game.assertClean();
    await game.close();
  }
}
