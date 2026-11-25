import { test } from 'node:test';
import { MATCH_END } from '../src/sim/tuning.ts';
import assert from 'node:assert/strict';
import {
  PLAYER,
  credited,
  startMatch,
  stepMatch,
  switched,
  type MatchState,
  type Sunk,
} from '../src/sim/match.ts';
import { over } from '../src/sim/teams.ts';

const ALONE = Array.from({ length: 10 }, (_, id) => id);

const raceOf = (alive: readonly number[]) => {
  const ended = over(ALONE, alive, 0);
  return {
    teams: ALONE,
    over: ended,
    place: ended && alive.includes(PLAYER) ? 1 : 0,
  };
};

const run = (
  m: MatchState,
  frames: { sinkings: Sunk[]; alive: number[]; share?: number }[],
  dt = 1 / 30
) =>
  frames.reduce((s, f) => stepMatch(s, { ...f, race: raceOf(f.alive) }, dt), m);

test('sunk, it places one behind the ships still afloat, and watches the one that sank it', () => {
  const sinkings: Sunk[] = [
    { id: 4, by: 2, cause: 'shot', gun: 'cannon' },
    { id: 5, by: null, cause: 'storm', gun: null },
  ];
  let m = run(startMatch(), [{ sinkings, alive: [0, 1, 2, 3] }]);
  assert.equal(m.phase, 'fighting');
  sinkings.push({ id: PLAYER, by: 3, cause: 'shot', gun: 'cannon' });
  m = run(m, [{ sinkings, alive: [1, 2, 3] }]);
  assert.deepEqual(
    [m.phase, m.place, m.watch, m.over],
    ['spectating', 4, 3, false]
  );
});

test('sunk by the storm, or by a ship since sunk, it watches the ship afloat that has sunk the most', () => {
  const sinkings: Sunk[] = [
    { id: 4, by: 2, cause: 'shot', gun: 'cannon' },
    { id: 5, by: 2, cause: 'shot', gun: 'cannon' },
    { id: 6, by: 1, cause: 'shot', gun: 'cannon' },
    { id: PLAYER, by: null, cause: 'storm', gun: null },
  ];
  const m = run(startMatch(), [{ sinkings, alive: [1, 2, 3] }]);
  assert.deepEqual([m.place, m.watch], [4, 2]);
});

test('when the ship watched sinks, the camera flies to the one that sank it', () => {
  const sinkings: Sunk[] = [
    { id: PLAYER, by: 2, cause: 'shot', gun: 'cannon' },
  ];
  let m = run(startMatch(), [{ sinkings, alive: [1, 2, 3] }]);
  assert.equal(m.watch, 2);
  m = run(m, [
    {
      sinkings: [...sinkings, { id: 2, by: 3, cause: 'shot', gun: 'cannon' }],
      alive: [1, 3],
    },
  ]);
  assert.deepEqual([m.watch, m.place], [3, 4]);
  m = run(m, [
    {
      sinkings: [
        ...sinkings,
        { id: 2, by: 3, cause: 'shot', gun: 'cannon' },
        { id: 1, by: 3, cause: 'shot', gun: 'cannon' },
      ],
      alive: [3],
    },
  ]);
  assert.equal(m.watch, 3);
});

test('nothing moves on by itself: its end counts its seconds, and the match is over only at its own end', () => {
  const sinkings: Sunk[] = [
    { id: PLAYER, by: 1, cause: 'shot', gun: 'cannon' },
  ];
  const open = run(
    startMatch(),
    Array.from({ length: 600 }, () => ({ sinkings, alive: [1, 2] }))
  );
  assert.deepEqual([open.over, open.phase], [false, 'spectating']);
  assert.ok(Math.abs(open.since - 599 / 30) < 1e-9, `${open.since}`);
  const over = run(
    open,
    Array.from({ length: 300 }, () => ({
      sinkings: [...sinkings, { id: 2, by: 1, cause: 'shot', gun: 'cannon' }],
      alive: [1],
    }))
  );
  assert.deepEqual(
    [over.over, over.phase, over.place],
    [true, 'spectating', 3]
  );
});

