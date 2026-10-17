// Captures every screenshot the spec asks for, each from a fresh seeded page with a scripted scene:
//   npm run capture -- <outdir> [--seed 1] [--only dawn,trail,...] [--dpr 2]
// Gameplay moments are found by scouting the same seeded match headless in Node; the page then replays
// it with the same scripted captain, running the last seconds live so the moment plays out on screen.
// Prints console errors and requests that left the origin per shot; exits non-zero if there were any.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { Page } from 'playwright';
import { Sim, GRID, R, cellDir, v3, type SimEvent, type V3 } from '../src/sim.ts';
import { createWorld } from '../src/world.ts';
import { Bots } from '../src/bots.ts';
import { serve, launch, open, playing, loopPilot } from './shot.ts';

const { values: a, positionals } = parseArgs({
  allowPositionals: true,
  options: { seed: { type: 'string', default: '1' }, only: { type: 'string' }, dpr: { type: 'string', default: '2' } },
});
const outDir = positionals[0] ?? 'captures';
const seed = +a.seed!;
const LIVE = 4; // seconds of each scene that run in real time before the moment

type Pilot = () => (sim: Sim) => number;

/** Self-sinking captain: runs out of its territory, then turns hard about across its own trail. */
function sinkPilot(): (sim: Sim) => number {
  let out = 0, turned = 0;
  return (sim) => {
    const s = sim.ships[0];
    if (!s.trail.length) return (out = turned = 0);
    if (++out < 75 || turned > 4.4) return 0;
    turned += s.turn / 30;
    return 1;
  };
}

/** Round-loop captain: runs out of its territory and swings back home on a wide, steady turn. */
function roundPilot(): (sim: Sim) => number {
  let out = 0;
  return (sim) => {
    const s = sim.ships[0], { pos: p, fwd: f, home: h } = s;
    if (!s.trail.length) return (out = 0);
    if (++out < 40) return 0;
    const px = p.y * f.z - p.z * f.y, py = p.z * f.x - p.x * f.z, pz = p.x * f.y - p.y * f.x;
    const dx = h.x - p.x, dy = h.y - p.y, dz = h.z - p.z;
    const bearing = Math.atan2(dx * px + dy * py + dz * pz, dx * f.x + dy * f.y + dz * f.z);
    return Math.abs(bearing) > 0.35 && out < 600 ? 0.42 : Math.max(-1, Math.min(1, bearing * 2.2 - s.turn * 0.4));
  };
}

/** Hunting captain: closes on the middle of the three nearest rivals. */
function huntPilot(): (sim: Sim) => number {
  return (sim) => {
    const s = sim.ships[0], p = s.pos, f = s.fwd;
    const near = sim.ships.filter((o) => o.id && o.alive)
      .map((o) => ({ o, d: (o.pos.x - p.x) ** 2 + (o.pos.y - p.y) ** 2 + (o.pos.z - p.z) ** 2 }))
      .sort((x, y) => x.d - y.d).slice(0, 3);
    let dx = -3 * p.x, dy = -3 * p.y, dz = -3 * p.z;
    for (const { o } of near) (dx += o.pos.x), (dy += o.pos.y), (dz += o.pos.z);
    const px = p.y * f.z - p.z * f.y, py = p.z * f.x - p.x * f.z, pz = p.x * f.y - p.y * f.x;
    const bearing = Math.atan2(dx * px + dy * py + dz * pz, dx * f.x + dy * f.y + dz * f.z);
    return Math.max(-1, Math.min(1, bearing * 2.2 - s.turn * 0.4));
  };
}

/** Run the seeded match headless with a captain until `found` holds after a tick; returns that tick. */
function scout(pilot: Pilot, found: (sim: Sim, events: SimEvent[]) => boolean, seconds = 300): number {
  const sim = new Sim({ seed, world: createWorld(seed) }), bots = new Bots(sim), helm = pilot();
  const inputs = new Float32Array(sim.ships.length);
  while (sim.tick < seconds * 30) {
    inputs[0] = Math.round(Math.max(-1, Math.min(1, helm(sim))) * 127) / 127; // as main.ts records it
    bots.decide(sim, inputs);
    sim.step(inputs);
    const events = sim.events;
    sim.events = [];
    if (found(sim, events)) return sim.tick;
  }
  throw new Error(`seed ${seed}: no such moment in ${seconds} s`);
}

