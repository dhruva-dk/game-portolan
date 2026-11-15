// Every generated name (Phase B section 2.4, D34): gulls' given and family names, colonies, crews ("<place> <noun>"),
// patrons ("<family> & <relation>, <trade>") and planets, built by seed from syllable tables. No generated name of any
// kind contains a BANNED word as a whole word, in any case: a generator draws again until it holds.

import { pick, type Rand } from './dice.ts';

/** Words no generated name may contain as a whole word, in any case. */
export const BANNED: readonly string[] = ['mara'];

/** Whether a name holds no banned word as a whole word, in any case. */
export function allowed(name: string): boolean {
  const words = name.toLowerCase().split(/[^a-z]+/);
  return !words.some((w) => BANNED.includes(w));
}

const capital = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** Draws a name until it is allowed. (A name is a few syllables: a banned word comes up rarely, so this ends.) */
function clean(rand: Rand, make: (rand: Rand) => string): string {
  for (;;) {
    const name = make(rand);
    if (allowed(name)) return name;
  }
}

const GIVEN_START = ['al', 'bri', 'ca', 'dor', 'el', 'fen', 'gwe', 'hal', 'is', 'jo', 'ke', 'lo', 'ma', 'ne', 'or', 'pe', 'que', 'ro', 'sa',
  'tam', 'ul', 'ver', 'wy', 'ya', 'zel', 'an', 'be', 'cor', 'da', 'ed', 'fa', 'gil', 'ha', 'ivo', 'kai', 'lu', 'mi', 'nor', 'os', 'ri'];
const GIVEN_MIDDLE = ['', '', '', 'li', 'ra', 'ne', 'da', 'vi', 'lo', 'ri', 'sa', 'me', 'no'];
const GIVEN_END = ['a', 'an', 'el', 'is', 'o', 'en', 'ia', 'yn', 'ard', 'ette', 'ith', 'or', 'us', 'wen', 'ric', 'ine', 'ey', 'old', 'win', 'ra'];

const FAMILY_START = ['black', 'brack', 'cor', 'dun', 'fal', 'gale', 'grey', 'hal', 'kit', 'mar', 'nor', 'pel', 'rook', 'salt', 'shear', 'skerr',
  'stor', 'tern', 'wash', 'whit', 'wind', 'wrack', 'ash', 'bell', 'cliff', 'drift', 'fair', 'gull', 'har', 'kel', 'lang', 'mere', 'over', 'reed',
  'sand', 'tide', 'vane', 'wester', 'hollo', 'bryn'];
const FAMILY_END = ['wick', 'ton', 'ley', 'ham', 'well', 'by', 'mere', 'thorpe', 'ridge', 'combe', 'stow', 'wing', 'feather', 'beck', 'holt',
  'shaw', 'ford', 'gate', 'ings', 'ett', 'ane', 'ow', 'er', 'ock'];

const PLACE_START = ['ash', 'bal', 'cair', 'dun', 'esk', 'far', 'gor', 'hel', 'ith', 'kel', 'lin', 'mor', 'nes', 'orm', 'pen', 'quar', 'ros',
  'skel', 'tor', 'ul', 'var', 'wex', 'yar', 'zan', 'bry', 'cal', 'del', 'fin', 'gal', 'hav', 'kir', 'lor', 'mal', 'nor', 'ost', 'por', 'rav',
  'sel', 'tal', 'vel'];
const PLACE_MIDDLE = ['', '', 'a', 'e', 'i', 'o', 'an', 'en', 'er', 'is'];
const PLACE_END = ['holm', 'wick', 'ness', 'by', 'mouth', 'haven', 'sey', 'ay', 'ster', 'ford', 'vik', 'port', 'ey', 'sund', 'mere', 'thorn',
  'garth', 'stack', 'wall', 'rock'];

