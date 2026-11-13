// The cannon as the player lays it: along the chase camera's look (play/chase.ts sight), on a ship crossing her bow at
// top speed, N balls at each range, every one flown among the ships as they sail. How many strike her, by its rarity,
// with the reticle on her and with it off her by a thumb's slip; and with a bot's unsteady hand (gunner.ts spreadBy).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChase } from '../src/play/chase.ts';
import { battleOf, crewOf, stepBattle } from '../src/sim/battle.ts';
import { afloat, stepFleet, type Vessel } from '../src/sim/contact.ts';
import { STEP } from '../src/sim/fixed.ts';
import { gunOf, laid, spreadOf } from '../src/sim/gun.ts';
import { spreadBy } from '../src/sim/gunner.ts';
import { GUN, SHIP } from '../src/sim/handling.ts';
import { loosed } from '../src/sim/shot.ts';
import { offSight, type Sight } from '../src/sim/sight.ts';
import { shipAt, turned } from '../src/sim/ship.ts';
import { R, add, along, cross, dot, frameAt, fromLatLon, normalize, scale, type Vec3 } from '../src/world/sphere.ts';

const deep = () => 30, N = 200;
const centre = fromLatLon(0.2, 0.3);

/** The sight from the chase camera over her shoulder, looking at `o`'s hull (half her freeboard up), or with `off`
 *  swung about the eye's up (to port if `off` > 0) until her body stands that many radians off it: a thumb's slip. */
function sightOn(v: Vessel, o: Vessel, off: number): Sight {
  const chase = createChase(() => -30, () => 0);
  const toward = normalize(add(o.ship.at, v.ship.at, -dot(o.ship.at, v.ship.at)));
  chase.reset({ position: scale(v.ship.at, R), forward: toward, up: v.ship.at }, 0);
  const from = chase.sight().from, up = normalize(from);
  const d = normalize(add(scale(o.ship.at, R + GUN.freeboard / 2), from, -1));
  const swung = (a: number): Sight => ({ from, dir: normalize(add(add(scale(d, Math.cos(a)), cross(up, d), Math.sin(a)), up, dot(up, d) * (1 - Math.cos(a)))) });
  let a = 0;
  while (off !== 0 && offSight(swung(a), o.ship)!.angle < Math.abs(off)) a += Math.sign(off) * 1e-4;
  return swung(a);
}

/** The share of N balls from a gun of `rarity` that strike a ship `metres` off crossing at top speed, the reticle `off`
 *  radians from her, the spread `k` times the gun's. */
function rate(rarity: number, metres: number, off = 0, k = 1): number {
  let hits = 0;
  for (let n = 0; n < N; n++) {
    const bearing = 0.3 + n * 0.031, side = n % 2 ? 1 : -1;
    const a = shipAt(centre, frameAt(centre).east), toward = turned(a, bearing);
    const p = along(centre, toward, metres).p, b = shipAt(p, frameAt(p).east);
    let fleet: Vessel[] = [afloat(1, a), afloat(2, { ...b, heading: turned(b, bearing + (side * Math.PI) / 2), speed: SHIP.top })];
    const gun = { ...gunOf('cannon', rarity), fired: n };
    const lay = laid(fleet[0], gun, sightOn(fleet[0], fleet[1], off * side), fleet, 11, deep, spreadOf(gun) * k);
    let battle = { ...battleOf([crewOf(1), crewOf(2)], 0), balls: [loosed(1, 'cannon', lay.from, lay.dirs[0], lay.speed, 1)] }, struck = false;
    for (let i = 0; i < 300 && battle.balls.length && !struck; i++) {
      fleet = stepFleet(fleet, [{ course: null, throttle: 0 }, { course: null, throttle: 1 }], STEP, deep).fleet;
      const r = stepBattle(battle, fleet, fleet.map(() => ({ aim: null, fire: false })), [], STEP, deep);
      battle = r.battle;
      struck = r.strikes.length > 0;
    }
    if (struck) hits++;
  }
  return hits / N;
}

const RANGES = [60, 100, 120, 150, 180];
const row = (f: (m: number) => number) => RANGES.map(f);
const show = (rates: number[]) => rates.map((r, i) => `${RANGES[i]} m ${Math.round(100 * r)}%`).join(', ');

test('the reticle on a crossing ship: a common gun strikes her 9 balls in 10 or more out to 180 m; rarity strikes more', () => {
  const by = [0, 2, 4].map((rarity) => row((m) => rate(rarity, m)));
  by.forEach((r, i) => console.log(`# rarity ${[0, 2, 4][i]}: ${show(r)}`));
  const [common, , legendary] = by;
  for (const r of common) assert.ok(r >= 0.88, show(common));
  for (let i = 0; i < RANGES.length; i++) assert.ok(legendary[i] >= common[i], `${show(common)} / ${show(legendary)}`);
});

test('the assist: a thumb\'s slip (2° off her body) is led onto her; well off her (5°) it is not', () => {
  const slip = row((m) => rate(0, m, 2 * (Math.PI / 180))), wide = row((m) => rate(0, m, 5 * (Math.PI / 180)));
  console.log(`# common, 2° off: ${show(slip)}`);
  console.log(`# common, 5° off: ${show(wide)}`);
  for (let i = 0; i < 4; i++) assert.ok(slip[i] >= 0.85, show(slip));
  for (const r of wide) assert.ok(r <= 0.25, show(wide));
});

test('a bot\'s unsteady hand: a green captain\'s balls strike less often than a sharp one\'s', () => {
  const green = row((m) => rate(0, m, 0, spreadBy(0))), sharp = row((m) => rate(0, m, 0, spreadBy(1)));
  console.log(`# common, a green captain's hand: ${show(green)}`);
  for (let i = 1; i < RANGES.length; i++) assert.ok(green[i] < sharp[i] - 0.15, `${show(green)} / ${show(sharp)}`);
});
