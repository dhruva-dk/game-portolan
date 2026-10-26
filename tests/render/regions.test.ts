import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cellOf, R, TERRITORY } from '../../src/sim/sphere.ts';
import { buildGeography, heightAt, toChart, ZONE } from '../../src/sim/world/geography.ts';
import { REGIONS, rimAt, TIDE } from '../../src/sim/world/regions.ts';
import { TerrainField, type Surface } from '../../src/render/terrain.ts';
import { arcOf } from '../../src/render/regions/fjords.ts';
import { crownOf } from '../../src/render/regions/iceCrown.ts';
import { BASE, planStacks } from '../../src/render/regions/basaltStacks.ts';
import { planKelp } from '../../src/render/regions/kelpShallows.ts';
import { open, planAmber, shoal } from '../../src/render/regions/amberShoals.ts';
import { chartDir } from '../../src/render/regions/kit.ts';
import { planWeeping } from '../../src/render/regions/weepingIsle.ts';
import { BLOCK, CLEAR, groundAt, LAND, LOW, planCoral } from '../../src/render/regions/coralAtolls.ts';
import { laceAt, openAt, SURF, surfAt } from '../../src/render/sea.ts';
import { BLOCK as SPICE_BLOCK, groundAt as spiceGround, LAND as SPICE_LAND, planSpice, SPICE_SHIPS } from '../../src/render/regions/spiceIsles.ts';
import { DRAFT } from '../../src/sim/world/regions.ts';
import { navigable } from '../../src/sim/world/geography.ts';
import { BLOCK as FIRE_BLOCK, calderaTime, fireOf, flowNear, groundAt as fireGround, LAND as FIRE_LAND, PERIOD, planFire, VOLCANO } from '../../src/render/regions/fireArchipelago.ts';
import { eruption } from '../../src/sim/economy.ts';
import { CALDERA } from '../../src/sim/tables.ts';
import { TICK, type MatchState } from '../../src/sim/state.ts';

const geo = buildGeography(), field = new TerrainField(geo);
const RIMS = (() => {
  const ri = REGIONS.findIndex((r) => r.id === 'coralAtolls'), rad = Math.PI / 180, off = (a: number): number => Math.abs(((a + 540) % 360) - 180);
  return REGIONS[ri].strokes.flatMap((s) => s.k !== 'reef' ? [] : [{ s, at: Array.from({ length: 360 }, (_, b) => {
    const { r, w } = rimAt(s.rim, b), n = b - Math.atan2((rimAt(s.rim, b + 0.5).r - rimAt(s.rim, b - 0.5).r) / rad, r) / rad;
    const on = (k: number, o = 0): THREE.Vector3 => chartDir(ri, s.x + k * Math.sin(b * rad) + o * Math.sin(n * rad), s.y + k * Math.cos(b * rad) + o * Math.cos(n * rad));
    let most = 0;
    for (let k = r - w / 2; k <= r + w / 2 + 3; k += 0.25) most = Math.max(most, surfAt(geo, on(k), 0));
    const edge = on(r + w / 2);
    return {
      b, off: off(n - SURF.from), most, arc: r * rad, pass: s.gaps.some((g) => off(b - g.bearing) * rad * r < g.half + CLEAR + 2),
      open: openAt(geo, edge, on(r + w / 2, 1).sub(edge).normalize(), 0),
    };
  }) }]);
})();
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
    if (p.u.angleTo(plan.arch.at) * R < 10) continue;
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