/** The crews' nouns: no word is shared between two crews, so there are more of them than crews. */
export const NOUNS: readonly string[] = [
  'Albatrosses', 'Anchors', 'Auks', 'Bells', 'Bowlines', 'Breakers', 'Brigantines', 'Buoys', 'Capstans', 'Cormorants', 'Corsairs', 'Crests',
  'Currents', 'Cutters', 'Dolphins', 'Drifters', 'Eiders', 'Fathoms', 'Fulmars', 'Gales', 'Gannets', 'Guillemots', 'Gulls', 'Gusts',
  'Halyards', 'Harpoons', 'Hawsers', 'Herons', 'Hulls', 'Jibs', 'Keels', 'Kestrels', 'Kittiwakes', 'Knots', 'Lanterns', 'Larks', 'Lighthouses',
  'Lugsails', 'Mariners', 'Martins', 'Masts', 'Merlins', 'Narwhals', 'Navigators', 'Oarsmen', 'Ospreys', 'Otters', 'Pennants', 'Petrels',
  'Pilots', 'Plovers', 'Privateers', 'Puffins', 'Quays', 'Rangers', 'Ravens', 'Razorbills', 'Reefs', 'Rovers', 'Rudders', 'Sailmakers',
  'Sandpipers', 'Schooners', 'Seals', 'Shearwaters', 'Sheets', 'Shoals', 'Skuas', 'Sloops', 'Sounders', 'Spars', 'Squalls', 'Starlings',
  'Storms', 'Swallows', 'Swells', 'Swifts', 'Terns', 'Tides', 'Tillers', 'Topsails', 'Trawlers', 'Turnstones', 'Voyagers', 'Wakes', 'Waves',
  'Whalers', 'Whimbrels', 'Winds', 'Wrens', 'Admirals', 'Barques', 'Beacons', 'Boatswains', 'Bowsprits', 'Caravels', 'Cetaceans', 'Chartmakers',
  'Clippers', 'Compasses', 'Coxswains', 'Curlews', 'Dories', 'Dunlins', 'Egrets', 'Falcons', 'Ferrymen', 'Figureheads', 'Frigates', 'Galleons',
  'Godwits', 'Grebes', 'Harriers', 'Helmsmen', 'Ironclads', 'Jaegers', 'Ketches', 'Longboats', 'Loons', 'Mackerels', 'Marlins', 'Mizzens',
  'Nightjars', 'Oystercatchers', 'Pelicans', 'Pinnaces', 'Portolans', 'Quartermasters', 'Redshanks', 'Rigs', 'Sextants', 'Shipwrights',
  'Skippers', 'Stormbirds', 'Tritons', 'Wherries', 'Yawls', 'Zephyrs',
];

const RELATIONS = ['Daughters', 'Sons', 'Nieces', 'Nephews', 'Cousins', 'Partners', 'Heirs', 'Kin', 'Company', 'Brothers', 'Sisters', 'Fledglings'];
const TRADES = ['Ropewalkers', 'Chandlers', 'Sailmakers', 'Fishmongers', 'Coopers', 'Tar Merchants', 'Lamplighters', 'Net Menders', 'Salt Traders',
  'Shipbrokers', 'Insurers', 'Chartsellers', 'Biscuit Bakers', 'Pewterers', 'Glassblowers', 'Lens Grinders', 'Clockmakers', 'Ink Makers'];

const PLANET_START = ['ae', 'bor', 'cy', 'dra', 'ery', 'gal', 'hy', 'io', 'ka', 'lyr', 'mae', 'nyx', 'ory', 'pha', 'rhe', 'syl', 'tha', 'ul',
  'vey', 'xan', 'yso', 'zeph'];
const PLANET_MIDDLE = ['', 'ra', 'li', 'the', 'no', 'ri', 'ma', 'ce', 'do', 'phi'];
const PLANET_END = ['a', 'on', 'is', 'os', 'ea', 'ion', 'ys', 'ara', 'ene', 'ux', 'el', 'ia'];

/** A gull's given name. */
export const given = (rand: Rand): string => clean(rand, (r) => capital(pick(r, GIVEN_START) + pick(r, GIVEN_MIDDLE) + pick(r, GIVEN_END)));

/** A gull's family name. */
export const family = (rand: Rand): string => clean(rand, (r) => capital(pick(r, FAMILY_START) + pick(r, FAMILY_END)));

/** A colony's name. */
export const colony = (rand: Rand): string => clean(rand, (r) => capital(pick(r, PLACE_START) + pick(r, PLACE_MIDDLE) + pick(r, PLACE_END)));

/** A crew's place word (the first of its name). */
export const place = (rand: Rand): string => colony(rand);

/** A crew's name from a place and a noun. */
export const crewName = (placeWord: string, noun: string): string => `${placeWord} ${noun}`;

/** A patron's name: "<family> & <relation>, <trade>". */
export const patron = (rand: Rand): string => clean(rand, (r) => `${family(r)} & ${pick(r, RELATIONS)}, ${pick(r, TRADES)}`);

/** A planet's name. */
export const planet = (rand: Rand): string => clean(rand, (r) => capital(pick(r, PLANET_START) + pick(r, PLANET_MIDDLE) + pick(r, PLANET_END)));

/** The key two gulls' full names are told apart by. */
export const fullName = (g: { given: string; family: string }): string => `${g.given} ${g.family}`.toLowerCase();

/** Every word of a name, lower case: two crews may share none. */
export const words = (name: string): string[] => name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 0);
