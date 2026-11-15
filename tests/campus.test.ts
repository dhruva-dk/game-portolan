// The rookery's buildings (campus/buildings.ts): every building's three levels are three forms of their own, each
// inside the building's footprint (world/rookery.ts FOOTPRINT), as tall as TALL says, flying the crew's flag; each
// level bigger than the last; smoke from the foundry's stacks at every level.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formOf } from '../src/campus/buildings.ts';
import { dressingOf } from '../src/campus/dressing.ts';
import { boundsOf } from '../src/campus/kit.ts';
import { BUILDINGS, FOOTPRINT, TALL } from '../src/world/rookery.ts';

test('each level of each building is a form of its own, inside its footprint, as tall as TALL says', () => {
  for (const b of BUILDINGS) {
    const f = FOOTPRINT[b], forms = ([1, 2, 3] as const).map((l) => formOf(b, l));
    forms.forEach((form, i) => {
      const { min, max } = boundsOf(form), at = `${b} ${i + 1}`;
      assert.ok(min[0] >= -f.half && max[0] <= f.half && min[2] >= -f.back && max[2] <= f.front, `${at}: out of its footprint`);
      assert.ok(Math.abs(form.top - TALL[b][i]) < 0.05, `${at}: ${form.top} m tall, not ${TALL[b][i]}`);
      assert.ok(form.flags.length > 0, `${at}: no flag`);
      assert.ok(form.tone.length === form.position.length / 3 && form.normal.length === form.position.length);
      if (i > 0) {
        // grown: more of it, and a different form, not the last one scaled
        assert.ok(form.position.length > forms[i - 1].position.length * 0.6, `${at}: smaller than the level before`);
        assert.notDeepEqual(form.tone, forms[i - 1].tone, `${at}: the same form as the level before`);
        const [a, z] = [boundsOf(forms[i - 1]), boundsOf(form)];
        assert.ok((z.max[0] - z.min[0]) * (z.max[2] - z.min[2]) * z.max[1] > (a.max[0] - a.min[0]) * (a.max[2] - a.min[2]) * a.max[1], `${at}: no bigger than the level before`);
      }
    });
    if (b === 'foundry') assert.ok(forms.every((form) => form.smoke.length > 0), 'a foundry without smoke');
  }
});

test('each first level\'s yard is dressed inside its footprint, on the land, lower than the building, in few triangles', () => {
  for (const b of BUILDINGS) {
    const f = FOOTPRINT[b], yard = dressingOf(b), { min, max } = boundsOf(yard), tris = yard.position.length / 9;
    assert.ok(tris > 50 && tris < 1200, `${b}: ${tris} triangles in its yard`);
    assert.ok(min[0] >= -f.half && max[0] <= f.half && min[2] >= -f.back && max[2] <= (f.water ? 0.5 : f.front), `${b}: its yard out of its footprint`);
    assert.ok(max[1] < TALL[b][0], `${b}: its yard taller than its first level`);
  }
});
