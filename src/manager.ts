// The manager's game: the office's desk (office/office.ts Desk) over the
// career kept on this device (desk.ts), and race day run on the page. The
// office floats over the planet of the next race, so the career's page is that
// planet's: a round done, or a team made, the page sails on to the next (a new
// page, the career opened on it again). On race day Continue opens the plan,
// and from the plan sails the race: hers on the page's game, by hand, the other
// championships' in a worker meanwhile; all three recorded, the result is
// shown. Every command is journaled before the office is drawn again.

import { raceCards } from './career/card.ts';
import {
  entries,
  foundingView,
  homeView,
  planOf,
  planView,
  resultView,
  shellView,
  standingsView,
  type Entry,
  type Look,
} from './career/office.ts';
import {
  calendarPaper,
  financesPaper,
  hqPaper,
  mailPaper,
  shipPaper,
  sponsorsPaper,
} from './career/papers.ts';
import type { CareerState } from './career/state.ts';
import { createSession, type Shelf } from './desk.ts';
import type { Command, Offer } from './office/command.ts';
import type { Ask, Desk, Tab, Viewed, Views } from './office/office.ts';
import type { Dyed } from './office/papers.ts';
import type { ScoutingFilter } from './office/people.ts';
import {
  TEAM,
  TEAMS,
  type PartType,
  type RaceCard,
  type RaceResult,
} from './race.ts';

/** What the manager asks of the page: its planet, its office, and its game. */
interface Page {
  /** The planet the page is on, and the seed's name a single race sails. */
  seed: number;
  name: string;
  /** The office: a screen opened, the screen open now, and the office drawn again. */
  open(screen: Tab | Viewed): void;
  at(): string | null;
  draw(): void;
  /** The page again on the planet `seed`, the career opened on it. */
  sail(seed: number): void;
  /** Her race begun on the page's game, by its card; `names`: who sails each of its ships, by ship id. */
  race(card: RaceCard, names: readonly string[]): void;
  /** Other races sailed to their ends elsewhere, by their cards. */
  apart(cards: readonly RaceCard[]): Promise<RaceResult[]>;
  /** The single race's lobby, and the preferences, in the office's place. */
  single(): void;
  preferences(): void;
}

/** A race day under way: the round's cards, which is hers, who sails it, and the others' results as they come. */
interface Racing {
  cards: readonly RaceCard[];
  mine: number;
  sheet: readonly Entry[];
  name: string;
  apart: Promise<RaceResult[]>;
}

