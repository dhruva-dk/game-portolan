// Territory, ported from the old simulation: water a ship sails through outside its own takes its trail;
// coming home closes the loop and inks everything inside. Cutting a rival's trail costs its hull and pays the
// cutter. Holding a region's landmark gives that region's perk. Ships mend slowly in their own water.
import { hurt } from './harm.ts';
import { PI, dcos, dot, normalize, set, v3, type V3 } from './math.ts';
import { openAt } from './nav.ts';
import { hasPerk } from './perks.ts';
import { AREA_Q, GRID, R, TERRITORY, along, cellDir, cellOf, neighbor, tangentAt } from './sphere.ts';
import { CAUSE, EVENT, PHASE, SHIPS, TICK, emit, type MatchState } from './state.ts';
import { INK, PERKS } from './tables.ts';
import { LANDMARKS } from './world/index.ts';

const M = GRID - 1, FACE_MASK = GRID * GRID - 1, LOG = TERRITORY.log, FACE_SHIFT = 2 * LOG, AREA = TERRITORY.area;
const STRIDE = 0.15;
const TURN = 32;
const HOME_COS = dcos(INK.home / R);
const ORIGIN = v3(), P = v3(), D = v3();

const BLOG = 4, B = 1 << BLOG, BLOG2 = LOG - BLOG, BM = (GRID >> BLOG) - 1, BFACE = 2 * BLOG2, BLOCKS = 6 << BFACE;
const CLEAN = 1, DIRTY = 2, ROW_WORDS = GRID >> 2, BLOCK_WORDS = B >> 2, ROW_EIGHTS = GRID >> 3, BLOCK_EIGHTS = B >> 3;
const BAREA = new Float64Array(1 << BFACE), BAREA_MASK = (1 << BFACE) - 1;
for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) BAREA[((j >> BLOG) << BLOG2) + (i >> BLOG)] += AREA[(j << LOG) + i];
const blockOf = (c: number): number => ((c >> FACE_SHIFT) << BFACE) + ((((c >> LOG) & M) >> BLOG) << BLOG2) + ((c & M) >> BLOG);
const firstCell = (b: number): number => ((b >> BFACE) << FACE_SHIFT) + ((((b >> BLOG2) & BM) << BLOG) << LOG) + ((b & BM) << BLOG);

const BARRIER = -1;
const LABEL = new Int32Array(TERRITORY.cells), SEEN = new Int32Array(TERRITORY.cells);
const SPAN = new Int32Array(TERRITORY.cells);
const BLABEL = new Int32Array(BLOCKS), BSTATE = new Uint8Array(BLOCKS), BSEEN = new Int32Array(BLOCKS), CLASSED = new Int32Array(BLOCKS);
const BHELD = new Uint8Array(BLOCKS);
const LOSS = new Float64Array(SHIPS + 1);
const MARK = new Float64Array(1), MARK_BYTES = new Uint8Array(MARK.buffer), inner: number[] = [];
const CELLS = TERRITORY.cells, NEXT = new Int32Array(CELLS + BLOCKS);
const parent: number[] = [], area: number[] = [], front: number[] = [], back: number[] = [];
let me = 0, owner: Uint8Array = new Uint8Array(0), root = 0, seen = 0, bseen = 0, classed = 0;
let words: Int32Array = new Int32Array(0), eights: Float64Array = new Float64Array(0), mine = 0;


/** Square metres in a held area. */
export const squareMetres = (held: number): number => held / AREA_Q;

export const holdsAt = (state: MatchState, i: number, p: V3): boolean => state.owner[cellOf(TERRITORY, p)] === i + 1;
export const atHome = (state: MatchState, i: number): boolean => holdsAt(state, i, state.ships[i].pos);

/** Metres of open water a landmark's hold has all round it at mean tide: room to sail a loop round it. */
const ROOM = 16;
/** The longest loop round a landmark that fits in a trail before it runs dry, with the way out to it and back. */
const ROUND = 340;
const AROUND = v3(), OUT = v3(), LAST = v3();

