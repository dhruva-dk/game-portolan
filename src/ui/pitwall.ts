// The pit wall: what a race sailed in teams adds to the match's HUD (hud.ts),
// laid on the office's page round her controls. Down the left the standings'
// tower: the leaders, and her own team's ships wherever they stand, each a
// place, her team's colour, who sails her and what she has sunk, the sunk
// struck out. Down the right, under the minimap, her team: each ship's place,
// who sails her, what she is about, her shield over her hull. Under the clock
// two keys: the team's orders (the four calls; a tap on one changes the call) and
// the pit stop, open only in her team's water (its jobs, each with the seconds
// it would cost, chosen one by one, their sum, and the stop asked or called
// off; while she is served, how far it has got). Once she has sunk the tower
// runs longer and the keys go: she only watches.
//
// It reads the race as the game reports it (player.ts Race) each frame, and
// draws a piece again only when what it shows has changed, a few times a
// second at most.

import {
  CALLS,
  JOBS,
  type Call,
  type Doing,
  type Job,
  type Race,
} from '../player.ts';
import { button } from './kit/button.ts';
import { createPage } from './kit/page.ts';
import { el, ordinal, pressed, styled, type Kid } from './kit/part.ts';
import { meter } from './kit/stat.ts';
import { cut, kitStyle, stylesheet } from './kit/style.ts';
import { fade, screen } from './ui.ts';

/** Who sails each ship of the race, and her team's colour as the page shows it, by ship id. */
interface Field {
  names: readonly string[];
  colours: readonly string[];
}

/** Rows of the tower while she sails, and once she only watches; ms between looks at what has changed. */
const ROWS = 10,
  WATCHING = 18,
  EVERY = 250;

const CSS = `
/* the tower and her mates' cards: slips of the HUD's own paper, ruled as a ledger is */
.w-tower { position: absolute; left: 12px; top: 198px; width: 196px; ${cut('panel')} color: var(--ink); }
.w-tower > b { display: block; padding: 6px 10px 4px; border-bottom: 1.2px solid var(--ink); font: 700 13px/1.2 var(--serif);
  letter-spacing: .16em; text-transform: uppercase; text-align: center; }
.w-row { position: relative; display: grid; grid-template-columns: 26px 1fr 22px; align-items: center; height: 23px;
  padding: 0 6px 0 12px; font-size: 13px; border-top: 1px solid var(--rule); }
.w-row > i { position: absolute; left: 1px; top: 2px; bottom: 2px; width: 5px; background: var(--team);
  box-shadow: inset 0 0 0 .6px var(--ink); }
.w-row > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.w-row > em { text-align: right; font-weight: 700; color: var(--bad); }
.w-row.own { background: var(--gilt); font-weight: 700; }
.w-row.out { color: var(--faint); text-decoration: line-through; }
.w-mates { position: absolute; right: 12px; top: 370px; width: 196px; display: flex; flex-direction: column; gap: 6px; }
.w-mate { display: grid; grid-template-columns: 44px 1fr; column-gap: 8px; align-items: center; padding: 2px 8px 5px;
  ${cut('panel')} color: var(--ink); font-size: 13px; }
.w-mate > b { grid-row: span 2; font: italic 500 21px/1 var(--serif); font-variant-numeric: oldstyle-nums; }
.w-mate > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; }
.w-mate > small { font-size: 13px; font-style: italic; color: var(--faint); }
.w-mate > .k-meter { grid-column: span 2; height: 5px; margin-top: 2px; }
.w-mate.out { opacity: .55; }
.w-keys { position: absolute; left: 420px; top: 96px; width: 340px; display: flex; gap: 8px; }
.w-keys > .k-btn { flex: 1; height: 44px; padding: 0 8px; }
.w-sheet { position: absolute; left: 440px; top: 150px; width: 300px; }
.w-sheet > .k-panel > .k-body { gap: 6px; }
.w-job { display: grid; grid-template-columns: 1fr auto; align-items: center; height: 40px; padding: 0 12px;
  border: 1.2px solid var(--rule); }
.w-job.chosen { background: var(--gilt); border-color: var(--ink); font-weight: 700; }
.w-sum { display: flex; justify-content: space-between; align-items: baseline; padding: 6px 4px 2px; }
.w-sum > b { font: italic 700 22px/1 var(--serif); color: var(--bad); }
.w-ways { display: flex; gap: 8px; }
.w-ways > .k-btn { flex: 1; }
`;

