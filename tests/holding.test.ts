import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crewOf, type Crew } from '../src/sim/battle.ts';
import { whole } from '../src/sim/health.ts';
import { calmShare, regain, regainRate } from '../src/sim/holding.ts';
import type { ShipValues } from '../src/sim/setup.ts';
import type { Cap } from '../src/sim/storm.ts';
import { SHIELD } from '../src/sim/tuning.ts';
import { EVEN_SHIP, TENDED, UNTENDED } from './setups.ts';

const WHOLE: Cap = { center: [0, 1, 0], radius: Math.PI };
const QUARTER: Cap = { center: [0, 1, 0], radius: Math.PI / 3 };
const shielded = (
  id: number,
  shield: number,
  values: ShipValues = EVEN_SHIP
): Crew => ({
  ...crewOf(id, values),
  health: { hull: values.hullPoints, shield, most: values.hullPoints },
});

test('its shield starts empty and holds at most its most', () => {
  assert.equal(whole(EVEN_SHIP.hullPoints).shield, SHIELD.start);
  assert.equal(SHIELD.start, 0);
  const r = regain(
    [shielded(0, SHIELD.most - 0.01)],
    [0],
    { share: () => 1 },
    WHOLE,
    1
  );
  assert.equal(r.crews[0].health.shield, SHIELD.most);
});

test('its share of the calm: of the whole planet before the storm closes, of what is left inside it after', () => {
  assert.equal(calmShare(0.05, WHOLE), 0.05);
  assert.ok(Math.abs(calmShare(0.05, QUARTER) - 0.2) < 1e-12);
  assert.equal(calmShare(0.3, QUARTER), 1, 'never more than all of it');
  assert.equal(calmShare(0, QUARTER), 0);
});

test('its shield comes back at its shield rate from SHIELD.held of the calm, in proportion below it, not at all with none', () => {
  const rate = EVEN_SHIP.shieldRate;
  assert.equal(regainRate(0, rate), 0, 'none with no water');
  assert.ok(
    Math.abs(regainRate(SHIELD.held / 2, rate) - rate / 2) < 1e-12,
    'half as fast with half as much'
  );
  assert.equal(regainRate(SHIELD.held, rate), rate);
  assert.equal(regainRate(0.9, rate), rate, 'no faster past it');
  assert.equal(SHIELD.held, 0.01);
});

test('every ship afloat regains by its own share and its own rate wherever it lies, up to its most; the rest do not', () => {
  const dt = 1 / 30,
    rate = EVEN_SHIP.shieldRate,
    crews = [
      shielded(0, 40),
      shielded(1, 40),
      shielded(2, SHIELD.most - 0.01),
      shielded(3, 40),
    ];
  const full = SHIELD.held / 4,
    shares = [full, full / 2, full, 0],
    held = { share: (id: number) => shares[id] };
  const r = regain(crews, [0, 1, 2], held, QUARTER, dt);
  assert.ok(Math.abs(r.crews[0].health.shield - (40 + rate * dt)) < 1e-12);
  assert.ok(
    Math.abs(r.crews[1].health.shield - (40 + (rate / 2) * dt)) < 1e-12
  );
  assert.equal(r.crews[2].health.shield, SHIELD.most);
  assert.equal(r.crews[3], crews[3], 'not afloat: the same crew');
  assert.deepEqual(
    r.regained.map((k) => k.id),
    [0, 1, 2]
  );
  assert.ok(Math.abs(r.regained[2].shield - 0.01) < 1e-9);
  const none = regain(
    [shielded(0, SHIELD.most), shielded(3, 10)],
    [0, 3],
    held,
    QUARTER,
    dt
  );
  assert.equal(none.crews[0].health.shield, SHIELD.most);
  assert.equal(none.crews[1].health.shield, 10);
  assert.deepEqual(none.regained, []);
});

test('its shield rate: the best-tended ship regains its shield faster than the worst-tended one', () => {
  assert.ok(TENDED.shieldRate > UNTENDED.shieldRate);
  const after = (values: ShipValues, share: number) => {
    let crews: Crew[] = [shielded(0, 0, values)];
    for (let t = 0; t < 5; t += 1 / 30)
      crews = regain(crews, [0], { share: () => share }, WHOLE, 1 / 30).crews;
    return crews[0].health.shield;
  };
  assert.ok(after(TENDED, 0.5) > after(UNTENDED, 0.5));
  assert.equal(after(TENDED, 0), 0, 'holding no sea, none');
});
