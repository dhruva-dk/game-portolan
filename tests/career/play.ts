// See the career at work, with no game: synthetic players sail synthetic matches through the real career.
//   node tests/career/play.ts [skill=1200] [matches=40] [seed=1]
// Prints each match (place, rating, rank, level, unlocks), then how a spread of synthetic players settle.
import { careerRank, newCareer } from '../../src/career/career.ts';
import { planMatch } from '../../src/career/fleet.ts';
import { rivalsOf } from '../../src/career/record.ts';
import { applyMatch } from '../../src/career/results.ts';
import { hash32, rngFrom } from '../../src/sim/math.ts';
import { syntheticReport } from './synthetic.ts';

const [skill = 1200, matches = 40, seed = 1] = process.argv.slice(2).map(Number);

let c = newCareer(seed);
const rng = rngFrom(hash32(seed, skill));
console.log(`A synthetic player of true skill ${skill}, ${matches} matches:`);
for (let m = 0; m < matches; m++) {
  const plan = planMatch(c), report = syntheticReport(rng, plan, skill), out = applyMatch(c, report), ch = out.changes;
  const lo = Math.min(...plan.fleet.map((f) => f.rating)), hi = Math.max(...plan.fleet.map((f) => f.rating));
  const unlocks = [...ch.unlocked.abilities, ...ch.unlocked.cosmetics];
  console.log(
    `${String(m + 1).padStart(3)}  place ${String(ch.place).padStart(2)}  kills ${ch.kills}  rating ${String(ch.rating.before).padStart(5)} -> ${String(ch.rating.after).padStart(5)}`
    + `  field ${lo}..${hi}  ${ch.rank.after.step.name.padEnd(12)} ${ch.rank.change === 'same' ? '' : ch.rank.change}`
    + `  level ${ch.level.after.level}  +${ch.xp.total} XP${unlocks.length ? '  unlocked ' + unlocks.join(', ') : ''}`,
  );
  c = out.career;
}
console.log(`\nRank ${careerRank(c).step.name}; ${c.wins} wins and ${c.top5} top 5s in ${c.matches}.`);
console.log('Rivals:', rivalsOf(c).slice(0, 5).map((r) => `${r.captain.name} (${r.rank}, ${r.lines[0]})`).join('; '));

console.log('\nSettled rates over matches 16 to 60, by true skill:');
for (const s of [0, 600, 1200, 1800, 2100]) {
  let n = 0, top5 = 0, wins = 0, err = 0;
  for (let k = 1; k <= 8; k++) {
    let d = newCareer(k * 31 + s);
    const r = rngFrom(hash32(k, s));
    for (let m = 0; m < 60; m++) {
      const rep = syntheticReport(r, planMatch(d), s);
      d = applyMatch(d, rep).career;
      if (m === 9) err += Math.abs(d.rating - s) / 8;
      if (m < 15) continue;
      n++;
      top5 += rep.ships[0].place <= 5 ? 1 : 0;
      wins += rep.ships[0].place === 1 ? 1 : 0;
    }
  }
  console.log(`  skill ${String(s).padStart(4)}: top 5 ${(top5 / n).toFixed(2)}, wins ${(wins / n).toFixed(2)}, off by ${err.toFixed(0)} after 10 matches`);
}
