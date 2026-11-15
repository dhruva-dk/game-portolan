// Drawing and answering the dilemmas (Phase B section 12; the twelve are career/events.ts's). After each round closes,
// each crew draws one at most, by seed: with a chance, among those whose trigger holds, an elder's dilemma weighted by
// the elder's Meddling. A rival answers at once by its manager's personality (the last option if it cannot take its
// own). The player's comes by mail a few days later, before the next race (a `dilemma` event, which stops Advance),
// if its trigger still holds; one left unanswered lapses to its last option at the next draw. AnswerDilemma, and
// MarkRead, which the mail's screen sends.

import type { EventHandler } from './advance.ts';
import { accept, refuse, whole, type Handlers } from './command.ts';
import { between, weighted, type Dice, type Rand } from './dice.ts';
import { effective } from './effective.ts';
import { DILEMMAS, PERSONALITIES, dilemma, type Answer, type Dilemma } from './events.ts';
import { nextRace } from './flags.ts';
import { meddleChance } from './leadership.ts';
import { mine, post } from './post.ts';
import { schedule } from './queue.ts';
import type { GullOf } from './roles.ts';
import type { CareerState, Crew, Mail } from './state.ts';
import { TUNING } from './tuning.ts';

const D = TUNING.dilemmas;

/** A dilemma's answer for a crew, falling back to its last option if the one chosen cannot be taken. */
function answered(s: CareerState, c: Crew, d: Dilemma, ctx: { slots: Mail['slots']; option: number }): CareerState {
  const a: Answer = d.answer(s, c, ctx.slots, ctx.option);
  if ('state' in a) return a.state;
  const last = d.answer(s, c, ctx.slots, d.options.length - 1);
  return 'state' in last ? last.state : s;
}

/** The option a rival's manager takes. */
function rivalOption(s: CareerState, c: Crew, d: Dilemma): number {
  const m = c.staff.manager === null ? null : s.gulls[c.staff.manager];
  const i = m?.personality ? PERSONALITIES.indexOf(m.personality) : -1;
  return i < 0 ? d.options.length - 1 : d.rival[i];
}

/** The dilemmas whose trigger holds for a crew, and how much each weighs in the draw: an elder's by its Meddling; for
 *  the player, each the less the more often it has come to them (the career's mail keeps count), so the rare ones
 *  are not drowned by those that nearly always hold. */
function candidates(s: CareerState, c: Crew, rand: Rand): { d: Dilemma; weight: number }[] {
  const elder = s.gulls[c.staff.elder] as GullOf<'elder'>;
  const meddle = meddleChance(effective(elder, null).meddling);
  const seen = new Map<string, number>();
  if (c.player) for (const m of s.mail) if (m.dilemma) seen.set(m.dilemma.id, (seen.get(m.dilemma.id) ?? 0) + 1);
  return DILEMMAS.filter((d) => d.trigger(s, c, rand) !== null).map((d) => ({ d, weight: (d.elder ? meddle : 1) / (1 + (seen.get(d.id) ?? 0)) }));
}

/** A state with the player's unanswered dilemmas lapsed to their last option. */
function lapsed(s: CareerState): CareerState {
  let out = s;
  for (const m of s.mail) {
    if (!m.dilemma || m.dilemma.answer !== null) continue;
    const d = dilemma(m.dilemma.id);
    const own = Number(m.slots.own);
    if (d && own === mine(out)) out = answered(out, out.crews[own], d, { slots: m.slots, option: d.options.length - 1 });
    out = { ...out, mail: out.mail.map((x) => (x.id === m.id && x.dilemma ? { ...x, dilemma: { ...x.dilemma, answer: x.dilemma.options.length - 1 } } : x)) };
  }
  return out;
}

/** A state after the round's close with every crew's dilemma drawn. */
export function drawn(s: CareerState, roll: Dice): CareerState {
  const rand = roll.roll('dilemmas');
  let out = lapsed(s);
  const me = mine(out), race = nextRace(out);
  for (const c0 of out.crews) {
    if (rand() >= D.chance) continue;
    const c = out.crews[c0.id];
    const list = candidates(out, c, rand);
    if (list.length === 0) continue;
    const d = list[weighted(rand, list.map((x) => x.weight))].d;
    if (c.id === me) {
      if (race === null) continue;
      const day = Math.min(race - 1, out.day + between(rand, D.after[0], D.after[1]));
      if (day > out.day) out = schedule(out, day, { kind: 'dilemma', id: d.id, crew: c.id });
      continue;
    }
    const slots = d.trigger(out, c, rand);
    if (slots) out = answered(out, c, d, { slots, option: rivalOption(out, c, d) });
  }
  return out;
}

/** The player's dilemma comes: by mail, if its trigger still holds. */
export const dilemmaComes: EventHandler<'dilemma'> = (s, e, roll) => {
  if (e.crew !== mine(s)) return s;
  const d = dilemma(e.id);
  const slots = d?.trigger(s, s.crews[e.crew], roll.roll('dilemmas'));
  if (!d || !slots) return s;
  const id = s.ids.mail;
  const out = post(s, { crew: e.crew, category: d.category, sender: null, kind: d.id, slots: { ...slots, own: e.crew }, links: [] });
  return { ...out, mail: out.mail.map((m) => (m.id === id ? { ...m, dilemma: { id: d.id, options: d.options, answer: null } } : m)) };
};

/** Whether a dilemma's mail came today and waits for the player (Advance stops on it). */
export const dilemmaWaits = (s: CareerState, id: string): boolean => s.mail.some((m) => m.day === s.day && m.dilemma?.id === id && m.dilemma.answer === null);

export const MAIL: Handlers = {
  AnswerDilemma: (s, c) => {
    const me = mine(s);
    if (me === null) return refuse('sacked', 'You have no crew: take one of the posts offered.');
    const m = whole(c.mail, 0, Number.MAX_SAFE_INTEGER) ? s.mail.find((x) => x.id === c.mail) : undefined;
    if (!m || !m.dilemma) return refuse('mail', 'No such dilemma.');
    if (m.dilemma.answer !== null) return refuse('answered', 'That is decided already.');
    if (!whole(c.option, 0, m.dilemma.options.length - 1)) return refuse('option', 'No such answer.');
    if (Number(m.slots.own) !== me) return refuse('stale', 'That was another crew\'s matter.');
    if (s.race?.started) return refuse('racing', 'The race is under way.');
    const d = dilemma(m.dilemma.id)!;
    const a = d.answer(s, s.crews[me], m.slots, c.option);
    if ('no' in a) return refuse(a.no.code, a.no.sentence);
    return accept({ ...a.state, mail: a.state.mail.map((x) => (x.id === m.id && x.dilemma ? { ...x, read: true, dilemma: { ...x.dilemma, answer: c.option } } : x)) });
  },
  MarkRead: (s, c) => {
    const m = whole(c.mail, 0, Number.MAX_SAFE_INTEGER) ? s.mail.find((x) => x.id === c.mail) : undefined;
    if (!m) return refuse('mail', 'No such message.');
    if (m.read) return refuse('read', 'That is read already.');
    return accept({ ...s, mail: s.mail.map((x) => (x.id === m.id ? { ...x, read: true } : x)) });
  },
};
