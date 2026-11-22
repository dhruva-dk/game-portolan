// The mail's words (Phase B section 12): every kind of message a section posts (career/post.ts), as data, with at
// least two wordings each; the wording is chosen by seed when the message is posted. A template's text names its
// slots in braces ({person}); `render` fills them from the message's slots, a person's or a team's id read as their name,
// a day as "Day 41", a sum as Coin. The twelve dilemmas' words are here too (their rules are career/events.ts's).

import type { Building, Measure } from '../office.ts';
import { component } from './components.ts';
import type { CareerState, Mail } from './state.ts';
import { supplier } from './suppliers.ts';
import { trait } from './traits.ts';

/** A kind's words: a subject and a body, each in two or more wordings (the same count of each). */
export interface Template {
  subject: readonly string[];
  body: readonly string[];
}

const t = (subject: readonly string[], body: readonly string[]): Template => ({
  subject,
  body,
});

/** Every kind of message, by the kind a section posts. */
export const TEMPLATES: Readonly<Record<string, Template>> = {
  // the market (sections 4, 5)
  scoutReport: t(
    ['Report on {person}', '{scout} has seen {person}'],
    [
      '{scout} has watched {person} closely. We know their stars, their potential and their traits now.',
      'My report on {person} is on your desk. Everything there is to know of them, we know. — {scout}',
    ]
  ),
  accepted: t(
    ['{person} accepts', '{person} signs'],
    [
      '{person} has accepted your offer and joins the team.',
      'Terms agreed: {person} has signed with us.',
    ]
  ),
  refused: t(
    ['{person} refuses', 'No from {person}'],
    [
      '{person} has turned your offer down.',
      '{person} will not sign on those terms.',
    ]
  ),
  counter: t(
    ['{person} asks for more', 'A counter from {person}'],
    [
      '{person} would sign, but not on those terms. Their counter stands seven days.',
      '{person} has come back with terms of their own. Take them within the week or they lapse.',
    ]
  ),
  counterLapsed: t(
    ["{person}'s counter lapsed", 'Too late for {person}'],
    [
      "You let {person}'s counter lapse. The talks are over.",
      "{person}'s terms were not taken in time.",
    ]
  ),
  signedElsewhere: t(
    ['{person} signs elsewhere', '{person} went to another team'],
    [
      '{person} took a better offer from another team.',
      'Another team outbid us: {person} has signed with them.',
    ]
  ),
  lapsedPost: t(
    ['The post for {person} is gone', '{person}: no post to offer'],
    [
      'By the time {person} answered, the post you offered was no longer open.',
      '{person} would have answered, but the post you offered is filled.',
    ]
  ),
  silent: t(
    ['{person} will not talk', '{person} has lost patience'],
    [
      '{person} has had enough of low offers and will talk to no one for thirty days.',
      'Too many low offers: {person} is not answering anyone for a month.',
    ]
  ),
  approached: t(
    ['A rival approaches {person}', '{team} wants {person}'],
    [
      '{team} has made {person} an offer. They decide on {day}: a renewal before then may keep them.',
      '{person} has been approached by {team}, and will answer them on {day}.',
    ]
  ),
  contractClosing: t(
    ["{person}'s contract is ending", "Last days of {person}'s contract"],
    [
      "{person}'s contract runs out at this season's end. Other teams may approach them now.",
      "We are into the last sixty days of {person}'s contract. Renew it or lose them.",
    ]
  ),
  contractEnded: t(
    ['{person} has left', "{person}'s contract is over"],
    [
      "{person}'s contract ran out and they have gone to the market.",
      'Out of contract, {person} leaves the team.',
    ]
  ),
  asksToLeave: t(
    ['{person} asks to leave', '{person} is unhappy'],
    [
      '{person} is miserable here and asks to be let go. They will not renew.',
      'A word from {person}: they want out, and will refuse any renewal.',
    ]
  ),
  // the chairmen and the managers' market (section 7)
  chairmanWord: t(
    ['A word from the chairman', 'The chairman writes'],
    [
      'My confidence in you has {rising}, past {level}. I will be watching.',
      'Know this: my trust in your work has {rising} beyond {level}.',
    ]
  ),
  sacked: t(
    ['You are dismissed', 'The chairman lets you go'],
    [
      'The chairman of {team} has sacked you. Look at the posts on offer.',
      "Your time at {team} is over. Other teams' offers wait.",
    ]
  ),
  managerSacked: t(
    ['{team} sacks its manager', 'A manager falls at {team}'],
    ["{team}'s chairman has dismissed {person}.", '{person} is out at {team}.']
  ),
  jobOffer: t(
    ['{team} offers you its post', 'A post at {team}'],
    [
      'The chairman of {team} would have you manage the team. The offer stands until {expires}.',
      '{team} wants you. Answer by {expires}.',
    ]
  ),
  // the parts and the headquarters (sections 8, 9)
  designFinished: t(
    ['The {type} design is drawn', 'Drawings done: {type}'],
    [
      'The new {type} is drawn: it rates {perf}, at most {perfMax}. The improvement builds it now.',
      'I have finished the {type}. It comes out at {perf}, room to {perfMax}.',
    ]
  ),
  componentLearned: t(
    ['A new component: {component}', 'Learnt: {component}'],
    [
      'Drawing that design taught me something: we can use the {component} now.',
      'I have worked out the {component}. It is ours to deal from now on.',
    ]
  ),
  partBuilt: t(
    ['The new {type} is built', 'A {type} off the slipway'],
    [
      'The improvement has finished the new {type}. Fit it when you will.',
      'Our new {type} is ready in the store.',
    ]
  ),
  buildingFinished: t(
    ['The {building} is finished', 'Works done: {building}'],
    [
      'The {building} stands at level {level}.',
      'Builders are out of the {building}: it is level {level} now.',
    ]
  ),
  // money and sponsors (section 10)
  sponsorOffer: t(
    ['An offer from {name}', '{name} would back us'],
    [
      '{name} offers to back the team. The offer stands until {expires}.',
      "A sponsor's agent: {name} would sign with us, until {expires}.",
    ]
  ),
  objectiveMet: t(
    ['Objective met', 'The sponsor is pleased'],
    [
      "We met the sponsor's objective ({objective}): the bonus is paid.",
      '{objective}: done. The bonus is ours.',
    ]
  ),
  objectiveMissed: t(
    ['Objective missed', 'No bonus this race'],
    [
      "We missed the sponsor's objective ({objective}).",
      '{objective}: not met. No bonus.',
    ]
  ),
  sponsorLeft: t(
    ['{name} leaves us', "The end of {name}'s backing"],
    ["{name}'s agreement has run its course.", '{name} has paid its last race.']
  ),
  // inspection and the Admiralty (sections 8.5, 11)
  inspectionClean: t(
    ['Inspection: clean', 'The inspectors found nothing'],
    [
      "The Admiralty's inspectors went over our ships and found nothing.",
      'Inspected and clean.',
    ]
  ),
  inspectionFound: t(
    ['Inspection: parts confiscated', 'Caught by the inspectors'],
    [
      'The inspectors took {parts} of our parts, fined us {fine} and struck {struck} points.',
      '{parts} parts confiscated, a fine of {fine}, and {struck} points struck from the race.',
    ]
  ),
  inspectionTier: t(
    ["{tier}: the inspectors' round", 'Inspections in {tier}'],
    [
      '{inspected} teams were inspected. Caught: {found}.',
      'The Admiralty inspected {inspected} teams. Found wanting: {found}.',
    ]
  ),
  voteDue: t(
    ['A vote is due: {measure}', 'The Admiralty proposes: {measure}'],
    [
      'The Admiralty puts a change to {measure} to the tier. The vote closes on {closes}.',
      'A proposal on {measure}: cast our vote by {closes}.',
    ]
  ),
  voteResult: t(
    ['The vote is counted', "The Admiralty's count"],
    [
      'The proposal was {carried}: {for} for, {against} against.',
      '{for} for, {against} against: {carried}.',
    ]
  ),
  // race day and the season (section 13)
  driverUnfit: t(
    ['{person} is injured', '{person} is unfit'],
    [
      '{person} is unfit for {races} races.',
      'The surgeon says {person} will miss {races} races.',
    ]
  ),
  driverFit: t(
    ['{person} is fit again', '{person} is back'],
    [
      '{person} is fit to sail again.',
      'Good news: {person} has been passed fit.',
    ]
  ),
  standIn: t(
    ['{person} sails for us today', 'A stand-in: {person}'],
    [
      'With no driver fit, {person} was engaged to sail for one race at {wage}.',
      '{person} sails ship two today, hired for the race at {wage}.',
    ]
  ),
  forfeit: t(
    ['Race forfeit', 'Our race was forfeit'],
    [
      'The race was cut short on our side and is forfeit: our ship counts as sunk at the start. The rest was sailed out.',
      'We lost our race: the logbook stopped mid-race, so it stands forfeit, ship one sunk at the start.',
    ]
  ),
  roundResults: t(
    ['{tier}: the results', 'Elsewhere: {tier}'],
    [
      '{tier} has sailed: {first} won, ahead of {second} and {third}.',
      'In {tier}, {first} took the race; {second} and {third} followed.',
    ]
  ),
  retired: t(
    ['{person} retires', 'Farewell to {person}'],
    [
      '{person} has retired.',
      'After a long career, {person} has hung up their glasses.',
    ]
  ),
  traitGained: t(
    ['{person}: {trait}', '{person} has changed'],
    [
      '{person} has become known as {trait}.',
      'Word is {person} is {trait} now.',
    ]
  ),
  traitLost: t(
    ['{person} is no longer {trait}', '{person} has changed'],
    ['{person} has lost the name {trait}.', '{trait} no longer fits {person}.']
  ),
  seasonEnded: t(
    ['The season is over', "Season's end"],
    [
      'We finished {place} in {tier}, for a prize of {prize}. {moved}',
      'Final place: {place} of {tier}. Prize money: {prize}. {moved}',
    ]
  ),
  seasonPlanets: t(
    ["The season's calendar", 'Ten planets'],
    [
      'Season {season} is set: ten races, the first on {planet} on {firstDay}.',
      'The Admiralty has fixed the season: {planet} opens it on {firstDay}.',
    ]
  ),
  raceResult: t(
    ['Our race: {place}', 'Race report'],
    [
      'Our best ship finished {place}: {points} points. We stand {standing} in {tier}.',
      '{points} points from the race, our best ship {place}. {standing} in {tier} now.',
    ]
  ),
  supplierDue: t(
    ['Choose your suppliers', 'Suppliers for the season'],
    [
      'Timber, canvas and cordage: choose one supplier of each before the first race.',
      "The suppliers' agents are waiting. Pick our timber, canvas and cordage before the first race.",
    ]
  ),
  // the dilemmas (career/events.ts)
  riseAsk: t(
    ['{person} wants a rise', 'A word about money from {person}'],
    [
      '{person} feels undervalued and asks for more money.',
      '{person} says the wage is not enough and wants it put right.',
    ]
  ),
  shipsArgue: t(
    ['The ships argue over the {type}', 'Trouble over the new {type}'],
    [
      '{person} is angry the new {type} went to the other ship.',
      'The new {type} has split the team: {person} says it should have been theirs.',
    ]
  ),
  bondFallOut: t(
    ['{mechanic} and {person} have fallen out', 'A quarrel on ship {ship}'],
    [
      '{mechanic} and {person} cannot work together. Something must be done.',
      "Ship {ship}'s mechanic {mechanic} and driver {person} are not speaking.",
    ]
  ),
  greyComponent: t(
    ['A grey component', 'An offer under the counter'],
    [
      '{person} has been offered a component the Admiralty would not like, for the {type}.',
      'A supplier has slipped {person} something for our {type} design. It is not quite legal.',
    ]
  ),
  sponsorGuest: t(
    ['{name} wants a guest aboard', 'A guest for ship two'],
    [
      '{name} asks to put a guest aboard ship two next race. They pay {balance} for it.',
      '{name} offers {balance} if their guest can ride ship two next race.',
    ]
  ),
  pitWorn: t(
    ['The pit crew is worn out', '{person} is exhausted'],
    [
      '{person} is worn out. The pit crew needs a decision before the race.',
      'The {job} job is wearing {person} down.',
    ]
  ),
  partSwap: t(
    ['{team} offers a swap', 'A trade from {team}'],
    [
      '{team} would swap their {give} for our {take}.',
      '{team} proposes a trade of parts: their {give} for our {take}.',
    ]
  ),
  pressChairman: t(
    ['The press asks about the chairman', 'Questions about the chairman'],
    [
      'The press want to know if you and the chairman see eye to eye.',
      "Reporters are asking about the chairman's faith in you.",
    ]
  ),
  youngTrial: t(
    ['{person} asks for a trial', 'A young hopeful: {person}'],
    [
      '{person}, a young driver, asks for a trial with the team.',
      '{person} wants a chance to show what they can do.',
    ]
  ),
  stormDamage: t(
    ['Storm damage at the headquarters', 'The storm hit the {building}'],
    [
      "Last night's storm damaged the {building}. Repairs now cost {balance}.",
      'The {building} took a beating in the storm: {balance} to repair it at once.',
    ]
  ),
  unfitWantsSail: t(
    ['{person} wants to sail', '{person} asks to race'],
    [
      '{person} has one more race out but says they are fit to sail.',
      '{person} insists they can race, though the surgeon wants one more week.',
    ]
  ),
  testingExemption: t(
    ['The Admiralty offers an exemption', 'A testing exemption'],
    [
      "As one of the tier's two lowest teams, we may take extra testing time.",
      'The Admiralty offers the lowest teams more improvement time. The press will notice.',
    ]
  ),
};