const near = (sim: Sim, id: number) => Math.hypot(...(['x', 'y', 'z'] as const).map((k) => sim.ships[id].pos[k] - sim.ships[0].pos[k])) * R;
const rivalsAround = (sim: Sim, dist: number) => sim.ships.filter((o) => o.id && o.alive && near(sim, o.id) < dist);

/** Camera yaw (from astern) that looks from the player's ship toward a world point, or along a direction. */
function bearing(w: V3, isDirection: boolean): number {
  const p = (window as any).__game.ctx.ships.poses[0];
  const d = isDirection ? w : { x: w.x - p.pos.x, y: w.y - p.pos.y, z: w.z - p.pos.z };
  const u = p.up, f = p.fwd;
  const px = u.y * f.z - u.z * f.y, py = u.z * f.x - u.x * f.z, pz = u.x * f.y - u.y * f.x;
  return Math.atan2(d.x * px + d.y * py + d.z * pz, d.x * f.x + d.y * f.y + d.z * f.z);
}

interface Aim { dist: number; pitch: number; yaw?: number; at?: 'sun' | 'moon' | V3; turn?: number }
/** Point the camera: yaw a plain angle, or toward the sun, the moon or a world point, turned by `turn`. */
const aim = (page: Page, cam: Aim) => page.evaluate(([c, src]) => {
  const g = (window as any).__game, toward = (0, eval)(src), env = g.ctx.sky.env;
  const yaw = c.at === undefined ? c.yaw ?? 0
    : (typeof c.at === 'string' ? toward(c.at === 'sun' ? env.sunDir : env.moonDir, true) : toward(c.at, false)) + (c.turn ?? 0);
  g.setCamera({ dist: c.dist, pitch: c.pitch, yaw });
}, [cam, `(${bearing})`] as const);
const hour = (page: Page, h: number) => page.evaluate((x) => (window as any).__game.setHour(x), h);
const settle = (page: Page, seconds: number) => page.waitForTimeout(seconds * 1000);
const until = (page: Page, js: string) => page.waitForFunction(js, null, { timeout: 60_000, polling: 'raf' });

/**
 * Hand the helm to the captain from the first tick (the page is opened without waiting), wait for play,
 * then run the match to `tick`: all at once to a few seconds before it, the rest live.
 */
async function stage(page: Page, pilot: Pilot | null, tick = 0): Promise<void> {
  if (pilot) await page.evaluate((src) => (window as any).__game.setPilot((0, eval)(src)()), `(${pilot})`);
  await playing(page);
  await page.evaluate((t) => {
    const g = (window as any).__game, ahead = t - g.sim.tick;
    if (ahead > 0) g.advance(ahead / 30);
  }, tick - LIVE * 30);
  if (tick) await until(page, `__game.sim.tick >= ${tick}`);
}

/** Centre of a set of territory cells, as a world point. */
function centre(cells: Int32Array): V3 {
  const c = v3(), d = v3();
  for (const cell of cells) {
    cellDir(cell, GRID, d);
    c.x += d.x; c.y += d.y; c.z += d.z;
  }
  const l = Math.hypot(c.x, c.y, c.z) / R;
  return v3(c.x / l, c.y / l, c.z / l);
}

// The day, each hour lit from the side that suits it: [name, hour, camera].
const HOURS: [string, number, Aim][] = [
  ['dawn', 6.1, { dist: 15, pitch: 0.16, at: 'sun', turn: 0.45 }],
  ['morning', 8.5, { dist: 16, pitch: 0.2, at: 'sun', turn: 2.3 }],
  ['midday', 12.2, { dist: 18, pitch: 0.28, at: 'sun', turn: 2.6 }],
  ['storm', 15, { dist: 16, pitch: 0.18, yaw: 0.7 }],
  ['golden-hour', 17.5, { dist: 15, pitch: 0.15, at: 'sun', turn: 0.4 }],
  ['sunset', 18.75, { dist: 16, pitch: 0.14, at: 'sun', turn: 0.3 }],
  ['blue-hour', 19.8, { dist: 15, pitch: 0.16, at: 'sun', turn: 0.6 }],
  ['night', 23, { dist: 15, pitch: 0.18, at: 'moon', turn: 0.35 }],
  ['pre-dawn', 4.6, { dist: 16, pitch: 0.16, at: 'sun', turn: 0.3 }],
];

