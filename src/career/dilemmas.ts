// Drawing and answering the dilemmas (the twelve are career/events.ts's). After each round closes,
// each team draws one at most, by seed: with a chance, among those whose trigger holds, a chairman's dilemma weighted by
// the chairman's Meddling. A rival answers at once by its manager's personality (the last option if it cannot take its
// own). The player's comes by mail a few days later, before the next race (a `dilemma` event, which stops Advance),
// if its trigger still holds; one left unanswered lapses to its last option at the next draw. AnswerDilemma, and
// MarkRead, which the mail's screen sends.

import { known } from './canon.ts';
import type { EventHandler } from './advance.ts';
import { accept, refuse, whole, type Handlers } from './command.ts';
import { between, weighted, type Dice, type Rand } from './dice.ts';
import { effective } from './effective.ts';
import {
  DILEMMAS,
  PERSONALITIES,
  dilemma,
  type Answer,
  type Dilemma,
} from './events.ts';
import { nextRace } from './flags.ts';
import { meddleChance } from './leadership.ts';
import { mine, post } from './post.ts';
import { schedule } from './queue.ts';
import type { CareerState, Team, Mail } from './state.ts';
import { inRole } from './roles.ts';
import { TUNING } from './tuning.ts';

const D = TUNING.dilemmas;

/** A dilemma's answer for a team, falling back to its last option if the one chosen cannot be taken. */
function answered(
  s: CareerState,
  c: Team,
  d: Dilemma,
  ctx: { slots: Mail['slots']; option: number }
): CareerState {
  const a: Answer = d.answer(s, c, ctx.slots, ctx.option);
  if ('state' in a) return a.state;
  const last = d.answer(s, c, ctx.slots, d.options.length - 1);
  return 'state' in last ? last.state : s;
}

/** The option a rival's manager takes. */
function rivalOption(s: CareerState, c: Team, d: Dilemma): number {
  const m = c.staff.manager === null ? null : s.people[c.staff.manager];
  const i = m?.personality ? PERSONALITIES.indexOf(m.personality) : -1;
  return i < 0 ? d.options.length - 1 : d.rival[i];
}

/** The dilemmas whose trigger holds for a team, and how much each weighs in the draw: a chairman's by its Meddling; for
 *  the player, each the less the more often it has come to them (the career's mail keeps count), so the rare ones
 *  are not drowned by those that nearly always hold. */
function candidates(
  s: CareerState,
  c: Team,
  rand: Rand
): { d: Dilemma; weight: number }[] {
  const chairman = inRole(s.people[c.staff.chairman], 'chairman');
  const meddle = meddleChance(effective(chairman, null).meddling);
  const seen = new Map<string, number>();
  if (c.player)
    for (const m of s.mail)
      if (m.dilemma) seen.set(m.dilemma.id, (seen.get(m.dilemma.id) ?? 0) + 1);
  return DILEMMAS.filter((d) => d.trigger(s, c, rand) !== null).map((d) => ({
    d,
    weight: (d.chairman ? meddle : 1) / (1 + (seen.get(d.id) ?? 0)),
  }));
}

/** A state with the player's unanswered dilemmas lapsed to their last option. */
function lapsed(s: CareerState): CareerState {
  let out = s;
  for (const m of s.mail) {
    if (!m.dilemma || m.dilemma.answer !== null) continue;
    const d = dilemma(m.dilemma.id);
    const own = Number(m.slots.own);
    if (d && own === mine(out))
      out = answered(out, out.teams[own], d, {
        slots: m.slots,
        option: d.options.length - 1,
      });
    out = {
      ...out,
      mail: out.mail.map((x) =>
        x.id === m.id && x.dilemma
          ? {
              ...x,
              dilemma: { ...x.dilemma, answer: x.dilemma.options.length - 1 },
            }
          : x
      ),
    };
  }
  return out;
}

/** A state after the round's close with every team's dilemma drawn. */
export function drawn(s: CareerState, roll: Dice): CareerState {
  const rand = roll.roll('dilemmas');
  let out = lapsed(s);
  const me = mine(out),
    race = nextRace(out);
  for (const c0 of out.teams) {
    if (rand() >= D.chance) continue;
    const c = out.teams[c0.id];
    const list = candidates(out, c, rand);
    if (list.length === 0) continue;
    const d =
      list[
        weighted(
          rand,
          list.map((x) => x.weight)
        )
      ].d;
    if (c.id === me) {
      if (race === null) continue;
      const day = Math.min(
        race - 1,
        out.day + between(rand, D.after[0], D.after[1])
      );
      if (day > out.day)
        out = schedule(out, day, { kind: 'dilemma', id: d.id, team: c.id });
      continue;
    }
    const slots = d.trigger(out, c, rand);
    if (slots)
      out = answered(out, c, d, { slots, option: rivalOption(out, c, d) });
  }
  return out;
}

/** The player's dilemma comes: by mail, if its trigger still holds. */
export const dilemmaComes: EventHandler<'dilemma'> = (s, e, roll) => {
  if (e.team !== mine(s)) return s;
  const d = dilemma(e.id);
  const slots = d?.trigger(s, s.teams[e.team], roll.roll('dilemmas'));
  if (!d || !slots) return s;
  const id = s.ids.mail;
  const out = post(s, {
    team: e.team,
    category: d.category,
    sender: null,
    kind: d.id,
    slots: { ...slots, own: e.team },
    links: [],
  });
  return {
    ...out,
    mail: out.mail.map((m) =>
      m.id === id
        ? { ...m, dilemma: { id: d.id, options: d.options, answer: null } }
        : m
    ),
  };
};

export const MAIL: Handlers = {
  AnswerDilemma: (s, c) => {
    const me = mine(s);
    if (me === null)
      return refuse(
        'sacked',
        'You have no team: take one of the posts offered.'
      );
    const m = whole(c.mail, 0, Number.MAX_SAFE_INTEGER)
      ? s.mail.find((x) => x.id === c.mail)
      : undefined;
    if (!m || !m.dilemma) return refuse('mail', 'No such dilemma.');
    if (m.dilemma.answer !== null)
      return refuse('answered', 'That is decided already.');
    if (!whole(c.option, 0, m.dilemma.options.length - 1))
      return refuse('option', 'No such answer.');
    if (Number(m.slots.own) !== me)
      return refuse('stale', "That was another team's matter.");
    if (s.race?.started) return refuse('racing', 'The race is under way.');
    const d = known(dilemma(m.dilemma.id));
    const a = d.answer(s, s.teams[me], m.slots, c.option);
    if ('no' in a) return refuse(a.no.code, a.no.sentence);
    return accept({
      ...a.state,
      mail: a.state.mail.map((x) =>
        x.id === m.id && x.dilemma
          ? { ...x, read: true, dilemma: { ...x.dilemma, answer: c.option } }
          : x
      ),
    });
  },
  MarkRead: (s, c) => {
    const m = whole(c.mail, 0, Number.MAX_SAFE_INTEGER)
      ? s.mail.find((x) => x.id === c.mail)
      : undefined;
    if (!m) return refuse('mail', 'No such message.');
    if (m.read) return refuse('read', 'That is read already.');
    return accept({
      ...s,
      mail: s.mail.map((x) => (x.id === m.id ? { ...x, read: true } : x)),
    });
  },
};
