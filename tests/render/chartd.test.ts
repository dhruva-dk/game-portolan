// WP24 part D in Node: a course drawn on the open chart becomes the ShipInput drawn course (valid, recorded, sailed);
// the edge tap closes; reduced motion makes no large camera move (cuts under a veil: no flight, no opening swing, no
// sinking rise, no pull-back) while the full moves exist; the compact chart shows only the rivals in sight; the chart
// content (the waters' edge, the known loot, a vignette for every landmark).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CameraRig, CINE, LIFT_CHART } from '../../src/render/camera.ts';
import { chartShips, groundOf, Net } from '../../src/render/chart.ts';
import { knownLoot, VIGNETTES, watersEdge } from '../../src/render/chartmarks.ts';
import { compactMarks, COMPACT } from '../../src/render/compactchart.ts';
import { CourseDrawing } from '../../src/render/course.ts';
import { idleInput, parseRecording, record, recorder } from '../../src/sim/input.ts';
import { step } from '../../src/sim/match.ts';
import { cellOf, neighbor, R, surfaceDistance, TERRITORY, cellDir } from '../../src/sim/sphere.ts';
import { EVENT, PHASE, SHIPS, type MatchState } from '../../src/sim/state.ts';
import { newSight, survey } from '../../src/sim/visibility.ts';
import { world } from '../sim/vectors.ts';
import { helm, scripted } from './territory.match.ts';

const W = world(), ground = groundOf(W);
const VIEW = { width: 956, height: 440, safe: { top: 0, right: 62, bottom: 20, left: 62 } };
const cam = () => new THREE.PerspectiveCamera(40, VIEW.width / VIEW.height, 0.1, 5000);

test('a course drawn on the chart is the ShipInput drawn course: valid, recorded and sailed; the edge tap closes', () => {
  const { sea, state } = scripted();
  for (let t = 0; t < 600; t++) step(sea, state, helm(state));
  const camera = cam(), net = new Net(), rig = new CameraRig(camera, ground, net);
  rig.layout(VIEW);
  net.layout(net.sheetOf(state.ships[0].pos));
  rig.zoom.set(LIFT_CHART);
  for (let k = 0; k < 3; k++) rig.frame(state, 1, 0, 0, 1 / 60);
  camera.updateMatrixWorld();
  const me = new THREE.Vector3(state.ships[0].pos.x, state.ships[0].pos.y, state.ships[0].pos.z).normalize(), k = net.sheetOf(me);
  const o = me.clone().multiplyScalar(R / me.dot(net.centres[k])).applyMatrix4(net.mats[k]).project(camera);
  const x0 = (o.x * 0.5 + 0.5) * VIEW.width, y0 = (0.5 - o.y * 0.5) * VIEW.height, draw = new CourseDrawing(net);
  draw.down(x0, y0, 0, camera, VIEW);
  for (let s = 1; s <= 24; s++) draw.move(x0 + s * 5, y0 - 18 * Math.sin(s / 6), camera, VIEW);
  const g = draw.up(x0 + 120, y0 - 18 * Math.sin(4), 0.9, camera, VIEW);
  assert.equal(g.kind, 'course');
  if (g.kind !== 'course') return;
  console.log(`course: ${g.cells.length} cells from a 120 px stroke`);
  assert.ok(g.cells.length >= 4 && g.cells.every((c) => Number.isInteger(c) && c >= 0 && c < TERRITORY.cells));
  const first = cellDir(TERRITORY, g.cells[0], new THREE.Vector3());
  assert.ok(surfaceDistance(first, state.ships[0].pos) < 12, 'the course starts at the ship, where the finger went down');
  // the validator: recorded (record throws on a bad field) and read back from untrusted JSON
  const r = recorder();
  record(r, 1, g.input);
  const back = parseRecording(JSON.parse(JSON.stringify(r.recording)));
  assert.deepEqual(back.events.find((e) => e[1] === 'course')?.[2], g.cells);
  // sailed: the ship takes the course and works along it
  step(sea, state, g.input);
  assert.deepEqual(state.ships[0].course, g.cells);
  const end = cellDir(TERRITORY, g.cells[g.cells.length - 1], new THREE.Vector3()), d0 = surfaceDistance(state.ships[0].pos, end);
  for (let t = 0; t < 240; t++) step(sea, state, idleInput());
  const d1 = surfaceDistance(state.ships[0].pos, end);
  console.log(`course sailed: ${d0.toFixed(1)} u → ${d1.toFixed(1)} u from its end, leg ${state.ships[0].leg}`);
  assert.ok(d1 < d0 || state.ships[0].course.length === 0, 'the ship sails toward the course end');
  // taps: the edge band closes the chart, the middle of the net does nothing
  draw.down(8, 200, 2, camera, VIEW);
  assert.equal(draw.up(8, 200, 2.1, camera, VIEW).kind, 'close');
  draw.down(x0, y0, 3, camera, VIEW);
  assert.equal(draw.up(x0 + 2, y0, 3.1, camera, VIEW).kind, 'none');
});

