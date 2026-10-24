// WP16 region placements: the Fjords' falls leave the rock and land in open water; the Crown Light's seracs are bedded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { R } from '../../src/sim/sphere.ts';
import { buildGeography, heightAt } from '../../src/sim/world/geography.ts';
import { REGIONS, TIDE } from '../../src/sim/world/regions.ts';
import { TerrainField, type Surface } from '../../src/render/terrain.ts';
import { arcOf } from '../../src/render/regions/fjords.ts';
import { crownOf } from '../../src/render/regions/iceCrown.ts';
import { BASE, planStacks } from '../../src/render/regions/basaltStacks.ts';
import { planKelp } from '../../src/render/regions/kelpShallows.ts';

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

test("the Kelp Shallows' canopy floats over deep kelp, the Cathedral's kelp reaches the surface, the shore parts keep the tide", () => {
  const plan = planKelp(field), p = new THREE.Vector3();
  const beds = REGIONS.find((r) => r.id === 'kelpShallows')!.strokes.flatMap((s) => (s.k === 'kelp' ? [s] : []));
  assert.ok(plan.floats.length > 200 && plan.stipes.length >= 40 && plan.wrack.length > 30 && plan.boulders.length > 30,
    `${plan.floats.length} canopies, ${plan.stipes.length} stipes, ${plan.wrack.length} wrack, ${plan.boulders.length} boulders, ${plan.pools.length} pools`);
  for (const f of plan.floats) {
    assert.ok(heightAt(geo, f.dir) < -1, 'a canopy over shoal water');
    assert.ok(beds.some((b) => Math.hypot(f.x - b.x, f.y - b.y) < b.r), 'a canopy outside the kelp');
  }
  for (const s of plan.stipes) {
    const depth = R - p.setFromMatrixPosition(s.m).length(), top = p.setFromMatrixColumn(s.m, 1).length();
    assert.ok(depth > 1.3 && Math.abs(top - depth) < 1e-6, 'a towering stipe stops short of the surface or rises above it');
  }
  for (const m of plan.pools) {
    const h = p.setFromMatrixPosition(m).length() - R;
    assert.ok(h > 0 && h < TIDE.amp, 'a tide pool outside the tide');
  }
  for (const m of plan.wrack) assert.ok(p.setFromMatrixPosition(m).length() - R >= TIDE.amp - 0.06, 'wrack below the strand line');
});
