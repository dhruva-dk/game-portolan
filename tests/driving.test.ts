import { test } from 'node:test';
import assert from 'node:assert/strict';
import { debugOf, type Match } from '../src/sim/engine.ts';
import { STEP } from '../src/sim/fixed.ts';
import { STILL } from '../src/sim/hands.ts';
import { PLAYER } from '../src/sim/match.ts';
import type { DriverStats } from '../src/sim/setup.ts';
import { calm, toEdge, type Storm } from '../src/sim/storm.ts';
import { R, add, along, bearingAt, type Vec3 } from '../src/world/sphere.ts';
import { EVEN_SHIP, statsWith } from './setups.ts';
import { OPEN, crowded, fighting, sail, smallSea } from './small.ts';

const SEEDS = [1, 2, 3];
type Stat = keyof DriverStats;

function compare(
  stat: Stat,
  run: (seed: number, stats: DriverStats) => number
): { best: number; worst: number } {
  const total = (level: number) =>
    SEEDS.reduce((n, seed) => n + run(seed, statsWith({ [stat]: level })), 0);
  return { best: total(20), worst: total(1) };
}

const fleet = (m: Match) => m.result().ships;

test('Gunnery 20 lands a larger share of its shots than Gunnery 1', () => {
  const share = (level: number) => {
    let fired = 0,
      landed = 0;
    for (const seed of SEEDS) {
      const m = crowded(
        smallSea(seed, () => statsWith({ gunnery: level }), { storm: fighting })
      );
      for (const s of fleet(sail(m, 40))) {
        fired += s.shotsFired;
        landed += s.shotsLanded;
      }
    }
    console.log(`# Gunnery ${level}: ${landed} of ${fired} shots land`);
    assert.ok(fired > 0, `Gunnery ${level} never fired`);
    return landed / fired;
  };
  const sharp = share(20),
    green = share(1);
  assert.ok(sharp > green, `Gunnery 20 ${sharp}, Gunnery 1 ${green}`);
});

test('Nerve 20 fights more than Nerve 1: it fires more shots', () => {
  const r = compare('nerve', (seed, stats) =>
    fleet(
      sail(crowded(smallSea(seed, () => stats, { storm: fighting })), 40)
    ).reduce((n, s) => n + s.shotsFired, 0)
  );
  console.log(`# shots fired: Nerve 20 ${r.best}, Nerve 1 ${r.worst}`);
  assert.ok(r.best > r.worst, JSON.stringify(r));
});

test('Territory 20 holds more sea than Territory 1', () => {
  const r = compare('territory', (seed, stats) => {
    const m = sail(
      smallSea(seed, () => stats, { storm: () => calm(OPEN) }),
      180
    );
    return fleet(m).reduce((n, _, id) => n + m.view.share(id), 0);
  });
  console.log(
    `# sea held: Territory 20 ${r.best.toFixed(4)}, Territory 1 ${r.worst.toFixed(4)}`
  );
  assert.ok(r.best > r.worst, JSON.stringify(r));
});

test('Lookout 20 notices ships from farther than Lookout 1: spread out, it is soon firing on them', () => {
  const r = compare('lookout', (seed, stats) =>
    fleet(
      sail(
        crowded(
          smallSea(seed, () => stats, { storm: fighting }),
          120
        ),
        15
      )
    ).reduce((n, s) => n + s.shotsFired, 0)
  );
  console.log(
    `# shots fired in 15 s: Lookout 20 ${r.best}, Lookout 1 ${r.worst}`
  );
  assert.ok(r.best > r.worst, JSON.stringify(r));
});

function closingOn(center: Vec3, wait: number, close: number, to: number) {
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

test('Stormcraft 20 takes less storm damage than Stormcraft 1', () => {
  const storm = closingOn(OPEN, 30, 30, 250);
  const r = compare('stormcraft', (seed, stats) => {
    let taken = 0;
    sail(
      smallSea(seed, () => stats, { storm }),
      90,
      (m) => {
        const s = storm(m.view.time());
        for (const k of m.view.ships())
          if (k.afloat && toEdge(k.at, s) < 0)
            taken += s.damage * EVEN_SHIP.hullPoints * STEP;
      }
    );
    return taken;
  });
  console.log(
    `# storm damage: Stormcraft 20 ${r.best.toFixed(0)}, Stormcraft 1 ${r.worst.toFixed(0)}`
  );
  assert.ok(r.best < r.worst, JSON.stringify(r));
});

test('Helm 20 takes less from a ship that rams it than Helm 1', () => {
  const r = compare('helm', (seed, stats) => {
    let taken = 0;
    for (const from of [0, 1, 2]) {
      const m = smallSea(seed, () => stats, {
        teams: 2,
        player: true,
        storm: () => calm(OPEN),
      });
      const a = (from * 2 * Math.PI) / 3,
        rammer = along(OPEN, bearingAt(OPEN, a), 70).p;
      debugOf(m).atSea({ at: rammer, bearing: a + Math.PI }, [
        { at: OPEN, heading: bearingAt(OPEN, a + Math.PI / 2), lashed: null },
      ]);
      sail(m, 20, undefined, (k) => {
        const me = k.view.vessel(PLAYER),
          it = k.view.vessel(1);
        return me && it
          ? { ...STILL, course: add(it.ship.at, me.ship.at, -1), throttle: 1 }
          : STILL;
      });
      taken += fleet(m)[1].damageTaken;
    }
    return taken;
  });
  console.log(
    `# ram damage taken: Helm 20 ${r.best.toFixed(0)}, Helm 1 ${r.worst.toFixed(0)}`
  );
  assert.ok(r.worst > 0 && r.best < r.worst, JSON.stringify(r));
});
