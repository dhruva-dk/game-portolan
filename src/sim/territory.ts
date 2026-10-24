// Territory (WP7): the sea each ship holds, as owner cells of the territory grid, and the trails it lays beyond it.
// A ship sailing out of its own waters lays an open trail, cell by cell; sailing back in closes the loop: everything
// the trail and the old border enclose becomes its sea, rivals' sea and islands included, and its purse is banked. A
// rival crossing an open trail breaks it: the trail washes away and the unbanked purse spills at the break. Also here:
// the home disc inked after break-off, the storm swallowing sea, the gold-leaf pennant, and what a ship's own waters
// give it. Part B adds the landmarks' perks (beside holds) and the harbours' repair (beside repairRate).
import { bankPurse, fill, spill } from './economy.ts';
import type { Sea } from './environment.ts';
import { dcos, dot, normalize, set, v3 } from './math.ts';
import { AREA_Q, GRID, R, TERRITORY, cellDir, cellOf, neighbor } from './sphere.ts';
import { EVENT, SHIPS, chronicle, emit, type MatchState } from './state.ts';
import { HOME } from './tables.ts';
import type { Perk } from './world/regions.ts';

const M = GRID - 1, FACE_MASK = GRID * GRID - 1, LOG = TERRITORY.log, FACE_SHIFT = 2 * LOG, AREA = TERRITORY.area;
/** Samples along a tick's move, u: closer than the narrowest cell, so successive samples' cells are at most diagonal. */
const STRIDE = 0.15;
/** Nodes (cells or blocks) each region floods per round of the race between regions (see flood). */
const TURN = 32;
const HOME_COS = dcos(HOME.radius / R);
const ORIGIN = v3(), P = v3(), D = v3();

// The flood works on blocks of B×B cells where it can: a block holding none of the closing ship's sea and none of its
// trail is clean, flooded whole; the rest are flooded cell by cell. Blocks tile the faces exactly, so a block's edge
// is its cells' edges and every adjacency across it is a cell's (sphere.ts neighbor, across faces too).
const BLOG = 4, B = 1 << BLOG, BLOG2 = LOG - BLOG, BM = (GRID >> BLOG) - 1, BFACE = 2 * BLOG2, BLOCKS = 6 << BFACE;
const CLEAN = 1, DIRTY = 2, ROW_WORDS = GRID >> 2, BLOCK_WORDS = B >> 2;
/** Each block's area, quanta, by its place on a face (the same on all six). */
const BAREA = new Float64Array(1 << BFACE), BAREA_MASK = (1 << BFACE) - 1;
for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) BAREA[((j >> BLOG) << BLOG2) + (i >> BLOG)] += AREA[(j << LOG) + i];
const blockOf = (c: number): number => ((c >> FACE_SHIFT) << BFACE) + ((((c >> LOG) & M) >> BLOG) << BLOG2) + ((c & M) >> BLOG);
const firstCell = (b: number): number => ((b >> BFACE) << FACE_SHIFT) + ((((b >> BLOG2) & BM) << BLOG) << LOG) + ((b & BM) << BLOG);

// Scratch, all zero between calls. LABEL: BARRIER on the closing loop's trail, else 1 + the flood region that reached
// the cell; BLABEL the same for clean blocks, BSTATE a block once classed CLEAN or DIRTY. SEEN, BSEEN, CLASSED: the
// cells and clean blocks labelled and the blocks classed, in order, to claim and to reset. LOSS: sea lost, by owner.
const BARRIER = -1;
const LABEL = new Int32Array(TERRITORY.cells), SEEN = new Int32Array(TERRITORY.cells);
const BLABEL = new Int32Array(BLOCKS), BSTATE = new Uint8Array(BLOCKS), BSEEN = new Int32Array(BLOCKS), CLASSED = new Int32Array(BLOCKS);
const LOSS = new Float64Array(SHIPS + 1);
// The flood's regions: union-find parents, areas (quanta), queues of nodes to spread from (a cell c, or a block b as
// −1 − b) and their heads; the closing ship's mark, the owner map, the region spreading now, and the lists' counts.
const parent: number[] = [], area: number[] = [], queue: number[][] = [], head: number[] = [];
let me = 0, owner: Uint8Array = new Uint8Array(0), root = 0, seen = 0, bseen = 0, classed = 0;
// The owner map four cells to a word (it is always a buffer of its own: createMatch, decodeMatch), and the closing
// ship's mark in each byte of a word, so a block's rows are tested and claimed a word at a time.
let words: Uint32Array = new Uint32Array(0), mine = 0;

/** Whether ship i lies in its own waters. */
export const atHome = (state: MatchState, i: number): boolean => state.owner[cellOf(TERRITORY, state.ships[i].pos)] === i + 1;

