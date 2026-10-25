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
import { open, planAmber, shoal } from '../../src/render/regions/amberShoals.ts';
import { chartDir } from '../../src/render/regions/kit.ts';
import { planWeeping } from '../../src/render/regions/weepingIsle.ts';
import { BLOCK, groundAt, LAND, LOW, planCoral } from '../../src/render/regions/coralAtolls.ts';
import { DRAFT } from '../../src/sim/world/regions.ts';
import { navigable } from '../../src/sim/world/geography.ts';

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

test("the Amber Shoals: the north-east sill is dry and shut at low water and a passage at high, as its riffles and streaks show; the Sandbar Light's dressing is bedded", () => {
  const plan = planAmber(field), ri = REGIONS.findIndex((r) => r.id === 'amberShoals');
  const sill = chartDir(ri, 23, 32), unit = chartDir(ri, 24, 32).distanceTo(sill);
  assert.ok(heightAt(geo, sill) > -TIDE.amp, 'the sill uncovers at low water');
  assert.ok(!navigable(geo, sill, -TIDE.amp) && navigable(geo, sill, TIDE.amp), 'the sill shuts at low water and passes at high');
  const crest = plan.riffles.filter((r) => r.dir.distanceTo(sill) < 6 * unit && Math.abs(r.floor + 0.45) < 0.2);
  const streaks = plan.streaks.filter((s) => s.dir.distanceTo(sill) < 6 * unit);
  assert.ok(crest.length > 2 && streaks.length > 4, `the sill has ${crest.length} riffles and ${streaks.length} streaks`);
  assert.ok(crest.some((r) => shoal(0 - r.floor) > 0) && crest.every((r) => shoal(TIDE.amp - r.floor) <= 0), 'riffles at half tide, none at high water');
  assert.ok(streaks.every((s) => !open(-TIDE.amp - s.floor)) && streaks.some((s) => open(TIDE.amp - s.floor)), 'streaks run only once the sill passes');
  for (const s of streaks) if (open(TIDE.amp - s.floor)) assert.ok(navigable(geo, s.dir, TIDE.amp), 'a streak runs where the sim is shut');
  for (const b of [...plan.stones, ...plan.blocks, ...plan.drifts]) {
    const h = field.surface(b.dir, -10, S).height;
    assert.ok(b.low < h && b.high > h, `a part floats or is buried: ${b.low.toFixed(2)} < ${h.toFixed(2)} < ${b.high.toFixed(2)}`);
  }
  assert.ok(plan.stones.length > 20 && plan.blocks.length >= 4 && plan.drifts.length >= 3, `${plan.stones.length} stones, ${plan.blocks.length} blocks, ${plan.drifts.length} drifts`);
  assert.ok(plan.tower.up.distanceTo(chartDir(ri, 40, 3)) < 5 * unit, 'the Sandbar Light stands at the landmark');
  assert.ok(plan.ripples.length > 200 && plan.channels.length > 10 && plan.feeding.length > 10, `${plan.ripples.length} ripples, ${plan.channels.length} channels, ${plan.feeding.length} feeding`);
});

