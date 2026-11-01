// Abilities: what the 8 actives do when used, and the ticking of their effects. The 8 passives are read where
// they apply (sailing, reloading, consumables, the Storm, sinking).
import { hurt, mend } from './harm.ts';
import type { ShipInput } from './input.ts';
import { addScaled, dot, normalize, set, v3 } from './math.ts';
import { activeOf, cooldownOf } from './perks.ts';
import { apart, along, tangentToward, turned } from './sphere.ts';
import { CAUSE, EVENT, PHASE, SHIPS, TICK, copy, emit, elapse, type MatchState } from './state.ts';
import { POWERS, SHIP } from './tables.ts';

const T = v3(), P = v3();

/** How long each active runs once used, in seconds (0: instant). */
export function runsFor(id: string): number {
  switch (id) {
    case 'repair': return POWERS.repair.time;
    case 'smokeScreen': return POWERS.smokeScreen.time;
    case 'ram': return POWERS.ram.time;
    case 'reveal': return POWERS.reveal.time;
    case 'decoy': return POWERS.decoy.time;
    default: return 0;
  }
}

/** Uses ship i's active ability, if it is ready. */
export function useAbility(state: MatchState, i: number, input: ShipInput): boolean {
  const ship = state.ships[i];
  if (ship.phase !== PHASE.sea || ship.cooldown > 0 || ship.flip > 0) return false;
  const id = activeOf(ship);
  ship.cooldown = cooldownOf(id);
  ship.power = runsFor(id);
  switch (id) {
    case 'smokeScreen':
      state.clouds.push({ owner: i, at: { x: ship.pos.x, y: ship.pos.y, z: ship.pos.z }, t: POWERS.smokeScreen.time });
      break;
    case 'reveal':
      ship.revealed = POWERS.reveal.time;
      break;
    case 'hardTurn': {
      const a = Math.abs(input.steer) > 0.3 ? Math.max(-3.14159, Math.min(3.14159, input.steer)) : 3.14159;
      turned(ship.head, ship.pos, a, ship.head);
      normalize(addScaled(ship.head, ship.head, ship.pos, -dot(ship.head, ship.pos)));
      ship.rate = 0;
      ship.speed = Math.max(ship.speed, SHIP.crawl);
      ship.boost = Math.max(ship.boost, POWERS.hardTurn.boost);
      break;
    }
    case 'decoy':
      state.decoys.push({
        owner: i, pos: { x: ship.pos.x, y: ship.pos.y, z: ship.pos.z }, head: { x: ship.head.x, y: ship.head.y, z: ship.head.z },
        t: POWERS.decoy.time,
      });
      break;
    case 'wave':
      for (let j = 0; j < SHIPS; j++) {
        const o = state.ships[j];
        if (j === i || o.phase !== PHASE.sea || apart(o.pos, ship.pos) > POWERS.wave.r) continue;
        tangentToward(ship.pos, o.pos, T);
        // push along the line between them, in o's tangent plane
        set(P, T.x, T.y, T.z);
        normalize(addScaled(P, P, o.pos, -dot(P, o.pos)));
        addScaled(o.shove, o.shove, P, POWERS.wave.push);
        hurt(state, j, POWERS.wave.damage, i, CAUSE.wave, o.pos, 1);
      }
      break;
    case 'driftMine':
      set(T, -ship.head.x, -ship.head.y, -ship.head.z);
      along(ship.pos, T, SHIP.half + 3, P);
      state.mines.push({ owner: i, at: { x: P.x, y: P.y, z: P.z }, t: 0 });
      break;
    default:
      break;
  }
  emit(state, EVENT.ability, i, -1, ship.pos, { item: ship.active, amount: ship.power });
  return true;
}

/** Ticks running abilities, smoke, decoys and mines. */
export function powers(state: MatchState): void {
  for (let i = 0; i < SHIPS; i++) {
    const ship = state.ships[i];
    if (ship.cooldown > 0) ship.cooldown = elapse(ship.cooldown);
    if (ship.revealed > 0) ship.revealed = elapse(ship.revealed);
    if (ship.power <= 0) continue;
    const id = activeOf(ship);
    if (id === 'repair' && ship.phase === PHASE.sea) mend(state, i, (POWERS.repair.hull / POWERS.repair.time) * TICK);
    ship.power = elapse(ship.power);
    if (ship.power === 0) emit(state, EVENT.abilityEnd, i, -1, ship.pos, { item: ship.active });
  }
  for (let k = state.clouds.length - 1; k >= 0; k--) {
    state.clouds[k].t -= TICK;
    if (state.clouds[k].t <= 0) state.clouds.splice(k, 1);
  }
  for (let k = state.decoys.length - 1; k >= 0; k--) {
    const d = state.decoys[k];
    d.t -= TICK;
    if (d.t <= 0) {
      state.decoys.splice(k, 1);
      continue;
    }
    // the ghost sails straight on at a fair speed
    along(d.pos, d.head, SHIP.top * 0.8 * TICK, P);
    tangentToward(d.pos, P, T);
    copy(d.pos, P);
    set(d.head, T.x, T.y, T.z);
    normalize(addScaled(d.head, d.head, d.pos, -dot(d.head, d.pos)));
  }
  const m = POWERS.driftMine;
  for (let k = state.mines.length - 1; k >= 0; k--) {
    const mine = state.mines[k];
    mine.t += TICK;
    if (mine.t >= m.life) {
      state.mines.splice(k, 1);
      continue;
    }
    if (mine.t < m.arm) continue;
    let near = false;
    for (let j = 0; j < SHIPS && !near; j++) {
      const o = state.ships[j];
      near = j !== mine.owner && o.phase === PHASE.sea && apart(o.pos, mine.at) < m.r;
    }
    if (!near) continue;
    emit(state, EVENT.mineBurst, -1, mine.owner, mine.at, { amount: m.splash });
    for (let j = 0; j < SHIPS; j++) {
      const o = state.ships[j], d = apart(o.pos, mine.at);
      if (o.phase !== PHASE.sea || d > m.splash) continue;
      hurt(state, j, m.damage * (1 - (0.5 * d) / m.splash), mine.owner, CAUSE.mine, o.pos, 0);
    }
    state.mines.splice(k, 1);
  }
}

/** Inside someone's smoke: hidden from everyone further than a hull's length away. */
export function inSmoke(state: MatchState, i: number): boolean {
  const p = state.ships[i].pos;
  for (const c of state.clouds) if (apart(c.at, p) < POWERS.smokeScreen.r) return true;
  return false;
}

