// The shipwright's geometry: hull lines that are real naval architecture, guns per side as the forms table says,
// and the rigging never clipping through the sails — every rope and spar against every sail's cloth over the full
// range of bracing on both tacks, every canvas, flat to billowing, shivering and slack.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FORM_NAMES, HullForm } from '../../src/render/ships/forms.ts';
import { Rig, trim, type Anchor, type RigState } from '../../src/render/ships/rig.ts';

test('hull lines: sheer, tumblehome, raked stem and sternpost', () => {
  for (const name of FORM_NAMES) {
    const f = new HullForm(name), s = f.s;
    assert.ok(f.sheer(0) > f.sheer(0.45) && f.sheer(1) > f.sheer(0.45), `${name}: the sheer rises to both ends`);
    assert.ok(f.half(0.45, s.rail) < f.half(0.45, s.maxY) * 0.95, `${name}: tumblehome above the greatest breadth`);
    assert.ok(f.zFwd(s.rail) - f.zFwd(-s.draft) > 0.5, `${name}: the stem rakes forward of the forefoot`);
    assert.ok(f.zAft(f.railAft) < f.zAft(-s.draft) - 0.2, `${name}: the sternpost rakes aft`);
  }
});

test('gunports: one, two, three and four a side', () => {
  const guns = { pinnace: 1, caravel: 2, carrack: 3, galleon: 4 };
  for (const name of FORM_NAMES) {
    const f = new HullForm(name), ports = f.gunports();
    assert.equal(ports.length, guns[name], name);
    const [lo, hi] = [f.s.wales[0], f.s.wales[1]];
    for (const p of ports) {
      const k = f.strake(f.uAt(p.z, p.y), p.y);
      assert.ok(k > lo + 0.5 && k < hi - 0.5, `${name}: ports between the wales (strake ${k.toFixed(2)})`);
    }
  }
});

// segment p→q against triangle abc (Möller–Trumbore)
const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _h = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Vector3(), _d = new THREE.Vector3();
function hits(p: THREE.Vector3, q: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): boolean {
  _d.subVectors(q, p);
  _e1.subVectors(b, a);
  _e2.subVectors(c, a);
  _h.crossVectors(_d, _e2);
  const det = _e1.dot(_h);
  if (Math.abs(det) < 1e-12) return false;
  _s.subVectors(p, a);
  const u = _s.dot(_h) / det;
  if (u < 0 || u > 1) return false;
  _q.crossVectors(_s, _e1);
  const v = _d.dot(_q) / det;
  if (v < 0 || u + v > 1) return false;
  const t = _e2.dot(_q) / det;
  return t >= 0 && t <= 1;
}

const NU = 14, NV = 12, END = 0.05, CLEAR = 0.008;
const WINDS = [0.5, 0.9, 1.3, 1.8, 2.3, 2.8, Math.PI].flatMap((w) => [w, -w]);
const CANVAS = ['full', 'plain', 'reefed'] as const;
const MOODS = [{ fill: 0 }, { fill: 0.6 }, { fill: 1 }, { fill: 0.6, shiver: 1 }, { fill: 0.6, slack: 1 }, { fill: 1, set: 0.45 }, { fill: 0.4, set: 0.08 }];

const end = (a: Anchor) => ('hull' in a ? 'hull' : 'yard' in a ? `yard ${a.yard}` : `sail ${a.sail} corner`);