function roomy(p: V3): boolean {
  if (!openAt(p)) return false;
  for (let k = 0; k < 12; k++) if (!openAt(along(p, tangentAt(p, (k * PI) / 6, AROUND), ROOM, OUT))) return false;
  return true;
}

/** Whether a loop round `at` through the first water out from it on each bearing is short enough to sail. */
function loopable(at: V3): boolean {
  let length = 0;
  for (let k = 0; k <= 12; k++) {
    tangentAt(at, (k * PI) / 6, AROUND);
    let r = 12;
    while (r <= 150 && !openAt(along(at, AROUND, r, OUT))) r += 6;
    if (r > 150) return false;
    const dx = OUT.x - LAST.x, dy = OUT.y - LAST.y, dz = OUT.z - LAST.z;
    if (k > 0) length += R * Math.sqrt(dx * dx + dy * dy + dz * dz);
    set(LAST, OUT.x, OUT.y, OUT.z);
  }
  return length <= ROUND;
}

/** The landmark's own spot where a loop round it fits in a trail, else the nearest water with room round it. */
function holdNear(at: V3): V3 {
  const out = v3(), t = v3();
  if (loopable(at)) return set(out, at.x, at.y, at.z);
  for (let r = 4; r <= 400; r += 4) {
    for (let k = 0; k < 32; k++) if (roomy(along(at, tangentAt(at, (k * PI) / 16, t), r, out))) return out;
  }
  return set(out, at.x, at.y, at.z);
}

/**
 * Where each landmark is held: whoever owns the territory cell under its hold holds that region's perk. It is the
 * landmark's own spot when a loop round it is short enough to sail before the trail runs dry; otherwise it is the
 * nearest water with room to sail round, so a small loop there holds it, as does a loop round the whole landmark.
 * (Settled overnight in the owner's absence; the owner may change it. Held at their own spots, Thunder Falls, the Great
 * Cherry, the Sandbar Light and the Weeping Isle could only be held by a loop round more land than a trail gets round,
 * and the Gorge by a loop round both its walls.)
 */
let holds: readonly V3[] | null = null, marks: readonly number[] = [];
export function landmarkHold(r: number): V3 {
  if (!holds) {
    holds = LANDMARKS.map((l) => holdNear(l.pos));
    marks = holds.map((h) => cellOf(TERRITORY, h));
  }
  return holds[r];
}
const MARKS = (): readonly number[] => (landmarkHold(0), marks);

/** The ship holding region r's landmark, or -1. */
export const holderOf = (state: MatchState, r: number): number => state.owner[MARKS()[r]] - 1;

/** Recomputes who holds which perk, and tells of the changes. */
export function perks(state: MatchState): void {
  for (let i = 0; i < SHIPS; i++) {
    const ship = state.ships[i];
    let mask = 0;
    const at = MARKS();
    if (ship.phase !== PHASE.sunk) for (let r = 0; r < at.length; r++) if (state.owner[at[r]] === i + 1) mask |= 1 << r;
    const gained = mask & ~ship.perks, lost = ship.perks & ~mask;
    ship.perks = mask;
    for (let r = 0; r < LANDMARKS.length; r++) {
      if ((gained & (1 << r)) !== 0) emit(state, EVENT.perkGained, i, -1, LANDMARKS[r].pos, { item: r });
      if ((lost & (1 << r)) !== 0) emit(state, EVENT.perkLost, i, -1, LANDMARKS[r].pos, { item: r });
    }
  }
}

/** Mending in your own water, once nobody has hit you for a few seconds; twice as fast with Fast Repair. */
export function mendAtHome(state: MatchState): void {
  const quiet = Math.round(INK.quiet / TICK);
  for (let i = 0; i < SHIPS; i++) {
    const ship = state.ships[i];
    if (ship.phase !== PHASE.sea || ship.hull >= 100 || state.tick - ship.lastHit < quiet || !atHome(state, i)) continue;
    ship.hull = Math.min(100, ship.hull + INK.repair * (hasPerk(ship, 'fastRepair') ? PERKS.fastRepair : 1) * TICK);
  }
}

