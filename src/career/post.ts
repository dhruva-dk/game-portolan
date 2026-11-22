// Posting a message to the player (Phase B section 12). Each section names its messages by a kind and fills its slots;
// the templates that word them, two or more each, are career/mail.ts's. A message addressed to a crew reaches the
// player only if it is theirs: a rival's news is not the player's mail (their scouting reports, their answers).

import type { MailCategory } from '../office.ts';
import { seeded } from './dice.ts';
import type { CareerState, Mail } from './state.ts';

/** What a section posts: the crew it concerns (null: the player whatever their crew), from whom, and its slots. */
export interface Letter {
  crew: number | null;
  category: MailCategory;
  sender: number | null;
  kind: string;
  slots: Mail['slots'];
  links: Mail['links'];
}

/** How many wordings a message has, unless career/mail.ts says otherwise. */
export const WORDINGS = 2;

/** The player's crew, or null before founding or while sacked (section 7). */
export const mine = (s: CareerState): number | null =>
  s.player && !s.player.sacked ? s.player.crew : null;

/** A state with a letter in the player's mail, if it is theirs; its wording chosen by seed. */
export function post(s: CareerState, letter: Letter): CareerState {
  if (!s.player || (letter.crew !== null && letter.crew !== mine(s))) return s;
  const id = s.ids.mail;
  const wording = Math.floor(seeded(s.seed, id)() * WORDINGS);
  const mail: Mail = {
    id,
    day: s.day,
    category: letter.category,
    sender: letter.sender,
    kind: letter.kind,
    wording,
    slots: letter.slots,
    links: letter.links,
    read: false,
    dilemma: null,
  };
  return { ...s, mail: [...s.mail, mail], ids: { ...s.ids, mail: id + 1 } };
}
