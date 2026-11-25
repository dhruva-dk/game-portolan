import { pressable, ribbon } from './button.ts';
import { MOTION, SPACE, TYPE } from './house.ts';
import { WASH, glyph, slip, svgNode } from './ink.ts';
import { sheet } from './sheet.ts';
import { bindSlider, sliderFace, type Track } from './slider.ts';
import { bindSwitch, switchFace, SWITCH } from './switch.ts';
import { fitted, label, measured, word, type Word } from './word.ts';

export type Settings = {
  sound: number;
  music: number;
  leftHanded: boolean;
  sensitivity: number;
};

export type Level = 'sound' | 'music' | 'sensitivity';

export const SETTINGS: Settings = {
  sound: 0.8,
  music: 0.6,
  leftHanded: false,
  sensitivity: 1,
};

export const RANGES: Readonly<
  Record<Level, { least: number; most: number; step: number }>
> = {
  sound: { least: 0, most: 1, step: 0.05 },
  music: { least: 0, most: 1, step: 0.05 },
  sensitivity: { least: 0.5, most: 2, step: 0.05 },
};

type SettingsRow =
  | {
      kind: 'slider';
      id: Level;
      word: Word;
      share: number;
      mark: number | null;
    }
  | { kind: 'switch'; id: 'leftHanded'; word: Word; on: boolean }
  | { kind: 'seed'; word: Word; seed: string }
  | { kind: 'newCareer'; word: Word };

type SettingsView = { rows: SettingsRow[] };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function shareOf(id: Level, value: number): number {
  const { least, most } = RANGES[id];
  return clamp01((value - least) / (most - least));
}

export function valueAt(id: Level, share: number): number {
  const { least, most, step } = RANGES[id],
    raw = least + (most - least) * clamp01(share);
  return Math.round(Math.round(raw / step) * step * 100) / 100;
}

export const moved = (s: Settings, id: Level, share: number): Settings => ({
  ...s,
  [id]: valueAt(id, share),
});

export const thrown = (s: Settings): Settings => ({
  ...s,
  leftHanded: !s.leftHanded,
});

const slider = (s: Settings, id: Level, word: Word): SettingsRow => ({
  kind: 'slider',
  id,
  word,
  share: shareOf(id, s[id]),
  mark: id === 'sensitivity' ? shareOf(id, SETTINGS.sensitivity) : null,
});

export function settingsView(
  s: Settings,
  lobby: { seed: string } | null
): SettingsView {
  const rows: SettingsRow[] = [
    slider(s, 'sound', 'Sound'),
    slider(s, 'music', 'Music'),
    { kind: 'switch', id: 'leftHanded', word: 'Left-handed', on: s.leftHanded },
    slider(s, 'sensitivity', 'Sensitivity'),
  ];
  if (lobby)
    rows.push(
      { kind: 'seed', word: 'Seed', seed: lobby.seed },
      { kind: 'newCareer', word: 'New Career' }
    );
  return { rows };
}

const level = (id: Level, v: unknown): number => {
  const { least, most } = RANGES[id];
  return typeof v === 'number' && v >= least && v <= most ? v : SETTINGS[id];
};

export function settled(fields: ReadonlyMap<string, unknown>): Settings {
  const left = fields.get('leftHanded');
  return {
    sound: level('sound', fields.get('sound')),
    music: level('music', fields.get('music')),
    leftHanded: typeof left === 'boolean' ? left : SETTINGS.leftHanded,
    sensitivity: level('sensitivity', fields.get('sensitivity')),
  };
}

export type SettingsPort = {
  get(): Settings;
  set(settings: Settings): void;
  heard?(id: Level): void;
};

export type LobbyRows = { seed: string; newCareer(): void };

const SETTINGS_SHEET = {
  w: 340,
  top: 42,
  row: 50,
  ribbon: 36,
  foot: 42,
  below: 70,
  words: 28,
  control: 150,
  seed: 32,
  newCareer: 196,
} as const;

const WASHES: Record<Level, string> = {
  sound: WASH.azure,
  music: WASH.viridian,
  sensitivity: WASH.ochre,
};

const S = SETTINGS_SHEET;

const sheetHeight = (lobby: boolean) =>
  lobby ? S.top + 4 * S.row + S.below : S.top + 3 * S.row + S.foot;

const track = (): Track => ({
  x: S.control - 4,
  w: S.w - S.control - S.words + 8,
});

