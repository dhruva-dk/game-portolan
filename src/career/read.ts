// What the career's screens read (Phase B section 12–13, for Phase C): pure selectors over the state, each a view a
// screen draws as given. The mail rendered, newest first; a tier's table; the season's calendar; race day's preview
// of the player's team; a dilemma's question and its answers.

import type { Call } from '../race.ts';
import { dilemma } from './events.ts';
import { lineups } from './lineup.ts';
import { render as worded } from './mail.ts';
import { mine } from './post.ts';
import type { CareerState, Mail, Planet } from './state.ts';

/** A message as the mail screen lists it. */
interface MailView {
  id: number;
  day: number;
  category: Mail['category'];
  subject: string;
  body: string;
  read: boolean;
  open: boolean;
  links: Mail['links'];
}

/** The player's mail, newest first; `open` marks a dilemma not yet answered. */
export const mailView = (s: CareerState): MailView[] =>
  [...s.mail]
    .sort((a, b) => b.day - a.day || b.id - a.id)
    .map((m) => ({
      id: m.id,
      day: m.day,
      category: m.category,
      ...worded(s, m),
      read: m.read,
      open: m.dilemma !== null && m.dilemma.answer === null,
      links: m.links,
    }));

/** Unread messages. */
export const unread = (s: CareerState): number =>
  s.mail.filter((m) => !m.read).length;

/** A row of a tier's table. */
interface TableRow {
  place: number;
  team: number;
  name: string;
  points: number;
  wins: number;
  podiums: number;
  sinkings: number;
  mine: boolean;
}

/** A tier's table, by points, then wins, then team id (the order the season's end promotes by). */
export function table(s: CareerState, tier: number): TableRow[] {
  const me = mine(s);
  return [...s.championships[tier].standings]
    .sort((a, b) => b.points - a.points || b.wins - a.wins || a.team - b.team)
    .map((x, i) => ({
      place: i + 1,
      team: x.team,
      name: s.teams[x.team].name,
      points: x.points,
      wins: x.wins,
      podiums: x.podiums,
      sinkings: x.sinkings,
      mine: x.team === me,
    }));
}

/** A race of the season's calendar: its round, day, planet, and whether it is sailed, today, or to come. */
interface Fixture {
  round: number;
  day: number;
  planet: Planet;
  when: 'sailed' | 'today' | 'ahead';
}

/** The season's calendar. */
export function fixtures(s: CareerState): Fixture[] {
  if (!s.calendar) return [];
  return s.calendar.rounds.map((r, round) => ({
    round,
    day: r.day,
    planet: r.planet,
    when:
      s.race?.round === round ? 'today' : round < s.round ? 'sailed' : 'ahead',
  }));
}

/** A ship of the player's team on race day: who sails her (null: the player, or no one), whether a stand-in, whether she forfeits. */
interface Boarding {
  driver: number | null;
  standIn: boolean;
  forfeit: boolean;
}

/**
 * Race day's preview of the player's team: who sails each ship, the call, and
 * whether the race may begin; null if no race is due or the player has no team.
 */
interface Preview {
  round: number;
  ships: readonly Boarding[];
  call: Call;
  started: boolean;
}

export function preview(s: CareerState): Preview | null {
  const me = mine(s);
  const x = me === null ? undefined : lineups(s)[me];
  if (s.race === null || !x) return null;
  return {
    round: s.race.round,
    ships: x.ships.map((a) => ({
      driver: a.driver,
      standIn: a.standIn,
      forfeit: a.forfeit,
    })),
    call: x.call,
    started: s.race.started,
  };
}

/** A dilemma's mail: its question and answers, which the player chose (null if open), the answer a lapse takes. */
interface DilemmaView {
  mail: number;
  id: string;
  subject: string;
  body: string;
  options: readonly string[];
  answer: number | null;
  lapse: number;
}

export function dilemmaView(s: CareerState, mail: number): DilemmaView | null {
  const m = s.mail.find((x) => x.id === mail);
  if (!m?.dilemma || !dilemma(m.dilemma.id)) return null;
  return {
    mail,
    id: m.dilemma.id,
    ...worded(s, m),
    options: m.dilemma.options,
    answer: m.dilemma.answer,
    lapse: m.dilemma.options.length - 1,
  };
}
