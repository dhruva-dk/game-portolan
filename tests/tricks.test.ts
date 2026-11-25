import { test } from 'node:test';
import assert from 'node:assert/strict';
import { debugOf, type Match } from '../src/sim/engine.ts';
import { STILL, type Hands } from '../src/sim/hands.ts';
import { PLAYER } from '../src/sim/match.ts';
import type { DriverStats } from '../src/sim/setup.ts';
import { calm, type Storm } from '../src/sim/storm.ts';
import { RETURN_FIRE, TRICKS } from '../src/sim/tuning.ts';
import { MIND } from '../src/sim/fighting.ts';
import {
  R,
  add,
  along,
  bearingAt,
  cross,
  distance,
  dot,
  normalize,
  scale,
  toward,
  type Vec3,
} from '../src/world/sphere.ts';
import { EVEN_SHIP, setupOf, statsWith } from './setups.ts';
import { OPEN, fighting, sail, waters } from './small.ts';
import { createMatch } from '../src/sim/engine.ts';

const SEEDS = [1, 2, 3];
const BOT = 1;

const below = (trick: keyof typeof TRICKS) => TRICKS[trick].needs - 1,
  at = (trick: keyof typeof TRICKS) => TRICKS[trick].needs;

function duel(
  seed: number,
  stats: DriverStats,
  o: { spread?: number; storm?: (t: number) => Storm } = {}
): Match {
  const m = createMatch(
    setupOf(seed, {
      teams: 2,
      perTeam: 1,
      player: true,
      stats,
      values: (ship) =>
        ship === BOT && o.spread !== undefined
          ? { ...EVEN_SHIP, spreadFactor: o.spread }
          : EVEN_SHIP,
    }),
    waters
  );
  debugOf(m).rig({ storm: o.storm ?? (() => calm(OPEN)) });
  return m;
}

function facing(m: Match, meters: number, bearing = 0): Match {
  const shooter = along(OPEN, bearingAt(OPEN, bearing), meters).p;
  debugOf(m).atSea({ at: shooter, bearing: bearing + Math.PI }, [
    { at: OPEN, heading: bearingAt(OPEN, bearing + Math.PI / 2), lashed: null },
  ]);
  return m;
}

const firing: (m: Match) => Hands = () => ({ ...STILL, fire: true });

test('a bot leads its shots from Gunnery 8; below, every shot goes where its target is now', () => {
  const offsets = (gunnery: number) => {
    const out: number[] = [];
    for (const seed of SEEDS) {
      const m = duel(seed, statsWith({ gunnery, nerve: 20 }), {
          spread: 0,
          storm: fighting,
        }),
        from = along(OPEN, bearingAt(OPEN, seed), 90).p;
      debugOf(m).atSea({ at: from, bearing: seed + Math.PI / 2 }, [
        { at: OPEN, heading: bearingAt(OPEN, seed), lashed: null },
      ]);
      sail(
        m,
        12,
        (k) => {
          const me = k.view.vessel(PLAYER);
          if (!me) return;
          for (const s of k.view.last().shots) {
            if (s.shooter !== BOT || s.target !== PLAYER) continue;
            const up = normalize(s.from),
              now = toward(up, me.ship.at),
              dir = normalize(add(s.dirs[0], up, -dot(s.dirs[0], up)));
            if (!now) continue;
            const ahead = dot(cross(up, now), me.ship.heading) > 0 ? 1 : -1;
            out.push(ahead * dot(cross(now, dir), up));
          }
        },
        (k) => {
          const me = k.view.vessel(PLAYER),
            it = k.view.vessel(BOT);
          return me && it
            ? {
                ...STILL,
                course: cross(me.ship.at, add(it.ship.at, me.ship.at, -1)),
                throttle: 0.6,
              }
            : STILL;
        }
      );
    }
    return out;
  };
  const green = offsets(below('lead')),
    sharp = offsets(at('lead'));
  const mean = (xs: number[]) => xs.reduce((x, y) => x + y, 0) / xs.length;
  console.log(
    `# shots off the target's place now, in radians: Gunnery ${below('lead')} ${green.length} shots, mean ${mean(green).toFixed(3)}; Gunnery ${at('lead')} ${sharp.length} shots, mean ${mean(sharp).toFixed(3)}`
  );
  assert.ok(green.length > 0 && sharp.length > 0);
  for (const x of green) assert.ok(Math.abs(x) < 0.01, `${x}`);
  for (const x of sharp) assert.ok(x > 0.02, `${x}`);
});

const apart = (m: Match) => {
  const a = m.view.vessel(PLAYER),
    b = m.view.vessel(BOT);
  return a && b ? distance(a.ship.at, b.ship.at) : 0;
};

test('a bot holding back returns fire beyond 90 m from Lookout 10, never below it', () => {
  const back = (lookout: number) => {
    let shots = 0;
    for (const seed of SEEDS)
      sail(
        facing(duel(seed, statsWith({ lookout, nerve: 1 })), 110, seed),
        20,
        (k) => {
          const fired = k.view
            .last()
            .shots.filter((s) => s.shooter === BOT).length;
          if (
            fired &&
            debugOf(k).mindOf(BOT)?.mode !== 'fight' &&
            apart(k) > RETURN_FIRE.beyond
          )
            shots += fired;
        },
        firing
      );
    return shots;
  };
  const deaf = back(below('returnFire')),
    keen = back(at('returnFire'));
  console.log(
    `# shots back, holding back, beyond 90 m: Lookout ${below('returnFire')} ${deaf}, Lookout ${at('returnFire')} ${keen}`
  );
  assert.equal(deaf, 0);
  assert.ok(keen > 0);
});