/** Runs the moves (the opening, a loop closing, the chart open and closed, the sinking) and measures the camera. */
function moves(rm: boolean) {
  const { sea, state } = scripted(), camera = cam(), rig = new CameraRig(camera, ground, new Net());
  rig.layout(VIEW);
  rig.reducedMotion = rm;
  const prev = new THREE.Vector3(), ship = new THREE.Vector3(), rel = new THREE.Vector3(), out = { jumps: 0, transit: 0, worstGlide: 0, open: 0, pull: 0, rise: 0, alt0: 0, veil: 0, chartAt: -1, frames: 0 };
  let clock = 0;
  const run = (n: number, sim = false) => {
    for (let k = 0; k < n; k++) {
      if (sim) step(sea, state, helm(state));
      clock += 1 / 60;
      rig.frame(state, 1, clock, 1 / 60, 1 / 60);
      // the camera's own motion: its place relative to the ship (the ship's sailing is not a camera move)
      const at = state.ships[0].pos, alt = camera.position.length() - R;
      rel.subVectors(camera.position, ship.set(at.x, at.y, at.z).normalize().multiplyScalar(R));
      const j = rel.distanceTo(prev) / Math.max(4, alt);
      if (out.frames > 0) { if (j > 0.1) out.jumps++; else out.worstGlide = Math.max(out.worstGlide, j); }
      if (rig.z > 1e-3 && rig.z < 1 - 1e-3) out.transit++;
      out.open = Math.max(out.open, rig.cine.open); out.pull = Math.max(out.pull, rig.cine.pull); out.veil = Math.max(out.veil, rig.zoom.veil);
      if (state.ships[0].phase === PHASE.sunk && rig.z < 0.01) out.rise = Math.max(out.rise, alt - out.alt0);
      if (out.chartAt < 0 && rig.zoom.target > 1.5 && state.ships[0].phase === PHASE.sunk) out.chartAt = out.frames;
      prev.copy(rel);
      out.frames++;
    }
  };
  assert.equal(state.ships[0].phase, PHASE.riding, 'the match opens riding the Great Current');
  run(90, true);
  state.events.push({ ...state.events[0], kind: EVENT.loop, ship: 0, amount: 9000 } as MatchState['events'][number]);
  state.tick++; // a new tick carrying the closed loop (the camera reads each tick's events once)
  run(90);
  rig.zoom.open(); run(120);
  rig.zoom.close(); run(120);
  out.alt0 = camera.position.length() - R;
  state.ships[0].phase = PHASE.sunk;
  run(Math.ceil((CINE.rise + CINE.hold + 0.5) * 60));
  return out;
}

test('reduced motion: no large camera move (cuts under a veil; no flight, swing, rise or pull-back); the full moves exist', () => {
  const rm = moves(true), full = moves(false);
  console.log(`reduced motion: ${rm.jumps} cuts, ${rm.transit} frames in flight, worst glide ${(rm.worstGlide * 100).toFixed(1)} % of altitude a frame, veil ${rm.veil}; full: ${full.transit} frames in flight, opening ${full.open.toFixed(2)}, pull-back ${full.pull.toFixed(2)}, sinking rise ${full.rise.toFixed(1)} u, chart opens at frame ${full.chartAt}`);
  assert.equal(rm.transit, 0, 'no frame between the deck and the chart');
  assert.ok(rm.jumps <= 3, `only the cuts: open, close, the chart after the sinking (${rm.jumps})`);
  assert.ok(rm.worstGlide < 0.05, `otherwise the camera holds by the ship (worst ${(rm.worstGlide * 100).toFixed(1)} % of altitude a frame)`);
  assert.equal(rm.open, 0); assert.equal(rm.pull, 0); assert.ok(rm.rise < 1, 'no sinking rise');
  assert.equal(rm.veil, 1, 'a paper veil covers each cut');
  assert.ok(rm.chartAt > 0, 'the chart still opens on the match after the sinking');
  assert.ok(full.transit > 20 && full.pull > 0.25 && full.rise > 30 && full.chartAt > 0, 'the full moves run');
});

test('the compact chart shows only the rivals in sight, inside its rim, and every rival in sight within reach', () => {
  const { sea, state } = scripted(), sights = Array.from({ length: SHIPS }, newSight);
  let checks = 0, shown = 0;
  for (let tick = 0; tick < 2400; tick++) {
    step(sea, state, helm(state));
    if (tick % 60) continue;
    const sight = survey(sea, state, sights)[0], m = compactMarks(state, W, sight), mask = chartShips(state, sight);
    assert.equal(m.shown & ~mask, 0, `tick ${tick}: only ships in sight`);
    assert.equal(m.shown & 1, 0, 'the player is the centre, not a mark');
    for (const s of m.ships) assert.ok(Math.hypot(s.x, s.y) <= 1 + 1e-9);
    for (let i = 1; i < SHIPS; i++) {
      const near = surfaceDistance(state.ships[i].pos, state.ships[0].pos) < COMPACT.reach * 0.98;
      if (mask & (1 << i) && near && state.ships[i].phase !== PHASE.sunk) assert.ok(m.shown & (1 << i), `tick ${tick}: rival ${i} in sight and in reach is shown`);
    }
    checks++;
    shown += m.ships.length;
  }
  console.log(`compact chart: ${checks} checks, ${shown} rival marks`);
});

