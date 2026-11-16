// PROTOTYPE (throwaway): Portolan's office, five screens after Motorsport Manager. ?screen=home|mail|captain|ship|league|faces  ?theme=parchment|dark
import { coin, crest, face, gauge, icon, meter, place, stat, stars, tone, type Gull } from './ui.ts';

// ── fixtures ────────────────────────────────────────────────
const ME = { name: 'Saltmarsh Rovers', shape: 'anchor', c1: '#2b4fa0', c2: '#f2c230' };
const RIVALS = [
  { name: 'Brine Corsairs', shape: 'saltire', c1: '#b3302a', c2: '#f4ead2' },
  { name: 'The Fogbank', shape: 'crescent', c1: '#4a4f58', c2: '#e8e2d0' },
  { name: 'Harbour Kings', shape: 'star', c1: '#c6951a', c2: '#2a1d10' },
  { name: 'Kelp Wardens', shape: 'wave', c1: '#2c7a4c', c2: '#e9f0dc' },
  { name: 'Ember Gulls', shape: 'sun', c1: '#d8691c', c2: '#2a1408' },
  { name: 'Tidecallers', shape: 'diamond', c1: '#5b3a8c', c2: '#efe3ff' },
  { name: 'Pier Rats', shape: 'triangle', c1: '#7a5232', c2: '#f2e2c6' },
  { name: 'Cliffside', shape: 'chevron', c1: '#1f7f8c', c2: '#e6f6f6' },
  { name: 'Red Shoal', shape: 'cross', c1: '#8c2238', c2: '#f6d9de' },
  { name: 'North Light', shape: 'circle', c1: '#2a3550', c2: '#f2c230' },
  { name: 'Scrimshaw Co.', shape: 'bars', c1: '#e8e2d0', c2: '#2a2622' },
];
const crew = { c1: ME.c1, c2: ME.c2 };
const G = (name: string, seed: number, age: number, role: Gull['role'], c = crew): Gull => ({ name, seed, age, role, crew: c });
const CAPT = [G('Fenwick Squall', 11, 31, 'captain'), G('Odile Brack', 23, 24, 'captain')];
const STAFF = { bosun: G('Hamish Tarr', 5, 47, 'bosun'), wright: G('Juno Pell', 41, 36, 'shipwright'), scout: G('Ivo Marram', 63, 19, 'scout') };
const ELDER = G('Elder Cormorant', 7, 62, 'elder', { c1: '#3d2f4a', c2: '#c6951a' });
const MGR = G('You', 99, 38, 'manager');

const IMG = (f: string) => `url(img/${f}.png)`;

// ── shell ───────────────────────────────────────────────────
const TABS: [string, string, string?][] = [
  ['home', 'Home'], ['crew', 'Crew', '2'], ['ship', 'Ship', 'busy'], ['rookery', 'Rookery', 'busy'],
  ['market', 'Market'], ['league', 'League'], ['finance', 'Coin'], ['mail', 'Mail', '4'],
];
const TAB_OF: Record<string, string> = { home: 'home', mail: 'mail', captain: 'crew', ship: 'ship', league: 'league', faces: 'crew' };
const TITLE: Record<string, string> = { home: 'Home', mail: 'Mail', captain: 'Captain', ship: 'Ship', league: 'League', faces: 'Portraits' };