/** Every so often, held water pays rent in coins. */
export function rent(state: MatchState): void {
  state.rentT += TICK;
  if (state.rentT < INK.every) return;
  state.rentT -= INK.every;
  for (let i = 0; i < SHIPS; i++) {
    const ship = state.ships[i];
    if (ship.phase === PHASE.sunk || ship.held <= 0) continue;
    const coins = Math.floor(squareMetres(ship.held) * INK.rent);
    if (coins <= 0) continue;
    ship.coins += coins;
    emit(state, EVENT.coins, i, -1, ship.pos, { amount: coins, item: 1 });
  }
}

export function intruders(state: MatchState, i: number): number {
  let mask = 0;
  for (let j = 0; j < SHIPS; j++) {
    if (j !== i && state.ships[j].phase !== PHASE.sunk && state.owner[cellOf(TERRITORY, state.ships[j].pos)] === i + 1) mask |= 1 << j;
  }
  return mask;
}

export function inkHome(state: MatchState, i: number): number {
  const p = state.ships[i].pos, cells: number[] = [];
  let n = 0, inked = 0;
  SEEN[n++] = cellOf(TERRITORY, p);
  LABEL[SEEN[0]] = 1;
  for (let k = 0; k < n; k++) {
    const c = SEEN[k];
    if (dot(cellDir(TERRITORY, c, D), p) < HOME_COS) continue;
    cells.push(c);
    inked += AREA[c & FACE_MASK];
    own(state, c, i + 1);
    for (let m = 0; m < 4; m++) {
      const x = neighbor(TERRITORY, c, m);
      if (LABEL[x] === 0) {
        LABEL[x] = 1;
        SEEN[n++] = x;
      }
    }
  }
  for (let k = 0; k < n; k++) LABEL[SEEN[k]] = 0;
  emit(state, EVENT.home, i, -1, p, { amount: inked / AREA_Q, cells });
  return inked / AREA_Q;
}

export function swallow(state: MatchState, cells: ArrayLike<number>): void {
  const lost: number[] = [];
  let swallowed = 0;
  for (let k = 0; k < cells.length; k++) {
    const c = cells[k];
    if (state.owner[c] === 0) continue;
    swallowed += AREA[c & FACE_MASK];
    own(state, c, 0);
    lost.push(c);
  }
  if (lost.length > 0) emit(state, EVENT.swallow, -1, -1, ORIGIN, { amount: swallowed / AREA_Q, cells: lost });
}

export function founder(state: MatchState, i: number): void {
  const ship = state.ships[i], mark = i + 1, held = ship.held, freed: number[] = [];
  wash(state, i);
  if (held === 0) return;
  for (let c = 0; c < CELLS; c++) {
    if (state.owner[c] !== mark) continue;
    own(state, c, 0);
    freed.push(c);
  }
  emit(state, EVENT.freed, i, -1, ship.pos, { amount: held / AREA_Q, cells: freed });
}

export function chart(state: MatchState): void {
  for (let i = 0; i < SHIPS; i++) if (state.ships[i].phase === PHASE.sea) lay(state, i);
  pennant(state);
}

function lay(state: MatchState, i: number): void {
  const ship = state.ships[i], a = ship.was, b = ship.pos;
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, dist = R * Math.sqrt(dx * dx + dy * dy + dz * dz);
  const steps = Math.ceil(dist / STRIDE), to = cellOf(TERRITORY, b);
  let from = cellOf(TERRITORY, a);
  for (let s = 1; s <= steps; s++) {
    const f = s / steps, c = s === steps ? to : cellOf(TERRITORY, normalize(set(P, a.x + dx * f, a.y + dy * f, a.z + dz * f)));
    if (c === from) continue;
    if (!adjacent(from, c)) {
      const x = bridge(from, c);
      enter(state, i, from, x);
      from = x;
    }
    enter(state, i, from, c);
    from = c;
  }
}

function adjacent(a: number, b: number): boolean {
  for (let k = 0; k < 4; k++) if (neighbor(TERRITORY, a, k) === b) return true;
  return false;
}

