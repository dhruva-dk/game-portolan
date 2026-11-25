import type { NewsKind } from './state.ts';

export const WORDINGS: Record<NewsKind, readonly string[]> = {
  yourFinish: [
    "{team} finish {place}. Owner 'encouraged'.",
    '{team} finish {place}. Fish supper canceled.',
    '{team} finish {place}, ahead of several ships that sank.',
  ],
  yourSeason: [
    '{team} end the season {place}. Board of one expresses full confidence.',
    'Season over: {team} are {place}. Next year, apparently.',
  ],
  raceWon: [
    '{team} take {planet}. Rivals blame the wind.',
    '{person} wins at {planet}, thanks nobody.',
  ],
  hired: [
    '{team} sign {person}. Sunglasses remain on.',
    '{person} joins {team} for an undisclosed amount of fish.',
  ],
  poached: [
    '{team} lure {person} from {team2}. Clause paid in full, feelings not.',
    "{person} swaps {team2} for {team}. 'Purely about the project.'",
  ],
  retired: [
    '{person} retires at {age} to spend more time near chips.',
    '{person}, {age}, hangs up the sunglasses.',
  ],
  rookie: ["{person}, {age}, enters the market. Scouts report 'a gull'."],
  repossessed: [
    'Creditors strip {team} to the planks.',
    '{team} lose everything except the name.',
  ],
  streak: ['{team} make it {n} in a row. League considers a rule about that.'],
  title: ['{team} are champions. Parade route: one lap of the planet.'],
  sponsorSigned: [
    "{sponsor} back {team}, citing 'brand alignment with sinking'.",
  ],
  unlocked: ['{team} unveil a {gun}. Nobody is reassured.'],
  lineLead: ["{team} now have the league's best {line}."],
};

export const SPECIAL_WORDING =
  'Creditors take everything from {team} except Uncle.';