function shell(screen: string, body: string) {
  const tabs = TABS.map(([k, label, mark]) => `<button class="tab${TAB_OF[screen] === k ? ' on' : ''}">${icon(k)}<span>${label}</span>${
    mark === 'busy' ? '<i class="busy"></i>' : mark ? `<span class="badge">${mark}</span>` : ''}</button>`).join('');
  return `
  <header class="top">
    <div class="ident">${crest(ME, 38)}<div><b>${ME.name}</b><small>Second Flight · Season 2</small></div></div>
    <div class="title">${TITLE[screen]}</div>
    <div class="widgets">
      <div class="widget">${face(ELDER, 34, true, 96)}<div><small>Elders</small><b class="good-t">Secure</b></div></div>
      <div class="widget"><small>Renown</small>${stars(3)}</div>
      <div class="widget coin-pill num">${icon('finance', 20)}<b>${coin(48250)}</b></div>
      <div class="widget bell">${icon('bell')}<span class="badge">3</span></div>
    </div>
  </header>
  <main class="body" style="${BODY_GRID[screen]}">${body}</main>
  <footer class="bottom">
    <div class="hist"><button>‹</button><button>›</button></div>
    ${tabs}
    <div class="date num">${icon('info', 20)}<span>Fog Moon · day 14</span></div>
    <button class="continue">Continue <span>›</span></button>
  </footer>`;
}
const BODY_GRID: Record<string, string> = {
  home: 'grid-template-columns: 330px 1fr 360px',
  mail: 'grid-template-columns: 380px 1fr',
  captain: 'grid-template-columns: 340px 1fr 330px',
  ship: 'grid-template-columns: 1fr 380px',
  league: 'grid-template-columns: 1fr 360px',
  faces: 'grid-template-columns: 1fr',
};

