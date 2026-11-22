// Designing a part (Phase B section 8.3, D18): one design at a time per team. Each of the drawing loft's slots (2, 3,
// 4) is dealt three cards from the components the designer knows and the buildings allow, seeded by the design, the
// slot and the deal's count, with one redeal a slot. The design starts from the team's best of the type plus the
// designer's rating × 8 plus the components; it costs by tier and type plus the components; it takes 14 days × the
// designer's Speed × the drawing loft's factor, then 7 − the factory's level to build. When it is drawn, the
// designer's Accuracy fixes the numbers and Innovation may teach a component. Rivals deal and design through these
// same functions (career/works.ts).

import { known } from './canon.ts';
import type { PartType } from '../race.ts';
import { SHIPS } from '../office/command.ts';
import { canSpend, paid } from './balance.ts';
import {
  accept,
  refuse,
  whole,
  why,
  type Check,
  type Handlers,
} from './command.ts';
import {
  TYPES,
  component,
  summed,
  tierOpen,
  unknownOpen,
} from './components.ts';
import { pick, seeded, shuffled, type Dice } from './dice.ts';
import { effective } from './effective.ts';
import { fitted } from './parts.ts';
import { mine, post } from './post.ts';
import { schedule, type Event } from './queue.ts';
import type { PersonOf } from './roles.ts';
import { designSlots, loftFactor, partBuildDays } from './hq.ts';
import {
  accuracyDraw,
  designHead,
  designSpeed,
  innovationChance,
} from './staff.ts';
import type {
  CareerState,
  Team,
  Design,
  Draft,
  Numbers,
  Part,
} from './state.ts';
import { termsFor } from './suppliers.ts';
import { inRole } from './roles.ts';
import { TUNING } from './tuning.ts';

const D = TUNING.design;
const thou = (x: number) => Math.round(x * 1000) / 1000;

/** A team's designer, or null. */
const wright = (s: CareerState, c: Team): PersonOf<'designer'> | null =>
  c.staff.designer === null
    ? null
    : inRole(s.people[c.staff.designer], 'designer');

/** The components a team's designer may put on a design of a type: known, of the type, of a tier its buildings allow. */
export function pool(s: CareerState, team: number, type: PartType): string[] {
  const c = s.teams[team];
  const w = wright(s, c);
  if (!w) return [];
  const open = tierOpen(c.buildings, type);
  return w.components.filter((id) => {
    const k = component(id);
    return k !== null && k.type === type && k.tier <= open;
  });
}

/** The cards a slot is dealt: three of the pool, seeded by the team, its design's number, the slot and the deal. */
export function dealt(
  s: CareerState,
  team: number,
  type: PartType,
  slot: number,
  count: number
): string[] {
  const rand = seeded(
    s.seed ^ (team * 7349 + s.teams[team].designs * 104729),
    slot * 4 + count + TYPES.indexOf(type) * 64
  );
  return shuffled(rand, pool(s, team, type)).slice(0, D.deal);
}

/** Whether a team may deal (or redeal) a slot's cards for a design of a type. */
function dealCheck(
  s: CareerState,
  team: number,
  type: PartType,
  slot: number
): Check {
  const c = s.teams[team];
  if (!TYPES.includes(type)) return why('type', 'No such part.');
  if (!wright(s, c))
    return why('noDesigner', 'The team has no designer to draw it.');
  if (!whole(slot, 0, designSlots(c) - 1))
    return why('slot', 'The drawing loft has no such slot.');
  const d =
    c.draft?.type === type
      ? c.draft.deals.find((x) => x.slot === slot)
      : undefined;
  if (d?.redealt) return why('redealt', 'That slot has had its one redeal.');
  return null;
}

/** A state with a slot dealt (checked first): a new draft if the type changed; a second deal of a slot is its redeal. */
export function dealSlot(
  s: CareerState,
  team: number,
  type: PartType,
  slot: number
): CareerState {
  const c = s.teams[team];
  const draft: Draft = c.draft?.type === type ? c.draft : { type, deals: [] };
  const prior = draft.deals.find((x) => x.slot === slot);
  const cards = dealt(s, team, type, slot, prior ? 1 : 0);
  const deals = [
    ...draft.deals.filter((x) => x.slot !== slot),
    { slot, cards, redealt: !!prior },
  ].sort((a, b) => a.slot - b.slot);
  const teams = [...s.teams];
  teams[team] = { ...c, draft: { type, deals } };
  return { ...s, teams };
}