test('the Coral Atolls: each ring has its channels, open at every tide with no reef, surf or foam across them; reef parts only where a hull grounds at low water; every part seated', () => {
  const plan = planCoral(field), ri = REGIONS.findIndex((r) => r.id === 'coralAtolls');
  const gaps = REGIONS[ri].strokes.reduce((n, s) => n + (s.k === 'reef' ? s.gaps.filter((g) => g.crest === null).length : 0), 0);
  assert.equal(plan.channels.filter((c) => c.great).length, 1, 'the Great Lagoon has a single channel');
  assert.equal(plan.channels.length, gaps, 'one channel per open gap in the sim');
  assert.ok(plan.sills.length >= 1, "the north-west atoll's back door is a sill");
  const reef = [...plan.heads, ...plan.branches, ...plan.tables, ...plan.slabs, ...plan.boulders];
  const solids = [...reef, ...plan.stakes, ...plan.hulks];
  const toLine = (c: (typeof plan.channels)[number], p: THREE.Vector3): number => Math.min(...c.line.slice(1).map((b, i) => {
    const a = c.line[i], ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq()));
    return a.clone().addScaledVector(ab, t).distanceTo(p) * R;
  }));
  const reach = ({ m: { elements: e } }: { m: THREE.Matrix4 }): number => 0.5 * Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[8], e[9], e[10]));
  for (const c of plan.channels) {
    for (const p of solids) assert.ok(toLine(c, p.dir) - (plan.stakes.includes(p) ? 0.05 : reach(p)) >= CLEAR, `no reef part within ${CLEAR} u of channel ${c.bearing}°: ${toLine(c, p.dir).toFixed(2)}`);
    for (const p of plan.spill) assert.ok(toLine(c, p.dir) - reach(p) >= CLEAR, `no breaking white water within ${CLEAR} u of channel ${c.bearing}°: ${toLine(c, p.dir).toFixed(2)}`);
    for (let i = 0; i + 1 < c.line.length; i++) {
      const a = c.line[i], b = c.line[i + 1], across = a.clone().cross(b).normalize();
      for (let s = 0; s <= 1; s += 0.5) {
        const d = a.clone().lerp(b, s).normalize();
        assert.ok(navigable(geo, d, -TIDE.amp), `channel ${c.bearing}° open at low water`);
        for (let w = -CLEAR; w <= CLEAR + 1e-6; w += 0.4) {
          const x = d.clone().addScaledVector(across, w / R).normalize();
          for (const level of [-TIDE.amp, 0, TIDE.amp]) {
            assert.equal(surfAt(geo, x, level), 0, `no surf across channel ${c.bearing}° (${w.toFixed(1)} u off its line, sea ${level})`);
            assert.equal(laceAt(geo, x, level), 0, `no lace across channel ${c.bearing}° (${w.toFixed(1)} u off its line, sea ${level})`);
          }
        }
      }
    }
    for (const side of [-1, 1]) {
      const most = Math.max(...c.line.slice(0, -1).flatMap((at, k) => {
        const across = at.clone().cross(c.line[k + 1]).normalize();
        return Array.from({ length: 41 }, (_, j) => laceAt(geo, at.clone().addScaledVector(across, (side * (CLEAR + 0.25 * j)) / R).normalize(), -TIDE.amp));
      }));
      assert.ok(most > 0.5, `lace frames channel ${c.bearing}° on side ${side}: ${most.toFixed(2)}`);
    }
  }
  for (const p of reef) assert.ok(p.sim >= LOW, 'reef only where a hull grounds at low water');
  for (const p of [...plan.heads, ...plan.branches, ...plan.tables]) if (p.sim < BLOCK) assert.ok(p.top <= BLOCK - 0.04, 'reef-front coral under a keel at high water');
  for (const d of plan.surf) assert.ok(heightAt(geo, d) >= LOW - 0.5, 'surf only over reef that strikes a keel at low water');
  for (const p of plan.spill) assert.ok(surfAt(geo, p.dir, 0) > 0.3 || p.sim <= TIDE.amp * 0.5, 'the break stands only where the surf breaks, and the spent water only over reef awash');
  for (const p of [...plan.palms.flat(), ...plan.pandanus, ...plan.shrubs]) assert.ok(p.sim > LAND, 'trees on land dry at high water');
  for (const p of [...plan.palms.flat(), ...plan.pandanus, ...plan.shrubs, ...plan.drift, ...solids]) {
    const g = groundAt(field, p.dir);
    assert.ok(p.base <= g + 0.02 && p.base >= g - 0.35, `seated: foot ${p.base.toFixed(2)} on ground ${g.toFixed(2)}`);
  }
  const n = { palms: plan.palms.flat().length, pandanus: plan.pandanus.length, shrubs: plan.shrubs.length, reef: reef.length, surf: plan.surf.length, spill: plan.spill.length, stakes: plan.stakes.length, hulks: plan.hulks.length, channels: plan.channels.map((c) => `${c.bearing}°/${c.width.toFixed(1)}`) };
  console.log('coral plan', JSON.stringify(n));
  assert.ok(n.palms >= 100 && n.reef >= 1600 && n.stakes >= 20 && n.hulks === 1, JSON.stringify(n));
  const near = (d: THREE.Vector3): number => Math.max(...Array.from({ length: 33 }, (_, k) => {
    const p = toChart(ri, d), a = (k * Math.PI) / 16, o = k === 32 ? 0 : 1.1;
    return surfAt(geo, chartDir(ri, p.x + o * Math.cos(a), p.y + o * Math.sin(a)), 0);
  }));
  for (const p of plan.spill) assert.ok(near(p.dir) >= 0.3, `white water where the surf does not break (${JSON.stringify(toChart(ri, p.dir))})`);
  const crest = RIMS.reduce((L, { at }) => L + at.reduce((l, a) => l + (a.off <= 60 && !a.pass && a.open > 0.5 && a.most > 0.8 ? a.arc : 0), 0), 0);
  assert.ok(n.spill >= crest / 1.5 && n.surf >= crest, `${n.spill} sheets and ${n.surf} breakers along ${crest.toFixed(0)} u of breaking windward crest`);
});