// ── home ────────────────────────────────────────────────────
function home() {
  const capts = CAPT.map((c, i) => `
    <div class="light" style="display:flex;align-items:center;gap:10px;padding:8px 10px">
      ${face(c, 64)}
      <div style="flex:1"><b>${c.name}</b><br>${stars(i ? 3 : 3.5, 'small')}</div>
      <div style="text-align:right"><span class="label">Last race</span><br><b class="num" style="font-size:22px;color:${i ? 'var(--warn)' : 'var(--good)'}">${i ? '31st' : '6th'}</b></div>
    </div>`).join('');

  const bars = [
    ['Hull', 14, 11], ['Sails', 9, 12], ['Guns', 16, 10], ['Crew', 12, 12], ['Flight', 7, 11],
  ].map(([k, v, avg]) => `
    <div style="display:grid;grid-template-columns:70px 1fr 30px;gap:10px;align-items:center;height:30px">
      <span>${k}</span>
      <div style="position:relative;height:18px;background:var(--track)">
        <i style="position:absolute;left:0;top:0;bottom:0;width:${(+v / 20) * 100}%;background:${+v >= +avg ? 'var(--good)' : 'var(--bad)'}"></i>
        <i style="position:absolute;top:-4px;bottom:-4px;width:3px;left:${(+avg / 20) * 100}%;background:var(--ink)"></i>
      </div>
      <b class="num" style="text-align:right">${v}</b>
    </div>`).join('');

  const work = [
    ['ship', 'Copper sheathing', 64, '6 d', null],
    ['rookery', 'Drawing loft · tier 3', 30, '19 d', null],
    ['ship', 'Long nines', 100, 'Ready', 'Fit'],
  ].map(([ic, name, pct, days, btn]) => `
    <div class="work"><i class="fill" style="width:${pct}%;${pct === 100 ? 'background:var(--good)' : ''}"></i>
      <span class="name">${icon(ic as string, 18)}${name}</span>
      ${btn ? `<b class="days" style="color:var(--on-fill)">Ready</b><button class="btn">${btn}</button>` : `<span class="days num">${days}</span>`}
    </div>`).join('');

  const season = ['coralAtolls', 'palmKeys', 'basaltFjords', 'volcanicArc', 'palmKeys', 'coralAtolls', 'volcanicArc', 'basaltFjords'];
  const strip = season.map((_, i) => {
    const done = i < 3, next = i === 3;
    const res = [6, 14, 3][i];
    return `<div style="flex:1;height:34px;display:grid;place-items:center;font-size:13px;font-weight:700;${
      next ? 'background:var(--go);color:var(--on-fill)' : done ? `background:${res <= 3 ? 'var(--gold)' : 'var(--good)'};color:var(--on-fill)` : 'background:var(--step-dark);color:var(--ink-2)'}">${done ? res : i + 1}</div>`;
  }).join('');

  const table = [[ME, 112, 1], [RIVALS[0], 140, 0], [RIVALS[2], 131, 0], [RIVALS[4], 118, 0]]
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .map(([t, pts, me], i) => `<tr class="${me ? 'me' : ''}"><td class="cbar"><i style="background:${(t as typeof ME).c1}"></i></td>
      <td class="num" style="width:28px">${i + 1}</td><td>${crest(t as typeof ME, 22)} ${(t as typeof ME).name}</td><td class="r num">${pts}</td></tr>`).join('');

  return `
  <section class="panel">
    <div class="ph">Crew</div>
    <div style="display:flex;flex-direction:column;gap:6px;padding:0 12px">${capts}</div>
    <div class="ph" style="margin-top:6px">Elders' favour</div>
    <div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:0 12px">
      ${gauge(68, 150)}
      <span class="stamp good-t" style="font-size:16px">Secure</span>
    </div>
    <div style="display:flex;gap:12px;align-items:center;padding:8px 14px">${face(ELDER, 52)}<div><b>Elder Cormorant</b><br><span class="label">Wants top 20</span></div></div>
    <div class="ph" style="margin-top:auto">Crew strengths</div>
    <div style="padding:0 14px 14px">${bars}</div>
  </section>

  <section style="display:grid;grid-template-rows:1fr auto;gap:12px;min-height:0">
    <div class="panel hero" style="background-image:${IMG('rookery-overview')};background-size:auto 114%;background-position:center top">
      <i class="slash" style="left:-40px;transform:skewX(-14deg)"></i>
      <div class="plate" style="left:0;top:0;right:0;display:flex;align-items:center;gap:10px;padding:10px 14px;background:linear-gradient(rgba(14,18,26,0.82),rgba(14,18,26,0))">
        ${crest(ME, 30)}<b style="font-size:18px;letter-spacing:0.08em;text-transform:uppercase">The Rookery</b>
        <span style="margin-left:auto" class="tag warn">2 building</span>
      </div>
      <div class="plate" style="left:14px;bottom:14px;display:flex;gap:16px;align-items:center;padding:10px 14px">
        <div><span style="font-size:13px;opacity:0.7">Ship</span><br><b style="font-size:20px">Gannet's Folly</b></div>
        <div style="text-align:center"><span style="font-size:13px;opacity:0.7">Rating</span><br><b class="num" style="font-size:20px;color:var(--gold)">71</b></div>
        <div style="text-align:center"><span style="font-size:13px;opacity:0.7">Rank</span><br><b class="num" style="font-size:20px">5th</b></div>
      </div>
    </div>
    <div class="panel">
      <div class="ph">Work under way</div>
      <div style="padding-bottom:6px">${work}</div>
    </div>
  </section>

  <section style="display:grid;grid-template-rows:auto 1fr;gap:12px;min-height:0">
    <div class="panel">
      <div class="ph">Next race <span class="aside">Race 4 of 8</span></div>
      <div class="hero" style="height:200px;background-image:${IMG('biome-volcanicArc-orbit')};background-position:center 30%">
        <div class="plate" style="left:0;right:0;bottom:0;display:flex;align-items:center;gap:10px">
          <b style="font-size:20px">Volcanic Arc</b><span class="tag bad" style="margin-left:auto">Ash squalls</span><span class="tag">80 ships</span>
        </div>
      </div>
      <div style="display:flex;gap:3px;padding:10px 12px 4px">${strip}</div>
      <div style="display:flex;justify-content:space-between;padding:4px 12px 12px" class="label"><span>Season</span><b class="go-t num">in 3 days</b></div>
    </div>
    <div class="panel">
      <div class="ph">Second Flight</div>
      <table class="tbl"><tr><th></th><th>#</th><th>Crew</th><th class="r">Pts</th></tr>${table}</table>
      <div style="margin-top:auto;padding:12px"><button class="btn wide">Full standings</button></div>
    </div>
  </section>`;
}

