// The save's schema version and the pure migrations between versions. A bump ships a migration
// from the version before, here, and a fixture of the old version under tests/fixtures/ that the tests load. A save
// is backed up before it is migrated (career/session.ts).

import type { Json } from './canon.ts';
import type { CareerState } from './state.ts';

/** The schema a state is written in now. */
export const SCHEMA = 2;

type Record_ = { readonly [key: string]: Json };

/** Each migration takes a state of version v (as parsed JSON) to v + 1: MIGRATIONS[v]. */
const MIGRATIONS: Readonly<Record<number, (old: Record_) => Record_>> = {
  // 2: the player keeps their chairman's confidence race by race, what they asked of him, and their seasons; a
  // career of schema 1 has kept none of them yet
  1: (old) => {
    const p = old.player;
    return p !== null && typeof p === 'object' && !Array.isArray(p)
      ? { ...old, player: { ...p, board: [], asks: [], seasons: [] } }
      : old;
  },
};

/** A parsed state brought to the present schema, or why it cannot be. */
export function migrated(
  parsed: unknown
): { ok: true; state: CareerState; from: number } | { ok: false; why: string } {
  const m = stepped(parsed);
  if (!m.ok) return m;
  const plain: unknown = m.state;
  return { ok: true, state: plain as CareerState, from: m.from };
}

function stepped(
  parsed: unknown
): { ok: true; state: Record_; from: number } | { ok: false; why: string } {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
    return { ok: false, why: 'the save is not a career' };
  let state: Record_ = Object.fromEntries(Object.entries(parsed));
  const from = state.schema;
  if (typeof from !== 'number' || !Number.isInteger(from) || from < 1)
    return { ok: false, why: 'the save has no schema version' };
  if (from > SCHEMA)
    return {
      ok: false,
      why: `the save was written by a newer version (schema ${from}; this one reads ${SCHEMA})`,
    };
  for (let v = from; v < SCHEMA; v++) {
    const step = MIGRATIONS[v];
    if (!step) return { ok: false, why: `no migration from schema ${v}` };
    state = { ...step(state), schema: v + 1 };
  }
  return { ok: true, state, from };
}
