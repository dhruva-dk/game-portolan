// Territory (WP7): the sea each ship holds, as owner cells of the territory grid, and the trails it lays beyond it.
// A ship sailing out of its own waters lays an open trail, cell by cell; sailing back in closes the loop: everything
// the trail and the old border enclose becomes its sea, rivals' sea and islands included, and its purse is banked. A
// rival crossing an open trail breaks it: the trail washes away and the unbanked purse spills at the break. Also here:
// the home disc inked after break-off, the storm swallowing sea, the gold-leaf pennant, what a ship's own waters and
// the harbours give it, and the twelve landmarks' perks, each held while its landmark lies in the holder's waters.
import { bankPurse, fill, spill } from './economy.ts';
import { timeOf, type Sea } from './environment.ts';
import { cross, dcos, dot, dsin, normalize, set, v3, type V3 } from './math.ts';
import { AREA_Q, GRID, R, TERRITORY, cellDir, cellOf, neighbor } from './sphere.ts';
import { EVENT, SHIPS, chronicle, emit, type MatchState } from './state.ts';
import { HARBOUR, HOME, PERK } from './tables.ts';
import { ZONE } from './world/geography.ts';
import type { Perk } from './world/regions.ts';

const M = GRID - 1, FACE_MASK = GRID * GRID - 1, LOG = TERRITORY.log, FACE_SHIFT = 2 * LOG, AREA = TERRITORY.area;
/** Samples along a tick's move, u: closer than the narrowest cell, so successive samples' cells are at most diagonal. */
const STRIDE = 0.15;
/** Nodes (cells or blocks) each region floods per round of the race between regions (see flood). */
const TURN = 32;
const HOME_COS = dcos(HOME.radius / R);
const BEAM_REACH = dcos(PERK.crownLight.reach / R), BEAM_HALF = dcos(PERK.crownLight.half);
const ORIGIN = v3(), P = v3(), D = v3(), RIGHT = v3(), BEAM = v3();

// The flood works on blocks of B×B cells where it can: a block holding none of the closing ship's sea and none of its
// trail is clean, flooded whole; the rest are flooded cell by cell. Blocks tile the faces exactly, so a block's edge
// is its cells' edges and every adjacency across it is a cell's (sphere.ts neighbor, across faces too).
const BLOG = 4, B = 1 << BLOG, BLOG2 = LOG - BLOG, BM = (GRID >> BLOG) - 1, BFACE = 2 * BLOG2, BLOCKS = 6 << BFACE;
const CLEAN = 1, DIRTY = 2, ROW_WORDS = GRID >> 2, BLOCK_WORDS = B >> 2, ROW_EIGHTS = GRID >> 3, BLOCK_EIGHTS = B >> 3;
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
// The flood's regions: union-find parents, areas (quanta), and queues of nodes to spread from (cell c is node c, block b
// node CELLS + b), each a list threaded through NEXT from its front to its back, so regions that meet splice their
// queues in one step; the closing ship's mark, the owner map, the region spreading now, and the lists' counts.
const CELLS = TERRITORY.cells, NEXT = new Int32Array(CELLS + BLOCKS);
const parent: number[] = [], area: number[] = [], front: number[] = [], back: number[] = [];
let me = 0, owner: Uint8Array = new Uint8Array(0), root = 0, seen = 0, bseen = 0, classed = 0;
// The owner map four and eight cells to a word (it is always a buffer of its own: createMatch, decodeMatch), and the
// closing ship's mark in each byte of a word, so a block's rows are tested and claimed a word at a time.
let words: Int32Array = new Int32Array(0), eights: Float64Array = new Float64Array(0), mine = 0;

/** Whether ship i lies in its own waters. */
export const atHome = (state: MatchState, i: number): boolean => state.owner[cellOf(TERRITORY, state.ships[i].pos)] === i + 1;

/** The landmark carrying a perk (Geography.landmarks order). */
const landmarkOf = (sea: Sea, perk: Perk): number => sea.geo.landmarks.findIndex((l) => l.perk === perk);

/** The ship holding a landmark's perk, the landmark lying in its waters: −1 nobody. */
export const holder = (sea: Sea, state: MatchState, perk: Perk): number => state.owner[sea.marks[landmarkOf(sea, perk)]] - 1;

/** Whether ship i holds a landmark's perk. */
export const holds = (sea: Sea, state: MatchState, i: number, perk: Perk): boolean => holder(sea, state, perk) === i;