// ── mail ────────────────────────────────────────────────────
function mail() {
  const items: [Gull | null, string, string, string, string, boolean][] = [
    [ELDER, 'Elder Cormorant', 'The Elders expect top twenty', 'Elders', 'bad', true],
    [STAFF.scout, 'Ivo Marram', 'A captain worth stealing', 'Scouting', 'go', true],
    [STAFF.wright, 'Juno Pell', 'Long nines are ready to fit', 'Ship', 'good', true],
    [null, 'Gull Gazette', 'Rovers climb to 5th', 'Press', '', true],
    [STAFF.bosun, 'Hamish Tarr', 'The crew want shore leave', 'Morale', 'warn', false],
    [null, 'Tar & Twine Ltd', 'Sponsorship renewal', 'Patrons', 'gold', false],
    [CAPT[1], 'Odile Brack', 'About my contract', 'Contracts', 'warn', false],
    [null, 'League office', 'Race 3 results', 'Results', '', false],
  ];
  const list = items.map(([g, from, subj, cat, c, unread], i) => `
    <div style="display:flex;gap:10px;align-items:center;padding:8px 10px;height:66px;${i === 0 ? 'background:var(--go);color:var(--on-fill)' : unread ? 'background:var(--step-light)' : ''};border-bottom:1px solid var(--rule)">
      ${g ? face(g, 46, true, 128) : `<span style="width:46px;height:46px;display:grid;place-items:center;background:var(--step-dark);color:var(--ink-2);border-radius:50%">${icon('mail', 22)}</span>`}
      <div style="flex:1;min-width:0"><b style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${unread ? '' : 'font-weight:400'}">${subj}</b>
        <span style="font-size:13px;opacity:0.75">${from}</span></div>
      <span class="tag ${c}" style="${i === 0 ? 'outline:1px solid rgba(255,255,255,0.5)' : ''}">${cat}</span>
    </div>`).join('');

  return `
  <section class="panel">
    <div style="display:flex;gap:6px;padding:10px">
      <div class="seg"><span class="on">All</span><span>Unread · 4</span><span>Flagged</span></div>
    </div>
    <div style="overflow:hidden">${list}</div>
  </section>
  <section class="panel">
    <div class="hero" style="height:250px;background-image:${IMG('rookery-overview')};background-position:center 70%">
      <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(45,34,56,0.96) 0%,rgba(45,34,56,0.9) 62%,rgba(45,34,56,0.2) 100%)"></div>
      <div style="position:absolute;left:0;bottom:-10px">${face(ELDER, 250, false, 512, 'background:none')}</div>
      <div style="position:absolute;left:260px;top:26px;color:#f6eedb">
        <span class="tag bad">Elders</span>
        <h1 style="font-size:30px;margin-top:10px;line-height:1.1">The Elders expect<br>top twenty</h1>
        <div style="margin-top:8px;opacity:0.8">Elder Cormorant · Fog Moon 14</div>
      </div>
    </div>
    <div style="padding:20px 24px;font-size:17px;line-height:1.5;max-width:600px">
      Three races, no top twenty. The Rookery has a long memory, Manager.
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;padding:0 24px">
      <div class="dark" style="padding:12px;text-align:center"><span class="label">Target</span><br><b class="num" style="font-size:28px">Top 20</b></div>
      <div class="dark" style="padding:12px;text-align:center"><span class="label">Best so far</span><br><b class="num warn-t" style="font-size:28px">6th</b></div>
      <div class="dark" style="padding:12px;text-align:center"><span class="label">Favour</span><br><b class="num bad-t" style="font-size:28px">−8</b></div>
    </div>
    <div class="ph" style="margin-top:12px">Reply</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;padding:0 24px 20px">
      ${[['Promise top ten', '+12 favour', 'Fail: sacked', 'go'], ['Ask for patience', '+0 favour', '', 'go'], ['Blame the hull', '−4 favour', 'Shipwright sulks', 'bad']].map(([a, b, c, k]) => `
        <button class="btn ${k}" style="height:auto;flex-direction:column;align-items:flex-start;padding:12px 14px;gap:4px;text-align:left">
          <b style="font-size:16px">${a}</b><span class="num" style="font-size:13px;opacity:0.9">${b}</span>${c ? `<span style="font-size:13px;opacity:0.9">${c}</span>` : ''}
        </button>`).join('')}
    </div>
  </section>`;
}