test('chart content: the edge of the player\'s waters, the known loot, a vignette for every landmark', () => {
  const { sea, state } = scripted();
  for (let t = 0; t < 1500; t++) step(sea, state, helm(state));
  const edge = watersEdge(state);
  assert.ok(edge.length > 20, `the waters have an edge (${edge.length} cells)`);
  for (let s = 0; s < edge.length; s += 7) {
    const c = cellOf(TERRITORY, edge[s]);
    assert.equal(state.owner[c], 1);
    assert.ok([0, 1, 2, 3].some((k) => state.owner[neighbor(TERRITORY, c, k)] !== 1));
  }
  const loot = knownLoot(sea, state);
  for (const k of loot.finds) assert.equal(state.finds[k], 0, 'only find sites there to take');
  console.log(`chart content: ${edge.length} edge cells, ${loot.finds.length} known find sites, ${loot.chests.length} chests`);
  for (const l of sea.geo.landmarks) assert.ok(VIGNETTES[l.perk], `a vignette for ${l.perk}`);
});

test('S-019: the play-out swings from the wreck to the storm\'s calm and frames it whole with the ships afloat, without a cut', () => {
  const { state } = scripted(), camera = cam(), net = new Net(), rig = new CameraRig(camera, ground, net);
  rig.layout(VIEW);
  const at = state.ships[0].pos, wreck = new THREE.Vector3(at.x, at.y, at.z).normalize();
  // the calm a quarter of the way round the world (the farthest swing a sinking needs), 44 u across its radius
  const e = new THREE.Vector3(0, 1, 0).addScaledVector(wreck, -wreck.y).normalize(), toward = wreck.clone().multiplyScalar(Math.cos(1.6)).addScaledVector(e, Math.sin(1.6));
  const f = new THREE.Vector3().crossVectors(toward, e).normalize(), g = new THREE.Vector3().crossVectors(toward, f), r = 44 / R;
  const ring = Array.from({ length: 32 }, (_, i) => toward.clone().multiplyScalar(Math.cos(r)).addScaledVector(f, Math.cos(i / 5.09) * Math.sin(r)).addScaledVector(g, Math.sin(i / 5.09) * Math.sin(r)));
  const ships = [0.5, 1.9, 3.3].map((a) => toward.clone().multiplyScalar(Math.cos(r * 0.7)).addScaledVector(f, Math.cos(a) * Math.sin(r * 0.7)).addScaledVector(g, Math.sin(a) * Math.sin(r * 0.7)));
  state.ships[0].phase = PHASE.sunk;
  net.layout(net.sheetOf(toward)); // Chart.rootAt: the chart rooted on the calm while on the deck
  // and a straggler far off in the storm, across the net from the calm: left out of the frame
  const far = wreck.clone().negate();
  rig.playOut = { toward, ring, ships: [...ships, far] };
  let worst = 0, frames = 0, clock = 0;
  const prev = new THREE.Vector3();
  for (; frames < 60 * 20 && !(rig.z >= 1 && frames > 60 * 12); frames++) {
    clock += 1 / 60;
    rig.frame(state, 1, clock, 1 / 60, 1 / 60);
    const p = camera.position, alt = Math.max(4, Math.min(p.length() - R, rig.z > 0.6 ? p.dot(net.normal) - R : Infinity));
    assert.ok(Number.isFinite(p.x + p.y + p.z), `finite at frame ${frames}`);
    if (frames > 0) worst = Math.max(worst, p.distanceTo(prev) / alt);
    prev.copy(p);
  }
  assert.ok(rig.z >= 1, 'the chart opens on the play-out');
  // every ring point and ship inside the safe rect; the calm at least 40 % of the safe height across
  const px = (d: THREE.Vector3) => { const q = net.toFlat(d, new THREE.Vector3()).project(camera); return [(q.x + 1) / 2 * VIEW.width, (1 - q.y) / 2 * VIEW.height]; };
  const s = VIEW.safe, pts = [...ring, ...ships].map(px), ys = ring.map((d) => px(d)[1]);
  for (const [x, y] of pts) assert.ok(x >= s.left - 1 && x <= VIEW.width - s.right + 1 && y >= s.top - 1 && y <= VIEW.height - s.bottom + 1, `in the safe rect: ${x.toFixed(0)}, ${y.toFixed(0)}`);
  const across = (Math.max(...ys) - Math.min(...ys)) / (VIEW.height - s.top - s.bottom);
  console.log(`play-out: ${frames} frames, worst step ${(worst * 100).toFixed(1)} % of altitude, the calm ${(across * 100).toFixed(0)} % of the safe height`);
  assert.ok(across >= 0.4, 'the calm is framed large enough to follow');
  assert.ok(worst < 0.1, 'no cut: the eye moves under a tenth of its altitude a frame through the swing');
});
