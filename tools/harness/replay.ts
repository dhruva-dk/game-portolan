// A match of bots set down as a page to watch: run headless on the game's own
// state (as inspect.ts), each ship each second where she was, her heading, her
// mind's mode and her hull, the storm and the calm it closes to next; drawn on
// a chart of the planet unrolled (latitude up, longitude across), the land as
// it is. Her shots are marks: a line from her to where the ball came down,
// coloured by her gun, solid and burst where it struck home, faint where it
// fell in the sea, drawn the second about its coming down. One file, nothing
// fetched: open it in a browser. Play, scrub, zoom (wheel) and pan (drag); a
// ship clicked is followed, her mode told, her persona and her gunner's skill,
// and her fighting so far: shots, those home, the damage she dealt and took,
// the ships she sank.
//   node tools/harness/replay.ts --match 4 [--brain default] [--seconds 300]
//     [--out .cache/harness/replay-4.html] [--planet seed]
//
// A shot comes down where its first ball does, or where one strikes home if
// any does: each ball come down is put to her oldest shot of that gun still in
// the air, each blow struck to her oldest shot still in the air of any gun, or
// her last if none is (a scatter's pellets come down together, a step or two
// apart, and she fires one gun at a time).
//
// Node only (tools/).

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { KINDS } from '../../src/kinds.ts';
import { createMatches } from '../../src/play/setup.ts';
import { createState, debugOf } from '../../src/play/state.ts';
import { BOT } from '../../src/sim/captain.ts';
import { STEP } from '../../src/sim/fixed.ts';
import { SHIP } from '../../src/sim/handling.ts';
import { STORM } from '../../src/sim/storm.ts';
import { along, fromLatLon, R, type Vec3 } from '../../src/world/sphere.ts';
import { flat } from '../../src/world/swell.ts';
import { brainNamed } from './brains.ts';
import { worldOf, type World } from './world.ts';

/** Latitude and longitude of a point, radians (sphere.ts fromLatLon's). */
const latLon = (p: Vec3): [number, number] => [
  Math.asin(Math.max(-1, Math.min(1, p[1]))),
  Math.atan2(-p[2], p[0]),
];
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
/** A time or a damage in tenths, as the page keeps them. */
const tenths = (x: number) => Math.round(x * 10);

const MODES = [
  'roam',
  'fight',
  'flee',
  'storm',
  'heal',
  'loot',
  'claim',
  'hunt',
];
/** A cap as [lat, lon, radius m]. */
const cap = (c: { centre: Vec3; radius: number }) => {
  const [la, lo] = latLon(c.centre);
  return [r4(la), r4(lo), Math.round(c.radius * R)];
};

/** A shot afire: when, by whom, her gun (in KINDS), when and where it came down, and whether it struck home. */
interface Fired {
  t: number;
  shooter: number;
  kind: number;
  land: number;
  at: Vec3 | null;
  home: boolean;
}

/** A shot forgotten as still in the air this long after it was fired (s). */
const AIRBORNE = 15;

/** A replay: match `match` of the planet `planet` (the game's own if not given), every bot sailing `brain`, for `seconds`. */
export interface Spec {
  match: number;
  brain: string;
  seconds: number;
  planet?: number;
}

/**
 * The match, as the page draws it: a frame each second, [id, lat, lon,
 * heading, mode, hull] a ship; each shot as [fired, came down after, shooter,
 * gun, home, lat, lon] (times in tenths of a second; a shot never seen to come
 * down is its first five); each blow struck as [when, by, on, damage, ram]
 * (tenths); each ship sunk as [when (tenths), id, by or -1]; and each bot's
 * persona and her gunner's skill.
 */