/** The team's best performance of a type (0 if it has none). */
const bestOf = (c: Team, type: PartType): number =>
  c.parts
    .filter((p) => p.type === type)
    .reduce((a, p) => Math.max(a, p.perf), 0);

/** What a design of a type with some components would be: its projected numbers, cost and days. */
export function projection(
  s: CareerState,
  team: number,
  type: PartType,
  components: readonly string[]
): { numbers: Numbers; cost: number; days: number; build: number } {
  const c = s.teams[team];
  const w = wright(s, c);
  const stats = w ? effective(w, null) : null;
  const e = summed(components);
  const t = termsFor(c.suppliers, type);
  const perf = Math.min(
    1000,
    Math.round(
      bestOf(c, type) + designHead(stats?.[type] ?? 0) + e.perf + t.start
    )
  );
  const perfMax = Math.min(
    1000,
    Math.max(perf, Math.round(perf + D.headroom + e.perfMax + t.max))
  );
  const reliabilityMax = thou(
    Math.min(
      1,
      Math.max(0, D.reliabilityMax + e.reliabilityMax + t.reliability)
    )
  );
  const reliability = thou(
    Math.min(
      reliabilityMax,
      Math.max(0, D.reliability + e.reliability + t.reliability)
    )
  );
  const risk = thou(Math.min(D.riskMost, Math.max(0, e.risk)));
  const tier = components.reduce(
    (a, id) => Math.max(a, component(id)?.tier ?? 1),
    1
  );
  const cost = Math.max(
    0,
    Math.round(D.cost[type] * D.tier[tier - 1] * t.cost + e.balance)
  );
  const days = Math.max(
    1,
    Math.round(D.days * designSpeed(stats?.speed ?? 0) * loftFactor(c)) +
      e.designDays
  );
  const build = Math.max(1, partBuildDays(c) + e.buildDays);
  return {
    numbers: { perf, perfMax, reliability, reliabilityMax, risk },
    cost,
    days,
    build,
  };
}

/** Whether designs for next season may be started: from the season's fifth round (index 4), or once its races are sailed. */
export const forNextOpen = (s: CareerState): boolean =>
  s.round >= D.forNextFrom;

/** Whether a team may start a design. */
export function designCheck(
  s: CareerState,
  team: number,
  type: PartType,
  components: readonly string[],
  forNext: boolean
): Check {
  const c = s.teams[team];
  if (!TYPES.includes(type)) return why('type', 'No such part.');
  if (c.design) return why('inHand', 'A design is already in hand.');
  if (!wright(s, c))
    return why('noDesigner', 'The team has no designer to draw it.');
  if (s.championships[c.tier].rules.spec.includes(type))
    return why(
      'spec',
      'That part is spec this season: everyone sails the standard one.'
    );
  if (forNext && !forNextOpen(s))
    return why('forNext', "Next season's designs begin from round five.");
  if (!Array.isArray(components) || components.length > designSlots(c))
    return why('slots', 'More components than the drawing loft has slots.');
  if (new Set(components).size !== components.length)
    return why('twice', 'A component goes on a design once.');
  const deals = c.draft?.type === type ? c.draft.deals : [];
  const used = new Set<number>();
  const allowed = pool(s, team, type);
  for (const id of components) {
    const d = deals.find((x) => !used.has(x.slot) && x.cards.includes(id));
    if (!d || !allowed.includes(id))
      return why('card', "Each component must be one of a slot's cards.");
    used.add(d.slot);
  }
  if (!canSpend(c, projection(s, team, type, components).cost))
    return why(
      'balance',
      'The chairman will not let the balance fall that far.'
    );
  return null;
}

/** A state with a design started (checked first): paid, the draft spent, the drawing's end scheduled. */
export function started(
  s: CareerState,
  team: number,
  type: PartType,
  components: readonly string[],
  forNext: boolean
): CareerState {
  const p = projection(s, team, type, components);
  const c = s.teams[team];
  const design: Design = {
    type,
    components: [...components],
    forNext,
    started: s.day,
    designed: s.day + p.days,
    built: s.day + p.days + p.build,
    cost: p.cost,
    projected: p.numbers,
    drawn: null,
  };
  const teams = [...s.teams];
  teams[team] = { ...c, design, draft: null, designs: c.designs + 1 };
  const out = paid({ ...s, teams }, team, p.cost, {
    kind: 'design',
    what: `a new ${type}`,
  });
  return schedule(out, design.designed, { kind: 'designed', team });
}

