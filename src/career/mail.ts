// The mail's words (Phase B section 12): every kind of message a section posts (career/post.ts), as data, with at
// least two wordings each; the wording is chosen by seed when the message is posted. A template's text names its
// slots in braces ({gull}); `render` fills them from the message's slots, a gull's or a crew's id read as their name,
// a day as "Day 41", a sum as Coin. The twelve dilemmas' words are here too (their rules are career/events.ts's).

import type { Building, Measure } from '../office.ts';
import { component } from './components.ts';
import type { CareerState, Mail } from './state.ts';
import { supplier } from './suppliers.ts';
import { trait } from './traits.ts';

/** A kind's words: a subject and a body, each in two or more wordings (the same count of each). */
export interface Template { subject: readonly string[]; body: readonly string[] }

const t = (subject: readonly string[], body: readonly string[]): Template => ({ subject, body });

/** Every kind of message, by the kind a section posts. */
export const TEMPLATES: Readonly<Record<string, Template>> = {
  // the market (sections 4, 5)
  scoutReport: t(['Report on {gull}', '{scout} has seen {gull}'],
    ['{scout} has watched {gull} closely. We know their stars, their potential and their traits now.', 'My report on {gull} is on your desk. Everything there is to know of them, we know. — {scout}']),
  accepted: t(['{gull} accepts', '{gull} signs'], ['{gull} has accepted your offer and joins the crew.', 'Terms agreed: {gull} has signed with us.']),
  refused: t(['{gull} refuses', 'No from {gull}'], ['{gull} has turned your offer down.', '{gull} will not sign on those terms.']),
  counter: t(['{gull} asks for more', 'A counter from {gull}'],
    ['{gull} would sign, but not on those terms. Their counter stands seven days.', '{gull} has come back with terms of their own. Take them within the week or they lapse.']),
  counterLapsed: t(['{gull}\'s counter lapsed', 'Too late for {gull}'], ['You let {gull}\'s counter lapse. The talks are over.', '{gull}\'s terms were not taken in time.']),
  signedElsewhere: t(['{gull} signs elsewhere', '{gull} went to another crew'], ['{gull} took a better offer from another crew.', 'Another crew outbid us: {gull} has signed with them.']),
  lapsedPost: t(['The post for {gull} is gone', '{gull}: no post to offer'], ['By the time {gull} answered, the post you offered was no longer open.', '{gull} would have answered, but the post you offered is filled.']),
  silent: t(['{gull} will not talk', '{gull} has lost patience'], ['{gull} has had enough of low offers and will talk to no one for thirty days.', 'Too many low offers: {gull} is not answering anyone for a month.']),
  approached: t(['A rival approaches {gull}', '{crew} wants {gull}'],
    ['{crew} has made {gull} an offer. They decide on {day}: a renewal before then may keep them.', '{gull} has been approached by {crew}, and will answer them on {day}.']),
  contractClosing: t(['{gull}\'s contract is ending', 'Last days of {gull}\'s contract'],
    ['{gull}\'s contract runs out at this season\'s end. Other crews may approach them now.', 'We are into the last sixty days of {gull}\'s contract. Renew it or lose them.']),
  contractEnded: t(['{gull} has left', '{gull}\'s contract is over'], ['{gull}\'s contract ran out and they have gone to the market.', 'Out of contract, {gull} leaves the crew.']),
  asksToLeave: t(['{gull} asks to leave', '{gull} is unhappy'], ['{gull} is miserable here and asks to be let go. They will not renew.', 'A word from {gull}: they want out, and will refuse any renewal.']),
  // the elders and the managers' market (section 7)
  elderWord: t(['A word from the elder', 'The elder writes'],
    ['My confidence in you has {rising}, past {level}. I will be watching.', 'Know this: my trust in your work has {rising} beyond {level}.']),
  sacked: t(['You are dismissed', 'The elder lets you go'], ['The elder of {crew} has sacked you. Look at the posts on offer.', 'Your time at {crew} is over. Other crews\' offers wait.']),
  managerSacked: t(['{crew} sacks its manager', 'A manager falls at {crew}'], ['{crew}\'s elder has dismissed {gull}.', '{gull} is out at {crew}.']),
  jobOffer: t(['{crew} offers you its post', 'A post at {crew}'],
    ['The elder of {crew} would have you manage the crew. The offer stands until {expires}.', '{crew} wants you. Answer by {expires}.']),
  // the parts and the rookery (sections 8, 9)
  designFinished: t(['The {type} design is drawn', 'Drawings done: {type}'],
    ['The new {type} is drawn: it rates {perf}, at most {perfMax}. The yard builds it now.', 'I have finished the {type}. It comes out at {perf}, room to {perfMax}.']),
  componentLearned: t(['A new component: {component}', 'Learnt: {component}'],
    ['Drawing that design taught me something: we can use the {component} now.', 'I have worked out the {component}. It is ours to deal from now on.']),
  partBuilt: t(['The new {type} is built', 'A {type} off the slipway'], ['The yard has finished the new {type}. Fit it when you will.', 'Our new {type} is ready in the store.']),
  buildingFinished: t(['The {building} is finished', 'Works done: {building}'], ['The {building} stands at level {level}.', 'Builders are out of the {building}: it is level {level} now.']),
  // money and patrons (section 10)
  patronOffer: t(['An offer from {name}', '{name} would back us'], ['{name} offers to back the crew. The offer stands until {expires}.', 'A patron\'s agent: {name} would sign with us, until {expires}.']),
  objectiveMet: t(['Objective met', 'The patron is pleased'], ['We met the patron\'s objective ({objective}): the bonus is paid.', '{objective}: done. The bonus is ours.']),
  objectiveMissed: t(['Objective missed', 'No bonus this race'], ['We missed the patron\'s objective ({objective}).', '{objective}: not met. No bonus.']),
  patronLeft: t(['{name} leaves us', 'The end of {name}\'s backing'], ['{name}\'s agreement has run its course.', '{name} has paid its last race.']),
  // inspection and the Admiralty (sections 8.5, 11)
  inspectionClean: t(['Inspection: clean', 'The inspectors found nothing'], ['The Admiralty\'s inspectors went over our ships and found nothing.', 'Inspected and clean.']),
  inspectionFound: t(['Inspection: parts confiscated', 'Caught by the inspectors'],
    ['The inspectors took {parts} of our parts, fined us {fine} and struck {struck} points.', '{parts} parts confiscated, a fine of {fine}, and {struck} points struck from the race.']),
  inspectionLeague: t(['{league}: the inspectors\' round', 'Inspections in {league}'],
    ['{inspected} crews were inspected. Caught: {found}.', 'The Admiralty inspected {inspected} crews. Found wanting: {found}.']),
  voteDue: t(['A vote is due: {measure}', 'The Admiralty proposes: {measure}'],
    ['The Admiralty puts a change to {measure} to the league. The vote closes on {closes}.', 'A proposal on {measure}: cast our vote by {closes}.']),
  voteResult: t(['The vote is counted', 'The Admiralty\'s count'], ['The proposal was {carried}: {for} for, {against} against.', '{for} for, {against} against: {carried}.']),
  // race day and the season (section 13)
  captainUnfit: t(['{gull} is injured', '{gull} is unfit'], ['{gull} is unfit for {races} races.', 'The surgeon says {gull} will miss {races} races.']),
  captainFit: t(['{gull} is fit again', '{gull} is back'], ['{gull} is fit to sail again.', 'Good news: {gull} has been passed fit.']),
  standIn: t(['{gull} sails for us today', 'A stand-in: {gull}'], ['With no captain fit, {gull} was engaged to sail for one race at {wage}.', '{gull} sails ship two today, hired for the race at {wage}.']),
  forfeit: t(['Race forfeit', 'Our race was forfeit'],
    ['The race was cut short on our side and is forfeit: our ship counts as sunk at the start. The rest was sailed out.', 'We lost our race: the logbook stopped mid-race, so it stands forfeit, ship one sunk at the start.']),
  roundResults: t(['{league}: the results', 'Elsewhere: {league}'], ['{league} has sailed: {first} won, ahead of {second} and {third}.', 'In {league}, {first} took the race; {second} and {third} followed.']),
  retired: t(['{gull} retires', 'Farewell to {gull}'], ['{gull} has retired.', 'After a long career, {gull} has hung up their glasses.']),
  traitGained: t(['{gull}: {trait}', '{gull} has changed'], ['{gull} has become known as {trait}.', 'Word is {gull} is {trait} now.']),
  traitLost: t(['{gull} is no longer {trait}', '{gull} has changed'], ['{gull} has lost the name {trait}.', '{trait} no longer fits {gull}.']),
  seasonEnded: t(['The season is over', 'Season\'s end'], ['We finished {place} in {league}, for a prize of {prize}. {moved}', 'Final place: {place} of {league}. Prize money: {prize}. {moved}']),
  seasonPlanets: t(['The season\'s calendar', 'Ten planets'], ['Season {season} is set: ten races, the first on {planet} on {firstDay}.', 'The Admiralty has fixed the season: {planet} opens it on {firstDay}.']),
  raceResult: t(['Our race: {place}', 'Race report'], ['Our best ship finished {place}: {points} points. We stand {standing} in {league}.', '{points} points from the race, our best ship {place}. {standing} in {league} now.']),
  supplierDue: t(['Choose your suppliers', 'Suppliers for the season'],
    ['Timber, canvas and cordage: choose one supplier of each before the first race.', 'The suppliers\' agents are waiting. Pick our timber, canvas and cordage before the first race.']),
  // the dilemmas (career/events.ts)
  riseAsk: t(['{gull} wants a rise', 'A word about money from {gull}'],
    ['{gull} feels undervalued and asks for more money.', '{gull} says the wage is not enough and wants it put right.']),
  shipsArgue: t(['The ships argue over the {type}', 'Trouble over the new {type}'],
    ['{gull} is angry the new {type} went to the other ship.', 'The new {type} has split the crew: {gull} says it should have been theirs.']),
  bondFallOut: t(['{bosun} and {gull} have fallen out', 'A quarrel on ship {ship}'],
    ['{bosun} and {gull} cannot work together. Something must be done.', 'Ship {ship}\'s bosun {bosun} and captain {gull} are not speaking.']),
  greyComponent: t(['A grey component', 'An offer under the counter'],
    ['{gull} has been offered a component the Admiralty would not like, for the {type}.', 'A supplier has slipped {gull} something for our {type} design. It is not quite legal.']),
  patronGuest: t(['{name} wants a guest aboard', 'A guest for ship two'],
    ['{name} asks to put a guest aboard ship two next race. They pay {coin} for it.', '{name} offers {coin} if their guest can ride ship two next race.']),
  flightWorn: t(['The flight is worn out', '{gull} is exhausted'], ['{gull} is worn out. The flight needs a decision before the race.', 'The {job} job is wearing {gull} down.']),
  partSwap: t(['{crew} offers a swap', 'A trade from {crew}'],
    ['{crew} would swap their {give} for our {take}.', '{crew} proposes a trade of parts: their {give} for our {take}.']),
  pressElder: t(['The press asks about the elder', 'Questions about the elder'],
    ['The press want to know if you and the elder see eye to eye.', 'Reporters are asking about the elder\'s faith in you.']),
  youngTrial: t(['{gull} asks for a trial', 'A young hopeful: {gull}'], ['{gull}, a young captain, asks for a trial with the crew.', '{gull} wants a chance to show what they can do.']),
  stormDamage: t(['Storm damage at the rookery', 'The storm hit the {building}'],
    ['Last night\'s storm damaged the {building}. Repairs now cost {coin}.', 'The {building} took a beating in the storm: {coin} to repair it at once.']),
  unfitWantsSail: t(['{gull} wants to sail', '{gull} asks to race'], ['{gull} has one more race out but says they are fit to sail.', '{gull} insists they can race, though the surgeon wants one more week.']),
  testingExemption: t(['The Admiralty offers an exemption', 'A testing exemption'],
    ['As one of the league\'s two lowest crews, we may take extra testing time.', 'The Admiralty offers the lowest crews more yard time. The press will notice.']),
};

