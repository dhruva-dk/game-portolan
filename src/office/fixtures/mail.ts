// The fixture's mail on 10 May 2026: the season's letters so far, newest
// first, as the career's templates word them; the open one a dilemma from her
// driver, unanswered, naming them and the team's drivers. Names as long as a
// career's.

import type { Letter, MailPaper } from '../papers.ts';
import { PROFILE } from './profile.ts';
import { HERS } from './teams.ts';

/** A letter, unread and not waiting on an answer unless said. */
const letter = (
  id: number,
  date: string,
  subject: string,
  from: string,
  sender: number | null,
  about: Letter['about'],
  kind: Letter['kind'],
  more: { unread?: boolean; sealed?: boolean } = {}
): Letter => ({
  id,
  date,
  subject,
  from,
  sender,
  about,
  kind,
  unread: more.unread ?? false,
  sealed: more.sealed ?? false,
});

const SEC = "The Admiralty's secretary";

const LETTERS: readonly Letter[] = [
  letter(
    12,
    '10 May 2026',
    'Corvin Ashdown-Pell Wants a Rise',
    'Corvin Ashdown-Pell',
    41,
    'Team',
    'team',
    { unread: true, sealed: true }
  ),
  letter(
    11,
    '9 May 2026',
    'Report on Isolde Varrenhythe',
    'Mabry Quill',
    52,
    'Market',
    'market',
    { unread: true }
  ),
  letter(
    10,
    '8 May 2026',
    'The Rudder Design Is Drawn',
    'Tamsin Orrely',
    47,
    'Ship',
    'ship',
    { unread: true }
  ),
  letter(
    9,
    '6 May 2026',
    'A Grey Component',
    'Tamsin Orrely',
    47,
    'Ship',
    'ship',
    { sealed: true }
  ),
  letter(
    8,
    '2 May 2026',
    'Results from Tharvenna',
    SEC,
    null,
    'Championship',
    'tier'
  ),
  letter(
    7,
    '28 April 2026',
    'The Composites Plant Is Built',
    SEC,
    null,
    'Headquarters',
    'hq'
  ),
  letter(
    6,
    '24 April 2026',
    'A Word from the Chairman',
    'Maneette Greymere',
    3,
    'Chairman',
    'chairman'
  ),
  letter(
    5,
    '18 April 2026',
    'Results from Ulmoreth',
    SEC,
    null,
    'Championship',
    'tier'
  ),
  letter(
    4,
    '12 April 2026',
    'Grey Harbour Signs On',
    SEC,
    null,
    'Finances',
    'finance'
  ),
  letter(
    3,
    '4 April 2026',
    'A Rival Approaches Wenna Strathcairn',
    'Mabry Quill',
    52,
    'Market',
    'market'
  ),
  letter(
    2,
    '1 April 2026',
    'The Season’s Calendar',
    SEC,
    null,
    'Championship',
    'tier'
  ),
  letter(
    1,
    '1 April 2026',
    `Welcome to ${HERS.name}`,
    'Maneette Greymere',
    3,
    'Chairman',
    'chairman'
  ),
];

const OPEN = LETTERS[0];

export const MAIL: MailPaper = {
  letters: LETTERS,
  open: OPEN
    ? {
        ...OPEN,
        face: {
          seed: 41,
          role: 'driver',
          age: 27,
          colours: PROFILE.face.colours,
          emblem: HERS.emblem,
        },
        body: 'Corvin Ashdown-Pell feels undervalued and asks for more money.',
        names: [
          {
            name: 'Corvin Ashdown-Pell',
            ask: { kind: 'person', id: 41, screen: 'profile' },
          },
          { name: 'Drivers', ask: { kind: 'open', screen: 'drivers' } },
        ],
        options: [
          {
            text: 'Pay',
            hint: 'Pleases Corvin Ashdown-Pell. Their wage rises by 54 a race.',
          },
          {
            text: 'Refuse',
            hint: 'Angers Corvin Ashdown-Pell greatly. Costs nothing.',
          },
          {
            text: 'Promise',
            hint: 'Pleases Corvin Ashdown-Pell a little. A bonus of 180, paid only on a podium.',
          },
        ],
        answer: null,
      }
    : null,
};
