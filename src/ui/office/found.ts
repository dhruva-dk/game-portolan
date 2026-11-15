// found: founding the crew (Phase C section 6). The form in columns 1–7: the crew's name (1–24 letters, a default, a
// reroll); its two colours, the first's choice disabled in the second; its emblem, of twelve; the player's name and
// headshot (a reroll). The preview in columns 8–12: the galleon in the chosen colours, the top bar as it will read,
// the crew being replaced, and "Found the crew", which sends Found. Each refusal shows under its own field.

import type { CommandOf, Face, FoundErrors, FoundView } from '../../office';
import { emblem } from '../emblem';
import { PAPER, crewInk, crewName, crewWash, galleon, svg } from '../ink';
import { button } from '../kit/button';
import { headshot } from '../kit/headshot';
import { make, tappable } from '../kit/part';
import { panel } from '../kit/panel';
import type { Screen, Send } from './screen';

type Found = CommandOf<'Found'>;

/** A text field: its label, its input (at most `most` letters) and its error line. */
function field(parent: HTMLElement, label: string, most: number, change: (v: string) => void) {
  const el = make('div', 'k-field', parent);
  make('label', '', el, label);
  const input = make('input', '', el);
  Object.assign(input, { type: 'text', maxLength: most, spellcheck: false, autocomplete: 'off' });
  input.setAttribute('aria-label', label);
  input.addEventListener('input', () => change(input.value));
  input.addEventListener('pointerdown', (e) => e.stopPropagation());
  const err = make('div', 'err', el);
  return {
    el, input,
    set(v: string) { input.value = v; },
    error(e: string | undefined) {
      err.textContent = e ?? '';
      el.classList.toggle('bad', !!e);
    },
  };
}