/** Whether ship i holds a landmark's perk: the landmark lies in its waters. */
export function holds(sea: Sea, state: MatchState, i: number, perk: Perk): boolean {
  const k = sea.geo.landmarks.findIndex((l) => l.perk === perk);
  return k >= 0 && state.owner[sea.marks[k]] === i + 1;
}

/** The hull points a second ship i mends: slowly, in its own waters (WP8 mends the hull). */
export const repairRate = (state: MatchState, i: number): number => (atHome(state, i) ? HOME.repair : 0);

/** What a gull call priced `price` costs ship i: less in its own waters (WP9 charges it). */
export const gullPrice = (state: MatchState, i: number, price: number): number => (atHome(state, i) ? price * HOME.gull : price);

/** The rivals inside ship i's waters, a bitmask by ship index: slowed there (sailing.ts) and marked on its chart (WP8). */
export function intruders(state: MatchState, i: number): number {
  let mask = 0;
  for (let j = 0; j < SHIPS; j++) {
    if (j !== i && state.owner[cellOf(TERRITORY, state.ships[j].pos)] === i + 1) mask |= 1 << j;
  }
  return mask;
}

/**
 * Ink ship i's home disc round it: every cell whose centre lies within HOME.radius becomes its sea, whoever held it.
 * WP8's opening calls this where the ship slows after breaking off the Great Current.
 */
export function inkHome(state: MatchState, i: number): void {
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
  emit(state, EVENT.home, i, -1, p, inked / AREA_Q, cells);
}

/** The storm swallows `cells`: they lose their owners and their colour runs (WP8 calls this as the storm closes). */
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
  if (lost.length > 0) emit(state, EVENT.swallow, -1, -1, ORIGIN, swallowed / AREA_Q, lost);
}

/**
 * One tick of territory, after the ships have moved: each ship's move from `was` to `pos`, in ship order, lays, breaks
 * and closes trails and fills its purse; then the pennant goes to the ship holding the most sea.
 */
export function chart(state: MatchState): void {
  for (let i = 0; i < SHIPS; i++) lay(state, i);
  pennant(state);
}

/**
 * Ship i's move this tick, cell by cell: sampled every STRIDE along the chord, with the corner cell bridging any
 * diagonal step, so the cells entered form an edge-connected path. Two edge-connected paths cannot cross without
 * sharing a cell, so no crossing of a trail is ever missed, and a trail is a barrier no flood leaks through.
 */
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
  if (ship.laid.length > 0) fill(state, i, dist); // the chord: the arc to a part in 10⁹ at a tick's move
}

function adjacent(a: number, b: number): boolean {
  for (let k = 0; k < 4; k++) if (neighbor(TERRITORY, a, k) === b) return true;
  return false;
}

/** The cell sharing an edge with each of two diagonal neighbours. */
function bridge(a: number, b: number): number {
  for (let k = 0; k < 4; k++) {
    const x = neighbor(TERRITORY, a, k);
    for (let m = 0; m < 4; m++) if (neighbor(TERRITORY, x, m) === b) return x;
  }
  throw new RangeError(`territory: cells ${a} and ${b}, a stride apart, are not neighbours`);
}

/**
 * Ship i sails from cell `from` into its edge neighbour c. A rival's trail there breaks (not the player's on its first
 * voyage, before its first loop closes); its own trail there is nothing. Its own waters close its open trail; any other
 * cell extends the trail, or starts one when the ship has just left its waters.
 */
function enter(state: MatchState, i: number, from: number, c: number): void {
  const ship = state.ships[i], mark = i + 1, t = state.trail[c];
  if (t !== 0 && t !== mark && !(t === 1 && state.charm)) breakTrail(state, t - 1, i, c);
  if (state.owner[c] === mark) {
    if (ship.laid.length > 0) closeLoop(state, i);
    return;
  }
  if (ship.laid.length === 0 && state.owner[from] !== mark) return;
  if (state.trail[c] !== mark) {
    ship.laid.push(c);
    state.trail[c] = mark;
  }
}

/** Ship j's trail washes away where ship `by` crossed it at cell c: the loop is lost and the purse spills there. */
function breakTrail(state: MatchState, j: number, by: number, c: number): void {
  const ship = state.ships[j], cells = ship.laid.slice(), lost = ship.purse, at = cellDir(TERRITORY, c, v3());
  wash(state, j);
  ship.purse = 0;
  emit(state, EVENT.broken, j, by, at, lost, cells);
  chronicle(state, EVENT.broken, j, by, lost);
  if (lost > 0) spill(state, at, lost, j);
}

