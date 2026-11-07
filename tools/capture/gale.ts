// The Gale on the chart, frame by frame on each device: Play from the lobby and its sheet rolling up off the Gale's,
// the fleet sliding along the course as the planet turns under it, a first press on the planet marking the dive and a
// second moving it, the sand-glass draining until she leaves the Gale, the sheet thinning as the camera dives with
// her, and the landing with the HUD's disc inking in. The chart's clock is held and stepped a frame at a time with the
// match stepped with it, so every run shows the same instants. Fails unless the dive lands her in the match.
import { log, openApp, Shots, type Rig } from './common.ts';
import { DEVICES, type DeviceName, type Game } from '../harness.ts';

type Hook = {
  scrubUi(ms: number): void;
  screen: string;
  sim: { gale: { from: V3; dir: V3; t: number }; ships: { phase: number; alt: number }[] } | null;
  app: { loop: { drawNow(dt: number): void }; stage: { camera: { position: V3 & { constructor: new (x: number, y: number, z: number) => V3 & { project(c: unknown): V3 } } } } };
};
type V3 = { x: number; y: number; z: number };

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

/** Where on the screen the planet's point `ahead` radians along the course from the fleet, `side` radians off it,
 *  is now. */
async function spot(game: Game, ahead: number, side: number): Promise<{ x: number; y: number }> {
  return game.page.evaluate(({ ahead, side }) => {
    const h = (window as unknown as { __portolan: Hook }).__portolan, g = h.sim!.gale, cam = h.app.stage.camera;
    const a = Math.PI * Math.min(g.t, 35) / 35 + ahead, f = g.from, d = g.dir;
    const p = { x: f.x * Math.cos(a) + d.x * Math.sin(a), y: f.y * Math.cos(a) + d.y * Math.sin(a), z: f.z * Math.cos(a) + d.z * Math.sin(a) };
    // the side: the course's pole, crossed
    const n = { x: f.y * d.z - f.z * d.y, y: f.z * d.x - f.x * d.z, z: f.x * d.y - f.y * d.x };
    const q = { x: p.x * Math.cos(side) + n.x * Math.sin(side), y: p.y * Math.cos(side) + n.y * Math.sin(side), z: p.z * Math.cos(side) + n.z * Math.sin(side) };
    const V = cam.position.constructor, v = new V(q.x * 554, q.y * 554, q.z * 554).project(cam);
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
  }, { ahead, side });
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
    // the fleet carried, the planet turning under the course
    for (const s of [5, 8]) {
      at = await to(game, at, played + 900 + s * 1000);
      await shots.shot(game, `carried ${s} s`);
    }
    // a press far ahead and off to one side marks the dive; a second moves it nearer, on the other side, by the course
    await game.hook((h) => h.clearEffects());
    at = await press(game, shots, at, await spot(game, 1.25, 0.3), 'first press');
    for (const ms of [150, 400]) {
      const p = at;
      at = await to(game, at, p + ms);
      await shots.shot(game, `first +${ms} ms`);
    }
    at = await press(game, shots, at, await spot(game, 0.75, -0.12), 'second press');
    const second = at;
    for (const ms of [150, 300, 600]) {
      at = await to(game, at, second + ms);
      await shots.shot(game, `second +${ms} ms`);
    }
    // the glass drains until the Gale has carried her nearest the mark, and she leaves it
    let k = 0;
    while (k++ < 12) {
      const was = at;
      at = await to(game, at, at + 2000, 'dive');
      if (at < was + 2000) break;
      await shots.shot(game, `riding, glass at ${Math.round(await game.hook((h) => 35 - h.sim.gale.t))} s`);
    }
    const dive = at;
    for (const ms of [0, 300, 700, 1200, 1800, 2600]) {
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
