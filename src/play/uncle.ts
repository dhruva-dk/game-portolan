import {
  PLAYER_SHIP,
  type Kit,
  type SeaBubble,
  type Status,
} from './player.ts';

export const UNCLE_AT_SEA = { fireAfter: 6, near: 150 } as const;

export interface Around {
  live: boolean;
  rival: number | null;
  offered: boolean;
}

type Now = Status & Kit;

const AT_HAND: Readonly<Record<SeaBubble, boolean>> = {
  steer: true,
  fire: true,
  gust: true,
  heal: true,
  home: true,
  storm: true,
  sunk: false,
};

const FIRST: readonly SeaBubble[] = ['steer', 'fire'];

export function createUncle(seen: readonly string[]) {
  let known = new Set(seen);
  const waiting: SeaBubble[] = [];
  let up: SeaBubble | null = null,
    clock = 0,
    steered: number | null = null;

  const fresh = (id: SeaBubble) =>
    !known.has(id) && up !== id && !waiting.includes(id);
  const happened = (id: SeaBubble, when: boolean) => {
    if (when && fresh(id)) waiting.push(id);
  };
  const taught = () => known.has('steer') && known.has('fire');
  const ready = (id: SeaBubble, now: Now, around: Around) =>
    AT_HAND[id]
      ? around.live &&
        now.arriving <= 0 &&
        !now.sunk &&
        (FIRST.includes(id) || taught())
      : around.offered;

  return {
    update(dt: number, now: Now, around: Around): SeaBubble | null {
      clock += dt;
      const begun = around.live && !now.sunk,
        live = begun && now.arriving <= 0;
      if (begun && fresh('steer')) waiting.unshift('steer');
      if (live && steered === null && known.has('steer')) steered = clock;
      happened(
        'fire',
        steered !== null && clock - steered >= UNCLE_AT_SEA.fireAfter
      );
      happened(
        'gust',
        begun &&
          now.gust >= 1 &&
          around.rival !== null &&
          around.rival <= UNCLE_AT_SEA.near
      );
      happened(
        'heal',
        begun &&
          now.moments.some((m) => m.kind === 'took' && m.ship === PLAYER_SHIP)
      );
      happened('home', begun && now.sea > 0);
      happened('storm', begun && now.closing);
      happened('sunk', now.sunk);
      if (now.sunk) {
        if (up !== null && AT_HAND[up]) up = null;
        for (let i = waiting.length - 1; i >= 0; i--)
          if (AT_HAND[waiting[i]]) waiting.splice(i, 1);
      }
      if (up === null) {
        const next = waiting.findIndex((id) => ready(id, now, around));
        if (next >= 0) up = waiting.splice(next, 1)[0];
      }
      return up;
    },
    seen(list: readonly string[]) {
      known = new Set(list);
      if (up !== null && known.has(up)) up = null;
      for (let i = waiting.length - 1; i >= 0; i--)
        if (known.has(waiting[i])) waiting.splice(i, 1);
    },
  };
}

export type Uncle = ReturnType<typeof createUncle>;
