// The player's pick on the Gale's globe: the ship rides on toward the region picked, leaves the Gale near it and glides
// down into it. A pick already within reach leaves at once and glides the rest of the way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Intents } from '../../src/app/controls.ts';
import { Session } from '../../src/app/session.ts';
import { newCareer } from '../../src/career/career.ts';
import { planMatch } from '../../src/career/fleet.ts';
import { v3 } from '../../src/sim/math.ts';
import { galeSeat } from '../../src/sim/opening.ts';
import { apart } from '../../src/sim/sphere.ts';
import { EVENT, PHASE, PLAYER, TICK } from '../../src/sim/state.ts';
import { CENTRES, REGION_COUNT } from '../../src/sim/world/index.ts';
import type { CosmeticIds } from '../../src/render/actors/view.ts';

const hands: Intents = {
  stick: { x: 0, y: 0 }, look: { x: 0, y: 0 }, idle: 0, throttle: 1,
  fire: false, dive: false, gust: false, reload: false, ability: false, drop: false, take: false, select: -1, swap: -1, hail: -1,
};

function ride(s: Session, seconds: number): void {
  for (let k = 0; k < seconds / TICK; k++) {
    s.control(hands, TICK);
    s.step();
  }
}

/** Picks `region`, then rides until the player's ship is at sea: when it left the Gale, and where it came down. */
function pickAndRide(s: Session, region: number): { left: number; landed: number; off: number } {
  s.pick(region);
  let left = -1, landed = -1, off = 0;
  for (let k = 0; k < 90 / TICK && s.me.phase !== PHASE.sea; k++) {
    ride(s, TICK);
    if (left < 0 && s.me.phase !== PHASE.gale) left = s.seconds;
    for (const e of s.state.events) {
      if (e.kind === EVENT.landing && e.ship === PLAYER) {
        landed = e.item;
        off = apart(s.me.pos, CENTRES[region]);
      }
    }
  }
  return { left, landed, off };
}

const session = (seed: number) => new Session(planMatch(newCareer(seed)), {} as CosmeticIds, { seed });

test('a pick within reach leaves the Gale at once and glides down to it', (t) => {
  for (const [seed, at] of [[3, 5], [11, 5], [3, 15], [29, 15]]) {
    const s = session(seed);
    ride(s, at);
    let near = -1;
    for (let r = 0; r < REGION_COUNT; r++) if (near < 0 || apart(s.me.pos, CENTRES[r]) < apart(s.me.pos, CENTRES[near])) near = r;
    const d = apart(s.me.pos, CENTRES[near]), was = s.seconds;
    assert.ok(d < 600, `seed ${seed}: a region within 600 m (${d.toFixed(0)} m)`);
    const { left, landed, off } = pickAndRide(s, near);
    t.diagnostic(`seed ${seed} at ${at} s: picked ${d.toFixed(0)} m off, came down ${off.toFixed(0)} m from its centre`);
    assert.ok(left - was < 0.2, `seed ${seed}: it leaves the Gale at once`);
    assert.equal(landed, near, `seed ${seed}: it comes down in the region picked`);
    assert.ok(off < 120, `seed ${seed}: near its centre (${off.toFixed(0)} m)`);
  }
});

test('a pick further along the Gale rides on to it, then glides down into it', (t) => {
  const P = v3(), H = v3();
  for (const seed of [3, 11, 41]) {
    const s = session(seed);
    ride(s, 2);
    // the region the Gale passes closest to, that lies well ahead
    let pick = -1, track = Infinity;
    for (let r = 0; r < REGION_COUNT; r++) {
      if (apart(s.me.pos, CENTRES[r]) < 900) continue;
      for (let g = 2; g <= 35; g += 0.5) {
        galeSeat(s.state, PLAYER, g, P, H);
        const d = apart(P, CENTRES[r]);
        if (d < track) [track, pick] = [d, r];
      }
    }
    const { left, landed, off } = pickAndRide(s, pick);
    t.diagnostic(`seed ${seed}: left the Gale at ${left.toFixed(1)} s, came down ${off.toFixed(0)} m from its centre`);
    assert.ok(left > 8, `seed ${seed}: it rides on toward the pick`);
    assert.equal(landed, pick, `seed ${seed}: and comes down in it`);
  }
});
