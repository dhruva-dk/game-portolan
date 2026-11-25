import type { PlanetView } from '../../career/views/planet.ts';
import type { PlanetMarks } from '../../play/player.ts';
import type { Eye } from '../../render/snapshot.ts';
import { clamp, smoother } from '../../world/scalar.ts';
import { R, dot, normalize, add, type Vec3 } from '../../world/sphere.ts';
import { createRings } from '../base/calm.ts';
import { liveryColors } from '../base/emblem.ts';
import {
  SWIRL,
  createOrbit,
  flight,
  focal,
  project,
  seenRadius,
  sightOf,
  spaceEye,
  type Seen,
  type Sight,
} from '../base/globe.ts';
import { FAINT, MOTION, SPACE, TYPE } from '../base/house.ts';
import { INK, WASH, alpha, glyph, slip, svgNode } from '../base/ink.ts';
import { least } from '../base/lexicon.ts';
import { onResize, piece, screen, view as viewport } from '../base/ui.ts';
import { label, measured, word } from '../base/word.ts';
import type { LobbyPort } from './port.ts';

const GLOBE = { r: 0.38, x: 34, y: 16 } as const;
const SKY = { stars: 1600, swirls: 200, glow: 0.09 } as const;

const sphere = (n: number, turn: number): Vec3[] =>
  Array.from({ length: n }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / n,
      r = Math.sqrt(1 - y * y),
      a = i * Math.PI * (3 - Math.sqrt(5)) + turn;
    return [r * Math.cos(a), y, r * Math.sin(a)];
  });
const STARS = sphere(SKY.stars, 0.7);
const GUSTS = sphere(SKY.swirls, 0.2);
const SLIP = { h: 96, rows: [24, 54, 78], gap: 1.02 } as const;
const BANDS = 6;
const WEATHER = { reach: 0.3, swirl: 0.25, ripple: 1.9, pulse: 2.6 } as const;
const BERTH = { r: 7, ripple: 15 } as const;

type Phase = 'shut' | 'rising' | 'open' | 'falling';

const eased = (t: number) => smoother(clamp(t));

function ratingRow(
  x: number,
  y: number,
  mark: string,
  rating: number,
  stars: number,
  said: 'Storm' | 'Heals',
  from: number,
  inking: boolean
) {
  const size = least('star'),
    step = size * SLIP.gap;
  let s = mark;
  for (let i = 0; i < stars; i++) {
    const lit = i < rating,
      star = glyph('star', x + i * step, y, size, {
        opacity: lit ? 1 : FAINT * 0.6,
      });
    s +=
      lit && inking
        ? `<g class="inked" style="--i:${from + i}">${star}</g>`
        : star;
  }
  return (
    s +
    word(x + (stars - 0.5) * step + SPACE.gap, y, said, TYPE.word, {
      anchor: 'start',
      weight: 600,
    })
  );
}

function planetSlip(v: PlanetView, inking: boolean) {
  const mark = least('storm'),
    star = least('star'),
    gx = SPACE.pad + mark / 2,
    sx = SPACE.pad + mark + SPACE.gap + star / 2;
  const said = Math.max(
    measured('Storm', TYPE.word, { weight: 600 }),
    measured('Heals', TYPE.word, { weight: 600 })
  );
  const rowW =
    sx + (v.stars - 0.5) * star * SLIP.gap + SPACE.gap + said + SPACE.pad;
  const nameSize = TYPE.name + 3,
    w = Math.ceil(
      Math.max(
        rowW,
        SPACE.pad * 2 + measured(v.name, nameSize, { weight: 600 })
      )
    );
  const [ny, sy, hy] = SLIP.rows;
  return {
    w: w + 4,
    h: SLIP.h + 6,
    svg:
      slip(1, 1, w, SLIP.h) +
      label(SPACE.pad, ny, v.name, nameSize, { anchor: 'start' }) +
      `<path d="M${SPACE.pad} ${ny + 14}H${w - SPACE.pad}" stroke="${INK.iron}" stroke-width=".6" opacity=".45"/>` +
      ratingRow(
        sx,
        sy,
        glyph('storm', gx, sy, mark),
        v.storm,
        v.stars,
        'Storm',
        0,
        inking
      ) +
      ratingRow(
        sx,
        hy,
        glyph('heal', gx, hy, mark),
        v.heals,
        v.stars,
        'Heals',
        v.storm,
        inking
      ),
  };
}