/** The drawing finishes: the designer's Accuracy fixes the numbers, Innovation may teach a component; mail says so
 *  and the build is scheduled. */
export function drawn(
  s: CareerState,
  e: Extract<Event, { kind: 'designed' }>,
  roll: Dice
): CareerState {
  const c = s.teams[e.team];
  const d = c.design;
  if (!d || d.drawn) return s;
  const rand = roll.roll(`design:${e.team}`);
  const w = wright(s, c);
  const stats = w ? effective(w, null) : null;
  const pr = d.projected;
  const perfMax = Math.min(
    1000,
    Math.round(pr.perfMax * accuracyDraw(stats?.accuracy ?? 0, rand))
  );
  const perf = Math.min(
    perfMax,
    Math.round(pr.perf * accuracyDraw(stats?.accuracy ?? 0, rand))
  );
  let out: CareerState = s;
  const teams = [...out.teams];
  teams[e.team] = { ...c, design: { ...d, drawn: { ...pr, perf, perfMax } } };
  out = { ...out, teams };
  out = post(out, {
    team: e.team,
    category: 'ship',
    sender: c.staff.designer,
    kind: 'designFinished',
    slots: { type: d.type, perf, perfMax },
    links: [{ to: 'screen', id: 'design' }],
  });
  if (w && rand() < innovationChance(known(stats).innovation)) {
    const open = unknownOpen(w.components, c.buildings);
    if (open.length > 0) {
      const learnt = pick(rand, open);
      const people = [...out.people];
      people[w.id] = { ...w, components: [...w.components, learnt].sort() };
      out = post(
        { ...out, people },
        {
          team: e.team,
          category: 'ship',
          sender: w.id,
          kind: 'componentLearned',
          slots: { component: learnt },
          links: [],
        }
      );
    }
  }
  return schedule(out, Math.max(out.day, d.built), {
    kind: 'built',
    team: e.team,
  });
}

/** The part is built: it joins the team's parts unfitted; mail says so. A rival fits it where it beats the worse of
 *  its ships' parts of the type (not a part for next season). */
export function built(
  s: CareerState,
  e: Extract<Event, { kind: 'built' }>
): CareerState {
  const c = s.teams[e.team];
  const d = c.design;
  if (!d || !d.drawn) return s;
  const id = s.ids.part;
  const part: Part = {
    id,
    type: d.type,
    ...d.drawn,
    condition: 1,
    components: d.components,
    ship: null,
    forNext: d.forNext,
    spec: false,
    cost: d.cost,
  };
  const teams = [...s.teams];
  teams[e.team] = { ...c, design: null, parts: [...c.parts, part] };
  let out: CareerState = { ...s, teams, ids: { ...s.ids, part: id + 1 } };
  out = post(out, {
    team: e.team,
    category: 'ship',
    sender: c.staff.designer,
    kind: 'partBuilt',
    slots: { type: d.type, part: id },
    links: [{ to: 'part', id }],
  });
  if (c.player || d.forNext) return out;
  const worst = SHIPS.map((ship) => ({
    ship,
    perf: c.parts.find((p) => p.ship === ship && p.type === d.type)?.perf ?? 0,
  })).reduce((a, b) => (b.perf < a.perf ? b : a));
  return part.perf > worst.perf ? fitted(out, e.team, id, worst.ship) : out;
}

export const DESIGNING: Handlers = {
  DealComponents: (s, c) => {
    const me = mine(s);
    if (me === null)
      return refuse(
        'sacked',
        'You have no team: take one of the posts offered.'
      );
    const no = dealCheck(s, me, c.type, c.slot);
    return no
      ? refuse(no.code, no.sentence)
      : accept(dealSlot(s, me, c.type, c.slot));
  },
  StartDesign: (s, c) => {
    const me = mine(s);
    if (me === null)
      return refuse(
        'sacked',
        'You have no team: take one of the posts offered.'
      );
    const no = designCheck(s, me, c.type, c.components, c.forNext === true);
    return no
      ? refuse(no.code, no.sentence)
      : accept(started(s, me, c.type, c.components, c.forNext === true));
  },
};