const SHOTS: Record<string, (page: Page) => Promise<unknown>> = {
  ...Object.fromEntries(HOURS.map(([name, h, cam]) => [name, async (page: Page) => {
    await stage(page, null);
    await hour(page, h);
    await settle(page, 0.3);
    await aim(page, cam);
    await settle(page, 2.5);
  }])),
  opening: async (page) => {
    await stage(page, null);
    await settle(page, 0.8);
  },
  trail: async (page) => {
    await stage(page, loopPilot, scout(loopPilot, (s) => s.ships[0].trail.length > 70));
    const t = await page.evaluate(() => {
      const trail = (window as any).__game.sim.ships[0].trail, p = trail[Math.floor(trail.length / 2)];
      return { x: p.x * 200, y: p.y * 200, z: p.z * 200 };
    });
    await aim(page, { dist: 26, pitch: 0.5, at: t });
    await settle(page, 1);
  },
  'loop-closing': async (page) => {
    let claim: V3 | null = null;
    const tick = scout(roundPilot, (_s, events) => events.some((e) =>
      e.type === 'claim' && e.ship === 0 && e.cells.length > 2000 && (claim = centre(e.cells)) !== null));
    await stage(page, roundPilot, tick);
    await aim(page, { dist: 50, pitch: 1, at: claim! });
    await settle(page, 0.5);
  },
  sinking: async (page) => {
    await stage(page, sinkPilot, scout(sinkPilot, (s) => !s.ships[0].alive));
    await aim(page, { dist: 15, pitch: 0.22, yaw: 2 });
    await until(page, '__game.ctx.ships.poses[0].sink > 0.45');
  },
  respawn: async (page) => {
    const sunk = scout(sinkPilot, (s) => !s.ships[0].alive);
    await stage(page, sinkPilot, scout(sinkPilot, (s) => s.tick > sunk && s.ships[0].alive));
    await aim(page, { dist: 17, pitch: 0.25, yaw: 0.8 });
    await until(page, '__game.ctx.ships.poses[0].rise > 0.35');
  },
  fight: async (page) => {
    await stage(page, huntPilot, scout(huntPilot, (s) => rivalsAround(s, 40).length >= 4));
    const c = await page.evaluate(() => {
      const ships = (window as any).__game.sim.ships, me = ships[0].pos;
      const d = (o: any) => Math.hypot(o.pos.x - me.x, o.pos.y - me.y, o.pos.z - me.z);
      const four = ships.filter((o: any) => o.id && o.alive).sort((x: any, y: any) => d(x) - d(y)).slice(0, 4);
      return four.reduce((m: V3, o: any) => ({ x: m.x + o.pos.x * 50, y: m.y + o.pos.y * 50, z: m.z + o.pos.z * 50 }), { x: 0, y: 0, z: 0 });
    });
    await aim(page, { dist: 30, pitch: 0.45, at: c });
    await settle(page, 0.8);
  },
  orbital: async (page) => {
    await stage(page, null);
    await hour(page, 9);
    await aim(page, { dist: 640, pitch: 1.2, yaw: 0 });
    await settle(page, 2.5);
  },
  hud: async (page) => {
    await stage(page, loopPilot, 1350);
    await hour(page, 10);
    await settle(page, 1);
  },
  'menu-day': async (page) => {
    await stage(page, loopPilot, 1350);
    await hour(page, 11);
    await settle(page, 0.5); // let the sky move to the new hour before the globe faces it
    await page.keyboard.press('KeyM');
    await settle(page, 3);
  },
  'menu-night': async (page) => {
    await stage(page, loopPilot, 1350);
    await hour(page, 23);
    await settle(page, 0.5); // let the sky move to the new hour before the globe faces it
    await page.keyboard.press('KeyM');
    await settle(page, 3);
  },
};

const names = a.only ? a.only.split(',') : Object.keys(SHOTS);
await mkdir(outDir, { recursive: true });
const server = await serve();
const browser = await launch();
let problems = 0;
try {
  for (const name of names) {
    const { page, errors, external } = await open(browser, server.url, { seed, dpr: +a.dpr!, ready: false });
    await SHOTS[name](page);
    // the HUD close-up: the top-right corner the papyrus disc sits in
    const clip = name === 'hud' ? { x: page.viewportSize()!.width - 360, y: 0, width: 360, height: 360 } : undefined;
    await page.screenshot({ path: join(outDir, `${name}.png`), clip });
    console.log(`${name}.png${errors.length || external.length ? '' : '  ok'}`);
    for (const e of errors) console.log(`  console error: ${e}`);
    for (const u of external) console.log(`  external request: ${u}`);
    problems += errors.length + external.length;
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
process.exitCode = problems ? 1 : 0;