export function recorded(spec: Spec) {
  const w = worldOf(spec.planet),
    brain = brainNamed(spec.brain);
  const matches = createMatches(w.seed, w.planet, null, null);
  const state = createState(
    w.planet,
    flat,
    w.waters,
    matches.first,
    () => brain
  );
  let m = matches.deal();
  for (let k = 1; k < spec.match; k++) m = matches.deal();
  state.start(m, false);
  const crew = state.ships().map((k) => {
    const n = debugOf(state).natureOf(k.id);
    return {
      id: k.id,
      persona: n?.persona ?? '',
      skill: Math.round((n?.temper.skill ?? 0) * 100) / 100,
    };
  });
  const frames: {
    t: number;
    ships: number[][];
    storm: number[];
    next: number[];
  }[] = [];
  const fired: Fired[] = [],
    blows: number[][] = [],
    // each ship's shots still in the air, oldest first, and her last
    flying = new Map<number, Fired[]>(),
    last = new Map<number, Fired>();
  /** Shot `f` come down `at` now, struck home or not. */
  const down = (f: Fired, at: Vec3, home: boolean, now: number) => {
    if (f.at === null || (home && !f.home)) {
      f.at = at;
      f.land = now;
    }
    if (home) f.home = true;
    const q = flying.get(f.shooter);
    if (q && q.includes(f))
      flying.set(
        f.shooter,
        q.filter((o) => o !== f)
      );
  };
  const idle = { course: null, throttle: 0 },
    still = { aim: null, fire: false },
    each = Math.round(1 / STEP);
  let steps = 0;
  while (state.time() < spec.seconds) {
    const did = state.advance(idle, still),
      now = state.time();
    for (const s of did.shots) {
      const f: Fired = {
        t: now,
        shooter: s.shooter,
        kind: KINDS.indexOf(s.gun),
        land: now,
        at: null,
        home: false,
      };
      fired.push(f);
      last.set(s.shooter, f);
      flying.set(s.shooter, [
        ...(flying.get(s.shooter) ?? []).filter((o) => now - o.t < AIRBORNE),
        f,
      ]);
    }
    for (const s of did.strikes) {
      blows.push([
        tenths(now),
        s.shooter,
        s.struck,
        tenths(s.damage),
        s.ram ? 1 : 0,
      ]);
      if (s.ram) continue;
      const f = flying.get(s.shooter)?.[0] ?? last.get(s.shooter);
      if (f) down(f, s.at, true, now);
    }
    for (const s of did.splashes) {
      const kind = KINDS.indexOf(s.gun),
        f = flying.get(s.shooter)?.find((o) => o.kind === kind);
      if (f) down(f, s.at, false, now);
    }
    if (++steps % each !== 0) continue;
    const hull = new Map(state.ships().map((k) => [k.id, k.hull]));
    const ships = state.vessels().map((v) => {
      const [la, lo] = latLon(v.ship.at),
        // her heading as a bearing, clockwise from north
        ahead = latLon(along(v.ship.at, v.ship.heading, 5).p),
        dLon = Math.atan2(Math.sin(ahead[1] - lo), Math.cos(ahead[1] - lo));
      const bearing = Math.atan2(dLon * Math.cos(la), ahead[0] - la);
      const mode = debugOf(state).mindOf(v.id)?.mode;
      return [
        v.id,
        r4(la),
        r4(lo),
        Math.round(bearing * 100) / 100,
        mode ? MODES.indexOf(mode) : -1,
        Math.round(hull.get(v.id) ?? 0),
      ];
    });
    const s = m.storm(now);
    frames.push({
      t: Math.round(now),
      ships,
      storm: cap(s),
      next: cap(s.next),
    });
    if (ships.length <= 1) break;
  }
  const marks = fired.map((f) => {
    const head = [tenths(f.t), tenths(f.land - f.t), f.shooter, f.kind];
    if (f.at === null) return [...head, 0];
    const [la, lo] = latLon(f.at);
    return [...head, f.home ? 1 : 0, r4(la), r4(lo)];
  });
  const sunk = state.sinkings().map((k) => [tenths(k.time), k.id, k.by ?? -1]);
  return {
    planet: w.seed,
    match: spec.match,
    seed: m.seed,
    type: m.type.name,
    brain: spec.brain,
    R,
    modes: MODES,
    kinds: KINDS,
    crew,
    frames,
    marks,
    blows,
    sunk,
  };
}

