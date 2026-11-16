// The office's screens, each registered with the desk's view it draws (screen.ts). To add one: write its file of
// ui/office/ (createName(send) returning its element and show(view)), and put its line here in place of its stub.

import type { OfficeScreen } from '../ways';
import { createCrew } from './crew';
import { createFound } from './found';
import { FOCUS } from './focus';
import { createHome } from './home';
import { createMarket } from './market';
import { createOffer } from './offer';
import { createProfile } from './profile';
import { createRecover } from './recover';
import { register, type Registered, type Send } from './screen';
import { createStub } from './stub';

/** Each office screen: how it is made and drawn. */
export const SCREENS: Readonly<Record<OfficeScreen, (send: Send) => Registered>> = {
  found: register(createFound, (d) => d.found(FIRST.seed, FIRST.colours)),
  recover: register(createRecover, (d) => d.recover()),
  home: register(createHome, (d) => d.home()),
  career: register(createStub('career'), () => null),
  crew: register(createCrew, (d) => d.crew()),
  profile: register(createProfile, (d) => d.profile(FOCUS.gull)),
  offer: register(createOffer, (d) => d.offer(FOCUS.gull, FOCUS.draft)),
  market: register(createMarket, (d) => d.market(FOCUS.filter, FOCUS.shortlist)),
  ship: register(createStub('ship'), () => null),
  rookery: register(createStub('rookery'), () => null),
  finance: register(createStub('finance'), () => null),
  league: register(createStub('league'), () => null),
  mail: register(createStub('mail'), () => null),
  plan: register(createStub('plan'), () => null),
  season: register(createStub('season'), () => null),
  jobs: register(createStub('jobs'), () => null),
};

/** The found form's first world seed and colours: the moment it opens, unless a fixture fixes it (debug.ts). */
export const FIRST = { seed: (Date.now() * 2654435761) >>> 0, colours: { first: 0, second: 13 } };

/** Screens without the top bar: before a crew is founded, a damaged save, the season's end. (jobs, too, once sacked:
 *  office.ts.) */
export const BARE: readonly OfficeScreen[] = ['found', 'recover', 'season'];