// ── captain ─────────────────────────────────────────────────
function captain() {
  const c = CAPT[0];
  const st = [['Helm', 15, 1], ['Gunnery', 12, 0], ['Nerve', 17, 0], ['Weather eye', 9, 1], ['Boarding', 6, -1], ['Leadership', 13, 0], ['Flight', 11, 0]]
    .map(([k, v, d]) => stat(k as string, v as number, d as number)).join('');
  const form = [6, 14, 3, 22, 9].map(place).join('');
  const traits = [['Storm-born', 'good', '+2 Helm in squalls'], ['Grudge', 'bad', 'vs Brine Corsairs'], ['Showboat', 'warn', 'Renown +, risk +']];
  return `
  <section class="panel" style="position:relative">
    <div style="height:330px;position:relative;background:radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--crew1) 70%, white), var(--crew1) 75%)">
      <i style="position:absolute;inset:0;background:repeating-linear-gradient(120deg,rgba(255,255,255,0.06) 0 18px,transparent 18px 36px)"></i>
      ${face(c, 330, false, 512, 'position:absolute;left:5px;bottom:0;background:none')}
      <span style="position:absolute;right:10px;top:10px">${crest(ME, 40)}</span>
    </div>
    <div style="background:var(--bar-dark);color:var(--bar-ink);padding:12px 14px">
      <b style="font-size:24px;letter-spacing:0.02em">${c.name}</b>
      <div style="display:flex;gap:12px;align-items:center;margin-top:4px;color:var(--bar-ink-2)"><span>Captain · age 31</span>${stars(3.5, 'small')}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;margin:12px">
      <div class="dark" style="padding:10px;text-align:center"><span class="label">Wage</span><br><b class="num" style="font-size:20px">${coin(1800)}</b><span class="label"> /race</span></div>
      <div class="dark" style="padding:10px;text-align:center"><span class="label">Contract</span><br><b class="num" style="font-size:20px">2 seasons</b></div>
    </div>
    <div style="display:flex;gap:8px;padding:0 12px 12px;margin-top:auto"><button class="btn" style="flex:1">Renew</button><button class="btn bad" style="flex:1">Release</button></div>
  </section>

  <section class="panel">
    <div class="ph">Seamanship <span class="aside">Rating <b class="go-t num" style="font-size:15px">74</b></span></div>
    <div style="padding:0 18px">${st}</div>
    <div class="ph" style="margin-top:8px">Traits</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:0 18px">
      ${traits.map(([n, k, d]) => `<div style="background:var(--${k});color:var(--on-fill);padding:10px 12px"><b class="word" style="font-size:15px">${n}</b><br><span style="font-size:13px;opacity:0.9">${d}</span></div>`).join('')}
    </div>
    <div class="ph" style="margin-top:8px">Last five races</div>
    <div class="form num" style="text-align:center;padding-bottom:16px;transform:scale(1.4);transform-origin:top center">${form}</div>
  </section>

  <section style="display:grid;grid-template-rows:auto 1fr;gap:12px;min-height:0">
    <div class="panel">
      <div class="ph">Mood</div>
      <div style="display:flex;justify-content:center;position:relative">${gauge(82, 190)}
        <span class="stamp good-t" style="position:absolute;right:14px;bottom:4px;font-size:16px">Content</span></div>
      <div style="padding:6px 16px 14px;display:grid;gap:8px">
        ${[['Fatigue', 38, 'var(--warn)'], ['Loyalty', 71, 'var(--good)'], ['Injury', 0, 'var(--good)']].map(([k, v, col]) => `
          <div style="display:grid;grid-template-columns:70px 1fr 40px;gap:10px;align-items:center"><span class="label">${k}</span>${meter(v as number, col as string)}<b class="num" style="text-align:right">${v ? v + '%' : '—'}</b></div>`).join('')}
      </div>
    </div>
    <div class="panel">
      <div class="ph">Season</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;padding:0 12px">
        ${[['Points', '61', ''], ['Best', '3rd', 'gold-t'], ['Sunk', '7', 'good-t'], ['Lost', '1', 'bad-t']].map(([k, v, cl]) => `
          <div class="dark" style="padding:10px;text-align:center"><span class="label">${k}</span><br><b class="num ${cl}" style="font-size:26px">${v}</b></div>`).join('')}
      </div>
      <div class="ph" style="margin-top:4px">Wants</div>
      <div style="padding:0 12px 12px;display:grid;gap:6px">
        <div class="light" style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px"><span>Better guns</span><span class="tag warn">Waiting</span></div>
        <div class="light" style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px"><span>Lead captain</span><span class="tag good">Met</span></div>
      </div>
    </div>
  </section>`;
}