test('the Weeping Isle: a fall at every sim cascade and streaks all round, each landing in open water; its rock stands bedded on land the sim knows; the dressing is seated', () => {
  const t0 = performance.now(), plan = planWeeping(field), ri = REGIONS.findIndex((r) => r.id === 'weepingIsle'), ms = performance.now() - t0;
  const surf = (p: THREE.Vector3) => field.surface(p, -10, S).height, wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const missing = REGIONS[ri].cascades.filter((c) => !plan.falls.some((f) => f.sim && Math.abs(wrap(f.bearing - (c.facing * Math.PI) / 180)) < 0.08)).map((c) => c.facing);
  assert.ok(missing.length <= 2, `a fall at every sim cascade with a drop to the sea (missing ${missing.join(', ')})`);
  const bs = plan.falls.map((f) => f.bearing).sort((a, b) => a - b), gaps = bs.map((b, i) => (i ? b - bs[i - 1] : b + 2 * Math.PI - bs[bs.length - 1]));
  assert.ok(plan.falls.length >= 26 && Math.max(...gaps) < 0.8, `${plan.falls.length} falls, widest gap ${Math.max(...gaps).toFixed(2)} rad`);
  for (const f of plan.falls) assert.ok(field.surface(f.foot, 0, S).height <= 0.1 && heightAt(geo, f.foot) < 0, 'every fall lands in open water');
  for (const c of plan.crags) {
    assert.ok(c.footprint.every((p) => heightAt(geo, p) >= -DRAFT + 0.1), `a ${c.kind} stands on ground the sim knows`);
    assert.ok(c.footprint.every((p) => surf(p) > c.base + 0.5) && c.top > c.ground + 1, `a ${c.kind} is bedded below the ground all round`);
  }
  const spire = plan.crags.find((c) => c.kind === 'spire');
  assert.ok(spire && spire.top > 40, `the spire tops ${spire?.top.toFixed(1)} u`);
  assert.ok(plan.crags.filter((c) => c.kind === 'buttress').length >= 6, `${plan.crags.filter((c) => c.kind === 'buttress').length} buttresses break the cliff band`);
  for (const s of [...plan.boulders, ...plan.clumps, ...plan.ferns]) {
    const d = s.at.clone().normalize();
    assert.ok(Math.abs(s.at.length() - R - surf(d)) < 0.05 && heightAt(geo, d) >= -DRAFT + 0.1, 'the dressing is seated on land');
  }
  assert.ok(plan.boulders.length > 100 && plan.clumps.length > 300 && plan.ferns.length > 120, `${plan.boulders.length} boulders, ${plan.clumps.length} clumps, ${plan.ferns.length} ferns`);
  console.log(`weeping: missing ${missing.join(',')}; ${plan.falls.length} falls (${plan.falls.filter((f) => f.sim).length} sim), ${plan.crags.length} crags, ${plan.boulders.length}/${plan.clumps.length}/${plan.ferns.length} dressing, ${plan.dashes.length} dashes, ${plan.puffs.length} puffs, spire ${spire?.top.toFixed(1)}, ${ms.toFixed(0)} ms`);
});

test('the Coral Atolls: each ring has its channels, open at every tide with no reef, surf or foam in them; reef parts only where a hull grounds at low water; every part seated', () => {
  const plan = planCoral(field), ri = REGIONS.findIndex((r) => r.id === 'coralAtolls');
  const gaps = REGIONS[ri].strokes.reduce((n, s) => n + (s.k === 'reef' ? s.gaps.filter((g) => g.crest === null).length : 0), 0);
  assert.equal(plan.channels.filter((c) => c.great).length, 1, 'the Great Lagoon has a single channel');
  assert.equal(plan.channels.length, gaps, 'one channel per open gap in the sim');
  assert.ok(plan.sills.length >= 1, "the north-west atoll's back door is a sill");
  const reef = [...plan.heads, ...plan.branches, ...plan.tables, ...plan.slabs, ...plan.boulders];
  const solids = [...reef, ...plan.stakes, ...plan.hulks];
  for (const c of plan.channels) {
    for (const d of c.line) {
      assert.ok(navigable(geo, d, -TIDE.amp), `channel ${c.bearing}° open at low water`);
      for (const p of solids) assert.ok(p.dir.distanceTo(d) * R > 1, `no reef part in channel ${c.bearing}°`);
      for (const f of [...plan.surf, ...plan.lace]) assert.ok(f.dir.distanceTo(d) * R > 1, `no surf or foam in channel ${c.bearing}°`);
    }
  }
  for (const p of reef) assert.ok(p.sim >= LOW, 'reef only where a hull grounds at low water');
  for (const p of [...plan.heads, ...plan.branches, ...plan.tables]) if (p.sim < BLOCK) assert.ok(p.top <= BLOCK - 0.04, 'reef-front coral under a keel at high water');
  for (const s of [...plan.surf, ...plan.lace]) assert.ok(s.sim >= LOW);
  for (const p of [...plan.palms.flat(), ...plan.pandanus, ...plan.shrubs]) assert.ok(p.sim > LAND, 'trees on land dry at high water');
  for (const p of [...plan.palms.flat(), ...plan.pandanus, ...plan.shrubs, ...plan.drift, ...solids]) {
    const g = groundAt(field, p.dir);
    assert.ok(p.base <= g + 0.02 && p.base >= g - 0.35, `seated: foot ${p.base.toFixed(2)} on ground ${g.toFixed(2)}`);
  }
  const n = { palms: plan.palms.flat().length, pandanus: plan.pandanus.length, shrubs: plan.shrubs.length, reef: reef.length, surf: plan.surf.length, lace: plan.lace.length, stakes: plan.stakes.length, hulks: plan.hulks.length, channels: plan.channels.map((c) => `${c.bearing}°/${c.width.toFixed(1)}`) };
  console.log('coral plan', JSON.stringify(n));
  assert.ok(n.palms >= 50 && n.surf >= 300 && n.stakes >= 8 && n.hulks === 1, JSON.stringify(n));
});
