// The fixture's sponsors: two slots signed (a fixed sum, and one paying for
// objectives), the third empty; three offers standing, the last of a grade her
// landing pad cannot receive. What the slots are worth a race is the
// finances' sponsors line. Names as long as a career's ("<family> & <relation>,
// <trade>").

import type { SponsorsPaper } from '../papers.ts';

const OPEN = { ok: true, why: '' };
const PAD = {
  ok: false,
  why: 'The landing pad cannot receive a sponsor of that standing.',
};

export const SPONSORS: SponsorsPaper = {
  slots: [
    {
      id: 1,
      name: 'Greymere & Daughters, Saltworks',
      grade: 2,
      races: 6,
      perRace: 24000,
      objectives: [],
      worth: 24000,
    },
    {
      id: 2,
      name: 'Varnhollow & Sons, Ropemakers',
      grade: 1,
      races: 3,
      perRace: 0,
      objectives: [
        { label: 'A ship in the first 10', pays: 21000 },
        { label: '3 of yours afloat at the end', pays: 25000 },
      ],
      worth: 18000,
    },
    null,
  ],
  offers: [
    {
      id: 7,
      name: 'Esketh & Brothers, Chandlers',
      grade: 2,
      races: 8,
      perRace: 19500,
      objectives: [],
      worth: 19500,
      days: 9,
      into: [OPEN, OPEN, OPEN],
    },
    {
      id: 8,
      name: 'Holloway & Partners, Lamp Oil',
      grade: 1,
      races: 5,
      perRace: 0,
      objectives: [
        { label: 'A ship in the first 10', pays: 18000 },
        { label: '2 ships sunk', pays: 28800 },
        { label: 'The most sea held', pays: 32400 },
      ],
      worth: 16000,
      days: 3,
      into: [OPEN, OPEN, OPEN],
    },
    {
      id: 9,
      name: 'Corrigan & Cousins, Shipwrights',
      grade: 3,
      races: 10,
      perRace: 36000,
      objectives: [],
      worth: 36000,
      days: 12,
      into: [PAD, PAD, PAD],
    },
  ],
  marketability: 46,
  grade: 2,
  grades: 3,
  next: 23,
  worth: 42000,
};
