// The career harness's scripted managers (tools/sim/managers.ts): idle sends nothing; sensible and shrewd send
// the player's own commands, the same for the same state, which the career takes. Over a season of stand-in results
// (the career's tests' kit) each spends as a manager does and keeps its team staffed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../src/career/career.ts';
import type { CareerState } from '../src/career/state.ts';
import { commandsOf, type Manager } from '../tools/sim/managers.ts';
import { founded, must, sailed, toRaceDay } from './career-kit.ts';

/** Every command a manager sends at a stop, applied: how many were taken and refused. */
function acted(
  s: CareerState,
  m: Manager
): { state: CareerState; taken: number; refused: string[] } {
  let state = s,
    taken = 0;
  const refused: string[] = [];
  for (const c of commandsOf(s, m)) {
    const r = apply(state, c, { debug: false });
    if (r.ok) {
      state = r.state;
      taken++;
    } else refused.push(`${c.kind}:${r.reason.code}`);
  }
  return { state, taken, refused };
}

test('idle sends nothing; sensible and shrewd send the same commands for the same state', () => {
  const s = must(founded(), { kind: 'Advance' });
  assert.deepEqual(commandsOf(s, 'idle'), []);
  for (const m of ['sensible', 'shrewd'] as const)
    assert.deepEqual(commandsOf(s, m), commandsOf(s, m));
});

test('over half a season sensible and shrewd act (sponsors, the improvement, a design, staff) and most of it is taken', () => {
  for (const m of ['sensible', 'shrewd'] as const) {
    let s = must(founded(), { kind: 'Advance' }),
      taken = 0;
    const refused: string[] = [];
    for (let round = 0; round < 5; round++) {
      const r = acted(toRaceDay(s), m);
      taken += r.taken;
      refused.push(...r.refused);
      s = sailed(r.state);
    }
    assert.ok(taken >= 5, `${m}: ${taken} taken`);
    assert.ok(
      refused.length <= taken,
      `${m}: ${taken} taken, refused ${refused.join(', ')}`
    );
    const me = s.teams[s.player!.team];
    assert.ok(
      me.sponsors.some((p) => p !== null),
      `${m} signs a sponsor`
    );
    assert.ok(me.improvement.length > 0, `${m} sets the improvement`);
  }
});
