import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newCareer, type Career } from '../../src/career/career.ts';
import { planMatch } from '../../src/career/fleet.ts';
import { SKILL, beatChance, expectedKills, kFactor, rateMatch } from '../../src/career/rating.ts';
import { applyMatch } from '../../src/career/results.ts';
import { hash32, rngFrom } from '../../src/sim/math.ts';
import { syntheticReport } from './synthetic.ts';

// Synthetic players of known true skill, from a beginner to a Legend, each starting a fresh career.
const SKILLS = [0, 300, 600, 900, 1200, 1500, 1800, 2100];

function career(skill: number, seed: number, matches: number, each?: (c: Career, place: number, m: number) => void): Career {
  let c = newCareer(seed);
  const rng = rngFrom(hash32(seed, skill + 7));
  for (let m = 0; m < matches; m++) {
    const report = syntheticReport(rng, planMatch(c), skill);
    c = applyMatch(c, report).career;
    each?.(c, report.ships[0].place, m);
  }
  return c;
}

test('the model: even ships are even, a stronger ship usually wins, and K settles', () => {
  assert.equal(beatChance(500, 500), 0.5);
  assert.ok(beatChance(800, 500) > 0.8 && beatChance(800, 500) < 0.9);
  assert.ok(Math.abs(beatChance(500, 800) + beatChance(800, 500) - 1) < 1e-12);
  assert.ok(expectedKills(1, 20) > 1.5 && expectedKills(20, 20) === 0);
  assert.equal(kFactor(0), SKILL.kHigh);
  assert.ok(kFactor(SKILL.kHalf) < (SKILL.kHigh + SKILL.kLow) / 2 + 1e-9 && kFactor(40) < SKILL.kLow + 1);
  const field = new Array<number>(19).fill(1000 - SKILL.edge);
  assert.ok(rateMatch(1000, 30, field, 1, 3) > 1000, 'a win raises the rating');
  assert.ok(rateMatch(1000, 30, field, 20, 0) < 1000, 'last place lowers it');
  assert.ok(rateMatch(1000, 30, field, 1, 6) > rateMatch(1000, 30, field, 1, 0), 'kills count');
});

test('the rating updates after every match, and finds a synthetic player’s level within about 10 matches', () => {
  const errors: number[] = [];
  for (const skill of SKILLS) {
    for (let seed = 1; seed <= 12; seed++) {
      let moves = 0, was = 0;
      const c = career(skill, seed * 101 + skill, 10, (c) => {
        if (c.rating !== was) moves++;
        was = c.rating;
      });
      assert.ok(moves >= 9, `the rating moved in ${moves} of 10 matches`);
      errors.push(Math.abs(c.rating - skill));
    }
  }
  errors.sort((a, b) => a - b);
  const at = (q: number): number => errors[Math.floor(q * (errors.length - 1))];
  const stats = `median ${at(0.5)}, 80% ${at(0.8)}, 90% ${at(0.9)} rating points off after 10 matches`;
  assert.ok(at(0.5) <= 120 && at(0.8) <= 220 && at(0.9) <= 300, stats);
});

test('settled, the bots put you in the top 5 about half the time and give you a win about 1 match in 6', () => {
  let n = 0, top5 = 0, wins = 0, drift = 0;
  for (const skill of SKILLS) {
    for (let seed = 1; seed <= 6; seed++) {
      career(skill, seed * 977 + skill, 60, (c, place, m) => {
        if (m < 15) return;
        n++;
        if (place <= 5) top5++;
        if (place === 1) wins++;
        drift += c.rating - skill;
      });
    }
  }
  const stats = `top 5 in ${(top5 / n).toFixed(3)}, wins in ${(wins / n).toFixed(3)}, rating off by ${(drift / n).toFixed(0)} on average, over ${n} matches`;
  assert.ok(Math.abs(top5 / n - 0.5) <= 0.05, stats);
  assert.ok(Math.abs(wins / n - 1 / 6) <= 0.035, stats);
  assert.ok(Math.abs(drift / n) <= 60, stats);
});