test('the Spice Isles (S-025 (6c)): the gardens and scrub keep out of every house, and the slope east of the harbour is planted', () => {
  const plan = planSpice(field), ri = REGIONS.findIndex((r) => r.id === 'spiceIsles'), hb = REGIONS[ri].harbours[0];
  const sown = [...plan.garden.flat(), ...plan.scrub];
  for (const g of plan.godowns) {
    const e = g.m.elements, x = new THREE.Vector3(e[0], e[1], e[2]), z = new THREE.Vector3(e[8], e[9], e[10]), sx = x.length(), sz = z.length();
    x.normalize(); z.normalize();
    for (const p of sown) {
      const d = p.at.clone().sub(g.at);
      assert.ok(Math.abs(d.dot(x)) > 1.4 * sx + 0.1 || Math.abs(d.dot(z)) > 0.9 * sz + 0.1, `a plant inside a house: ${d.dot(x).toFixed(2)}, ${d.dot(z).toFixed(2)}`);
    }
  }
  const box = [[11, 6], [20, 6], [20, 14], [11, 14]].map(([x, y]) => chartDir(ri, hb.x + x, hb.y + y));
  const inside = (p: { dir: THREE.Vector3 }): boolean => {
    for (let i = 0; i < 4; i++) if (box[i].clone().cross(box[(i + 1) % 4]).dot(p.dir) * Math.sign(box[0].clone().cross(box[1]).dot(box[2])) < 0) return false;
    return true;
  };
  const n = sown.filter(inside).length;
  console.log('spice east slope plants', n, 'gardens', plan.garden.map((g) => g.length), 'scrub', plan.scrub.length);
  assert.ok(n >= 15, `the east slope planted: ${n}`);
});