test('the last team afloat, it wins: first place, and the match is over', () => {
  const sinkings: Sunk[] = [
    { id: 1, by: PLAYER, cause: 'shot', gun: 'cannon' },
    { id: 2, by: 1, cause: 'shot', gun: 'cannon' },
  ];
  let m = run(startMatch(), [
    { sinkings: sinkings.slice(0, 1), alive: [0, 2] },
  ]);
  assert.equal(m.phase, 'fighting');
  m = run(m, [{ sinkings, alive: [0] }]);
  assert.deepEqual(
    [m.phase, m.place, m.watch, m.over, m.since],
    ['won', 1, PLAYER, true, 0]
  );
  m = run(
    m,
    Array.from({ length: 300 }, () => ({ sinkings, alive: [0] }))
  );
  assert.deepEqual([m.phase, m.over], ['won', true]);
});

test('spectating, she turns to the next ship afloat or the one before, round and round; fighting, not at all', () => {
  const alive = [2, 5, 9];
  const m = run(startMatch(), [
    { sinkings: [{ id: PLAYER, by: 5, cause: 'shot', gun: 'cannon' }], alive },
  ]);
  assert.equal(m.watch, 5);
  assert.equal(switched(m, alive, 1).watch, 9);
  assert.equal(switched(switched(m, alive, 1), alive, 1).watch, 2);
  assert.equal(switched(m, alive, -1).watch, 2);
  assert.equal(switched(switched(m, alive, -1), alive, -1).watch, 9);
  const gone = { ...m, watch: 7 };
  assert.equal(switched(gone, alive, 1).watch, 9);
  assert.equal(switched(gone, alive, -1).watch, 5);
  const fighting = startMatch();
  assert.equal(switched(fighting, alive, 1), fighting);
});

test('its place and how it sank: by a ball, a ram, or the Storm, one behind every ship afloat', () => {
  for (const cause of ['shot', 'ram', 'storm'] as const) {
    const mine: Sunk = {
      id: PLAYER,
      by: cause === 'storm' ? null : 7,
      cause,
      gun: cause === 'shot' ? 'harpoon' : null,
    };
    const m = run(startMatch(), [
      {
        sinkings: [{ id: 3, by: 7, cause: 'shot', gun: 'cannon' }, mine],
        alive: [1, 2, 7],
      },
    ]);
    assert.deepEqual(
      [m.phase, m.place, m.sunk],
      ['spectating', 4, mine],
      cause
    );
  }
});

test('sunk in the same step as others, the sinkings count one by one in the order reported', () => {
  const sinkings: Sunk[] = [
    { id: 4, by: 1, cause: 'shot', gun: 'cannon' },
    { id: PLAYER, by: 1, cause: 'ram', gun: null },
    { id: 5, by: null, cause: 'storm', gun: null },
  ];
  assert.equal(run(startMatch(), [{ sinkings, alive: [1, 2] }]).place, 4);
  const both: Sunk[] = [
    { id: 1, by: PLAYER, cause: 'ram', gun: null },
    { id: PLAYER, by: 1, cause: 'ram', gun: null },
  ];
  const m = run(startMatch(), [{ sinkings: both, alive: [] }]);
  assert.deepEqual([m.phase, m.place], ['won', 1]);
  const first = run(startMatch(), [
    { sinkings: [both[1], both[0]], alive: [] },
  ]);
  assert.deepEqual([first.phase, first.place], ['spectating', 2]);
});

test('its share of the water is what it held afloat, kept once it has sunk and its water drains', () => {
  let m = run(startMatch(), [{ sinkings: [], alive: [0, 1, 2], share: 0.012 }]);
  assert.equal(m.share, 0.012);
  m = run(m, [
    {
      sinkings: [{ id: PLAYER, by: 1, cause: 'shot', gun: 'cannon' }],
      alive: [1, 2],
      share: 0,
    },
  ]);
  assert.deepEqual([m.place, m.share], [3, 0.012]);
  m = run(m, [
    {
      sinkings: [{ id: PLAYER, by: 1, cause: 'shot', gun: 'cannon' }],
      alive: [1, 2],
      share: 0,
    },
  ]);
  assert.equal(m.share, 0.012);
});

test("the Storm's sinking goes to the ship that last struck it, within CREDIT seconds; a ball's or a ram's always", () => {
  assert.equal(credited('storm', null), null);
  assert.equal(credited('storm', { by: 3, ago: MATCH_END.credit - 0.1 }), 3);
  assert.equal(credited('storm', { by: 3, ago: MATCH_END.credit + 0.1 }), null);
  assert.equal(credited('shot', { by: 5, ago: 0 }), 5);
  assert.equal(credited('ram', { by: 5, ago: 60 }), 5);
});
