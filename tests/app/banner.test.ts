// The region event's banner: it shows in the region whose event is warned, and outside it within 240 m of its water,
// and not beyond. For every region, points walked out from its landmark across its border are checked: one inside,
// two at most 120 m and 220 m out (shown), and one with none of the region's water within 260 m (not shown). Where two
// events apply, the second banner keeps the one already running beside you.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventOf, eventsOf } from '../../src/app/matchModels.ts';
import { Session } from '../../src/app/session.ts';
import { newCareer } from '../../src/career/career.ts';
import { planMatch } from '../../src/career/fleet.ts';
import type { CosmeticIds } from '../../src/render/actors/view.ts';
import { EVENT_STATE, TICK } from '../../src/sim/state.ts';
import { along, tangentAt } from '../../src/sim/sphere.ts';
import { v3, type V3 } from '../../src/sim/math.ts';
import { LANDMARKS, REGIONS, regionAt } from '../../src/sim/world/index.ts';

const at = (p: V3, bearing: number, d: number): V3 => along(p, tangentAt(p, bearing, v3()), d, v3());

/** The metres from p to the nearest point in region ri, to within a few metres, or Infinity past `reach`. */
function toRegion(p: V3, ri: number, reach: number): number {
  for (let d = 0; d <= reach; d += 5) {
    for (let k = 0; k < 180; k++) if (regionAt(at(p, (k * Math.PI) / 90, d)) === ri) return d;
  }
  return Infinity;
}

test('the banner shows in its region and within 240 m of it, and not further out', (t) => {
  const s = new Session(planMatch(newCareer(5)), {} as CosmeticIds, { seed: 5, skipGale: true }), st = s.state;
  const far: string[] = [];
  assert.ok(st.regionEvents.length === REGIONS.length);
  for (let ri = 0; ri < REGIONS.length; ri++) {
    // this region's event warned, and none other
    st.regionEvents.forEach((e, i) => {
      e.state = i === ri ? EVENT_STATE.warning : EVENT_STATE.waiting;
      e.at = st.tick * TICK + 8;
    });
    const name = REGIONS[ri].id, home = LANDMARKS[ri].pos;
    assert.equal(eventOf(st, home)?.region, name, `${name}: shown at its landmark`);
    // out from the landmark on bearings round the compass, to where the region ends
    let checked = 0;
    for (let k = 0; k < 12 && checked < 3; k++) {
      const b = (k * Math.PI) / 6;
      let edge = -1;
      for (let d = 0; d < 4000; d += 5) if (regionAt(at(home, b, d)) !== ri) { edge = d; break; }
      if (edge < 0) continue;
      for (const out of [120, 220]) {
        const p = at(home, b, edge + out);
        // walked `out` metres past the edge, so the region's water is at most that far (it may come closer elsewhere)
        assert.equal(eventOf(st, p)?.region, name, `${name}: shown ${out} m out on bearing ${k * 30}`);
      }
      // further out along the same bearing, at the first point with none of the region within 260 m
      for (let d = edge + 250; d < edge + 1500; d += 20) {
        const p = at(home, b, d);
        if (toRegion(p, ri, 260) < Infinity) continue;
        const shown = eventOf(st, p);
        assert.notEqual(shown?.region, name, `${name}: not shown ${d - edge} m past its edge on bearing ${k * 30}`);
        far.push(`${name} ${d - edge} m`);
        break;
      }
      checked++;
    }
    assert.ok(checked > 0, `${name}: crossed its border somewhere`);
  }
  t.diagnostic(`clear of the banner past 260 m: ${far.length} points, e.g. ${far.slice(0, 4).join(', ')}`);
  assert.ok(far.length >= REGIONS.length, 'a point beyond reach for every region');
});

test('a warning at home puts an event running next door on the second banner, not out of sight', () => {
  const s = new Session(planMatch(newCareer(5)), {} as CosmeticIds, { seed: 5, skipGale: true }), st = s.state;
  let pairs = 0;
  for (let ri = 0; ri < REGIONS.length && pairs < 4; ri++) {
    // a point 120 m past ri's border, in the region beyond
    const home = LANDMARKS[ri].pos;
    for (let k = 0; k < 12; k++) {
      const b = (k * Math.PI) / 6;
      let edge = -1;
      for (let d = 0; d < 4000; d += 5) if (regionAt(at(home, b, d)) !== ri) { edge = d; break; }
      if (edge < 0) continue;
      const p = at(home, b, edge + 120), here = regionAt(p);
      if (here < 0 || here === ri) continue;
      st.regionEvents.forEach((e, i) => {
        e.state = i === ri ? EVENT_STATE.running : i === here ? EVENT_STATE.warning : EVENT_STATE.waiting;
        e.at = st.tick * TICK + 8;
      });
      const both = eventsOf(st, p), next = REGIONS[ri].id, own = REGIONS[here].id;
      assert.equal(both.event?.region, own, `${own}'s warning on the first banner by ${next}`);
      assert.equal(both.event?.warning, true);
      assert.equal(both.also?.region, next, `${next}'s running event still shown from ${own}`);
      assert.equal(both.also?.warning, false);
      // and once home's event is over, the one next door is back on the first banner
      st.regionEvents[here].state = EVENT_STATE.over;
      assert.equal(eventsOf(st, p).event?.region, next);
      assert.equal(eventsOf(st, p).also, null);
      pairs++;
      break;
    }
  }
  assert.ok(pairs >= 4, `checked ${pairs} borders`);
});
