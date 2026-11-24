import { named, rolled } from '../world/seeds.ts';

export const roll = () => rolled(Math.random);

export function launched(otherwise: () => string): string {
  const given = named(new URLSearchParams(location.search).get('seed') ?? '');
  return given || otherwise();
}

export function sail(name: string) {
  const at = new URL(location.href),
    debug = at.searchParams.get('debug'),
    query = new URLSearchParams();
  if (debug !== null) query.set('debug', debug);
  query.set('seed', named(name));
  at.search = query.toString();
  at.hash = '';
  location.replace(at.href);
}