test('the rigging never clips through the sails', () => {
  let states = 0;
  const clips = new Map<string, string>();
  for (const name of FORM_NAMES) {
    const rig = new Rig(name);
    for (const canvas of CANVAS) for (const mood of MOODS) for (const wind of WINDS) for (const time of mood.shiver ? [0, 0.04, 0.09] : [0]) {
      const st: RigState = trim(rig, rig.state(canvas), wind);
      st.sails.forEach((s) => Object.assign(s, { fill: mood.fill, shiver: mood.shiver ?? 0, slack: mood.slack ?? 0 }, s.set ? { set: mood.set ?? 1 } : {}));
      states++;
      // every rope (shortened at the ends where it is made fast) and every spar, as segments with a radius
      const ends = new Float32Array(6 * rig.ropes.length);
      rig.ropeEnds(st, time, ends);
      const segs: { p: THREE.Vector3; q: THREE.Vector3; r: number; what: string; owner: number }[] = [];
      rig.ropes.forEach((rope, i) => {
        if (!rig.ropeShown(rope, st)) return;
        const p = new THREE.Vector3().fromArray(ends, 6 * i), q = new THREE.Vector3().fromArray(ends, 6 * i + 3), len = p.distanceTo(q);
        if (len < 2 * END + 0.01) return;
        const d = q.clone().sub(p).divideScalar(len);
        segs.push({ p: p.addScaledVector(d, END), q: q.addScaledVector(d, -END), r: rope.r, what: `${rope.standing ? 'standing' : 'running'} rope ${i} ${end(rope.a)}→${end(rope.b)}`, owner: -2 });
      });
      for (const sp of rig.spars(st)) segs.push({ p: sp.a, q: sp.b, r: sp.r, what: sp.owner >= 0 ? `yard ${sp.owner}` : 'mast/top/sprit', owner: sp.owner });
      rig.sails.forEach((sail, i) => {
        if (st.sails[i].set <= 0) return;
        const pts: THREE.Vector3[] = [], box = new THREE.Box3();
        for (let j = 0; j <= NV; j++) for (let k = 0; k <= NU; k++) { const p = rig.sailPoint(st, i, Math.min(Math.max(k / NU, 0.002), 0.998), j / NV, time, new THREE.Vector3()); pts.push(p); box.expandByPoint(p); }
        const below = sail.lowers ? sail.yard - 1 : -3;
        for (const sg of segs) {
          const key = `${name}: ${sg.what} through sail ${i} (${sail.kind}, yard ${sail.yard})`;
          if (sg.owner === sail.yard || sg.owner === below || clips.has(key)) continue;
          const pad = sg.r + CLEAR, sb = new THREE.Box3().setFromPoints([sg.p, sg.q]).expandByScalar(pad);
          if (!sb.intersectsBox(box)) continue;
          search: for (let j = 0; j < NV; j++) for (let k = 0; k < NU; k++) {
            const a = pts[j * (NU + 1) + k], b = pts[j * (NU + 1) + k + 1], c = pts[(j + 1) * (NU + 1) + k], d = pts[(j + 1) * (NU + 1) + k + 1];
            const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize().multiplyScalar(pad);
            for (const o of [0, 1, -1]) {
              const [a2, b2, c2, d2] = [a, b, c, d].map((x) => x.clone().addScaledVector(n, o));
              if (hits(sg.p, sg.q, a2, b2, d2) || hits(sg.p, sg.q, a2, d2, c2)) {
                clips.set(key, `${canvas}, wind ${wind.toFixed(2)}, ${JSON.stringify(mood)}, cloth (${(k / NU).toFixed(2)}, ${(j / NV).toFixed(2)})`);
                break search;
              }
            }
          }
        }
      });
    }
  }
  assert.deepEqual([...clips].slice(0, 25).map(([k, v]) => `${k} — ${v}`), []);
  assert.ok(states > 1000, `${states} states`);
});

// ---- part B: emblems, chart silhouettes, levels of detail ---------------------------------------------------------
import { EMBLEMS, emblemAtlas } from '../../src/render/ships/emblems.ts';
import { silhouetteAtlas } from '../../src/render/ships/silhouettes.ts';
import { FLEET_TRIANGLES, LODS, LOD_BUDGET, buildLevel, chooseLods } from '../../src/render/ships/shipwright.ts';

