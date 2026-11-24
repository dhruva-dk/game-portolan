// The board and a season's review as the fixture career has them. The board
// four races into 1719: a chairman ambitious and tight with money, confidence
// sliding below the line after a poor run, money asked for and refused. The
// review: 1718 in the Third Championship, fourth against a target of sixth,
// with two promoted, the rules turned for the season after.

import type { BoardView, SeasonView } from '../board.ts';
import { HERS, TEAMS } from './teams.ts';

const team = (i: number) => TEAMS[i] ?? HERS;

export const BOARD: BoardView = {
  teamId: HERS.id,
  team: HERS.name,
  chairman: {
    person: 88,
    name: 'Aurelian Fitzwarren-Blythe',
    face: {
      seed: 88,
      role: 'chairman',
      age: 61,
      colours: { dye: HERS.emblem, pattern: 0 },
      emblem: HERS.emblem,
    },
  },
  temper: [
    {
      name: 'Ambition',
      value: 15,
      says: 'Expects the team near the top: an easier target is hard won.',
    },
    { name: 'Patience', value: 9, says: 'Lets a few poor races pass.' },
    {
      name: 'Generosity',
      value: 5,
      says: 'Keeps a tight purse: money and a lower floor are hard won.',
    },
    { name: 'Meddling', value: 12, says: 'Has a say now and then.' },
  ],
  confidence: 33,
  verdict: 35,
  missedBy: 5,
  rounds: 10,
  marks: [
    { round: 0, planet: 'Brindle', confidence: 52, place: 9 },
    { round: 1, planet: 'Tharvenna', confidence: 47, place: 11 },
    { round: 2, planet: 'Ulmoreth', confidence: 41, place: 12 },
    { round: 3, planet: 'Saltmere', confidence: 33, place: 12 },
  ],
  target: '6th',
  standing: '12th of 20',
  budget: '640,000',
  balance: '211,000',
  floor: '−212,000',
  requests: [
    {
      ask: 'money',
      name: 'Money for the team',
      gives: '64,000 into the balance',
      bar: 81,
      asked: false,
      act: { ok: false, why: 'You have asked that once this season.' },
    },
    {
      ask: 'floor',
      name: 'A lower debt floor',
      gives: 'The floor down to −276,000',
      bar: 81,
      asked: null,
      act: { ok: true, why: '' },
    },
    {
      ask: 'target',
      name: 'An easier target',
      gives: '8th instead of 6th',
      bar: 85,
      asked: null,
      act: { ok: true, why: '' },
    },
  ],
  costs: { granted: 3, refused: 6 },
};

export const SEASON: SeasonView = {
  year: '1718',
  seasons: [
    { season: 2, year: '1718' },
    { season: 1, year: '1717' },
  ],
  season: 2,
  teamId: HERS.id,
  team: HERS.name,
  tier: 'Third Championship',
  sacked: false,
  place: 4,
  of: 20,
  target: '6th',
  met: 2,
  points: 148,
  wins: 1,
  podiums: 4,
  sinkings: 23,
  prize: '38,400',
  confidence: 71,
  honours: ['Target met', '1 race won'],
  champions: [
    { tier: 'First Championship', team: team(0).id, name: team(0).name },
    { tier: 'Second Championship', team: team(5).id, name: team(5).name },
    { tier: 'Third Championship', team: team(6).id, name: team(6).name },
  ],
  moves: [
    {
      team: team(6).id,
      name: team(6).name,
      from: 'Third Championship',
      up: true,
    },
    {
      team: team(7).id,
      name: team(7).name,
      from: 'Third Championship',
      up: true,
    },
    {
      team: team(5).id,
      name: team(5).name,
      from: 'Second Championship',
      up: true,
    },
    {
      team: team(4).id,
      name: team(4).name,
      from: 'Second Championship',
      up: true,
    },
    {
      team: team(8).id,
      name: team(8).name,
      from: 'Second Championship',
      up: false,
    },
    {
      team: team(9).id,
      name: team(9).name,
      from: 'Second Championship',
      up: false,
    },
    {
      team: team(1).id,
      name: team(1).name,
      from: 'First Championship',
      up: false,
    },
    {
      team: team(2).id,
      name: team(2).name,
      from: 'First Championship',
      up: false,
    },
  ],
  retired: [
    { person: 120, name: 'Ottoline Quarrie', role: 'Driver' },
    { person: 121, name: 'Gideon Thrale', role: 'Designer' },
  ],
  arrivals: [
    { person: 900, name: 'Wenna Strathcairn', role: 'Driver', age: 17 },
    { person: 901, name: 'Lucan Ferrers', role: 'Mechanic', age: 18 },
    { person: 902, name: 'Isolde Varrenhythe', role: 'Driver', age: 16 },
  ],
  rules: [
    { name: 'The sea-held point', was: 'None', now: 'Given' },
    { name: 'The storm’s pace', was: '×1.0', now: '×1.2' },
  ],
};
