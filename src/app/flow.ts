// The screens and the ways between them. Title, then the lobby over the live planet with its menus, then the Gale, the
// match, death and spectating or victory, the results, and back to the lobby.

export const MENUS = ['abilities', 'locker', 'rivals', 'rank', 'settings'] as const;
export type MenuName = (typeof MENUS)[number];

export const SCREENS = [
  'boot', 'title', 'lobby', ...MENUS, 'gale', 'match', 'death', 'spectate', 'victory', 'results',
] as const;
export type ScreenName = (typeof SCREENS)[number];

/** Screens that sit over a running match. */
export const IN_MATCH: readonly ScreenName[] = ['gale', 'match', 'death', 'spectate', 'victory'];

/** Screens that sit over the lobby's planet, with the player's ship on the water. */
export const OVER_LOBBY: readonly ScreenName[] = ['title', 'lobby', ...MENUS, 'results'];

export const isScreen = (s: string): s is ScreenName => (SCREENS as readonly string[]).includes(s);