const SPRINTS: ReadonlySet<string> = new Set(['flee', 'storm', 'fight']);

function gusted(
  m: Match,
  seconds: number,
  hands?: (m: Match) => Hands,
  why: (m: Match, id: number) => boolean = () => true
) {
  let on = 0;
  sail(
    m,
    seconds,
    (k) => {
      for (const c of k.view.crews())
        if (c.id !== PLAYER && c.gust.on && why(k, c.id)) on++;
    },
    hands
  );
  return on;
}

const dodging = (m: Match, id: number) => {
  const mind = debugOf(m).mindOf(id);
  return (
    !!mind &&
    !SPRINTS.has(mind.mode) &&
    mind.clock - mind.shotT < MIND.shotFresh
  );
};

test('a bot under fire dodges on Gust from Helm 12, never below it', () => {
  const dodges = (helm: number) =>
    SEEDS.reduce(
      (n, seed) =>
        n +
        gusted(
          facing(duel(seed, statsWith({ helm, lookout: 1 })), 80, seed),
          20,
          firing,
          dodging
        ),
      0
    );
  const stiff = dodges(below('dodge')),
    deft = dodges(at('dodge'));
  console.log(
    `# steps on Gust under fire: Helm ${below('dodge')} ${stiff}, Helm ${at('dodge')} ${deft}`
  );
  assert.equal(stiff, 0);
  assert.ok(deft > 0);
});

function closing(center: Vec3, wait: number, close: number, to: number) {
  const next = { center, radius: to / R };
  return (t: number): Storm => {
    const f = Math.min(1, Math.max(0, (t - wait) / close)),
      done = t >= wait + close;
    return {
      center,
      radius: Math.PI + (to / R - Math.PI) * f,
      next,
      closing: t >= wait && !done,
      secondsToNext: t < wait ? wait - t : done ? Infinity : wait + close - t,
      phase: done ? 1 : 0,
      final: false,
      damage: 0.02,
    };
  };
}

test('a bot outruns the storm on Gust from Stormcraft 10, never below it', () => {
  const storm = closing(OPEN, 10, 30, 150);
  const runs = (stormcraft: number) =>
    SEEDS.reduce(
      (n, seed) =>
        n +
        gusted(
          (() => {
            const m = createMatch(
              setupOf(seed, {
                teams: 2,
                perTeam: 1,
                stats: statsWith({ stormcraft, nerve: 1 }),
              }),
              waters
            );
            debugOf(m).rig({ storm });
            return m;
          })(),
          40
        ),
      0
    );
  const slow = runs(below('outrun')),
    canny = runs(at('outrun'));
  console.log(
    `# steps on Gust before the storm: Stormcraft ${below('outrun')} ${slow}, Stormcraft ${at('outrun')} ${canny}`
  );
  assert.equal(slow, 0);
  assert.ok(canny > 0);
});

test('a bot sets out on loops to claim sea from Territory 8; below, it never does', () => {
  const claims = (territory: number) => {
    let n = 0;
    for (const seed of SEEDS) {
      const m = createMatch(
        setupOf(seed, {
          teams: 2,
          perTeam: 1,
          stats: statsWith({ territory }),
        }),
        waters
      );
      debugOf(m).rig({ storm: () => calm(OPEN) });
      sail(m, 60, (k) => {
        for (const id of [0, 1])
          if (debugOf(k).mindOf(id)?.mode === 'claim') n++;
      });
    }
    return n;
  };
  const meek = claims(below('loops')),
    greedy = claims(at('loops'));
  console.log(
    `# steps claiming: Territory ${below('loops')} ${meek}, Territory ${at('loops')} ${greedy}`
  );
  assert.equal(meek, 0);
  assert.ok(greedy > 0);
});

const stormy =
  (until: number) =>
  (t: number): Storm => {
    const far = scale(OPEN, -1);
    return t < until
      ? {
          ...calm(far),
          radius: 1e-6,
          next: { center: far, radius: 1e-6 },
          damage: 0.1,
        }
      : calm(OPEN);
  };

test('a bot uses a heal while under fire from Nerve 12, never below it', () => {
  const heals = (nerve: number) => {
    let n = 0;
    for (const seed of SEEDS) {
      const m = facing(
        duel(seed, statsWith({ nerve, lookout: 1 }), { storm: stormy(4) }),
        80,
        seed
      );
      let using = false;
      sail(
        m,
        20,
        (k) => {
          if (k.view.time() > 4 && k.view.time() < 4 + 1.5 / 30) {
            const it = k.view.vessel(BOT);
            if (it) debugOf(k).strew(it.ship.at, ['rare', 'rare', 'rare']);
          }
          const mind = debugOf(k).mindOf(BOT),
            now = !!k.view.crew(BOT).hold.using;
          if (now && !using && mind && mind.clock - mind.shotT < 5) n++;
          using = now;
        },
        firing
      );
    }
    return n;
  };
  const timid = heals(below('healUnderFire')),
    bold = heals(at('healUnderFire'));
  console.log(
    `# heals begun under fire: Nerve ${below('healUnderFire')} ${timid}, Nerve ${at('healUnderFire')} ${bold}`
  );
  assert.equal(timid, 0);
  assert.ok(bold > 0);
});