test('the Spice Isles: nothing stands in a hull\'s water; trees on land dry at high water; every part seated; the harbour has its quay, godowns and apron', () => {
  const plan = planSpice(field), hb = REGIONS.findIndex((r) => r.id === 'spiceIsles');
  const trees = [...plan.emergents, ...plan.flowers.flat(), ...plan.edge, ...plan.palms, ...plan.garden.flat()], works = [...plan.godowns, ...plan.quays, ...plan.heaps, ...plan.walls, ...plan.stairs];
  for (const p of [...trees, ...works]) assert.ok(p.sim >= SPICE_BLOCK, `no part in a hull's water: sim ${p.sim.toFixed(2)}`);
  for (const p of plan.quays) {
    const e = p.m.elements, face = new THREE.Vector3(e[12], e[13], e[14]).addScaledVector(new THREE.Vector3(e[8], e[9], e[10]).normalize(), 0.56).normalize();
    assert.ok(heightAt(geo, face) >= SPICE_BLOCK, `the quay's face stands where a hull grounds: ${heightAt(geo, face).toFixed(2)}`);
  }
  for (const p of [...plan.godowns, ...plan.heaps, ...plan.emergents, ...plan.walls, ...plan.stairs]) {
    const e = p.m.elements, x = new THREE.Vector3(e[0], e[1], e[2]).normalize(), z = new THREE.Vector3(e[8], e[9], e[10]).normalize();
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const d = p.at.clone().addScaledVector(x, a * p.reach).addScaledVector(z, b * p.reach * 0.6).normalize();
      assert.ok(heightAt(geo, d) >= SPICE_BLOCK, `footprint clear of a hull's water: ${heightAt(geo, d).toFixed(2)}`);
    }
  }
  for (const p of trees) assert.ok(p.sim > SPICE_LAND, 'trees on land dry at high water');
  for (const p of [...trees, ...plan.heaps]) {
    const g = spiceGround(field, p.dir);
    assert.ok(p.base <= g + 0.02 && p.base >= g - 0.35, `seated: foot ${p.base.toFixed(2)} on ground ${g.toFixed(2)}`);
  }
  for (const p of plan.godowns) assert.ok(spiceGround(field, p.dir) <= p.base + 0.39 && spiceGround(field, p.dir) >= p.base - 1.56, 'a godown on its plinth (0.39 u over its foot, sunk 1.56 u)');
  for (const p of plan.quays) assert.ok(spiceGround(field, p.dir) <= p.base + 0.5 && spiceGround(field, p.dir) >= p.base - 1.6, 'the quay bedded');
  const n = { emergents: plan.emergents.length, palms: plan.palms.length, garden: plan.garden.map((g) => g.length), flowers: plan.flowers.map((f) => f.length), edge: plan.edge.length, godowns: plan.godowns.length, quays: plan.quays.length, heaps: plan.heaps.length, berths: plan.berths.length, birds: plan.birds.length, voices: plan.voices.length, region: hb };
  console.log('spice plan', JSON.stringify(n));
  const hbr = REGIONS[hb].harbours[0], anchor = chartDir(hb, hbr.x, hbr.y);
  assert.ok(plan.mole.length >= 10, 'the mole is built');
  for (const p of plan.mole) assert.ok(p.dir.angleTo(anchor) * R >= hbr.r + 1, `the mole clear of the harbour's water: ${(p.dir.angleTo(anchor) * R).toFixed(2)} u`);
  for (const [x, y, tx, ty] of SPICE_SHIPS) {
    const l = Math.hypot(tx - x, ty - y), ux = (tx - x) / l, uy = (ty - y) / l;
    for (const d of [-2.9, 0, 2.9]) for (const b of [-0.5, 0.5]) {
      const h = heightAt(geo, chartDir(hb, x + ux * d - uy * b, y + uy * d + ux * b));
      assert.ok(h < -TIDE.amp - DRAFT, `a staged ship afloat at low water: ${h.toFixed(2)}`);
    }
  }
  assert.ok(n.godowns >= 4 && n.quays >= 30 && n.heaps >= 8 && n.emergents >= 50 && plan.flowers.every((f) => f.length >= 30) && n.edge >= 40, JSON.stringify(n));
});

test('the Coral Atolls (S-027 (7), S-029): every ring breaks along its exposed windward crest, less where a shelf shelters it, beam-on or on its lee; never in a lagoon or open sea', () => {
  const ri = REGIONS.findIndex((r) => r.id === 'coralAtolls'), mean = (xs: { most: number }[]): number => xs.reduce((m, a) => m + a.most, 0) / Math.max(xs.length, 1);
  assert.equal(RIMS.length, 5, 'five rings');
  for (const { s, at } of RIMS) {
    const ring = `the ring at (${s.x}, ${s.y})`, rim = at.filter((a) => !a.pass && a.open > 0.5), exposed = rim.filter((a) => a.off <= 60);
    const sheltered = at.filter((a) => !a.pass && a.open <= 0.5 && a.off <= 60), breaks = exposed.filter((a) => a.most > 0.8);
    const beam = rim.filter((a) => a.off > 75 && a.off < 105), lee = rim.filter((a) => a.off >= 120);
    assert.ok(breaks.length > exposed.length / 2, `${ring}: its exposed windward crest breaks along ${breaks.length} of ${exposed.length}°`);
    assert.ok(Math.max(...exposed.map((a) => a.most)) > 0.95, `${ring}: full where the swell strikes square`);
    if (sheltered.length > 0) assert.ok(mean(sheltered) < mean(exposed), `${ring}: weaker where a shelf shelters its windward crest (${mean(sheltered).toFixed(2)} against ${mean(exposed).toFixed(2)})`);
    for (const [side, xs] of [['beam-on', beam], ['on its lee', lee]] as const) {
      if (xs.length > 0) assert.ok(mean(xs) < mean(exposed), `${ring}: less ${side} (${mean(xs).toFixed(2)}) than to windward (${mean(exposed).toFixed(2)})`);
    }
    assert.equal(surfAt(geo, chartDir(ri, s.x, s.y), 0), 0, `${ring}: its lagoon lies calm`);
  }
  for (let y = -66; y <= 66; y += 1) for (let x = -66; x <= 66; x += 1) {
    const d = chartDir(ri, x, y);
    if (geo.zones[cellOf(TERRITORY, d)] & ZONE.lagoon) assert.equal(surfAt(geo, d, 0), 0, `the lagoon at (${x}, ${y}) lies calm`);
  }
  for (const [x, y] of [[60, -60], [-10, -60], [-70, 0], [0, 60]]) assert.equal(surfAt(geo, chartDir(ri, x, y), 0), 0, `no surf in open sea at (${x}, ${y})`);
});

