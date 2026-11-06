// The lobby: transparent over the live planet and your ship. Your level and rank, the loadout you bring, play, a free
// voyage, and a tile for every menu.
import { ability } from '../../sim/abilities.ts';
import { button, el, esc, ICON, iconButton, press, stagger, tile } from '../parts/index.ts';
import type { LobbyModel, MenuId } from '../model.ts';
import type { ScreenView } from '../shell.ts';
import { abilityGlyph, playerPlate } from './bits.ts';
import './lobby.css';

export interface LobbyActions {
  onPlay(): void;
  /** A free voyage: no Storm, no end, secrets to find. */
  onVoyage?(): void;
  onOpen(menu: MenuId): void;
}

export interface LobbyView extends ScreenView {
  setNews(news: LobbyModel['news']): void;
}

const MENUS: { id: Exclude<MenuId, 'settings'>; label: string; icon: string }[] = [
  { id: 'abilities', label: 'Abilities', icon: ICON.abilities },
  { id: 'locker', label: 'Locker', icon: ICON.locker },
  { id: 'rivals', label: 'Rivals', icon: ICON.rivals },
  { id: 'career', label: 'Career', icon: ICON.career },
  { id: 'rank', label: 'Rank', icon: ICON.rank },
];

export function lobbyScreen(m: LobbyModel, a: LobbyActions): LobbyView {
  const root = el('s-lobby');
  el('s-lobby__shade', root);
  const safe = el('pui-safe s-lobby__safe', root);

  const top = el('s-lobby__top', safe);
  playerPlate(m.player, top, 's-lobby__me');
  const stats = el('s-lobby__stats', top);
  for (const [v, l] of [[m.stats.matches, 'Matches'], [m.stats.wins, 'Wins'], [m.stats.top5, 'Top 5']] as const) {
    el('s-lobby__stat', stats, `<b>${v}</b><span>${l}</span>`);
  }
  iconButton({ icon: ICON.gear, label: 'Settings', kind: 'dark', sound: 'open', parent: top, className: 's-lobby__gear', onPress: () => a.onOpen('settings') });

  const menu = el('s-lobby__menu', safe);
  const tiles = MENUS.map((x) => tile({ icon: x.icon, label: x.label, badge: m.news[x.id] ?? null, parent: menu, onPress: () => a.onOpen(x.id) }));

  const go = el('s-lobby__go', safe);
  const load = el('s-lobby__loadout', go);
  for (const id of [m.active, m.passive]) {
    const s = el('s-lobby__slot p-smoke', load);
    abilityGlyph(id, s);
    const d = ability(id);
    el('s-lobby__slotT', s, `<span>${d.kind === 'active' ? 'Active' : 'Passive'}</span><b>${esc(d.name)}</b>`);
    press(s, () => a.onOpen('abilities'), { sound: 'open', what: 'lobby:loadout' });
  }
  button({ label: 'Play', icon: ICON.play, sub: '20 ships · the Gale', kind: 'gold', size: 'lg', parent: go, className: 's-lobby__play', what: 'lobby:play', onPress: a.onPlay });
  if (a.onVoyage) {
    button({
      label: 'Voyage', icon: ICON.secret, sub: `No Storm · ${m.secrets.found}/${m.secrets.of} secrets`, kind: 'secondary', size: 'md', parent: go,
      className: 's-lobby__voyage', what: 'lobby:voyage', onPress: a.onVoyage,
    });
  }

  const ticker = el('s-lobby__ticker p-paper p-torn', safe);
  el('s-lobby__tickI', ticker, ICON.rivals);
  const line = el('s-lobby__tickT', ticker, esc(m.ticker[0] ?? ''));
  if (!m.ticker.length) ticker.remove();
  let k = 0, timer = 0;

  return {
    el: root,
    enter: () => {
      stagger(menu, ':scope > *', 2);
      timer = window.setInterval(() => {
        if (m.ticker.length < 2) return;
        k = (k + 1) % m.ticker.length;
        line.classList.remove('is-in');
        void line.offsetWidth;
        line.textContent = m.ticker[k];
        line.classList.add('is-in');
      }, 5200);
    },
    leave: () => clearInterval(timer),
    setNews: (n) => MENUS.forEach((x, i) => tiles[i].setBadge(n[x.id] ?? null)),
  };
}