export function createFound(send: Send): Screen<FoundView> {
  const el = make('div', '');
  Object.assign(el.style, { inset: '0' });
  const form = panel({ from: 1, to: 7, top: 0, height: 724 }, { title: 'Found your crew', note: 'Every name may be changed before you found it' });
  const preview = panel({ from: 8, to: 12, top: 0, height: 724 }, { title: 'As it will sail' });
  el.append(form.el, preview.el);

  let c: Found | null = null, view: FoundView | null = null, tries = 0, errors: FoundErrors = {};
  const now = () => c as Found;

  // the crew's name
  const nameRow = make('div', 'o-field-row', form.body);
  const crew = field(nameRow, 'Crew name', 24, (v) => edit({ crew: v }));
  nameRow.appendChild(button('Reroll', () => {
    const v = send.desk().found((now().seed + ++tries * 7919) >>> 0, now().colours);
    crew.set(v.crew);
    edit({ crew: v.crew });
  }, 'plain').el);
  // the two colours
  make('div', 'o-label', form.body, 'First colour');
  const first = make('div', 'o-swatches', form.body);
  make('div', 'o-label', form.body, 'Second colour');
  const second = make('div', 'o-swatches', form.body);
  const colourErr = make('div', 'small harm', form.body);
  const swatches = (grid: HTMLElement, which: 'first' | 'second') => Array.from({ length: 24 }, (_, i) => {
    const s = make('div', 'o-swatch', grid);
    s.style.background = crewInk(i);
    s.setAttribute('aria-label', `${which} colour ${crewName(i)}`);
    tappable(s, () => edit({ colours: { ...now().colours, [which]: i } }));
    return s;
  });
  const firsts = swatches(first, 'first'), seconds = swatches(second, 'second');
  // the emblem, and the player's gull
  const lower = make('div', '', form.body);
  Object.assign(lower.style, { display: 'grid', gridTemplateColumns: '356px 1fr', columnGap: '20px', marginTop: '4px' });
  const left = make('div', '', lower), right = make('div', '', lower);
  make('div', 'o-label', left, 'Emblem');
  const emblems = make('div', 'o-emblems', left);
  const emblemErr = make('div', 'small harm', left);
  const marks = Array.from({ length: 12 }, (_, i) => {
    const m = make('div', 'o-emblem', emblems);
    m.setAttribute('aria-label', `emblem ${i + 1}`);
    tappable(m, () => edit({ emblem: i }));
    return m;
  });
  make('div', 'o-label', right, 'You');
  const you = make('div', '', right);
  Object.assign(you.style, { display: 'grid', gridTemplateColumns: '96px 1fr', columnGap: '12px' });
  const face = headshot(96), names = make('div', '', you);
  you.prepend(face.el);
  const given = field(names, 'Given name', 20, (v) => edit({ given: v }));
  const family = field(names, 'Family name', 20, (v) => edit({ family: v }));
  const gullErr = make('div', 'small harm', right);
  right.appendChild(button('Reroll face', () => edit({ headshot: (now().headshot * 1103515245 + 12345) >>> 0 }), 'plain').el);

  // the preview
  const ship = make('div', '', preview.body);
  const bar = make('div', 'k-plate', preview.body), barFace = headshot(40), barText = make('div', '', bar);
  bar.prepend(barFace.el);
  const barName = make('div', 'bold', barText), barCrew = make('div', 'small o-crew', barText);
  make('div', 'o-label', preview.body, 'The crew you replace');
  const replacing = make('p', '', preview.body);
  Object.assign(replacing.style, { margin: '0 0 16px' });
  const go = button('Found the crew', () => void found(), 'primary');
  preview.body.appendChild(go.el);
  go.el.style.width = '100%';

  const faceOf = (k: Found): Face => ({ seed: k.headshot, role: 'manager', age: view?.age ?? 35, colours: k.colours, emblem: k.emblem });

  /** The form changed: redrawn, its errors cleared where now right. */
  function edit(k: Partial<Found>) {
    const was = now().colours;
    c = { ...now(), ...k };
    // (the second colour moved off the first's)
    if (c.colours.first === c.colours.second) c = { ...c, colours: { first: c.colours.first, second: was.first !== c.colours.first ? was.first : (c.colours.first + 1) % 24 } };
    if (c.colours.first !== was.first || c.colours.second !== was.second) view = send.desk().found(c.seed, c.colours);
    errors = Object.fromEntries(Object.entries(send.desk().foundErrors(c)).filter(([key]) => key in errors)) as FoundErrors;
    draw();
  }

  function draw() {
    const k = now();
    firsts.forEach((s, i) => s.classList.toggle('on', i === k.colours.first));
    seconds.forEach((s, i) => {
      s.classList.toggle('on', i === k.colours.second);
      s.classList.toggle('off', i === k.colours.first);
      s.setAttribute('aria-disabled', String(i === k.colours.first));
    });
    marks.forEach((m, i) => {
      m.innerHTML = svg(44, 44, emblem(i, 22, 22, 38, { ink: crewInk(k.colours.first), ground: PAPER }));
      m.classList.toggle('on', i === k.emblem);
    });
    face.set(faceOf(k));
    ship.innerHTML = svg(300, 250, `<rect x="0" y="0" width="300" height="250" fill="${crewWash(k.colours.second)}"/>`
      + galleon(150, 120, 230, { sail: crewInk(k.colours.second), hull: crewInk(k.colours.first), waves: true })
      // (the crew's mark on a roundel on the mainsail)
      + emblem(k.emblem, 150, 92, 34, { ink: crewInk(k.colours.first), ground: PAPER }));
    Object.assign((ship.firstElementChild as SVGElement).style, { width: '100%', height: '250px', marginBottom: '14px', border: '1px solid currentColor' });
    barFace.set(faceOf(k));
    barName.textContent = `${k.given} ${k.family}`.trim() || 'Your name';
    barCrew.innerHTML = svg(18, 18, emblem(k.emblem, 9, 9, 16, { ink: crewInk(k.colours.first), ground: PAPER }));
    make('span', '', barCrew, k.crew.trim() || 'Your crew');
    replacing.textContent = view?.replacing ?? '';
    crew.error(errors.crew);
    colourErr.textContent = errors.colours ?? '';
    emblemErr.textContent = errors.emblem ?? '';
    gullErr.textContent = errors.gull ?? '';
  }

  async function found() {
    errors = send.desk().foundErrors(now());
    draw();
    if (Object.keys(errors).length > 0) return;
    if (await send.command({ ...now(), crew: now().crew.trim(), given: now().given.trim(), family: now().family.trim() })) send.tap('home');
  }

  return {
    el,
    show(v) {
      // (the form is kept while it is open: a new view only for a new form)
      if (view && c && v.seed === c.seed) return;
      view = v;
      c = { kind: 'Found', seed: v.seed, crew: v.crew, colours: v.colours, emblem: v.emblem, given: v.given, family: v.family, headshot: v.headshot };
      errors = {};
      crew.set(v.crew);
      given.set(v.given);
      family.set(v.family);
      draw();
    },
  };
}
