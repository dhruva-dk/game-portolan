// WP16 region placements: the Fjords' falls leave the rock and land in open water; the Crown Light's seracs are bedded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { R } from '../../src/sim/sphere.ts';
import { buildGeography } from '../../src/sim/world/geography.ts';
import { REGIONS } from '../../src/sim/world/regions.ts';
import { TerrainField, type Surface } from '../../src/render/terrain.ts';
import { arcOf } from '../../src/render/regions/fjords.ts';
import { crownOf } from '../../src/render/regions/iceCrown.ts';
import { BASE, planStacks } from '../../src/render/regions/basaltStacks.ts';

const geo = buildGeography(), field = new TerrainField(geo);
const S: Surface = { height: 0, normal: new THREE.Vector3(), up: 1, ground: 0, region: 0 };
const v = (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.y, p.z);

test('the Fjords cascades fall clear of the rock into open water', () => {
  const ri = REGIONS.findIndex((r) => r.id === 'fjords'), cascades = geo.cascades.filter((c) => c.region === ri);
  let drawn = 0;
  for (const c of cascades) {
    const site = v(c.pos), f = v(c.facing), arc = arcOf(field, site, f, 1.2);
    if (!arc) continue;
    drawn++;
    const ground = (d: number) => field.surface(site.clone().multiplyScalar(R).addScaledVector(f, d).normalize(), 0, S).height;
    for (const a of arc) if (a.y > 0.3) assert.ok(ground(a.d) <= a.y - 0.3, `a fall touches the rock at ${a.d.toFixed(2)} u`);
    assert.ok(ground(arc[arc.length - 1].d) <= 0.05, 'a fall ends over land');
  }
  assert.ok(drawn * 2 >= cascades.length, `${drawn} of ${cascades.length} cascades drawn`);
});

test("the Crown Light's seracs are bedded in the skerry", () => {
  const crown = crownOf(field), p = new THREE.Vector3();
  assert.ok(crown.length >= 6, `${crown.length} seracs`);
  for (const m of crown) {
    p.setFromMatrixPosition(m);
    const h = p.length() - R;
    assert.ok(field.surface(p.normalize(), 0, S).height >= h - 1e-6, 'a serac stands above the ground');
  }
});

test("the Basalt Stacks' columns cover the sim's stacks and stand over the rock", () => {
  const ri = REGIONS.findIndex((r) => r.id === 'basaltStacks'), plan = planStacks(field);
  const upright = plan.prisms.filter((p) => p.u.dot(p.o.clone().normalize()) > 0.99999);
  for (const st of geo.stacks.filter((s) => s.region === ri)) {
    const c = v(st.pos), n = v(st.facing), e = new THREE.Vector3().crossVectors(n, c);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * 2 * Math.PI, d = 0.85 * st.r;
      const q = c.clone().multiplyScalar(R).addScaledVector(e, d * Math.cos(a)).addScaledVector(n, d * Math.sin(a)).normalize();
      assert.ok(upright.some((p) => p.u.angleTo(q) * R < p.r), `a gap in a stack of radius ${st.r.toFixed(2)}`);
    }
  }
  for (const p of upright) {
    if (p.u.angleTo(plan.arch.at) * R < 10) continue; // the Arch's piers end inside its entablature
    assert.ok(BASE + p.len >= field.surface(p.u, 0, S).height + 0.25, 'a column top under the rock');
  }
  assert.ok(plan.crest >= 18.4 && plan.colonies.length > 20, `crest ${plan.crest}, ${plan.colonies.length} colonies`);
});