// ── ship ────────────────────────────────────────────────────
function ship() {
  const parts: [string, number, number, string, number | null][] = [
    ['Hull', 14, 3, 'Copper sheathing', 64], ['Sails', 9, 2, '', null], ['Guns', 16, 4, '', 100],
    ['Rigging', 12, 3, '', null], ['Rudder', 11, 2, '', null], ['Roost', 7, 1, 'Wider perches', 22],
  ];
  const cards = parts.map(([k, v, lvl, job, pct]) => `
    <div class="light" style="position:relative;display:grid;grid-template-columns:1fr auto;gap:4px 10px;padding:10px 12px;align-items:center">
      <b class="word" style="font-size:15px">${k}</b>
      <b class="num" style="font-size:26px;color:${tone(v)};grid-row:span 2;text-align:right">${v}</b>
      <span class="label">Level ${lvl} · ${'●'.repeat(lvl)}${'○'.repeat(5 - lvl)}</span>
      <div style="grid-column:span 2;height:8px;background:var(--track)"><i style="display:block;height:100%;width:${v * 5}%;background:${tone(v)}"></i></div>
      ${pct === 100 ? '<button class="btn good" style="grid-column:span 2;height:34px">Fit long nines</button>'
        : pct !== null ? `<div style="grid-column:span 2;position:relative;height:34px;background:var(--step-dark)"><i style="position:absolute;inset:0 auto 0 0;width:${pct}%;background:repeating-linear-gradient(-45deg,var(--warn) 0 8px,color-mix(in srgb,var(--warn) 80%,black) 8px 16px)"></i><span style="position:relative;padding:0 10px;line-height:34px;font-size:13px;font-weight:700">${job}</span></div>`
        : '<button class="btn" style="grid-column:span 2;height:34px">Improve</button>'}
    </div>`).join('');
  const vs = [['Speed', 62, 55], ['Firepower', 78, 60], ['Handling', 58, 61], ['Toughness', 70, 58]];
  return `
  <section style="display:grid;grid-template-rows:1fr auto;gap:12px;min-height:0">
    <div class="panel hero" style="background-image:${IMG('biome-palmKeys-sea')};background-size:175%;background-position:30% 74%">
      <div class="plate" style="left:0;top:0;right:0;display:flex;align-items:center;gap:12px;padding:12px 16px 26px;background:linear-gradient(rgba(14,18,26,0.92) 55%,rgba(14,18,26,0))">
        ${crest(ME, 34)}<div><b style="font-size:22px">Gannet's Folly</b><br><span style="font-size:13px;opacity:0.75">Brigantine · 3 masts</span></div>
        <div style="margin-left:auto;text-align:right"><span style="font-size:13px;opacity:0.75">Rating</span><br><b class="num" style="font-size:30px;color:var(--gold)">71</b></div>
      </div>
      <div class="plate" style="left:14px;bottom:14px;right:14px;display:grid;grid-template-columns:repeat(4,1fr);gap:16px;padding:12px 16px">
        ${vs.map(([k, v, avg]) => `<div><div style="display:flex;justify-content:space-between;font-size:13px"><span style="opacity:0.75">${k}</span><b class="num">${v}</b></div>
          <div style="position:relative;height:8px;background:rgba(255,255,255,0.15);margin-top:6px"><i style="position:absolute;inset:0 auto 0 0;width:${v}%;background:${(v as number) >= (avg as number) ? '#4fbf7a' : '#e2574f'}"></i><i style="position:absolute;top:-3px;bottom:-3px;width:2px;left:${avg}%;background:#fff"></i></div></div>`).join('')}
      </div>
    </div>
    <div class="panel" style="flex-direction:row;align-items:center;gap:12px;padding:10px 14px">
      ${face(STAFF.wright, 52)}<div><b>Juno Pell</b><br><span class="label">Shipwright · ${stars(4, 'small')}</span></div>
      <div style="margin-left:auto;display:flex;gap:6px"><span class="tag warn">2 jobs</span><span class="tag">1 slot free</span></div>
    </div>
  </section>
  <section class="panel">
    <div class="ph">Parts <span class="aside">vs fleet avg</span></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 12px 12px">${cards}</div>
  </section>`;
}