function bridge(a: number, b: number): number {
  for (let k = 0; k < 4; k++) {
    const x = neighbor(TERRITORY, a, k);
    for (let m = 0; m < 4; m++) if (neighbor(TERRITORY, x, m) === b) return x;
  }
  throw new RangeError(`territory: cells ${a} and ${b}, a stride apart, are not neighbours`);
}

function enter(state: MatchState, i: number, from: number, c: number): void {
  const ship = state.ships[i], mark = i + 1, t = state.trail[c];
  if (t !== 0 && t !== mark) breakTrail(state, t - 1, i, c);
  if (state.owner[c] === mark) {
    if (ship.laid.length > 0) closeLoop(state, i);
    return;
  }
  if (ship.laid.length === 0 && state.owner[from] !== mark) return;
  if (state.trail[c] !== mark) {
    ship.laid.push(c);
    state.trail[c] = mark;
  }
  if (ship.laid.length > INK.trail) {
    // too long a trail runs dry
    emit(state, EVENT.cut, i, -1, ship.pos, { amount: 0, cells: ship.laid.slice(), flag: 1 });
    wash(state, i);
  }
}

/** Ship `by` sails across ship j's trail: j's trail is gone, it pays in hull past the shield, and the cutter is paid. */
export function breakTrail(state: MatchState, j: number, by: number, c: number): void {
  const ship = state.ships[j];
  if (ship.laid.length === 0) return;
  const cells = ship.laid.slice(), at = cellDir(TERRITORY, c, v3());
  wash(state, j);
  emit(state, EVENT.cut, j, by, at, { amount: INK.cut, cells });
  hurt(state, j, INK.cut, by, CAUSE.ink, at, 1);
  if (by >= 0) {
    state.ships[by].coins += INK.cutCoins;
    emit(state, EVENT.coins, by, j, at, { amount: INK.cutCoins, item: 2 });
  }
}

function wash(state: MatchState, i: number): void {
  const laid = state.ships[i].laid;
  for (const c of laid) if (state.trail[c] === i + 1) state.trail[c] = 0;
  laid.length = 0;
}

function closeLoop(state: MatchState, i: number): void {
  const ship = state.ships[i], laid = ship.laid;
  me = i + 1;
  owner = state.owner;
  words = new Int32Array(owner.buffer, owner.byteOffset, owner.length >> 2);
  eights = new Float64Array(owner.buffer, owner.byteOffset, owner.length >> 3);
  mine = Math.imul(me, 0x01010101);
  seen = bseen = classed = 0;
  parent.length = area.length = front.length = back.length = 0;
  for (const c of laid) {
    LABEL[c] = BARRIER;
    const b = blockOf(c);
    if (BSTATE[b] === 0) {
      BSTATE[b] = DIRTY;
      CLASSED[classed++] = b;
    }
  }
  for (const c of laid) {
    for (let k = 0; k < 4; k++) {
      const n = step(c, k), b = blockOf(n);
      if (classify(b) === CLEAN ? BLABEL[b] !== 0 : !open(n)) continue;
      root = adjoining(n);
      if (root < 0) {
        root = parent.length;
        parent.push(root);
        area.push(0);
        front.push(-1);
        back.push(-1);
      }
      dispatch(n);
    }
  }
  const outer = flood();
  for (let r = 0; r < parent.length; r++) inner[r] = find(r) === outer ? 0 : 1;
  let gained = 0;
  LOSS.fill(0);
  for (const c of laid) {
    if (LABEL[c] !== BARRIER) continue;
    LABEL[c] = 0;
    gained += claim(c);
  }
  for (let k = 0; k < seen; k++) {
    const lo = SEEN[k], hi = SPAN[lo], won = inner[LABEL[lo] - 1] === 1;
    for (let c = lo; c <= hi; c++) {
      if (won) gained += claim(c);
      LABEL[c] = 0;
    }
  }
  MARK_BYTES.fill(me);
  const full = MARK[0];
  for (let k = 0; k < bseen; k++) {
    const b = BSEEN[k], first = firstCell(b);
    if (inner[BLABEL[b] - 1] === 0) continue;
    gained += BAREA[b & BAREA_MASK];
    if (BHELD[b] === 1) {
      for (let row = first, j = 0; j < B; j++, row += GRID) for (let c = row; c < row + B; c++) LOSS[owner[c]] += AREA[c & FACE_MASK];
    }
    for (let e = first >> 3, j = 0; j < B; j++, e += ROW_EIGHTS) for (let x = e; x < e + BLOCK_EIGHTS; x++) eights[x] = full;
  }
  for (let k = 0; k < classed; k++) BSTATE[CLASSED[k]] = BLABEL[CLASSED[k]] = BHELD[CLASSED[k]] = 0;
  for (let k = 1; k <= SHIPS; k++) state.ships[k - 1].held -= LOSS[k];
  ship.held += gained;
  const cells = laid.slice();
  wash(state, i);
  emit(state, EVENT.claim, i, -1, ship.pos, { amount: gained / AREA_Q, cells });
  const coins = Math.floor((gained / AREA_Q) * INK.claim);
  if (coins > 0) {
    ship.coins += coins;
    emit(state, EVENT.coins, i, -1, ship.pos, { amount: coins, item: 3 });
  }
}

