import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Seen } from '../src/sim/bot.ts';
import { offSight } from '../src/sim/sight.ts';
import { along, normalize, type Vec3 } from '../src/world/sphere.ts';
import { standIn } from '../tools/sim/player.ts';
import { runMatch } from '../tools/sim/match.ts';

const at: Vec3 = normalize([0.3, 0.5, 0.8]),
  east: Vec3 = normalize([0.8, 0, -0.3]);

const seen = (id: number, metres: number): Seen => {
  const { p, t } = along(at, east, metres);
  return { id, ship: { at: p, heading: t, speed: 0, turn: 0 } };
};

test('its eye is on its foe’s body, never further off it than a thumb wanders', () => {
  const eye = standIn(7),
    own = seen(1, 0),
    foe = seen(2, 120);
  let most = 0;
  for (let i = 0; i < 600; i++) {
    const s = eye(own, foe),
      off = offSight(s, foe.ship);
    assert.ok(off, 'not behind it');
    most = Math.max(most, off.angle);
  }
  assert.ok(most < 0.04, `${most.toFixed(3)} rad off its body at most`);
  assert.ok(most > 0, 'it wanders');
});

test('its eye is the same for the same seed, and another for another', () => {
  const run = (seed: number) => {
    const eye = standIn(seed),
      own = seen(1, 0),
      foe = seen(2, 90);
    return Array.from({ length: 90 }, () => eye(own, foe).dir);
  };
  assert.deepEqual(run(3), run(3));
  assert.notDeepEqual(run(3), run(4));
});

test('a match with stand-ins runs the same every time, and they fire', () => {
  const spec = {
    kind: 'match',
    match: 1,
    brains: ['default'],
    players: 4,
    seconds: 60,
  } as const;
  const a = runMatch({ ...spec, brains: [...spec.brains] }),
    b = runMatch({ ...spec, brains: [...spec.brains] });
  assert.equal(a.hash, b.hash);
  const players = a.account.ships.filter((s) => s.player);
  assert.equal(players.length, a.account.ships.length / 4);
  assert.ok(
    players.some((s) => Object.keys(s.aim).length > 0),
    'a stand-in fired'
  );
});
