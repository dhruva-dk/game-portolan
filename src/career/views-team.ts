// `team`: the roster by role, its wages and open posts, each ship's bond, the
// pit crew, and each ship's pit stop as the race card will carry it. Pure,
// read-side.

import { SHIPS } from '../office/command.ts';
import type { Act, TeamView, PitRow, RosterRow } from '../office/people.ts';
import { pitOf } from './card.ts';
import { effective } from './effective.ts';
import { perRace, wages } from './money.ts';
import { bondLevel, fatigueOn, recovery, slipOf, work } from './pit.ts';
import { hasRole, type Person, type PersonOf } from './roles.ts';
import { staffOf, type CareerState, type Team } from './state.ts';
import { trait } from './traits.ts';
import { renewWhy } from './views-profile.ts';
import { TUNING } from './tuning.ts';
import {
  ROLE_NAMES,
  ageOf,
  endsText,
  openPosts,
  postOf,
  seen,
  shipName,
  wageText,
} from './views-person.ts';
import { myTeam, faceOf, fig, line, nameOf, rival, topBar } from './views.ts';
import { moneyText } from './names.ts';

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** A person's line of the roster. */
function personRow(s: CareerState, c: Team, g: Person, you = false): RosterRow {
  const v = seen(s, c.id, g.id);
  return {
    kind: 'person',
    id: g.id,
    you,
    title: you ? `${nameOf(g)} (you)` : nameOf(g),
    face: faceOf(s, g),
    post: you ? shipName(0) : postOf(s, g),
    age: String(ageOf(s, g)),
    stars: v.stars,
    potential: v.potential,
    morale: you ? null : Math.round(g.morale),
    wage: you ? '—' : wageText(g.contract?.wage ?? 0),
    ends: you ? '—' : endsText(s, g),
    tags: g.traits.map((t) => trait(t).name),
    find: null,
    renew: you ? null : act(renewWhy(s, c, g)),
  };
}
const act = (why: string | null): Act => ({ ok: why === null, why: why ?? '' });
const head = (title: string): RosterRow => ({
  kind: 'head',
  id: null,
  you: false,
  title,
  face: null,
  post: '',
  age: '',
  stars: null,
  potential: null,
  morale: null,
  wage: '',
  ends: '',
  tags: [],
  find: null,
  renew: null,
});
const open = (o: ReturnType<typeof openPosts>[number]): RosterRow => ({
  ...head(o.label),
  kind: 'open',
  post: 'Open',
  find: { role: o.role, status: o.status },
});

/** The roster: the drivers (the player first, on the first ship), mechanics, designer, scouts, pit crew, the chairman. */
function roster(s: CareerState, c: Team): RosterRow[] {
  const posts = openPosts(c),
    opens = (role: string) => posts.filter((p) => p.role === role).map(open);
  const rows = (ids: readonly (number | null)[]) =>
    ids.flatMap((id) => {
      const g = id === null ? undefined : s.people[id];
      return g ? [personRow(s, c, g)] : [];
    });
  const me = s.player ? s.people[s.player.person] : undefined;
  return [
    head('Drivers'),
    ...(me && c.player ? [personRow(s, c, me, true)] : []),
    ...rows([...c.staff.ships.map((h) => h.driver), c.staff.reserve]),
    ...opens('driver'),
    head('Mechanics'),
    ...rows(c.staff.ships.map((h) => h.mechanic)),
    ...opens('mechanic'),
    head('Designer'),
    ...rows([c.staff.designer]),
    ...opens('designer'),
    head('Scouts'),
    ...rows(c.staff.scouts),
    ...opens('scout'),
    head('Pit crew'),
    ...rows(c.staff.pit),
    ...opens('pit'),
    head('Chairman'),
    ...rows([c.staff.chairman]),
  ];
}

