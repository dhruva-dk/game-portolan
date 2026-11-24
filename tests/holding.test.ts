import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crewOf, type Crew } from '../src/sim/battle.ts';
import { HEALTH, HOLDING } from '../src/sim/handling.ts';
import { calmShare, regain, regainRate } from '../src/sim/holding.ts';
import type { Cap } from '../src/sim/storm.ts';

const WHOLE: Cap = { center: [0, 1, 0], radius: Math.PI };
const QUARTER: Cap = { center: [0, 1, 0], radius: Math.PI / 3 };
const shielded = (id: number, shield: number): Crew => ({
  ...crewOf(id),
  health: { hull: HEALTH.hull, shield },
});

test('its share of the calm: of the whole planet before the storm closes, of what is left inside it after', () => {
  assert.equal(calmShare(0.05, WHOLE), 0.05);
  assert.ok(Math.abs(calmShare(0.05, QUARTER) - 0.2) < 1e-12);
  assert.equal(calmShare(0.3, QUARTER), 1, 'never more than all of it');
  assert.equal(calmShare(0, QUARTER), 0);
});

test('its shield comes back in proportion to its share of the calm, at HOLDING.shield a second from HOLDING.full of it', () => {
  assert.equal(regainRate(0), 0, 'none with no water');
  assert.ok(
    Math.abs(regainRate(HOLDING.full / 2) - HOLDING.shield / 2) < 1e-12,
    'half as fast with half as much'
  );
  assert.equal(regainRate(HOLDING.full), HOLDING.shield);
  assert.equal(regainRate(0.9), HOLDING.shield, 'no faster past it');
  assert.equal(regainRate(HOLDING.full), 4.5);
});

test('every ship afloat regains by its own share wherever it lies, up to its most; the rest do not', () => {
  const dt = 1 / 30,
    crews = [
      shielded(0, 40),
      shielded(1, 40),
      shielded(2, HEALTH.shield - 0.01),
      shielded(3, 40),
    ];
  const full = HOLDING.full / 4,
    shares = [full, full / 2, full, 0],
    held = { share: (id: number) => shares[id] };
  const r = regain(crews, [0, 1, 2], held, QUARTER, dt);
  assert.ok(
    Math.abs(r.crews[0].health.shield - (40 + HOLDING.shield * dt)) < 1e-12
  );
  assert.ok(
    Math.abs(r.crews[1].health.shield - (40 + (HOLDING.shield / 2) * dt)) <
      1e-12
  );
  assert.equal(r.crews[2].health.shield, HEALTH.shield);
  assert.equal(r.crews[3], crews[3], 'not afloat: the same crew');
  assert.deepEqual(
    r.regained.map((k) => k.id),
    [0, 1, 2]
  );
  assert.ok(Math.abs(r.regained[2].shield - 0.01) < 1e-9);
  const none = regain(
    [shielded(0, HEALTH.shield), shielded(3, 10)],
    [0, 3],
    held,
    QUARTER,
    dt
  );
  assert.equal(none.crews[0].health.shield, HEALTH.shield);
  assert.equal(none.crews[1].health.shield, 10);
  assert.deepEqual(none.regained, []);
});
