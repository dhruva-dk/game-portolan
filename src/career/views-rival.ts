// `rival`: a team's page, any team of the career's (hers too), as her team sees
// it. Who runs it, how its season stands, the team against its championship,
// and everyone on its books, their stars as her scouts know them. Pure.

import type { Personality } from '../office/command.ts';
import type { Hand, RivalView } from '../office/rival.ts';
import {
  championship,
  driverLines,
  named,
  security,
  standing,
  teamLines,
  teamStats,
  type Look,
} from './office.ts';
import { rowsFor } from './rivals.ts';
import { TUNING } from './tuning.ts';
import { ROLE_NAMES, seen, shipName } from './views-person.ts';
import { myTeam, nameOf } from './views.ts';
import type { CareerState } from './state.ts';

/** Each personality as the office names it. */
const PERSONALITIES: Readonly<Record<Personality, string>> = {
  spender: 'Spender',
  youthBuilder: 'Youth Builder',
  poacher: 'Poacher',
  engineer: 'Engineer',
  gambler: 'Gambler',
  steady: 'Steady Hand',
};

/** What each row of a manager's review sees to, in words. */
const ROWS: Readonly<Record<string, string>> = {
  fill: 'Open posts',
  replace: 'Replacing the weakest',
  renew: 'Renewals',
  poach: 'Poaching',
  scout: 'Scouting',
  improvement: 'Improving parts',
  design: 'Designing parts',
  build: 'Building',
  sponsors: 'Sponsors',
  suppliers: 'Suppliers',
  vote: 'The vote',
};

/** `rival`: team `id`'s page (null: hers). */
export function rivalView(
  s: CareerState,
  look: Look,
  id: number | null
): RivalView {
  const mine = myTeam(s),
    c = s.teams[id ?? mine.id] ?? mine,
    own = c.id === mine.id;
  const hand = (person: number, post: string): Hand => ({
    person,
    name: nameOf(s.people[person]),
    post,
    stars: seen(s, mine.id, person).stars,
  });

  const lines = teamLines(s, c.tier, look),
    line = lines.find((t) => t.team.id === c.id),
    hers = own ? undefined : lines.find((t) => t.own);
  const table = driverLines(s, c.tier, look);

  const boss = c.player ? (s.player?.person ?? null) : c.staff.manager;
  const g = boss === null ? undefined : s.people[boss];
  const personality = g && !g.player ? (g.personality ?? 'steady') : null;

  // (on her own team she sails ship 1 herself)
  const sailors: [number | null, string][] = [
    ...c.staff.ships.map((h, k): [number | null, string] =>
      c.player && k === 0
        ? [s.player?.person ?? null, shipName(0)]
        : [h.driver, shipName(k)]
    ),
    [c.staff.reserve, 'Reserve'],
  ];
  const drivers = sailors.flatMap(([p, post]) => {
    if (p === null) return [];
    const at = table.find((d) => d.person === p);
    return [
      {
        ...hand(p, post),
        place: at && at.points > 0 ? at.place : null,
        points: at?.points ?? 0,
      },
    ];
  });
  const staff: Hand[] = [
    ...c.staff.ships.flatMap((h, k) =>
      h.mechanic === null ? [] : [hand(h.mechanic, `Mechanic, ${shipName(k)}`)]
    ),
    ...[c.staff.designer, ...c.staff.scouts, ...c.staff.pit].flatMap((p) =>
      p === null ? [] : [hand(p, ROLE_NAMES[s.people[p].role])]
    ),
  ];

  return {
    team: named(c, look),
    own,
    championship: championship(c.tier),
    tier: c.tier,
    port: s.colonies[c.colony] ?? '',
    reputation: Math.round(c.reputation),
    manager:
      boss === null || !g
        ? null
        : {
            person: boss,
            name: nameOf(g),
            you: g.player,
            personality: personality && PERSONALITIES[personality],
            spends:
              personality && TUNING.rivals.personalities[personality].spend,
            first: personality
              ? rowsFor(personality)
                  .filter((r) => r !== 'fill')
                  .slice(0, 3)
                  .map((r) => ROWS[r] ?? r)
              : [],
            security: security(c.confidence),
          },
    chairman: {
      person: c.staff.chairman,
      name: nameOf(s.people[c.staff.chairman]),
      target: c.target,
      standing: standing(line?.place ?? lines.length, c.target),
    },
    season: {
      round: s.round,
      rounds: TUNING.calendar.rounds,
      place: line?.place ?? lines.length,
      of: lines.length,
      points: line?.points ?? 0,
      wins: line?.wins ?? 0,
      podiums: line?.podiums ?? 0,
      sinkings: line?.sinkings ?? 0,
      leader: lines[0]?.points ?? 0,
      hers: hers?.points ?? null,
      prize: line?.prize ?? 0,
      move: line?.move ?? null,
    },
    stats: teamStats(s, c),
    drivers,
    staff,
  };
}