/** A pit crew member: their work (against the best of the crew), their chance of a slip, their fatigue. */
function pitRow(
  s: CareerState,
  c: Team,
  g: PersonOf<'pit'>,
  best: number
): PitRow {
  const st = effective(g, null),
    house = c.buildings.pitHouse.level,
    tired = fatigueOn(g, s.day, house);
  const now = work(st, tired),
    fresh = work(st, 0),
    slip = slipOf(st, tired),
    steady = slipOf(st, 0);
  return {
    id: g.id,
    face: faceOf(s, g),
    name: nameOf(g),
    work: fig(now, now.toFixed(2), rival('best', best.toFixed(2)), {
      title: 'Work',
      lines: [
        line('Rested', fresh.toFixed(2)),
        line('Lost to fatigue', `−${pct((TUNING.pit.tired * tired) / 100)}`),
      ],
    }),
    slip: fig(slip, pct(slip), rival('rested', pct(steady)), {
      title: 'Slip chance',
      lines: [
        line('From Precision and Nerve', pct(steady)),
        line('From fatigue', pct(slip - steady)),
      ],
    }),
    fatigue: fig(
      Math.round(tired),
      String(Math.round(tired)),
      rival('a day', `−${Math.round(recovery(house))}`),
      {
        title: 'Fatigue',
        lines: [
          line('After the last race', Math.round(g.fatigue)),
          line('Recovered since', Math.round(g.fatigue - tired)),
          line('Pit house level', house),
        ],
      }
    ),
  };
}

/** The pit crew's rows, the best worker's work beside each. */
function pitRows(s: CareerState, c: Team): PitRow[] {
  const members = c.staff.pit.flatMap((id) => {
    const g = s.people[id];
    return g && hasRole(g, 'pit') ? [g] : [];
  });
  const house = c.buildings.pitHouse.level;
  const best = Math.max(
    0,
    ...members.map((g) => work(effective(g, null), fatigueOn(g, s.day, house)))
  );
  return members.map((g) => pitRow(s, c, g, best));
}

/** A team's wages a race by role's name (the player's own person draws none). */
function wagesByRole(s: CareerState, c: Team): Map<string, number> {
  const byRole = new Map<string, number>();
  for (const id of staffOf(c)) {
    const g = s.people[id];
    if (!g || g.player || g.role === 'chairman') continue;
    const name = ROLE_NAMES[g.role];
    byRole.set(name, (byRole.get(name) ?? 0) + (g.contract?.wage ?? 0));
  }
  return byRole;
}

/** `team`. */
export function teamView(s: CareerState): TeamView {
  const c = myTeam(s),
    total = wages(s, c),
    money = perRace(s, c.id),
    income = money.pay + money.sponsors + money.fish;
  const levels = TUNING.bond.levels,
    top = levels[levels.length - 1] ?? 1;
  return {
    top: topBar(s),
    roster: roster(s, c),
    wages: fig(
      total,
      moneyText(total),
      rival('income a race', moneyText(income)),
      {
        title: 'Wages a race',
        lines: [
          ...[...wagesByRole(s, c)].map(([k, n]) => line(k, moneyText(n))),
          line('Income a race', moneyText(income)),
        ],
      }
    ),
    open: openPosts(c),
    bonds: SHIPS.map((ship) => {
      const b = c.bonds[ship] ?? 0,
        level = bondLevel(b),
        next = levels[level] ?? null;
      return {
        ship,
        label: shipName(ship),
        fill: Math.min(100, (b / top) * 100),
        marks: levels.map((at) => at / top),
        level,
        bond: fig(
          b,
          `Level ${level} of ${levels.length}`,
          next === null
            ? rival('the', 'strongest bond')
            : rival('next at', `${next} races`),
          {
            title: 'Bond',
            lines: [
              line('Races together', b),
              ...levels.map((at, i) =>
                line(`Level ${i + 1} at`, `${at} races`)
              ),
            ],
          }
        ),
      };
    }),
    pit: pitRows(s, c),
    stops: SHIPS.map((ship) => {
      const p = pitOf(s, c, ship);
      return {
        ship,
        pace: fig(p.pace, `× ${p.pace.toFixed(2)}`, rival('spec', '× 1.00'), {
          title: 'Pit stop time',
          lines: [
            line('Bond level', bondLevel(c.bonds[ship] ?? 0)),
            line('Pit crew', c.staff.pit.length),
          ],
        }),
        slip: fig(p.slip, pct(p.slip), rival('a job', 'slips'), {
          title: 'Slip chance',
          lines: [line('Each job of a stop', pct(p.slip))],
        }),
      };
    }),
  };
}