/** The manager's game on `shelf`, drawn as `look` has the liveries, on `page`. */
export async function createManager(shelf: Shelf, look: Look, page: Page) {
  const session = await createSession(shelf);
  // a load that lost something carries on with what was kept
  if (session.desk.where() === 'recover')
    await session.desk.recoverBy('carry').catch(() => null);

  /** The world a new career is founded on. */
  const world = Math.floor(Math.random() * 4294967296) >>> 0;
  let refused: string | null = null,
    busy = false,
    racing: Racing | null = null,
    waiting = false,
    last: Parameters<typeof resultView>[2] | null = null;
  /** What the screens are open at: a person and the offer drawn to them, the scouting list's filter, a letter, the drawing board. */
  let person: number | null = null,
    draft: Offer | null = null,
    filter: ScoutingFilter | null = null,
    letter: number | null = null,
    drafting: PartType = 'sails',
    picked: (string | null)[] = [];

  /** The career, if one is founded. */
  const founded = (): CareerState | null => {
    const s = session.state();
    return s?.player ? s : null;
  };
  const career = (): CareerState => {
    const s = founded();
    if (!s) throw new Error('no career is founded');
    return s;
  };

  /** Sends a command: its refusal's sentence, or null. */
  async function send(c: Command): Promise<string | null> {
    const no = await session.desk.send(c);
    if (no) console.info(`${c.kind}: ${no}`);
    return no;
  }

  /** The office where the career stands: on its next race's planet (a new page if this is another), at the plan on race day, else Home. */
  function arrive() {
    const s = career(),
      next = s.calendar?.rounds[s.round]?.planet.seed;
    if (next !== undefined && next !== page.seed) page.sail(next);
    else page.open(s.race !== null ? 'plan' : 'home');
  }

  /** Her race begun, and the other championships' set sailing elsewhere. */
  async function sailRace() {
    const before = career();
    if (
      before.race &&
      !before.race.started &&
      (await send({ kind: 'RaceStarted', round: before.race.round }))
    )
      return;
    const s = career(),
      cards = raceCards(s),
      mine = s.teams[s.player?.team ?? 0]?.tier ?? 0,
      card = cards[mine];
    if (!card) return;
    const sheet = entries(s);
    racing = {
      cards,
      mine,
      sheet,
      name: s.calendar?.rounds[s.round]?.planet.name ?? '',
      apart: page.apart(cards.filter((_, i) => i !== mine)),
    };
    page.race(
      card,
      sheet.map((e) => e.driver)
    );
  }

  /** The way on: from a result, on to the next planet; on race day, the plan and then the race; else the calendar. */
  async function goOn() {
    const s = career();
    if (page.at() === 'result') {
      // (kept while the result is still shown: the page may be sailing on under it)
      arrive();
      if (page.at() !== 'result') last = null;
    } else if (s.player?.sacked && page.at() !== 'jobs') page.open('jobs');
    else if (s.player?.sacked) {
      // (Continue past the posts offered: the highest championship's is taken)
      const post = [...s.player.offers].sort(
        (a, b) =>
          (s.teams[a.team]?.tier ?? 9) - (s.teams[b.team]?.tier ?? 9) ||
          a.made - b.made
      )[0];
      if (post) await send({ kind: 'TakeJob', team: post.team });
      arrive();
    } else if (s.race !== null) {
      if (page.at() !== 'plan') page.open('plan');
      else if (!waiting && !racing) await sailRace();
    } else {
      await send({ kind: 'Advance' });
      arrive();
    }
  }

  /** What is asked of the career, one thing at a time. */
  async function asked(a: Ask) {
    if (a.kind === 'menu') {
      if (a.choice === 'single') page.single();
      else if (a.choice === 'preferences') page.preferences();
      else if (a.choice === 'continue' && founded()) arrive();
      else if (a.choice === 'new') {
        if (founded()) await session.desk.recoverBy('new');
        refused = null;
        page.open('found');
      }
    } else if (a.kind === 'found') {
      const f = a.founding;
      refused = await send({
        kind: 'Found',
        seed: world,
        team: f.team,
        colours: { dye: f.dye, pattern: f.pattern },
        emblem: f.emblem,
        given: f.given,
        family: f.family,
        headshot: 0,
      });
      if (refused === null) arrive();
    } else if (a.kind === 'call') {
      const plan = planOf(career(), a.call);
      if (plan) await send({ kind: 'SetPlan', plan });
    } else if (a.kind === 'job') {
      const [what, id] = a.job.split(':');
      if (a.what === 'cancel' && what === 'scout')
        await send({ kind: 'CancelScout', scout: Number(id) });
      else if (a.what === 'details')
        page.open(
          what === 'scout' ? 'scouting' : what === 'design' ? 'ship' : 'hq'
        );
    } else if (a.kind === 'continue') await goOn();
    else if (a.kind === 'send') {
      const no = await send(a.command);
      if (no) return;
      if (a.command.kind === 'StartDesign') picked = [];
      if (a.command.kind === 'TakeJob') arrive();
    } else if (a.kind === 'person') {
      person = a.id;
      draft = null;
      page.open(a.screen);
    } else if (a.kind === 'draft') draft = a.offer;
    else if (a.kind === 'filter') filter = a.filter;
    else if (a.kind === 'letter') {
      letter = a.id;
      if (career().mail.some((m) => m.id === a.id && !m.read))
        await send({ kind: 'MarkRead', mail: a.id });
    } else if (a.kind === 'design') {
      drafting = a.type;
      picked = [];
    } else if (a.kind === 'card')
      picked[a.slot] = picked[a.slot] === a.card ? null : a.card;
  }

  const dyed = <V>(view: V): Dyed<V> => ({ view, dyes: look.dyes });
  const roster = () => dyed(session.desk.team());

  const views: { [K in Viewed]: () => Views[K] } = {
    menu() {
      const s = founded(),
        shell = s ? shellView(s, look) : null;
      return {
        career: { championships: 3, teams: 3 * TEAMS },
        kept: shell ? { team: shell.team, date: shell.date } : null,
        single: { seed: page.name, ships: TEAMS * TEAM },
      };
    },
    home: () => homeView(career(), look),
    found: () => foundingView(world, look, refused),
    plan: () => planView(career(), look, waiting),
    standings: () => standingsView(career(), look),
    team: roster,
    drivers: roster,
    staff: roster,
    profile: () => dyed(session.desk.profile(person)),
    offer: () => dyed(session.desk.offer(person, draft)),
    scouting: () => dyed(session.desk.market(filter, [])),
    player: () => dyed(session.desk.career()),
    jobs: () => dyed(session.desk.jobs()),
    mail: () => mailPaper(career(), letter),
    calendar: () => calendarPaper(career()),
    finances: () => financesPaper(career()),
    sponsors: () => sponsorsPaper(career()),
    hq: () => hqPaper(career()),
    ship: () => shipPaper(career(), drafting, picked),
    result() {
      if (!last) throw new Error('no race has been sailed');
      return resultView(career(), look, last);
    },
  };

  const desk: Desk = {
    shell: () => shellView(career(), look),
    view: (screen) => views[screen](),
    ask(a) {
      if (busy) return;
      busy = true;
      void asked(a)
        .catch((e: unknown) => console.error(e))
        .finally(() => {
          busy = false;
          page.draw();
        });
    },
  };

  return {
    desk,
    /** Whether a career is founded on this device. */
    get founded() {
      return founded() !== null;
    },
    /** Opens the office where the career stands (a career must be founded). */
    arrive,
    /**
     * Her race is over, with this result: the office waits at the plan while
     * the other championships' come in, records all three, and shows hers.
     */
    async raced(result: RaceResult) {
      const day = racing;
      if (!day) return;
      racing = null;
      waiting = true;
      page.open('plan');
      page.draw();
      const rules = day.cards[day.mine]?.rules;
      const rest = [...(await day.apart)];
      for (let i = 0; i < day.cards.length; i++) {
        const r = i === day.mine ? result : rest.shift();
        if (r) await send({ kind: 'RecordRace', result: r });
      }
      waiting = false;
      if (rules) last = { result, sheet: day.sheet, name: day.name, rules };
      page.open(last ? 'result' : 'home');
      page.draw();
    },
  };
}