/** The perks ship i holds, a bitmask by landmark (Geography.landmarks order): for the interface and the captains. */
export function perksOf(sea: Sea, state: MatchState, i: number): number {
  let mask = 0;
  for (let k = 0; k < sea.marks.length; k++) if (state.owner[sea.marks[k]] === i + 1) mask |= 1 << k;
  return mask;
}

/**
 * The hull points a second ship i mends where it lies (WP8 mends the hull): at harbour speed in any harbour's waters
 * and inside the Great Lagoon while it holds it; slowly in its own waters, twice as fast holding the Great Falls.
 */
export function repairRate(sea: Sea, state: MatchState, i: number): number {
  const cell = cellOf(TERRITORY, state.ships[i].pos);
  if ((sea.geo.zones[cell] & ZONE.harbour) !== 0 || sheltered(sea, state, i)) return HARBOUR.repair;
  if (state.owner[cell] !== i + 1) return 0;
  return holds(sea, state, i, 'greatFalls') ? HOME.repair * PERK.greatFalls : HOME.repair;
}

/** Whether ship i lies inside the Great Lagoon while holding it: it mends at harbour speed, and no rival fires on it (WP8). */
export function sheltered(sea: Sea, state: MatchState, i: number): boolean {
  const lagoon = sea.geo.landmarks[landmarkOf(sea, 'greatLagoon')];
  return holds(sea, state, i, 'greatLagoon') && dot(state.ships[i].pos, lagoon.pos) >= dcos(lagoon.r / R);
}

/** What a gull call priced `price` costs ship i (WP9 charges it): less in its own waters, half holding Spice Harbour. */
export function gullPrice(sea: Sea, state: MatchState, i: number, price: number): number {
  const home = atHome(state, i) ? price * HOME.gull : price;
  return holds(sea, state, i, 'spiceHarbour') ? home * PERK.spiceHarbour : home;
}

/** How fast ship i's weapons reload, × (WP8, WP9): a third faster holding the Arch. */
export const reloadSpeed = (sea: Sea, state: MatchState, i: number): number =>
  (holds(sea, state, i, 'arch') ? PERK.arch : 1);

/** How fast ship i's gull brings a chest, × (WP9): twice as fast holding the Sandbar Light. */
export const chestSpeed = (sea: Sea, state: MatchState, i: number): number =>
  (holds(sea, state, i, 'sandbarLight') ? PERK.sandbarLight : 1);

/** Whether ship i is kept off rival charts (WP8's sight): in its own waters, holding the Kelp Cathedral. */
export const unseen = (sea: Sea, state: MatchState, i: number): boolean =>
  atHome(state, i) && holds(sea, state, i, 'kelpCathedral');

/**
 * The Crown Light's beam now, a unit tangent at its landmark, into `out`: it turns clockwise from the landmark's facing,
 * once every PERK.crownLight.period s, day and night (the renderer draws it from this).
 */
export function crownBeam(sea: Sea, state: MatchState, out: V3): V3 {
  const mark = sea.geo.landmarks[landmarkOf(sea, 'crownLight')], e = mark.facing;
  const a = (2 * Math.PI * timeOf(state)) / PERK.crownLight.period, c = dcos(a), s = dsin(a);
  cross(RIGHT, e, mark.pos); // starboard of the facing, seen from above
  return set(out, e.x * c + RIGHT.x * s, e.y * c + RIGHT.y * s, e.z * c + RIGHT.z * s);
}