const LEAGUES = ['League One', 'League Two', 'League Three'];
const BUILDINGS: Readonly<Record<Building, string>> = {
  factory: 'factory', drawingLoft: 'drawing loft', testTank: 'test tank', foundry: 'foundry', sailingSchool: 'sailing school',
  flightLoft: 'flight loft', crowsNest: 'crow\'s nest', fishMarket: 'fish market', landingPad: 'landing pad',
};
const MEASURES: Readonly<Record<Measure, string>> = {
  spec: 'the spec parts', storm: 'the storm\'s pace', ban: 'a gun ban', pointsPerSinking: 'points for a sinking', seaHeldPoint: 'the sea-held point',
  prizeSpread: 'the prize money\'s spread', inspection: 'the inspection rate',
};
const OBJECTIVES: Readonly<Record<string, string>> = { top10: 'finish in the top ten', sinkTwo: 'sink two ships', afloat: 'both ships afloat', mostSea: 'hold the most sea' };
const ORDINAL = (n: number): string => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/** What a slot's value reads as, by the slot's name. */
function slotText(s: CareerState, key: string, value: string | number): string {
  const n = Number(value);
  const gull = () => (s.gulls[n] ? `${s.gulls[n].given} ${s.gulls[n].family}` : 'someone');
  const crew = (id: number) => s.crews[id]?.name ?? 'a crew';
  switch (key) {
    case 'gull': case 'scout': case 'bosun': return gull();
    case 'crew': case 'first': case 'second': case 'third': return crew(n);
    case 'league': return LEAGUES[n] ?? 'the league';
    case 'day': case 'expires': case 'closes': case 'firstDay': return `Day ${n}`;
    case 'fine': case 'coin': case 'prize': case 'wage': return `${Math.round(n)} Coin`;
    case 'building': return BUILDINGS[value as Building] ?? String(value);
    case 'component': return component(String(value))?.name ?? String(value);
    case 'trait': return trait(String(value)).name;
    case 'measure': return MEASURES[value as Measure] ?? String(value);
    case 'objective': return OBJECTIVES[String(value)] ?? String(value);
    case 'supplier': return supplier(String(value))?.name ?? String(value);
    case 'place': case 'standing': return ORDINAL(n);
    case 'rising': return n ? 'risen' : 'fallen';
    case 'carried': return n ? 'carried' : 'lost';
    case 'moved': return n > 0 ? 'We are promoted.' : n < 0 ? 'We are relegated.' : '';
    case 'season': return String(n + 1);
    case 'ship': return String(n + 1);
    case 'found': return String(value) === '' ? 'no one' : String(value).split(',').map((x) => crew(Number(x))).join(', ');
    default: return String(value);
  }
}

/** A template's text with its slots filled from a message. */
export const filled = (s: CareerState, text: string, slots: Mail['slots']): string =>
  text.replace(/\{(\w+)\}/g, (all, key: string) => (key in slots ? slotText(s, key, slots[key]) : all)).trim();

/** A message's subject and body, in its wording. A kind with no template reads plainly as its kind. */
export function render(s: CareerState, m: Mail): { subject: string; body: string } {
  const tpl = TEMPLATES[m.kind];
  if (!tpl) return { subject: m.kind, body: '' };
  return { subject: filled(s, tpl.subject[m.wording % tpl.subject.length], m.slots), body: filled(s, tpl.body[m.wording % tpl.body.length], m.slots) };
}
