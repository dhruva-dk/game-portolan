// The drop, frame by frame on each device: Play from the lobby and the paper coming down over it and thinning on the
// camera's flight to the Gale, the fleet carried on it through the streaks and the torn cloud, DIVE faint then inked,
// the disc opening the full map where a tap sets the marker and another moves it and the disc shuts it, a press on
// DIVE, the camera coming down onto her as she glides with the stick up and her pennant standing on the water, and the
// landing with the HUD inking in. The chart's clock is held and stepped a frame at a time with the match stepped with
// it, so every run shows the same instants. Fails unless the dive lands her in the match.
import { log, openApp, Shots, type Rig } from './common.ts';
import { DEVICES, type DeviceName, type Game } from '../harness.ts';

type Hook = {
  scrubUi(ms: number): void;
  screen: string;
  sim: { gale: { t: number }; ships: { phase: number; alt: number }[] } | null;
  app: { loop: { drawNow(dt: number): void } };
};

/** Steps the held clock and the match to `ms` a frame at a time; stops early (returning where) once `until` holds. */
async function to(game: Game, from: number, ms: number, until?: 'dive' | 'land'): Promise<number> {
  return game.page.evaluate(({ a, b, u }) => {
    const h = (window as unknown as { __portolan: Hook }).__portolan;
    const done = () => (u === 'dive' ? (h.sim?.ships[0].phase ?? 0) !== 0 : u === 'land' ? h.screen === 'match' : false);
    let t = a;
    while (t < b) {
      t = Math.min(b, t + 1000 / 30);
      h.scrubUi(t);
      h.app.loop.drawNow(1 / 30);
      if (done()) break;
    }
    return t;
  }, { a: from, b: ms, u: until });
}

/** Presses at (x, y) as a finger would: down, a few frames held, and up. */
async function press(game: Game, shots: Shots, at: number, p: { x: number; y: number }, label: string): Promise<number> {
  await game.page.mouse.move(p.x, p.y);
  await game.page.mouse.down();
  at = await to(game, at, at + 100);
  await game.page.mouse.up();
  at = await to(game, at, at + 34);
  await shots.shot(game, `${label}`);
  return at;
}

export async function gale(r: Rig, o: { dpr: number; device?: string }): Promise<void> {
  const devices = (o.device?.split(',') ?? ['ipad', 'iphone']) as DeviceName[];
  for (const device of devices) {
    if (!(device in DEVICES)) throw new Error(`--device must be among ${Object.keys(DEVICES).join(', ')}`);
    const game = await openApp(r, { device, dpr: o.dpr });
    const shots = await Shots.create(`gale-${device}`);
    // the first Gale: its hand shows where to press
    await game.hook((h) => { h.forgetTips(); h.tips(true); h.freezeUi(true); h.go('lobby'); });
    let at = await to(game, 0, 2300);
    const seal = await game.hook((h) => h.app.chart.presses.list.find((p: { id: string }) => p.id === 'lobby:play')?.hit);
    await game.page.mouse.move(seal.x, seal.y);
    await game.page.mouse.down();
    at = await to(game, at, at + 100);
    await game.page.mouse.up();
    const played = at;
    for (const ms of [900, 1150, 1400, 1650, 2000, 2400, 2900]) {
      at = await to(game, at, played + ms);
      await shots.shot(game, `play +${ms} ms`);
    }
    // the fleet carried on the Gale, DIVE faint and then inked in
    for (const s of [3, 5, 8]) {
      at = await to(game, at, played + 900 + s * 1000);
      await shots.shot(game, `carried ${s} s`);
    }
    // the disc opens the full map, the match running under it: a tap in its window sets the marker, a second moves it
    const hit = async (id: string) => game.hook((h, i: string) => h.app.chart.presses.list.find((p: { id: string }) => p.id === i)?.hit, id);
    await game.hook((h) => h.clearEffects());
    at = await press(game, shots, at, await hit('gale:map'), 'full map');
    const window0 = await game.hook((h) => h.mapWindow);
    at = await press(game, shots, at, { x: window0.x + window0.r * 0.35, y: window0.y - window0.r * 0.3 }, 'marker set');
    at = await press(game, shots, at, { x: window0.x - window0.r * 0.28, y: window0.y + window0.r * 0.25 }, 'marker moved');
    at = await press(game, shots, at, await hit('gale:map'), 'map shut');
    for (const ms of [150, 400]) {
      const p = at;
      at = await to(game, at, p + ms);
      await shots.shot(game, `riding +${ms} ms`);
    }
    // she dives: DIVE inked, a press, and the camera comes down from the fleet onto her
    at = await press(game, shots, at, await hit('gale:dive'), 'dive');
    const dive = at;
    for (const ms of [0, 300, 700, 1200, 1800, 2600, 3600]) {
      at = await to(game, at, dive + ms);
      await shots.shot(game, `dive +${ms} ms`);
    }
    // down to the sea, a frame every few seconds
    let landed = false;
    for (let s = 5; s <= 45 && !landed; s += 4) {
      at = await to(game, at, dive + s * 1000, 'land');
      landed = (await game.hook((h) => h.screen)) === 'match';
      await shots.shot(game, landed ? 'landed' : `dive +${s} s, ${Math.round(await game.hook((h) => h.sim.ships[0].alt))} m up`);
    }
    const down = at;
    for (const ms of [150, 300, 500, 900]) {
      at = await to(game, at, down + ms);
      await shots.shot(game, `landed +${ms} ms`);
    }
    const state = await game.hook((h) => ({ screen: h.screen, phase: h.sim?.ships[0].phase ?? -1 }));
    await shots.json('effects.json', await game.hook((h) => h.effects()));
    await game.hook((h) => h.freezeUi(false));
    await shots.sheet(r.browser, 6);
    log(`gale ${device}: after the dive the screen is "${state.screen}", her phase ${state.phase}`);
    game.assertClean();
    await game.close();
    if (state.screen !== 'match' || state.phase !== 2) throw new Error(`gale ${device}: the dive did not land her in the match (screen "${state.screen}", phase ${state.phase})`);
  }
}