/** The rivals in the Crown Light's beam, marked on ship i's chart (WP8's sight), a bitmask by ship: none unless i holds it. */
export function beamMarks(sea: Sea, state: MatchState, i: number): number {
  if (!holds(sea, state, i, 'crownLight')) return 0;
  const light = sea.geo.landmarks[landmarkOf(sea, 'crownLight')].pos, beam = crownBeam(sea, state, BEAM);
  let mask = 0;
  for (let j = 0; j < SHIPS; j++) {
    const p = state.ships[j].pos, near = dot(p, light);
    if (j === i || near < BEAM_REACH || near >= 1) continue;
    if (dot(p, beam) >= BEAM_HALF * Math.sqrt(1 - near * near)) mask |= 1 << j; // within its half-width of the bearing
  }
  return mask;
}

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
  let gained = 0;
  LOSS.fill(0);
  for (const c of laid) {
    if (LABEL[c] !== BARRIER) continue; // listed twice: a trail recrossing a cell another trail had marked since
    LABEL[c] = 0;
    gained += claim(c);
  }
  for (let k = 0, l = 0, inside = false; k < seen; k++) {
    const c = SEEN[k];
    if (LABEL[c] !== l) { // the cells of one region come in runs
      l = LABEL[c];
      inside = find(l - 1) !== outer;
    }
    if (inside) gained += claim(c);
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
 * The region already reaching an edge neighbour of the open node at cell c, or −1. Seeding c into it rather than into
 * a region of its own keeps the race to a few regions along each side of the trail, not two for every trail cell.
 */
function adjoining(c: number): number {
  for (let k = 0; k < 4; k++) {
    const x = step(c, k), b = blockOf(x), l = BSTATE[b] === CLEAN ? BLABEL[b] : LABEL[x];
    if (l > 0) return find(l - 1);
  }
  return -1;
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

/**
 * Spread from a node: a cell to its four neighbours (those inside its own block, which is dirty, directly); a clean
 * block across each edge, to the block beyond if it is clean (the B cells across an edge always lie in one block,
 * faces' edges included), else to each of those cells.
 */
function expand(node: number): void {
  if (node < CELLS) {
    const i = node & (B - 1), j = (node >> LOG) & (B - 1);
    if (i > 0) visitCell(node - 1);
    else dispatch(step(node, 0));
    if (i < B - 1) visitCell(node + 1);
    else dispatch(step(node, 1));
    if (j > 0) visitCell(node - GRID);
    else dispatch(step(node, 2));
    if (j < B - 1) visitCell(node + GRID);
    else dispatch(step(node, 3));
    return;
  }
  const c0 = firstCell(node - CELLS);
  for (let k = 0; k < 4; k++) {
    const beyond = blockOf(step(edgeCell(c0, k, 0), k));
    if (classify(beyond) === CLEAN) visitBlock(beyond);
    else for (let t = 0; t < B; t++) visitCell(step(edgeCell(c0, k, t), k));
  }
}

/** Cell c's edge neighbour on side k (as sphere.ts neighbor): within its face straight from its index, else neighbor. */
function step(c: number, k: number): number {
  const i = c & M, j = (c >> LOG) & M;
  if (k === 0) return i > 0 ? c - 1 : neighbor(TERRITORY, c, 0);
  if (k === 1) return i < M ? c + 1 : neighbor(TERRITORY, c, 1);
  if (k === 2) return j > 0 ? c - GRID : neighbor(TERRITORY, c, 2);
  return j < M ? c + GRID : neighbor(TERRITORY, c, 3);
}

/** The t-th cell along side k (as neighbor's k) of the block whose first cell is c0. */
function edgeCell(c0: number, k: number, t: number): number {
  if (k === 0) return c0 + (t << LOG);
  if (k === 1) return c0 + (t << LOG) + B - 1;
  return k === 2 ? c0 + t : c0 + ((B - 1) << LOG) + t;
}

/**
 * Block b, classed on first sight: CLEAN when it holds none of the closing ship's sea (its trail's blocks are DIRTY).
 * Most blocks are open sea nobody holds, settled by one pass over their bytes eight at a time, as doubles (zero only
 * when every byte is, but for −0, whose top byte 0x80 no mark reaches); only held blocks are searched for the closing
 * ship's mark, byte by byte a word at a time.
 */
function classify(b: number): number {
  if (BSTATE[b] !== 0) return BSTATE[b];
  const first = firstCell(b);
  let state = CLEAN, held = false;
  for (let e = first >> 3, j = 0; j < B && !held; j++, e += ROW_EIGHTS) {
    for (let k = e; k < e + BLOCK_EIGHTS; k++) if (eights[k] !== 0) held = true;
  }
  for (let w = first >> 2, j = 0; held && j < B && state === CLEAN; j++, w += ROW_WORDS) {
    for (let k = w; k < w + BLOCK_WORDS; k++) {
      const x = words[k] ^ mine;
      if ((((x - 0x01010101) | 0) & ~x & 0x80808080) !== 0) { // a byte of the word is the closing ship's mark
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
    enqueue(CELLS + b);
    BSEEN[bseen++] = b;
  } else if (l - 1 !== root) meet(l - 1);
}

/** An open cell joins the region spreading now and is queued; another region's merges with it; the barrier stops it. */
function visitCell(c: number): void {
  if (owner[c] === me) return;
  const l = LABEL[c];
  if (l === 0) {
    LABEL[c] = root + 1;
    area[root] += AREA[c & FACE_MASK];
    SEEN[seen++] = c;
    enqueue(c);
  } else if (l > 0 && l - 1 !== root) meet(l - 1);
}

/** Node joins the back of the queue of the region spreading now. */
function enqueue(node: number): void {
  NEXT[node] = -1;
  if (front[root] < 0) front[root] = node;
  else NEXT[back[root]] = node;
  back[root] = node;
}

/** Region r touches the region spreading now: one region, r's queue spliced onto the back of its own. */
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