const CALL: Readonly<Record<Call, string>> = {
  free: 'Free',
  attack: 'Attack',
  hold: 'Hold Our Water',
  form: 'Form on Me',
};
const JOB: Readonly<Record<Job, string>> = {
  rigging: 'Rigging',
  rudder: 'Rudder',
  waterline: 'Waterline',
  deck: 'Deck',
  gust: 'Gust',
  kit: 'Kit',
};
const DOING: Readonly<Record<Doing, string>> = {
  sailing: 'Sailing',
  fighting: 'Fighting',
  fleeing: 'Fleeing',
  storm: 'In the Storm',
  pit: 'In the Pit',
  sunk: 'Sunk',
};

/** A panel of the pit wall's own, titled. */
const sheetOf = (title: string, ...kids: Kid[]) =>
  el(
    'section',
    'k-panel',
    el('header', 'k-head', title),
    el('div', 'k-body', ...kids)
  );

/** The pit wall, asking `act` for a pit stop's jobs (none: called off) and a change of call. */
export function createPitwall(act: {
  pit(jobs: readonly Job[]): void;
  call(c: Call): void;
}) {
  kitStyle();
  stylesheet(CSS);
  const root = screen();
  const tower = el('div', 'w-tower'),
    mates = el('div', 'w-mates'),
    keys = el('div', 'w-keys'),
    sheet = el('div', 'w-sheet');
  root.append(createPage(tower, mates, keys, sheet));

  let field: Field | null = null,
    open: 'orders' | 'pit' | null = null,
    chosen: readonly Job[] = [],
    looked = 0;
  /** What each piece last showed, as text: drawn again only when it differs. */
  const shown = { tower: '', mates: '', keys: '', sheet: '' };

  const name = (id: number) => field?.names[id] || `Ship ${id + 1}`;

  function drawTower(race: Race, watching: boolean) {
    const top = race.tower.slice(0, watching ? WATCHING : ROWS);
    const rest = watching
      ? []
      : race.tower.slice(ROWS).filter((p) => p.team === race.team);
    const rows = [...top, ...rest];
    const sig = rows
      .map((p) => `${p.id},${p.place},${p.afloat ? 1 : 0},${p.sinkings}`)
      .join(' ');
    if (sig === shown.tower) return;
    shown.tower = sig;
    tower.replaceChildren(
      el('b', '', 'Standings'),
      ...rows.map((p) =>
        styled(
          el(
            'div',
            `w-row${p.team === race.team ? ' own' : ''}${p.afloat ? '' : ' out'}`,
            el('i'),
            String(p.place),
            el('span', '', name(p.id)),
            el('em', '', p.sinkings > 0 ? String(p.sinkings) : '')
          ),
          { '--team': field?.colours[p.id] ?? 'transparent' }
        )
      )
    );
  }

  function drawMates(race: Race) {
    const sig = race.mates
      .map(
        (m) =>
          `${m.id},${m.place},${m.doing},${Math.ceil(m.hull)},${Math.ceil(m.shield)}`
      )
      .join(' ');
    if (sig === shown.mates) return;
    shown.mates = sig;
    mates.replaceChildren(
      ...race.mates.map((m) =>
        el(
          'div',
          `w-mate${m.doing === 'sunk' ? ' out' : ''}`,
          el('b', '', ordinal(m.place)),
          el('span', '', name(m.id)),
          el('small', '', DOING[m.doing]),
          meter(m.shieldMax > 0 ? m.shield / m.shieldMax : 0, 'go'),
          meter(m.hullMax > 0 ? m.hull / m.hullMax : 0, 'good')
        )
      )
    );
  }

  /** Opens the sheet `which`, or shuts it if it is the one open. */
  const toggle = (which: 'orders' | 'pit') => () => {
    open = open === which ? null : which;
    chosen = [];
    looked = 0;
  };

  function drawKeys(race: Race, watching: boolean) {
    const pit = race.pit.open || race.pit.stop !== null;
    const sig = watching ? '' : `${race.call},${pit ? 1 : 0},${open ?? ''}`;
    if (sig === shown.keys) return;
    shown.keys = sig;
    keys.replaceChildren(
      ...(watching
        ? []
        : [
            button(`Orders: ${CALL[race.call]}`, toggle('orders'), {
              kind: open === 'orders' ? 'on' : 'plain',
            }),
            button('Pit Stop', toggle('pit'), {
              kind: open === 'pit' ? 'on' : 'go',
              off: !pit,
            }),
          ])
    );
  }

  function drawSheet(race: Race, watching: boolean) {
    const { pit } = race;
    if (watching || (open === 'pit' && !pit.open && !pit.stop)) open = null;
    const stop = pit.stop;
    const sig =
      open === 'orders'
        ? `orders,${race.call}`
        : open === 'pit'
          ? stop
            ? `stop,${stop.done},${stop.slips},${Math.ceil(stop.left)}`
            : `pit,${pit.costs.map((c) => Math.ceil(c)).join('/')},${chosen.join('/')}`
          : '';
    if (sig === shown.sheet) return;
    shown.sheet = sig;
    if (open === null) return sheet.replaceChildren();
    if (open === 'orders')
      return sheet.replaceChildren(
        sheetOf(
          'Team Orders',
          ...CALLS.map((c) =>
            pressed(
              el('div', `w-job${c === race.call ? ' chosen' : ''}`, CALL[c]),
              () => {
                act.call(c);
                open = null;
                looked = 0;
              }
            )
          )
        )
      );
    if (stop)
      return sheet.replaceChildren(
        sheetOf(
          'Pit Stop',
          meter(
            stop.jobs.length > 0 ? stop.done / stop.jobs.length : 0,
            'warn'
          ),
          el(
            'div',
            'w-sum',
            `${JOB[stop.jobs[stop.at] ?? 'kit']} · ${stop.done} of ${stop.jobs.length}`,
            el('b', '', `${Math.ceil(stop.left)} SECS`)
          ),
          button('Cancel', () => act.pit([]), { kind: 'danger', wide: true })
        )
      );
    const total = JOBS.reduce(
      (sum, j, i) => sum + (chosen.includes(j) ? (pit.costs[i] ?? 0) : 0),
      0
    );
    sheet.replaceChildren(
      sheetOf(
        'Pit Stop',
        ...JOBS.map((j, i) => {
          const cost = pit.costs[i] ?? 0;
          return pressed(
            el(
              'div',
              `w-job${chosen.includes(j) ? ' chosen' : ''}`,
              el('span', '', JOB[j]),
              el('span', '', cost > 0 ? `${Math.ceil(cost)} s` : '-')
            ),
            () => {
              chosen = chosen.includes(j)
                ? chosen.filter((x) => x !== j)
                : [...chosen, j];
              looked = 0;
            },
            cost <= 0
          );
        }),
        el(
          'div',
          'w-sum',
          'Total Estimated Pitstop Time',
          el('b', '', `${Math.ceil(total)} SECS`)
        ),
        el(
          'div',
          'w-ways',
          button('Cancel', toggle('pit'), { kind: 'plain' }),
          button(
            'Continue',
            () => {
              act.pit(JOBS.filter((j) => chosen.includes(j)));
              chosen = [];
              looked = 0;
            },
            { kind: 'on', off: chosen.length === 0 }
          )
        )
      )
    );
  }

  return {
    root,
    /** The race about to be sailed: who sails each ship, and in what colour. */
    field(f: Field | null) {
      field = f;
      open = null;
      chosen = [];
      shown.tower = shown.mates = shown.keys = shown.sheet = '';
    },
    /**
     * A frame: the race as the game reports it (null: no race, and nothing
     * shows), whether it is shown now, and whether she only watches.
     */
    update(race: Race | null, on: boolean, watching: boolean, now: number) {
      fade(root, race !== null && on);
      if (!race || !on || now - looked < EVERY) return;
      looked = now;
      drawTower(race, watching);
      drawMates(race);
      drawKeys(race, watching);
      drawSheet(race, watching);
    },
  };
}