/** Lift ship i's trail from the map (cells another trail has since crossed keep that trail's mark). */
function wash(state: MatchState, i: number): void {
  const laid = state.ships[i].laid;
  for (const c of laid) if (state.trail[c] === i + 1) state.trail[c] = 0;
  laid.length = 0;
}

/**
 * Ship i is back in its waters: its own sea and its trail are the barrier, and every region of the rest that is cut off
 * from the largest becomes its sea, with the trail itself. On a sphere every loop splits the world in two, so this
 * claims the smaller side, any pockets a self-crossing trail closed, and whatever lies in them: rivals' sea, islands,
 * rivals' trails (which stay open). Then the purse is banked.
 */
function closeLoop(state: MatchState, i: number): void {
  const ship = state.ships[i], laid = ship.laid;
  me = i + 1;
  owner = state.owner;
  words = new Uint32Array(owner.buffer, owner.byteOffset, owner.length >> 2);
  mine = Math.imul(me, 0x01010101);
  seen = bseen = classed = 0;
  parent.length = area.length = queue.length = head.length = 0;
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
      const n = neighbor(TERRITORY, c, k), b = blockOf(n);
      if (classify(b) === CLEAN ? BLABEL[b] !== 0 : !open(n)) continue;
      root = parent.length;
      parent.push(root);
      area.push(0);
      queue.push([]);
      head.push(0);
      dispatch(n);
    }
  }
  const outer = flood();
  let gained = 0;
  LOSS.fill(0);
  for (const c of laid) {
    if (LABEL[c] !== BARRIER) continue; // listed twice: a trail recrossing a cell another trail had marked since
    LABEL[c] = 0;
    gained += claim(c);
  }
  for (let k = 0; k < seen; k++) {
    const c = SEEN[k];
    if (find(LABEL[c] - 1) !== outer) gained += claim(c);
    LABEL[c] = 0;
  }
  for (let k = 0; k < bseen; k++) {
    const b = BSEEN[k];
    if (find(BLABEL[b] - 1) === outer) continue;
    gained += BAREA[b & BAREA_MASK];
    for (let w = firstCell(b) >> 2, j = 0; j < B; j++, w += ROW_WORDS) {
      for (let k = w; k < w + BLOCK_WORDS; k++) {
        if (words[k] !== 0) for (let c = k << 2; c < (k << 2) + 4; c++) LOSS[owner[c]] += AREA[c & FACE_MASK];
        words[k] = mine;
      }
    }
  }
  for (let k = 0; k < classed; k++) BSTATE[CLASSED[k]] = BLABEL[CLASSED[k]] = 0;
  for (let k = 1; k <= SHIPS; k++) state.ships[k - 1].held -= LOSS[k];
  ship.held += gained;
  const cells = laid.slice();
  wash(state, i);
  emit(state, EVENT.loop, i, -1, ship.pos, gained / AREA_Q, cells);
  chronicle(state, EVENT.loop, i, -1, gained / AREA_Q);
  bankPurse(state, i);
  if (i === 0) state.charm = false;
}

/** Cell c becomes the closing ship's, its sea lost to whoever held it; returns its area. */
function claim(c: number): number {
  const a = AREA[c & FACE_MASK];
  LOSS[owner[c]] += a;
  owner[c] = me;
  return a;
}

/**
 * The race between regions: each grows from its seeds a few nodes a round, regions that touch merge, and the race stops
 * once one region still growing outweighs every finished one, so it is the largest, the outside. The work is about
 * twice the enclosed side's, never the whole planet's unless the loop halves it. Returns the outside's root.
 */
function flood(): number {
  const active = parent.slice();
  let finished = 0;
  while (active.length > 1 || (active.length === 1 && area[active[0]] < finished)) {
    for (const r of active) {
      if (parent[r] !== r) continue;
      root = r;
      for (let turn = 0; turn < TURN && head[root] < queue[root].length; turn++) expand(queue[root][head[root]++]);
    }
    let live = 0;
    for (const r of active) {
      if (parent[r] !== r) continue;
      if (head[r] < queue[r].length) active[live++] = r;
      else finished = Math.max(finished, area[r]);
    }
    active.length = live;
  }
  if (active.length === 1) return active[0];
  let outer = -1;
  for (let r = 0; r < parent.length; r++) if (parent[r] === r && (outer < 0 || area[r] > area[outer])) outer = r;
  return outer;
}

/**
 * Spread from a node: a cell to its four neighbours (those inside its own block, which is dirty, directly); a clean
 * block across each edge, to the block beyond if it is clean (the B cells across an edge always lie in one block,
 * faces' edges included), else to each of those cells.
 */