function rowFace(row: SettingsRow, cy: number) {
  const right = S.w - S.words;
  switch (row.kind) {
    case 'slider':
      return (
        word(S.words, cy, row.word, TYPE.name, {
          anchor: 'start',
          weight: 600,
        }) +
        sliderFace(row.id, track(), cy, row.share, {
          wash: WASHES[row.id],
          mark: row.mark,
        })
      );
    case 'switch':
      return (
        word(S.words, cy, row.word, TYPE.name, {
          anchor: 'start',
          weight: 600,
        }) + switchFace(row.id, right - SWITCH.w, cy, row.on)
      );
    case 'seed': {
      const w = right - S.control,
        size = fitted(row.seed, TYPE.name + 1, w - 2 * SPACE.pad - 18);
      return (
        word(S.words, cy, row.word, TYPE.name, {
          anchor: 'start',
          weight: 600,
        }) +
        `<g id="seed">${slip(S.control, cy - S.seed / 2, w, S.seed)}` +
        label(S.control + SPACE.pad, cy + 0.5, row.seed, size, {
          anchor: 'start',
        }) +
        '</g>' +
        `<g id="copied" class="answer" opacity="0">${glyph('tick', right - 13, cy, 18, { ink: 'green' })}</g>`
      );
    }
    case 'newCareer': {
      const said = measured(row.word, TYPE.ribbon - 4, { weight: 600 });
      return (
        '<g id="new-career">' +
        ribbon(
          S.w / 2,
          cy,
          S.newCareer,
          word(S.w / 2 - said / 2, cy - 1, row.word, TYPE.ribbon - 4, {
            anchor: 'start',
            weight: 600,
          })
        ) +
        '</g>'
      );
    }
  }
}

const copier = () => {
  try {
    const clip = navigator.clipboard;
    return typeof clip?.writeText === 'function' ? clip : null;
  } catch {
    return null;
  }
};

export function createSettingsSheet(
  port: SettingsPort,
  lobby?: LobbyRows,
  back?: () => void
) {
  const h = sheetHeight(lobby !== undefined),
    tall = lobby ? h + S.ribbon : h,
    el = document.createElement('div');
  el.style.cssText = `position:relative;width:${S.w}px;height:${tall}px`;
  let timer = 0;

  function draw() {
    const v = settingsView(port.get(), lobby ? { seed: lobby.seed } : null),
      clip = copier();
    let art = sheet(0, 0, S.w, h, {
      seed: 29,
      close: back ? 'back' : undefined,
    });
    v.rows.forEach((row, i) => {
      art += rowFace(row, row.kind === 'newCareer' ? h : S.top + i * S.row);
    });
    const svg = svgNode(S.w, tall, art);
    el.replaceChildren(svg);
    for (const row of v.rows) {
      if (row.kind === 'slider') {
        const id = row.id;
        bindSlider(svg, id, track(), {
          move: (share) => port.set(moved(port.get(), id, share)),
          done(share) {
            const next = moved(port.get(), id, share);
            port.set(next);
            port.heard?.(id);
            return shareOf(id, next[id]);
          },
        });
      }
      if (row.kind === 'switch')
        bindSwitch(svg, row.id, () => {
          const next = thrown(port.get());
          port.set(next);
          return next.leftHanded;
        });
    }
    if (back)
      pressable(svg.querySelector<SVGElement>('#back'), () => back(), 'back');
    if (lobby) {
      pressable(
        svg.querySelector<SVGElement>('#new-career'),
        () => lobby.newCareer(),
        'new-career'
      );
      if (clip)
        pressable(
          svg.querySelector<SVGElement>('#seed'),
          () => {
            const seed = svg.querySelector<SVGElement>('#seed');
            const refused = () => {
              seed?.classList.remove('refuse');
              void seed?.getBoundingClientRect();
              seed?.classList.add('refuse');
            };
            clip.writeText(lobby.seed).then(() => {
              const answer = svg.querySelector<SVGElement>('#copied');
              if (!answer) return;
              answer.classList.remove('copied');
              void answer.getBoundingClientRect();
              answer.classList.add('copied');
              window.clearTimeout(timer);
              timer = window.setTimeout(
                () => answer.classList.remove('copied'),
                MOTION.copied.hold
              );
            }, refused);
          },
          'seed'
        );
    }
    return svg;
  }

  return {
    el,
    w: S.w,
    h: tall,
    show() {
      draw();
    },
  };
}