test('the 31 emblems: distinct charges on a roundel, crisp', () => {
  const cell = 128, W = 8 * cell, a = emblemAtlas(cell), charges: Uint8Array[] = [];
  assert.equal(EMBLEMS.length, 31);
  EMBLEMS.forEach((name, k) => {
    const ox = (k % 8) * cell, oy = (3 - Math.floor(k / 8)) * cell, g = new Uint8Array(cell * cell);
    let field = 0, charge = 0, soft = 0;
    for (let j = 0; j < cell; j++) for (let i = 0; i < cell; i++) {
      const o = 4 * ((oy + j) * W + ox + i), c = a[o + 1];
      field += a[o] / 255;
      charge += c / 255;
      g[j * cell + i] = c;
      if (c > 40 && c < 215) soft++;
    }
    const n = cell * cell;
    assert.ok(field / n > 0.6 && field / n < 0.75, `${name}: a roundel (${(field / n).toFixed(2)})`);
    assert.ok(charge / field > 0.12 && charge / field < 0.75, `${name}: the charge covers ${(charge / field).toFixed(2)} of the field`);
    assert.ok(soft / charge < 0.5, `${name}: crisp edges (${(soft / charge).toFixed(2)})`);
    charges.push(g);
  });
  for (let i = 0; i < 31; i++) for (let j = i + 1; j < 31; j++) {
    let d = 0;
    for (let k = 0; k < cell * cell; k++) d += Math.abs(charges[i][k] - charges[j][k]);
    assert.ok(d / (255 * cell * cell) > 0.04, `${EMBLEMS[i]} and ${EMBLEMS[j]} differ (${(d / (255 * cell * cell)).toFixed(3)})`);
  }
});

test('the chart silhouettes: readable by heading from above, bigger with every form', () => {
  const cell = 64, W = 4 * cell, a = silhouetteAtlas(cell);
  const sum = (col: number, row: number, c: number, y0 = 0, y1 = cell) => {
    let s = 0;
    for (let j = y0; j < y1; j++) for (let i = 0; i < cell; i++) s += a[4 * ((row * cell + j) * W + col * cell + i) + c];
    return s / 255;
  };
  const area = FORM_NAMES.map((_, i) => sum(i, 1, 0) + sum(i, 1, 1));
  FORM_NAMES.forEach((name, i) => {
    // the hull's own length in the plan cell, bow up: a pointed bow against a square stern
    const rows = Array.from({ length: cell }, (_, j) => sum(i, 0, 0, j, j + 1)), lit = rows.flatMap((r, j) => (r > 0.5 ? [j] : []));
    const j0 = lit[0], j1 = lit[lit.length - 1] + 1, fifth = Math.max(2, Math.round((j1 - j0) * 0.12));
    const bow = sum(i, 0, 0, j1 - fifth, j1), stern = sum(i, 0, 0, j0, j0 + fifth);
    // or, where the ends are alike, the bowsprit and the head reaching out beyond the stem
    const all = Array.from({ length: cell }, (_, j) => sum(i, 0, 3, j, j + 1)).flatMap((r, j) => (r > 0.5 ? [j] : []));
    const ahead = all[all.length - 1] + 1 - j1, astern = j0 - all[0];
    assert.ok(stern > bow * 1.2 || ahead > astern + 1, `${name}: readable by heading (ends ${stern.toFixed(0)} / ${bow.toFixed(0)}, overhang ${astern} / ${ahead})`);
    if (i) assert.ok(area[i] > area[i - 1], `${name}: bigger in profile than the ${FORM_NAMES[i - 1]} (${area[i].toFixed(0)} / ${area[i - 1].toFixed(0)})`);
  });
});

test('levels of detail: every form within its budget at every level, ten ships within the fleet budget', () => {
  const tris = Object.fromEntries(FORM_NAMES.map((form) => [form, LODS.map((lod) => buildLevel(new Rig(form), lod).triangles)]));
  console.log('triangles hero/mid/far', JSON.stringify(tris));
  for (const form of FORM_NAMES) {
    LODS.forEach((lod, i) => assert.ok(tris[form][i] <= LOD_BUDGET[lod], `${form} ${lod}: ${tris[form][i]} > ${LOD_BUDGET[lod]}`));
    assert.ok(tris[form][0] > tris[form][1] && tris[form][1] > tris[form][2], `${form}: each level lighter than the last`);
  }
  // ten galleons all large on screen: the smallest give way until the fleet fits, the nearest keeps hero detail
  const g = tris.galleon, lv = chooseLods(Array.from({ length: 10 }, (_, i) => 900 - i * 10), Array(10).fill(g), Array(10).fill(0));
  assert.ok(lv.reduce((s, l) => s + g[l], 0) <= FLEET_TRIANGLES, `fleet ${lv.join('')}`);
  assert.equal(lv[0], 0);
  // hysteresis: a hero ship just under the threshold stays hero; a mid ship there does not climb
  assert.deepEqual(chooseLods([220, 220], [g, g], [0, 1]), [0, 1]);
});
