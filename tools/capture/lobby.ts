// The lobby, frame by frame on each device: the instruments laid and inked in over her ship at anchor, the camera
// drifting round her over a few seconds, a press on the wheel, the career plate and each tab (and the way back from
// each), a finger orbiting her and two pinching in and out, the camera easing home, and a press on PLAY: paper
// coming down over her, the match begun under it and thinning away on the camera's flight to the Gale, where the
// Gale inks in. The chart's clock is held and stepped a frame at a time with the world drawn each step, so every run
// shows the same instants. Fails unless every press reaches its screen and the camera answers the fingers.
import { log, openApp, Shots, type Rig } from './common.ts';
import { DEVICES, type DeviceName, type Game } from '../harness.ts';
import { LOBBY_CAMERA } from '../../src/app/scenes.ts';
import { LOBBY_ORBIT } from '../../src/screens/lobby.ts';

/** Milliseconds into the lobby's ink, and from each press. */
const INK = [0, 150, 300, 500, 700, 900, 1200, 1500, 1800, 2200];
const DRY = [0, 150, 300, 600];
const PLAY = [0, 150, 300, 450, 600, 750, 900, 1050, 1200, 1350, 1500, 1700, 2000, 2400, 3000];
/** Everything on the lobby that opens a screen, and the screen it opens. */
const PRESSES = [
  ['lobby:settings', 'settings'], ['lobby:career', 'rank'], ['lobby:abilities', 'abilities'], ['lobby:locker', 'locker'],
  ['lobby:rank', 'rank'], ['lobby:rivals', 'rivals'],
] as const;

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
    // the camera drifting round her
    const still = at;
    for (const s of [3, 6, 9]) {
      at = await to(game, at, still + s * 1000);
      await shots.shot(game, `drift +${s} s`);
    }
    // each press: its sheet unrolls over the lobby, and rolls back
    await game.hook((h) => h.clearEffects());
    for (const [id, want] of PRESSES) {
      at = await press(game, shots, at, await where(game, id), want);
      const set = at;
      for (const ms of DRY) {
        at = await to(game, at, set + ms);
        await shots.shot(game, `to the ${want} +${ms} ms`);
      }
      const reached = await game.hook((h) => h.screen);
      if (reached !== want) throw new Error(`lobby ${device}: ${id} opened "${reached}", not the ${want}`);
      await game.hook((h) => h.go('lobby'));
      const back = at;
      for (const ms of [300, 1000, 2200]) {
        at = await to(game, at, back + ms);
        if (want === 'settings') await shots.shot(game, `back +${ms} ms`);
      }
    }
    // the fingers on open water: the camera turns and tilts with one, and comes closer and farther with two
    const { w: vw, h: vh } = await game.hook((h) => h.app.chart.layout);
    const mid = { x: vw * 0.55, y: vh * 0.4 }, boom = () => game.hook((h) => ({ ...h.app.boom }));
    const fingers = async (points: { id: number; x: number; y: number }[]) => {
      await game.touch(points);
      at = await to(game, at, at + 100);
    };
    await fingers([{ id: 1, ...mid }]);
    await fingers([{ id: 1, x: mid.x - vw * 0.25, y: mid.y + vh * 0.2 }]);
    await shots.shot(game, 'orbit');
    const orbit = await boom();
    await fingers([]);
    if (orbit.yaw <= 0.5 || orbit.pitch <= 0.1) throw new Error(`lobby ${device}: the finger left the camera at ${JSON.stringify(orbit)}`);
    const pinch = async (spread: number) => {
      await fingers([{ id: 1, x: mid.x - 60, y: mid.y }, { id: 2, x: mid.x + 60, y: mid.y }]);
      await fingers([{ id: 1, x: mid.x - spread, y: mid.y }, { id: 2, x: mid.x + spread, y: mid.y }]);
      const b = await boom();
      await shots.shot(game, `pinched to ${spread * 2} px`);
      await fingers([]);
      return b.zoom;
    };
    const near = await pinch(240), far = await pinch(10);
    if (near >= 1) throw new Error(`lobby ${device}: pinching out left the zoom at ${near}`);
    if (far <= near || far > LOBBY_ORBIT.zoom[1]) throw new Error(`lobby ${device}: pinching in left the zoom at ${far}`);
    // the closest the fingers can bring it, low, off her bow and off her stern: it must stand clear of her
    for (const [label, yaw] of [['bow', LOBBY_CAMERA.quarter], ['stern', LOBBY_CAMERA.quarter - Math.PI]] as const) {
      const put = () => game.hook((h, v) => { Object.assign(h.app.boom, v); h.app.stage.rig.dist = v.dist; }, { yaw, pitch: LOBBY_ORBIT.pitch[0], zoom: LOBBY_ORBIT.zoom[0], dist: LOBBY_CAMERA.dist * LOBBY_ORBIT.zoom[0] });
      await put();
      at = await to(game, at, at + 200);
      await put();
      at = await to(game, at, at + 34);
      await shots.shot(game, `closest off her ${label}`);
    }
    await game.hook((h, o) => { Object.assign(h.app.boom, o); }, { ...orbit, zoom: far });
    const free = at;
    for (const s of [2, 6]) {
      at = await to(game, at, free + s * 1000);
      await shots.shot(game, `eased home +${s} s`);
    }
    const home = await boom();
    if (Math.abs(home.yaw) >= Math.abs(orbit.yaw) * 0.25 || Math.abs(home.zoom - 1) >= 0.25) throw new Error(`lobby ${device}: the camera did not ease home: ${JSON.stringify(home)}`);
    // PLAY: the paper comes down over her, and thins away on the camera's flight to the Gale, as the drop's chart inks in
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
    log(`lobby ${device}: every press reached its screen, the camera answered the fingers (orbit ${orbit.yaw.toFixed(2)} rad, zoom ${near.toFixed(2)}-${far.toFixed(2)}), PLAY reached the ${screen}`);
    game.assertClean();
    await game.close();
    if (screen !== 'gale') throw new Error(`lobby ${device}: PLAY left the lobby for "${screen}", not the Gale`);
  }
}