// ── league ──────────────────────────────────────────────────
function league() {
  const pts = [140, 131, 124, 118, 112, 104, 97, 90, 82, 77, 64, 52];
  const all = [RIVALS[0], RIVALS[2], RIVALS[5], RIVALS[4], ME, RIVALS[1], RIVALS[3], RIVALS[7], RIVALS[6], RIVALS[8], RIVALS[9], RIVALS[10]];
  const forms = [[2, 1, 4], [5, 3, 1], [8, 12, 6], [3, 18, 9], [6, 14, 3], [11, 9, 15], [20, 7, 13], [14, 22, 19], [30, 16, 25], [18, 41, 22], [44, 28, 37], [52, 61, 48]];
  const rows = all.map((t, i) => `<tr class="${t === ME ? 'me' : ''}${i === 2 ? ' cut' : ''}${i === 8 ? ' drop' : ''}">
    <td class="cbar"><i style="background:${t.c1}"></i></td>
    <td class="num" style="width:34px;font-weight:700">${i + 1}</td>
    <td><span style="display:flex;align-items:center;gap:10px">${crest(t, 26)}${t.name}</span></td>
    <td class="form num">${forms[i].map(place).join('')}</td>
    <td class="r num">${[3, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0][i]}</td>
    <td class="r num" style="font-weight:700;font-size:17px">${pts[i]}</td>
    <td style="width:36px;text-align:center">${i < 3 ? '<span class="good-t">▲</span>' : i >= 9 ? '<span class="bad-t">▼</span>' : ''}</td>
  </tr>`).join('');
  return `
  <section class="panel">
    <div style="display:flex;align-items:center;gap:10px;padding:10px 12px">
      <div class="seg"><span>First Flight</span><span class="on">Second Flight</span><span>Third Flight</span></div>
      <div class="seg" style="margin-left:auto"><span class="on">Crews</span><span>Captains</span></div>
    </div>
    <table class="tbl"><tr><th></th><th>#</th><th>Crew</th><th>Last 3</th><th class="r">Wins</th><th class="r">Pts</th><th></th></tr>${rows}</table>
    <div style="display:flex;gap:16px;padding:10px 14px;margin-top:auto" class="label">
      <span><i style="display:inline-block;width:14px;height:4px;background:var(--good);vertical-align:middle"></i> Promoted</span>
      <span><i style="display:inline-block;width:14px;height:4px;background:var(--bad);vertical-align:middle"></i> Relegated</span>
    </div>
  </section>
  <section style="display:grid;grid-template-rows:auto 1fr;gap:12px;min-height:0">
    <div class="panel">
      <div class="ph">Last race</div>
      <div class="hero" style="height:150px;background-image:${IMG('biome-basaltFjords-sea')};background-position:center 60%">
        <div class="plate" style="left:0;right:0;bottom:0;display:flex;align-items:center"><b>Basalt Fjords</b><span class="tag gold" style="margin-left:auto">3rd</span></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:2px;padding:12px">
        ${[[RIVALS[2], 'gold'], [RIVALS[0], 'silver'], [ME, 'bronze']].map(([t, m], i) => `
          <div class="${i === 2 ? 'light' : 'dark'}" style="padding:10px 6px;text-align:center;${i === 2 ? 'outline:2px solid var(--go);outline-offset:-2px' : ''}">
            <b class="num" style="font-size:22px;color:${m === 'gold' ? 'var(--gold)' : m === 'silver' ? 'var(--ink-2)' : '#a8692c'}">${i + 1}</b><br>${crest(t as typeof ME, 34)}<br><span style="font-size:13px">${(t as typeof ME).name}</span></div>`).join('')}
      </div>
    </div>
    <div class="panel">
      <div class="ph">Top captains</div>
      ${[[CAPT[0], 61, ME], [G('Rook Halyard', 77, 29, 'captain', RIVALS[0]), 74, RIVALS[0]], [G('Wren Ashby', 88, 41, 'captain', RIVALS[2]), 66, RIVALS[2]]]
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .map(([g, p, t], i) => `<div style="display:flex;align-items:center;gap:10px;padding:6px 12px;${t === ME ? 'background:var(--step-light)' : ''}">
          <b class="num" style="width:18px">${i + 1}</b><i style="width:5px;height:44px;background:${(t as typeof ME).c1}"></i>${face(g as Gull, 44, true, 128)}<span style="flex:1">${(g as Gull).name}</span><b class="num">${p}</b></div>`).join('')}
    </div>
  </section>`;
}

