// Sponsors (Phase B section 10): three slots a team. Offers come every few rounds (a `sponsorOffer` event a team, every
// 42 days), their size by the team's marketability and their tier (at most the landing pad's level). A sponsor pays a
// fixed sum a race (career/money.ts raceMoney), or a bonus for the objective chosen in each race plan from their list
// (finish top 10; sink two ships; both ships afloat at the end; hold the most sea in the team's tier), harder paying
// more, for a number of races. SignSponsor. Rivals sign by Finance (career/works.ts).

import type { Objective, Sponsor, SponsorOffer } from './state.ts';
import { paid } from './balance.ts';
import {
  accept,
  refuse,
  whole,
  why,
  type Check,
  type Handlers,
} from './command.ts';
import { between, shuffled, type Dice } from './dice.ts';
import { sponsor as sponsorName } from './names.ts';
import { mine, post } from './post.ts';
import { schedule, type Event } from './queue.ts';
import { teamMarketability } from './reputation.ts';
import { sponsorTier } from './hq.ts';
import type { CareerState, Team } from './state.ts';
import { TUNING } from './tuning.ts';

const P = TUNING.sponsors;
export const OBJECTIVES: readonly Objective[] = [
  'top10',
  'sinkTwo',
  'afloat',
  'mostSea',
];

/** A sponsor's worth a race to a team: its fixed sum, or its bonus × the mean weight of its objectives × an even chance. */
export const sponsorWorth = (p: Sponsor): number =>
  p.objectives.length === 0
    ? p.perRace
    : (p.bonus * p.objectives.reduce((a, o) => a + P.objectives[o], 0)) /
      p.objectives.length /
      2;

/** A sponsor's offers made to a team today: `count` of them, drawn. */
export function sponsorOffers(
  s: CareerState,
  c: Team,
  rand: () => number,
  count: number
): { offers: SponsorOffer[]; next: number } {
  let id = s.ids.sponsor;
  const market =
    teamMarketability(s, c) * P.tier[Math.min(P.tier.length - 1, c.tier)];
  const offers: SponsorOffer[] = [];
  for (let i = 0; i < count; i++) {
    const tier = between(rand, 1, Math.max(1, sponsorTier(c)));
    const scale = market * P.tier[tier - 1];
    const races = between(rand, P.races[0], P.races[1]);
    const objective = rand() < P.objectiveShare;
    const objectives = objective
      ? shuffled(rand, OBJECTIVES)
          .slice(0, between(rand, 2, 3))
          .sort((a, b) => OBJECTIVES.indexOf(a) - OBJECTIVES.indexOf(b))
      : [];
    const sponsor: Sponsor = {
      id: id++,
      name: sponsorName(rand),
      perRace: objective ? 0 : Math.round(P.perRace * scale),
      objectives,
      bonus: objective ? Math.round(P.bonus * scale) : 0,
      races,
      tier,
    };
    offers.push({ sponsor, expires: s.day + P.stand });
  }
  return { offers, next: id };
}

/** A team's offers come: the lapsed ones dropped, new ones dealt; the player is mailed; the next scheduled. */
export function offersCome(
  s: CareerState,
  e: Extract<Event, { kind: 'sponsorOffer' }>,
  roll: Dice
): CareerState {
  const c = s.teams[e.team];
  const { offers, next } = sponsorOffers(s, c, roll.roll('sponsors'), P.offers);
  const teams = [...s.teams];
  teams[e.team] = {
    ...c,
    offers: [...c.offers.filter((o) => o.expires >= s.day), ...offers],
  };
  let out: CareerState = { ...s, teams, ids: { ...s.ids, sponsor: next } };
  for (const o of offers) {
    out = post(out, {
      team: e.team,
      category: 'finance',
      sender: null,
      kind: 'sponsorOffer',
      slots: {
        sponsor: o.sponsor.id,
        name: o.sponsor.name,
        expires: o.expires,
      },
      links: [],
    });
  }
  return schedule(out, s.day + P.every, { kind: 'sponsorOffer', team: e.team });
}