/**
 * The land of `w`: each pixel of a 1440 × 720 chart (some 2.4 m a pixel at the
 * equator), 0 deep water, 1 too shallow for her, 2 land; base64.
 */
function groundOf(w: World) {
  const W = 1440,
    H = 720,
    ground = new Uint8Array(W * H),
    deep = SHIP.draught + BOT.open;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = w.depth(
        fromLatLon(
          (0.5 - (y + 0.5) / H) * Math.PI,
          ((x + 0.5) / W - 0.5) * 2 * Math.PI
        )
      );
      ground[y * W + x] = d >= deep ? 0 : d >= 0 ? 1 : 2;
    }
  return { W, H, ground: Buffer.from(ground).toString('base64') };
}

/** The page of a match recorded and its land. */
const pageOf = (
  data: ReturnType<typeof recorded> & ReturnType<typeof groundOf>
) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bot replay</title>
<style>
:root { --bg:#0e1116; --panel:#161b22; --fg:#e6edf3; --muted:#8b949e; --line:#30363d; }
@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { --bg:#f6f8fa; --panel:#fff; --fg:#1f2328; --muted:#59636e; --line:#d0d7de; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--fg); font:13px/1.4 system-ui, sans-serif; }
header { display:flex; flex-wrap:wrap; gap:8px 16px; align-items:center; padding:8px 16px; background:var(--panel); border-bottom:1px solid var(--line); }
header h1 { font-size:14px; margin:0; font-weight:600; }
#bar { display:flex; gap:8px; align-items:center; flex:1; min-width:240px; }
#scrub { flex:1; }
button { background:var(--bg); color:var(--fg); border:1px solid var(--line); border-radius:6px; padding:3px 10px; cursor:pointer; font:inherit; }
.legend { display:flex; flex-wrap:wrap; gap:4px 12px; padding:6px 16px 0; color:var(--muted); }
.legend:last-of-type { padding-bottom:6px; }
.legend span::before { content:""; display:inline-block; width:9px; height:9px; border-radius:50%; margin-right:5px; background:var(--c); vertical-align:-1px; }
.legend span.gun::before { width:14px; height:3px; border-radius:1px; vertical-align:3px; }
.legend span.miss::before { width:14px; height:0; border-radius:0; border-top:2px dashed var(--c); background:none; opacity:.5; vertical-align:3px; }
#wrap { position:relative; }
canvas { display:block; width:100%; touch-action:none; cursor:grab; }
#info { position:absolute; left:16px; top:8px; background:var(--panel); border:1px solid var(--line); border-radius:6px; padding:6px 10px; display:none; font-variant-numeric:tabular-nums; white-space:pre-line; }
#t { font-variant-numeric:tabular-nums; min-width:72px; color:var(--muted); }
</style></head><body>
<header><h1>Planet ${data.planet} · match ${data.match} · seed ${data.seed} · ${data.type} · ${data.brain}</h1>
<div id="bar"><button id="play">Play</button><input id="scrub" type="range" min="0" value="0">
<span id="t"></span><select id="speed"><option>1</option><option>2</option><option selected>4</option><option>8</option><option>16</option></select></div></header>
<div class="legend" id="modes"></div>
<div class="legend" id="guns"></div>
<div id="wrap"><canvas id="c"></canvas><div id="info"></div></div>
<script>
const D = ${JSON.stringify(data)};
const COLORS = { roam:'#8b949e', fight:'#f85149', flee:'#d29922', storm:'#a371f7', heal:'#3fb950', loot:'#e3b341', claim:'#58a6ff', hunt:'#ff7b72' };
const GUNS = { cannon:'#ffa657', scatter:'#56d4dd', repeater:'#7ee787', harpoon:'#f778ba', mortar:'#ffdf5d' };
function key(to, c, text, cls) { const s = document.createElement('span'); s.style.setProperty('--c', c); s.textContent = text; if (cls) s.className = cls; document.getElementById(to).append(s); }
for (const m of D.modes) key('modes', COLORS[m], m);
key('modes', '#fff', 'player / none');
for (const k of D.kinds) key('guns', GUNS[k], k, 'gun');
key('guns', 'var(--fg)', 'hit (solid, burst)', 'gun'); key('guns', 'var(--fg)', 'miss (faint, ring)', 'miss');
// each bot's persona and skill, by id
const CREW = new Map(D.crew.map((c) => [c.id, c]));
// the ground, as an image
const raw = atob(D.ground), img = new ImageData(D.W, D.H);
const dark = matchMedia('(prefers-color-scheme: dark)').matches;
const tones = dark ? [[22,44,66],[44,80,96],[86,98,72]] : [[150,190,220],[190,214,226],[176,166,128]];
for (let i = 0; i < raw.length; i++) { const t = tones[raw.charCodeAt(i)]; img.data.set([t[0], t[1], t[2], 255], 4 * i); }
const ground = document.createElement('canvas'); ground.width = D.W; ground.height = D.H; ground.getContext('2d').putImageData(img, 0, 0);
const cv = document.getElementById('c'), g = cv.getContext('2d'), info = document.getElementById('info');
let view = { x: 0, y: 0, k: 1 }, follow = null, frame = 0, playing = false, last = 0, acc = 0;
const scrub = document.getElementById('scrub'); scrub.max = D.frames.length - 1;
function size() { const w = cv.clientWidth; cv.width = w * devicePixelRatio; cv.height = Math.round(w / 2) * devicePixelRatio; cv.style.height = Math.round(w / 2) + 'px'; }
// lat/lon (radians) to canvas pixels, and back
const px = (la, lo) => { const s = cv.width / D.W * view.k; return [((lo / (2 * Math.PI) + 0.5) * D.W - view.x) * s, ((0.5 - la / Math.PI) * D.H - view.y) * s]; };
const ll = (x, y) => { const s = cv.width / D.W * view.k; return [(0.5 - (y / s + view.y) / D.H) * Math.PI, ((x / s + view.x) / D.W - 0.5) * 2 * Math.PI]; };
// a point d metres from (la, lo) on bearing b (clockwise from north)
function off(la, lo, b, d) { const a = d / D.R; const la2 = Math.asin(Math.sin(la) * Math.cos(a) + Math.cos(la) * Math.sin(a) * Math.cos(b)); return [la2, lo + Math.atan2(Math.sin(b) * Math.sin(a) * Math.cos(la), Math.cos(a) - Math.sin(la) * Math.sin(la2))]; }
function ring(c, color, dash) {
  g.strokeStyle = color; g.lineWidth = 2 * devicePixelRatio; g.setLineDash(dash ? [6 * devicePixelRatio, 5 * devicePixelRatio] : []);
  g.beginPath(); let prev = null;
  for (let i = 0; i <= 96; i++) { const [la, lo] = off(c[0], c[1], (i / 96) * 2 * Math.PI, c[2]); const p = px(la, lo); if (prev && Math.abs(p[0] - prev[0]) > cv.width / 2) g.moveTo(p[0], p[1]); else if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); prev = p; }
  g.stroke(); g.setLineDash([]);
}
function lerpAngle(a, b, f) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * f; }
// a shot is drawn from half a second before it came down to SHOWN after, fading
const BEFORE = 5, SHOWN = 7;
function shots(T, where, r) {
  for (const m of D.marks) {
    if (m.length < 7) continue;
    const down = m[0] + m[1], since = T - down;
    if (since < -BEFORE || since > SHOWN) continue;
    const home = m[4] === 1, c = GUNS[D.kinds[m[3]]], from = where.get(m[2]);
    const [x, y] = px(m[5], from ? from[2] + lerpAngle(0, m[6] - from[2], 1) : m[6]);
    g.globalAlpha = (home ? 1 : 0.5) * (since > 0 ? 1 - since / SHOWN : 1);
    g.strokeStyle = c; g.lineWidth = (home ? 2 : 1.2) * devicePixelRatio; g.setLineDash(home ? [] : [3 * devicePixelRatio, 3 * devicePixelRatio]);
    if (from) { g.beginPath(); g.moveTo(from[0], from[1]); g.lineTo(x, y); g.stroke(); }
    g.setLineDash([]);
    if (home && since >= 0) { const b = r * (1.2 + since / SHOWN * 1.6); g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, q = i % 2 ? 0.5 : 1; g.moveTo(x + Math.cos(a) * b * 0.3, y + Math.sin(a) * b * 0.3); g.lineTo(x + Math.cos(a) * b * q, y + Math.sin(a) * b * q); } g.stroke(); }
    else if (!home) { g.beginPath(); g.arc(x, y, r * 0.6, 0, 2 * Math.PI); g.stroke(); }
  }
  g.globalAlpha = 1;
}
// her fighting up to T (tenths): shots, those home, damage dealt by her balls and taken from any, ships she sank
function tally(id, T) {
  const t = { shots: 0, home: 0, dealt: 0, taken: 0, kills: 0 };
  for (const m of D.marks) if (m[2] === id && m[0] <= T) { t.shots++; if (m[4] === 1 && m[0] + m[1] <= T) t.home++; }
  for (const b of D.blows) if (b[0] <= T) { if (b[1] === id && !b[4]) t.dealt += b[3]; if (b[2] === id) t.taken += b[3]; }
  for (const k of D.sunk) if (k[0] <= T && k[2] === id && k[1] !== id) t.kills++;
  return t;
}
function inspect(id, mode, hull, T) {
  const c = CREW.get(id), t = tally(id, T);
  info.style.display = 'block';
  info.textContent = 'ship ' + id + ' · ' + (c && c.persona ? c.persona + ' · skill ' + c.skill.toFixed(2) : 'player') + '\\n'
    + (hull === null ? 'sunk' : (mode ?? 'player') + ' · hull ' + hull) + '\\n'
    + 'shots ' + t.shots + ' · hits ' + t.home + ' · kills ' + t.kills + '\\n'
    + 'dealt ' + Math.round(t.dealt / 10) + ' · taken ' + Math.round(t.taken / 10);
}
function draw() {
  const f0 = D.frames[Math.floor(frame)], f1 = D.frames[Math.min(D.frames.length - 1, Math.floor(frame) + 1)], f = frame - Math.floor(frame);
  const T = (f0.t + (f1.t - f0.t) * f) * 10;
  const next = new Map(f1.ships.map((s) => [s[0], s]));
  if (follow !== null) { const s = f0.ships.find((s) => s[0] === follow); if (s) { const s2 = next.get(follow) ?? s; const [x, y] = [((lerpAngle(s[2], s2[2], f) / (2 * Math.PI) + 0.5) * D.W), ((0.5 - (s[1] + (s2[1] - s[1]) * f) / Math.PI) * D.H)]; view.x = x - D.W / view.k / 2; view.y = y - D.H / view.k / 2; } }
  g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false;
  const s = cv.width / D.W * view.k;
  g.drawImage(ground, -view.x * s, -view.y * s, D.W * s, D.H * s);
  ring(f0.storm, '#a371f7', false); ring(f0.next, '#ffffff', true);
  const r = Math.max(2.5, Math.min(7, 2 * view.k)) * devicePixelRatio;
  // each ship now: [x, y, lon]
  const where = new Map(f0.ships.map((a) => { const b = next.get(a[0]) ?? a, lo = lerpAngle(a[2], b[2], f); return [a[0], [...px(a[1] + (b[1] - a[1]) * f, lo), lo]]; }));
  shots(T, where, r);
  for (const a of f0.ships) {
    const b = next.get(a[0]) ?? a, h = lerpAngle(a[3], b[3], f);
    const [x, y] = where.get(a[0]), mode = D.modes[a[4]];
    g.fillStyle = mode ? COLORS[mode] : '#fff';
    g.beginPath(); g.arc(x, y, r, 0, 2 * Math.PI); g.fill();
    g.strokeStyle = g.fillStyle; g.lineWidth = 1.5 * devicePixelRatio; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(h) * r * 2.4, y - Math.cos(h) * r * 2.4); g.stroke();
    if (a[0] === follow) { g.strokeStyle = '#fff'; g.lineWidth = 2 * devicePixelRatio; g.beginPath(); g.arc(x, y, r * 2.2, 0, 2 * Math.PI); g.stroke();
      inspect(a[0], mode, a[5], T); }
  }
  if (follow !== null && !f0.ships.some((s) => s[0] === follow)) inspect(follow, null, null, T);
  document.getElementById('t').textContent = f0.t + ' s · ' + f0.ships.length + ' afloat';
  scrub.value = Math.floor(frame);
}
function tick(now) { if (playing) { acc = (now - last) / 1000 * Number(document.getElementById('speed').value); frame = Math.min(D.frames.length - 1, frame + acc); if (frame >= D.frames.length - 1) toggle(false); } last = now; draw(); requestAnimationFrame(tick); }
function toggle(on) { playing = on ?? !playing; document.getElementById('play').textContent = playing ? 'Pause' : 'Play'; }
document.getElementById('play').onclick = () => toggle();
scrub.oninput = () => { frame = Number(scrub.value); };
cv.addEventListener('wheel', (e) => { e.preventDefault(); const rect = cv.getBoundingClientRect(), mx = (e.clientX - rect.left) * devicePixelRatio, my = (e.clientY - rect.top) * devicePixelRatio; const s0 = cv.width / D.W * view.k; const wx = mx / s0 + view.x, wy = my / s0 + view.y; view.k = Math.max(1, Math.min(64, view.k * Math.exp(-e.deltaY * 0.002))); const s1 = cv.width / D.W * view.k; view.x = wx - mx / s1; view.y = wy - my / s1; }, { passive: false });
let drag = null;
cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', (e) => { if (!drag) return; const s = cv.width / D.W * view.k / devicePixelRatio; if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) { drag.moved = true; follow = null; info.style.display = 'none'; } view.x = drag.vx - (e.clientX - drag.x) / s; view.y = drag.vy - (e.clientY - drag.y) / s; });
cv.addEventListener('pointerup', (e) => { if (drag && !drag.moved) { const rect = cv.getBoundingClientRect(), mx = (e.clientX - rect.left) * devicePixelRatio, my = (e.clientY - rect.top) * devicePixelRatio; let best = null, bd = 14 * devicePixelRatio; const f0 = D.frames[Math.floor(frame)]; for (const a of f0.ships) { const [x, y] = px(a[1], a[2]); const d = Math.hypot(x - mx, y - my); if (d < bd) { bd = d; best = a[0]; } } follow = best; if (best === null) info.style.display = 'none'; else if (view.k < 6) view.k = 6; } drag = null; });
addEventListener('resize', size); size(); requestAnimationFrame(tick);
</script></body></html>
`;

/** The storm's whole course and two minutes more (run.ts's end), s. */
export const END = STORM.phases.reduce((t, p) => t + p.wait + p.close, 0) + 120;

/** The replay of `spec` written to `out`; a line on it. */
export function writeReplay(spec: Spec, out: string): string {
  const data = recorded(spec);
  const page = pageOf({ ...data, ...groundOf(worldOf(spec.planet)) });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, page);
  return `${out}: ${data.frames.length} s, ${data.marks.length} shots, ${(page.length / 1e6).toFixed(2)} MB`;
}

if (import.meta.main) {
  const { values: a } = parseArgs({
    options: {
      match: { type: 'string', default: '1' },
      brain: { type: 'string', default: 'default' },
      seconds: { type: 'string' },
      out: { type: 'string' },
      planet: { type: 'string' },
    },
  });
  console.log(
    writeReplay(
      {
        match: Number(a.match),
        brain: a.brain,
        seconds: a.seconds ? Number(a.seconds) : END,
        planet: a.planet ? Number(a.planet) : undefined,
      },
      a.out ?? `.cache/harness/replay-${a.match}.html`
    )
  );
}