function claim(c: number): number {
  const a = AREA[c & FACE_MASK];
  LOSS[owner[c]] += a;
  owner[c] = me;
  return a;
}

function adjoining(c: number): number {
  for (let k = 0; k < 4; k++) {
    const x = step(c, k), b = blockOf(x), l = BSTATE[b] === CLEAN ? BLABEL[b] : LABEL[x];
    if (l > 0) return find(l - 1);
  }
  return -1;
}

function flood(): number {
  const active = parent.slice();
  let finished = 0;
  while (active.length > 1 || (active.length === 1 && area[active[0]] < finished)) {
    for (const r of active) {
      if (parent[r] !== r) continue;
      root = r;
      for (let turn = 0; turn < TURN && front[root] >= 0; turn++) {
        const node = front[root];
        front[root] = NEXT[node];
        expand(node);
      }
    }
    let live = 0;
    for (const r of active) {
      if (parent[r] !== r) continue;
      if (front[r] >= 0) active[live++] = r;
      else finished = Math.max(finished, area[r]);
    }
    active.length = live;
  }
  if (active.length === 1) return active[0];
  let outer = -1;
  for (let r = 0; r < parent.length; r++) if (parent[r] === r && (outer < 0 || area[r] > area[outer])) outer = r;
  return outer;
}

function expand(node: number): void {
  if (node < CELLS) {
    const lo = node, hi = SPAN[node], j = (node >> LOG) & (B - 1);
    if ((lo & (B - 1)) > 0) visitCell(lo - 1);
    else dispatch(step(lo, 0));
    if ((hi & (B - 1)) < B - 1) visitCell(hi + 1);
    else dispatch(step(hi, 1));
    if (j > 0) for (let c = lo; c <= hi; c++) visitCell(c - GRID);
    else for (let c = lo; c <= hi; c++) dispatch(step(c, 2));
    if (j < B - 1) for (let c = lo; c <= hi; c++) visitCell(c + GRID);
    else for (let c = lo; c <= hi; c++) dispatch(step(c, 3));
    return;
  }
  const c0 = firstCell(node - CELLS);
  for (let k = 0; k < 4; k++) {
    const beyond = blockOf(step(edgeCell(c0, k, 0), k));
    if (classify(beyond) === CLEAN) visitBlock(beyond);
    else for (let t = 0; t < B; t++) visitCell(step(edgeCell(c0, k, t), k));
  }
}

function step(c: number, k: number): number {
  const i = c & M, j = (c >> LOG) & M;
  if (k === 0) return i > 0 ? c - 1 : neighbor(TERRITORY, c, 0);
  if (k === 1) return i < M ? c + 1 : neighbor(TERRITORY, c, 1);
  if (k === 2) return j > 0 ? c - GRID : neighbor(TERRITORY, c, 2);
  return j < M ? c + GRID : neighbor(TERRITORY, c, 3);
}