/** Whether a team may sign an offered sponsor into a slot (a sponsor there already is replaced). */
export function signCheck(
  s: CareerState,
  team: number,
  offer: number,
  slot: number
): Check {
  const c = s.teams[team];
  if (!whole(slot, 0, P.slots - 1))
    return why('slot', 'A team has three sponsor slots.');
  const o = c.offers.find((x) => x.sponsor.id === offer);
  if (!o) return why('offer', 'No such offer stands.');
  if (o.expires < s.day) return why('lapsed', 'That offer has lapsed.');
  if (o.sponsor.tier > sponsorTier(c))
    return why(
      'tier',
      'The landing pad cannot receive a sponsor of that standing.'
    );
  return null;
}

/** A state with a sponsor signed into a slot (checked first). */
export function signedSponsor(
  s: CareerState,
  team: number,
  offer: number,
  slot: number
): CareerState {
  const c = s.teams[team];
  const o = c.offers.find((x) => x.sponsor.id === offer)!;
  const sponsors = [0, 1, 2].map((i) =>
    i === slot ? o.sponsor : (c.sponsors[i] ?? null)
  );
  const teams = [...s.teams];
  teams[team] = { ...c, sponsors, offers: c.offers.filter((x) => x !== o) };
  return { ...s, teams };
}

/** How a team's race went, for its sponsors' objectives. */
export interface Outcome {
  best: number | null;
  sinkings: number;
  afloat: number;
  mostSea: boolean;
}

/** Whether an objective was met. */
export function objectiveMet(o: Objective, r: Outcome): boolean {
  switch (o) {
    case 'top10':
      return r.best !== null && r.best <= 10;
    case 'sinkTwo':
      return r.sinkings >= 2;
    case 'afloat':
      return r.afloat >= 2;
    case 'mostSea':
      return r.mostSea;
  }
}

/** A state after a race for a team's sponsors: each objective sponsor pays its bonus × the objective's weight if the one
 *  chosen (`chosen[slot]`, an index into its list; the first if none) was met, and mail says met or missed; every
 *  sponsor has a race fewer, and leaves at none. Section 13 calls it as the round closes. */
export function sponsorsAfterRace(
  s: CareerState,
  team: number,
  r: Outcome,
  chosen: readonly (number | null)[]
): CareerState {
  let out = s;
  const c = s.teams[team];
  const sponsors = c.sponsors.map((p, slot) => {
    if (!p) return null;
    if (p.objectives.length > 0) {
      const o =
        p.objectives[
          Math.min(p.objectives.length - 1, Math.max(0, chosen[slot] ?? 0))
        ];
      const met = objectiveMet(o, r);
      if (met)
        out = paid(out, team, -Math.round(p.bonus * P.objectives[o]), {
          kind: 'sponsor',
          what: `${p.name}'s bonus`,
        });
      out = post(out, {
        team,
        category: 'finance',
        sender: null,
        kind: met ? 'objectiveMet' : 'objectiveMissed',
        slots: { sponsor: p.id, objective: o },
        links: [],
      });
    }
    if (p.races <= 1) {
      out = post(out, {
        team,
        category: 'finance',
        sender: null,
        kind: 'sponsorLeft',
        slots: { sponsor: p.id, name: p.name },
        links: [],
      });
      return null;
    }
    return { ...p, races: p.races - 1 };
  });
  const teams = [...out.teams];
  teams[team] = { ...out.teams[team], sponsors };
  return { ...out, teams };
}

export const SPONSORS: Handlers = {
  SignSponsor: (s, c) => {
    const me = mine(s);
    if (me === null)
      return refuse(
        'sacked',
        'You have no team: take one of the posts offered.'
      );
    const no = signCheck(s, me, c.offer, c.slot);
    return no
      ? refuse(no.code, no.sentence)
      : accept(signedSponsor(s, me, c.offer, c.slot));
  },
};