export function createPlanet(port: LobbyPort) {
  const el = screen(true);
  el.parentElement?.prepend(el);
  el.style.touchAction = 'none';
  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:absolute;left:0;top:0;pointer-events:none;opacity:0';
  el.append(canvas);
  const ctx = canvas.getContext('2d')!;
  const card = piece(el, 'top left', false, true);

  const lay: {
    r: number;
    f: number;
    x: number;
    y: number;
    center: [number, number];
  } = { r: 1, f: 1, x: 0, y: 0, center: [0, 0] };
  function layout() {
    const { w, h, k, dpr } = viewport;
    lay.r = h * GLOBE.r;
    lay.f = focal(lay.r);
    lay.x = w / 2 + GLOBE.x * k;
    lay.y = h / 2 + GLOBE.y * k;
    lay.center = [(2 * GLOBE.x * k) / w, (2 * GLOBE.y * k) / h];
    const scale = Math.min(dpr, 3);
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }
  onResize(layout);

  const orbit = createOrbit(el, { f: () => lay.f });
  const rings = createRings(BANDS + 2);
  const seen: Seen = { x: 0, y: 0, facing: 0 };

  let phase: Phase = 'shut',
    t = 0,
    clock = 0,
    view: PlanetView | null = null,
    aimed = false,
    landed: (() => void) | null = null;

  function aim(ground: Eye) {
    const marks = port.marks();
    const at: Vec3 = marks
      ? normalize(add(normalize(marks.berths[0]), normalize(marks.berths[1])))
      : normalize(ground.position);
    orbit.reset(at);
    aimed = marks !== null;
  }

  function trace(e: Sight, ring: readonly Vec3[]) {
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i <= ring.length; i++) {
      const p = project(e, ring[i % ring.length], seen);
      if (p.facing <= 0) pen = false;
      else if (pen) ctx.lineTo(p.x, p.y);
      else {
        ctx.moveTo(p.x, p.y);
        pen = true;
      }
    }
  }

  function weather(e: Sight, marks: PlanetMarks, k: number) {
    const { center, radius } = marks.storm;
    for (let i = BANDS; i >= 1; i--) {
      const f = i / BANDS;
      trace(e, rings(center, (radius + WEATHER.reach * f * f) * R));
      ctx.strokeStyle = alpha(INK.storm, 0.2 * (1 - f) + 0.05);
      ctx.lineWidth = (10 + 8 * f) * k;
      ctx.stroke();
    }
    const calm = Math.cos(radius + 0.06),
      size = Math.min(1.3, seenRadius(e) / 160);
    ctx.fillStyle = alpha(INK.white, 0.55);
    ctx.strokeStyle = alpha(INK.storm, 0.75);
    ctx.lineWidth = 0.8;
    for (const [i, q] of GUSTS.entries()) {
      const p = project(e, q, seen);
      if (p.facing < 0.12 || dot(q, center) > calm) continue;
      const s = size * Math.min(1, p.facing * 2) * 1.1;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(s, s);
      ctx.rotate(i + clock * WEATHER.swirl * (i % 2 ? 1 : -1));
      ctx.translate(-12, -12);
      ctx.fill(SWIRL);
      ctx.stroke(SWIRL);
      ctx.restore();
    }
    trace(e, rings(center, radius * R));
    ctx.strokeStyle = alpha(INK.white, 0.8);
    ctx.lineWidth = 6 * k;
    ctx.stroke();
    ctx.strokeStyle = INK.storm;
    ctx.lineWidth = 3 * k;
    ctx.setLineDash([9 * k, 5 * k]);
    ctx.lineDashOffset = -clock * 6 * k;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function berths(e: Sight, marks: PlanetMarks, k: number, dye: string) {
    const beat = (clock % WEATHER.pulse) / WEATHER.pulse,
      swell = 1 + 0.12 * Math.sin(beat * Math.PI * 2);
    marks.berths.forEach((at, i) => {
      const p = project(e, at, seen);
      if (p.facing <= 0) return;
      const ripple = (((clock / WEATHER.ripple + i * 0.5) % 1) + 1) % 1;
      ctx.beginPath();
      ctx.arc(
        p.x,
        p.y,
        (BERTH.r + (BERTH.ripple - BERTH.r) * ripple) * k,
        0,
        Math.PI * 2
      );
      ctx.strokeStyle = alpha(dye, 0.7 * (1 - ripple));
      ctx.lineWidth = 2 * k;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, BERTH.r * swell * k, 0, Math.PI * 2);
      ctx.strokeStyle = alpha(INK.white, 0.9);
      ctx.lineWidth = 6 * k;
      ctx.stroke();
      ctx.strokeStyle = INK.iron;
      ctx.lineWidth = 4.4 * k;
      ctx.stroke();
      ctx.strokeStyle = dye;
      ctx.lineWidth = 2.6 * k;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.6 * k, 0, Math.PI * 2);
      ctx.fillStyle = INK.iron;
      ctx.fill();
    });
  }

  function heavens(e: Sight, k: number) {
    const r = seenRadius(e);
    for (const [i, q] of STARS.entries()) {
      const z = -dot(q, e.c);
      if (z <= 0.05) continue;
      const x = e.cx + (e.f * dot(q, e.right)) / z,
        y = e.cy - (e.f * dot(q, e.up)) / z;
      if (Math.hypot(x - e.cx, y - e.cy) < r + 4 * k) continue;
      if (x < 0 || y < 0 || x > viewport.w || y > viewport.h) continue;
      const big = i % 7 === 0;
      ctx.fillStyle = alpha(INK.white, big ? 0.85 : 0.3 + (i % 5) * 0.1);
      ctx.beginPath();
      ctx.arc(x, y, (big ? 1.3 : 0.55 + (i % 3) * 0.2) * k, 0, Math.PI * 2);
      ctx.fill();
    }
    const glow = ctx.createRadialGradient(
      e.cx,
      e.cy,
      r * 0.98,
      e.cx,
      e.cy,
      r * (1 + SKY.glow)
    );
    glow.addColorStop(0, alpha(WASH.azure, 0.55));
    glow.addColorStop(0.35, alpha(WASH.sea, 0.22));
    glow.addColorStop(1, alpha(WASH.sea, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(e.cx, e.cy, r * (1 + SKY.glow), 0, Math.PI * 2);
    ctx.arc(e.cx, e.cy, r * 0.98, 0, Math.PI * 2, true);
    ctx.fill();
  }

  function ink(e: Sight) {
    const k = viewport.k,
      dpr = canvas.width / Math.max(1, viewport.w);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewport.w, viewport.h);
    heavens(e, k);
    const marks = port.marks();
    if (!marks || !view) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(e.cx, e.cy, seenRadius(e) + 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.lineJoin = 'round';
    weather(e, marks, k);
    berths(e, marks, k, liveryColors(view.livery)[0]);
    ctx.restore();
  }

  function drawSlip(inking: boolean) {
    if (!view) return;
    const s = planetSlip(view, inking);
    const svg = svgNode(s.w, s.h, s.svg);
    card.replaceChildren(svg);
  }

  function arrived() {
    phase = 'open';
    canvas.style.transition = `opacity ${MOTION.planet.ink}ms ease`;
    canvas.style.opacity = '1';
  }

  return {
    el,
    show(v: PlanetView) {
      const first = view === null || view.name !== v.name;
      view = v;
      if (phase !== 'shut' && first) drawSlip(false);
    },
    open() {
      layout();
      phase = 'rising';
      t = 0;
      aimed = false;
      landed = null;
      el.hidden = false;
      canvas.style.transition = 'none';
      canvas.style.opacity = '0';
      card.hidden = true;
      card.classList.remove('arrive');
      window.setTimeout(() => {
        if (phase !== 'rising' && phase !== 'open') return;
        card.hidden = false;
        drawSlip(true);
        card.classList.remove('arrive');
        void card.offsetWidth;
        card.classList.add('arrive');
      }, MOTION.planet.slip);
      port.scene.planet(true);
    },
    close(done: () => void) {
      if (phase === 'shut') return done();
      phase = 'falling';
      landed = done;
      orbit.clear();
      canvas.style.transition = `opacity ${MOTION.fade.ms}ms ease`;
      canvas.style.opacity = '0';
      card.hidden = true;
    },
    step(dt: number, ground: Eye): Eye | null {
      if (phase === 'shut') return null;
      clock += dt;
      if (!aimed && (phase === 'rising' || t === 0)) aim(ground);
      if (phase === 'rising') {
        t = Math.min(1, t + (dt * 1000) / MOTION.planet.rise);
        if (t >= 1) arrived();
      } else if (phase === 'falling') {
        t = Math.max(0, t - (dt * 1000) / MOTION.planet.fall);
        if (t <= 0) {
          phase = 'shut';
          el.hidden = true;
          port.scene.planet(false);
          const done = landed;
          landed = null;
          done?.();
          return null;
        }
      }
      if (phase === 'open') orbit.step(dt);
      const sight = sightOf(orbit, lay.f, lay.x, lay.y),
        sky = spaceEye(sight, viewport.h, lay.center);
      if (phase === 'open') ink(sight);
      return t >= 1 ? sky : flight(ground, sky, eased(t));
    },
  };
}