function expand(node: number): void {
  if (node >= 0) {
    const i = node & (B - 1), j = (node >> LOG) & (B - 1);
    if (i > 0) visitCell(node - 1);
    else dispatch(neighbor(TERRITORY, node, 0));
    if (i < B - 1) visitCell(node + 1);
    else dispatch(neighbor(TERRITORY, node, 1));
    if (j > 0) visitCell(node - GRID);
    else dispatch(neighbor(TERRITORY, node, 2));
    if (j < B - 1) visitCell(node + GRID);
    else dispatch(neighbor(TERRITORY, node, 3));
    return;
  }
  const c0 = firstCell(-1 - node);
  for (let k = 0; k < 4; k++) {
    const beyond = blockOf(neighbor(TERRITORY, edgeCell(c0, k, 0), k));
    if (classify(beyond) === CLEAN) visitBlock(beyond);
    else for (let t = 0; t < B; t++) visitCell(neighbor(TERRITORY, edgeCell(c0, k, t), k));
  }
}

/** The t-th cell along side k (as neighbor's k) of the block whose first cell is c0. */
function edgeCell(c0: number, k: number, t: number): number {
  if (k === 0) return c0 + (t << LOG);
  if (k === 1) return c0 + (t << LOG) + B - 1;
  return k === 2 ? c0 + t : c0 + ((B - 1) << LOG) + t;
}

/** Block b, classed on first sight: CLEAN when it holds none of the closing ship's sea (its trail's blocks are DIRTY). */
function classify(b: number): number {
  if (BSTATE[b] !== 0) return BSTATE[b];
  let state = CLEAN;
  for (let w = firstCell(b) >> 2, j = 0; j < B && state === CLEAN; j++, w += ROW_WORDS) {
    for (let k = w; k < w + BLOCK_WORDS; k++) {
      const x = words[k] ^ mine;
      if (((x - 0x01010101) & ~x & 0x80808080) !== 0) { // a byte of the word is the closing ship's mark
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

/** The region spreading now reaches cell c: its block, if clean, or the cell itself. */
function dispatch(c: number): void {
  const b = blockOf(c);
  if (classify(b) === CLEAN) visitBlock(b);
  else visitCell(c);
}

/** An unlabelled clean block joins the region spreading now and is queued; another region's merges with it. */
function visitBlock(b: number): void {
  const l = BLABEL[b];
  if (l === 0) {
    BLABEL[b] = root + 1;
    area[root] += BAREA[b & BAREA_MASK];
    queue[root].push(-1 - b);
    BSEEN[bseen++] = b;
  } else meet(l - 1);
}

/** An open cell joins the region spreading now and is queued; another region's merges with it; the barrier stops it. */
function visitCell(c: number): void {
  if (owner[c] === me) return;
  const l = LABEL[c];
  if (l === 0) {
    LABEL[c] = root + 1;
    area[root] += AREA[c & FACE_MASK];
    SEEN[seen++] = c;
    queue[root].push(c);
  } else if (l > 0) meet(l - 1);
}

/** Region r touches the region spreading now: one region, carrying on with the larger queue. */
function meet(r: number): void {
  const o = find(r);
  if (o === root) return;
  const keep = queue[o].length - head[o] > queue[root].length - head[root] ? o : root, drop = keep === o ? root : o;
  const from = queue[drop], into = queue[keep];
  for (let m = head[drop]; m < from.length; m++) into.push(from[m]);
  queue[drop] = [];
  head[drop] = 0;
  parent[drop] = keep;
  area[keep] += area[drop];
  root = keep;
}

function find(r: number): number {
  while (parent[r] !== r) r = parent[r] = parent[parent[r]];
  return r;
}

/** Cell c passes to ship mark k (0 nobody), keeping every ship's held area. */
function own(state: MatchState, c: number, k: number): void {
  const o = state.owner[c];
  if (o === k) return;
  const a = AREA[c & FACE_MASK];
  if (o !== 0) state.ships[o - 1].held -= a;
  if (k !== 0) state.ships[k - 1].held += a;
  state.owner[c] = k;
}

/** The gold-leaf pennant: to the ship holding the most sea; the holder keeps it through a tie, and nobody holding none. */
function pennant(state: MatchState): void {
  const was = state.leader;
  let best = was >= 0 && state.ships[was].held > 0 ? was : -1;
  for (let i = 0; i < SHIPS; i++) if (state.ships[i].held > (best >= 0 ? state.ships[best].held : 0)) best = i;
  if (best === was) return;
  state.leader = best;
  const held = best >= 0 ? state.ships[best].held / AREA_Q : 0;
  emit(state, EVENT.lead, best, was, best >= 0 ? state.ships[best].pos : ORIGIN, held);
  chronicle(state, EVENT.lead, best, was, held);
}