function edgeCell(c0: number, k: number, t: number): number {
  if (k === 0) return c0 + (t << LOG);
  if (k === 1) return c0 + (t << LOG) + B - 1;
  return k === 2 ? c0 + t : c0 + ((B - 1) << LOG) + t;
}

function classify(b: number): number {
  if (BSTATE[b] !== 0) return BSTATE[b];
  const first = firstCell(b);
  let state = CLEAN, sum = 0;
  for (let e = first >> 3, j = 0; j < B; j++, e += ROW_EIGHTS) for (let k = e; k < e + BLOCK_EIGHTS; k++) sum += eights[k];
  const held = sum !== 0;
  BHELD[b] = held ? 1 : 0;
  for (let w = first >> 2, j = 0; held && j < B && state === CLEAN; j++, w += ROW_WORDS) {
    for (let k = w; k < w + BLOCK_WORDS; k++) {
      const x = words[k] ^ mine;
      if ((((x - 0x01010101) | 0) & ~x & 0x80808080) !== 0) {
        state = DIRTY;
        break;
      }
    }
  }
  BSTATE[b] = state;
  CLASSED[classed++] = b;
  return state;
}

const open = (c: number): boolean => owner[c] !== me && LABEL[c] === 0;

function dispatch(c: number): void {
  const b = blockOf(c);
  if (classify(b) === CLEAN) visitBlock(b);
  else visitCell(c);
}

function visitBlock(b: number): void {
  const l = BLABEL[b];
  if (l === 0) {
    BLABEL[b] = root + 1;
    area[root] += BAREA[b & BAREA_MASK];
    enqueue(CELLS + b);
    BSEEN[bseen++] = b;
  } else if (l - 1 !== root) meet(l - 1);
}

function visitCell(c: number): void {
  if (owner[c] === me) return;
  const l = LABEL[c];
  if (l === 0) {
    const label = root + 1, row = c & ~(B - 1);
    let lo = c, hi = c, a = 0;
    while (lo > row && owner[lo - 1] !== me && LABEL[lo - 1] === 0) lo--;
    while (hi < row + B - 1 && owner[hi + 1] !== me && LABEL[hi + 1] === 0) hi++;
    for (let x = lo; x <= hi; x++) {
      LABEL[x] = label;
      a += AREA[x & FACE_MASK];
    }
    area[root] += a;
    SPAN[lo] = hi;
    SEEN[seen++] = lo;
    enqueue(lo);
  } else if (l > 0 && l - 1 !== root) meet(l - 1);
}

function enqueue(node: number): void {
  NEXT[node] = -1;
  if (front[root] < 0) front[root] = node;
  else NEXT[back[root]] = node;
  back[root] = node;
}

function meet(r: number): void {
  const o = find(r);
  if (o === root) return;
  if (front[o] >= 0) {
    if (front[root] < 0) front[root] = front[o];
    else NEXT[back[root]] = front[o];
    back[root] = back[o];
    front[o] = -1;
  }
  parent[o] = root;
  area[root] += area[o];
}

function find(r: number): number {
  while (parent[r] !== r) r = parent[r] = parent[parent[r]];
  return r;
}

function own(state: MatchState, c: number, k: number): void {
  const o = state.owner[c];
  if (o === k) return;
  const a = AREA[c & FACE_MASK];
  if (o !== 0) state.ships[o - 1].held -= a;
  if (k !== 0) state.ships[k - 1].held += a;
  state.owner[c] = k;
}

function pennant(state: MatchState): void {
  const was = state.leader;
  let best = was >= 0 && state.ships[was].held > 0 ? was : -1;
  for (let i = 0; i < SHIPS; i++) if (state.ships[i].held > (best >= 0 ? state.ships[best].held : 0)) best = i;
  if (best === was) return;
  state.leader = best;
  const held = best >= 0 ? state.ships[best].held / AREA_Q : 0;
  emit(state, EVENT.lead, best, was, best >= 0 ? state.ships[best].pos : ORIGIN, { amount: held });
}
