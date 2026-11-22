// The seed in the page's address: ?seed= names the race the page sails, and a
// race done (or sailed again) is a new page with its seed there. The world is
// built once a page (main.ts), so a new seed is a new page: home from a race,
// the title comes over it and the page loads again under it. The app, which
// has no address bar, keeps its page's address the same way; opened afresh, a
// page with no seed rolls one.

import { named, rolled } from './world/seeds.ts';

/** A seed rolled afresh: two words of the sea, run together. */
export const roll = () => rolled(Math.random);

/**
 * The seed this page sails: ?seed='s text, read as a seed is (named), or
 * `otherwise`'s if there is none.
 */
export function launched(otherwise: () => string): string {
  const given = named(new URLSearchParams(location.search).get('seed') ?? '');
  return given || otherwise();
}

/** Whether this page was sailed to by a career (?career): it opens on the career kept. */
export const careered = () =>
  new URLSearchParams(location.search).has('career');

/**
 * The page again, sailing the seed `name`: of the address only ?debug is kept,
 * so a debug switch that set the last page going (?leave) does not again.
 * `career`: the new page opens on the career kept (?career), not the menu.
 */
export function sail(name: string, career = false) {
  const at = new URL(location.href),
    debug = at.searchParams.get('debug'),
    query = new URLSearchParams();
  if (debug !== null) query.set('debug', debug);
  if (career) query.set('career', '');
  query.set('seed', named(name));
  at.search = query.toString();
  at.hash = '';
  location.replace(at.href);
}