const TIERS = ['Tier 1', 'Tier 2', 'Tier 3'];
const BUILDINGS: Readonly<Record<Building, string>> = {
  factory: 'factory',
  drawingLoft: 'drawing loft',
  testTank: 'test tank',
  foundry: 'foundry',
  sailingSchool: 'sailing school',
  pitHouse: 'pit loft',
  crowsNest: "crow's nest",
  fishMarket: 'fish market',
  landingPad: 'landing pad',
};
const MEASURES: Readonly<Record<Measure, string>> = {
  spec: 'the spec parts',
  storm: "the storm's pace",
  ban: 'a gun ban',
  pointsPerSinking: 'points for a sinking',
  seaHeldPoint: 'the sea-held point',
  prizeSpread: "the prize money's spread",
  inspection: 'the inspection rate',
};
const OBJECTIVES: Readonly<Record<string, string>> = {
  top10: 'finish in the top ten',
  sinkTwo: 'sink two ships',
  afloat: 'both ships afloat',
  mostSea: 'hold the most sea',
};
const ORDINAL = (n: number): string =>
  `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;

/** What a slot's value reads as, by the slot's name. */
function slotText(s: CareerState, key: string, value: string | number): string {
  const n = Number(value);
  const person = () =>
    s.people[n] ? `${s.people[n].given} ${s.people[n].family}` : 'someone';
  const team = (id: number) => s.teams[id]?.name ?? 'a team';
  switch (key) {
    case 'person':
    case 'scout':
    case 'mechanic':
      return person();
    case 'team':
    case 'first':
    case 'second':
    case 'third':
      return team(n);
    case 'tier':
      return TIERS[n] ?? 'the tier';
    case 'day':
    case 'expires':
    case 'closes':
    case 'firstDay':
      return `Day ${n}`;
    case 'fine':
    case 'balance':
    case 'prize':
    case 'wage':
      return `${Math.round(n)} Coin`;
    case 'building':
      return BUILDINGS[value as Building] ?? String(value);
    case 'component':
      return component(String(value))?.name ?? String(value);
    case 'trait':
      return trait(String(value)).name;
    case 'measure':
      return MEASURES[value as Measure] ?? String(value);
    case 'objective':
      return OBJECTIVES[String(value)] ?? String(value);
    case 'supplier':
      return supplier(String(value))?.name ?? String(value);
    case 'place':
    case 'standing':
      return ORDINAL(n);
    case 'rising':
      return n ? 'risen' : 'fallen';
    case 'carried':
      return n ? 'carried' : 'lost';
    case 'moved':
      return n > 0 ? 'We are promoted.' : n < 0 ? 'We are relegated.' : '';
    case 'season':
      return String(n + 1);
    case 'ship':
      return String(n + 1);
    case 'found':
      return String(value) === ''
        ? 'no one'
        : String(value)
            .split(',')
            .map((x) => team(Number(x)))
            .join(', ');
    default:
      return String(value);
  }
}

/** A template's text with its slots filled from a message. */
export const filled = (
  s: CareerState,
  text: string,
  slots: Mail['slots']
): string =>
  text
    .replace(/\{(\w+)\}/g, (all, key: string) =>
      key in slots ? slotText(s, key, slots[key]) : all
    )
    .trim();

/** A message's subject and body, in its wording. A kind with no template reads plainly as its kind. */
export function render(
  s: CareerState,
  m: Mail
): { subject: string; body: string } {
  const tpl = TEMPLATES[m.kind];
  if (!tpl) return { subject: m.kind, body: '' };
  return {
    subject: filled(s, tpl.subject[m.wording % tpl.subject.length], m.slots),
    body: filled(s, tpl.body[m.wording % tpl.body.length], m.slots),
  };
}