// ── portrait check sheet ────────────────────────────────────
function faces() {
  const roles: Gull['role'][] = ['captain', 'bosun', 'shipwright', 'scout', 'flight', 'manager', 'elder'];
  const crews = [ME, ...RIVALS];
  let s = '';
  for (let i = 0; i < 24; i++) {
    const t = crews[i % crews.length];
    const g = G(`#${i}`, 100 + i * 7, [16, 28, 35, 52][i % 4], roles[i % roles.length], { c1: t.c1, c2: t.c2 });
    s += `<div style="text-align:center">${face(g, 150, true, 256)}<span class="label">${g.role} · ${g.age}</span></div>`;
  }
  return `<section class="panel" style="display:grid;grid-template-columns:repeat(8,1fr);gap:10px;padding:14px;align-content:start;justify-items:center">${s.replaceAll('width:150px;height:150px', 'width:124px;height:124px')}</section>`;
}

// ── page ────────────────────────────────────────────────────
const SCREENS: Record<string, () => string> = { home, mail, captain, ship, league, faces };
const ORDER = ['home', 'mail', 'captain', 'ship', 'league'];
const q = new URLSearchParams(location.search);
let screen = q.get('screen') ?? 'home';
let theme = q.get('theme') ?? 'parchment';
const page = document.getElementById('page')!;

function fit() {
  const s = Math.min(innerWidth / 1180, innerHeight / 820);
  page.style.transform = s < 1 ? `scale(${s})` : '';
}

function render() {
  document.documentElement.dataset.theme = theme;
  page.style.setProperty('--crew1', ME.c1);
  page.innerHTML = shell(screen, SCREENS[screen]());
  const u = new URL(location.href);
  u.searchParams.set('screen', screen);
  u.searchParams.set('theme', theme);
  history.replaceState(null, '', u);
  bar.querySelector('span')!.textContent = `${screen} · ${theme}`;
}

const bar = document.createElement('div');
bar.className = 'proto';
bar.innerHTML = '<button data-d="-1">←</button><span></span><button data-d="1">→</button><button data-t>theme</button><button data-h>hide</button>';
const step = (d: number) => {
  screen = ORDER[(ORDER.indexOf(screen) + d + ORDER.length) % ORDER.length];
  render();
};
bar.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  if (b.dataset.d) step(+b.dataset.d);
  else if (b.dataset.t !== undefined) { theme = theme === 'dark' ? 'parchment' : 'dark'; render(); }
  else bar.style.display = 'none';
});
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') step(1);
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === 't') { theme = theme === 'dark' ? 'parchment' : 'dark'; render(); }
  if (e.key === 'h') bar.style.display = bar.style.display === 'none' ? '' : 'none';
});
addEventListener('resize', fit);
if (!q.has('clean')) document.body.append(bar);
render();
fit();
const ready = document.createElement('i');
ready.id = 'ready';
document.body.append(ready);