test('the Fire Archipelago: the volcano stands; each fresh flow runs from the crater into hot water; nothing grows or stands on a fresh flow; nothing in a hull\'s water', () => {
  const plan = planFire(field), ri = REGIONS.findIndex((r) => r.id === 'fireArchipelago'), m = REGIONS[ri].landmark;
  const sim = (x: number, y: number): number => heightAt(geo, chartDir(ri, x, y));
  const at = toChart(ri, plan.crater.dir);
  assert.ok(Math.hypot(at.x - m.x, at.y - m.y) < 1e-6 && plan.crater.rim > 15 && plan.crater.rim - plan.crater.h > 3, `crater at the landmark, rim ${plan.crater.rim.toFixed(1)} over floor ${plan.crater.h.toFixed(1)}`);
  assert.equal(plan.flows.length, 2, 'two lava deltas');
  for (const f of plan.flows) {
    const n = f.x.length - 1;
    assert.ok(Math.hypot(f.x[0] - VOLCANO.x, f.y[0] - VOLCANO.y) < VOLCANO.crater + 1, 'a flow breaches the crater rim');
    assert.ok(sim(f.x[n], f.y[n]) < 0 && geo.zones[cellOf(TERRITORY, chartDir(ri, f.x[n], f.y[n]))] & ZONE.hot, `a flow ends in the sea in hot water (${f.x[n].toFixed(1)}, ${f.y[n].toFixed(1)}: ${sim(f.x[n], f.y[n]).toFixed(2)} u)`);
    assert.ok(f.entry > 20 && sim(f.x[0], f.y[0]) > FIRE_LAND, 'a flow runs over land to its sea entry');
  }
  for (const p of [...plan.snags, ...plan.palms, ...plan.tuff]) {
    const c = toChart(ri, p.dir);
    assert.ok(flowNear(plan.flows, c.x, c.y).d >= 1.05, 'nothing grows or stands on a fresh flow');
    assert.ok(p.sim > FIRE_LAND, 'growth and ledges on land dry at high water');
  }
  for (const p of [...plan.clinker, ...plan.snags, ...plan.palms, ...plan.tuff]) {
    assert.ok(p.sim >= FIRE_BLOCK, 'nothing in a hull\'s water');
    assert.ok(Math.abs(fireGround(field, p.dir) - p.ground) < 1e-6 && p.base <= p.ground, 'every part seated on the drawn ground');
  }
  assert.ok(plan.clinker.length > 60 && plan.snags.length > 10 && plan.palms.length > 10 && plan.tuff.length > 5, JSON.stringify({ clinker: plan.clinker.length, snags: plan.snags.length, palms: plan.palms.length, tuff: plan.tuff.length }));
});

test('the Fire Archipelago: the Caldera erupts on the sim\'s rhythm (economy.ts), never a clock of its own', () => {
  for (const seed of [1, 77, 4242]) {
    let erupted = 0;
    for (let tick = 0; tick < 2 * PERIOD / TICK; tick++) {
      const state = { tick, seed } as unknown as MatchState, t = calderaTime(state), on = eruption(state) >= 0;
      assert.ok(t >= 0 && t < PERIOD);
      assert.equal(t < CALDERA.burst, on, 'the fire is up exactly while the sim rains gold');
      if (on && t >= 0.8) assert.ok(fireOf(t) > 0.99, 'full fire while it erupts');
      if (!on) assert.ok(fireOf(t) < 0.61, 'the afterglow only while it sleeps');
      erupted += on ? 1 : 0;
    }
    assert.ok(Math.abs(erupted * TICK - 2 * CALDERA.burst) <= 2 * TICK, 'it erupts twice in two cycles');
  }
});
