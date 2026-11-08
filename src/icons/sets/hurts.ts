// The hurts a ship carries, as the HUD shows them under her vitals while each lasts: canvas torn, the mainmast sprung
// or gone, the rudder shot about, water coming in, fire aloft, ice on her. Each reads at a glance beside the bars,
// inked as a woodcut (src/chart/woodcut.ts) and drying away as the hurt is mended.
import { HULL } from './hud.ts';
import { cut, cutLine, fill, flame, line, path, poly, px, py, wave, type Prim } from '../draw.ts';

export type HurtId = 'sail' | 'mast' | 'rudder' | 'leak' | 'fire' | 'ice';

/** A snowflake: six spokes from the centre, each forked near its tip. */
const flake = (): Prim[] => {
  const spokes: string[] = [], forks: string[] = [];
  for (let k = 0; k < 6; k++) {
    const a = -90 + k * 60;
    spokes.push(path(12, 12, px(12, 10.2, a), py(12, 10.2, a)));
    const fx = px(12, 6.6, a), fy = py(12, 6.6, a);
    forks.push(path(px(fx, 3.2, a - 50), py(fy, 3.2, a - 50), fx, fy, px(fx, 3.2, a + 50), py(fy, 3.2, a + 50)));
  }
  return [line(spokes.join(''), 1.8), line(forks.join(''), 1.4, { fine: true }), line(forks.join(''), 1.6, { bold: true })];
};

export const HURT_ICONS: Record<HurtId, Prim[]> = {
  /** The course on its yard with a rent torn down it. */
  sail: [
    line('M2.6 4.6H21.4', 2),
    line('M12 1.2V4.6', 1.8),
    fill('M4.4 5.8H19.6C21.2 10 21.2 14.6 19.6 18.8H4.4C2.8 14.6 2.8 10 4.4 5.8Z'),
    cut(poly(9.4, 5.8, 12.6, 10.2, 10.4, 12.4, 14.2, 18.8, 11.6, 18.8, 8.4, 13, 10.6, 10.6, 7.4, 5.8)),
  ],
  /** The mainmast broken: the stump standing on the deck, the top sprung over the side. */
  mast: [
    line('M4.6 22.4H19.4', 2),
    line('M12 22.4V12.6', 2.8),
    line('M12.6 11.8L18.6 2.8', 2.6),
    line('M14.2 8.2L21.6 10.4', 1.6, { fine: true }),
    fill(poly(10.4, 12.8, 13.6, 12.8, 13.1, 10.6, 12.3, 12, 11.4, 10.2)),
  ],
  /** The rudder on its post, its blade cracked. */
  rudder: [
    line('M12 1.6V8.2', 2.4),
    line('M8.6 3.4H15.4', 1.8),
    fill('M8.2 8H15.8V14C15.8 18.4 14 21.4 12 22.8C10 21.4 8.2 18.4 8.2 14Z'),
    cut(poly(8.2, 12.2, 11.6, 13.8, 9.4, 16, 12.8, 18.6, 11.4, 18.6, 8.2, 17.2)),
  ],
  /** Water in her: the sea's line over the hull and the water risen inside it. */
  leak: [
    fill(HULL),
    cut(poly(2.4, 12.6, 21.6, 11.4, 20.4, 14.4, 3.4, 15.4)),
    line(wave(1.6, 22.4, 13.6, 1, 3), 1.6, { top: true }),
    line(wave(1.6, 22.4, 4.2, 1.1, 3), 1.8),
  ],
  /** Fire aloft: a large flame with a smaller one leaning from it. */
  fire: [
    fill(flame(11, 22.4, 12, 20)),
    cut(flame(11, 22.4, 5.4, 9.4)),
    fill(flame(18.4, 22.4, 5, 8.6), { tr: 'rotate(14 18.4 22.4)' }),
    cutLine('M5.2 4.6L4 1.6', 1.4, { fine: true }),
  ],
  /** Ice built on her: a snowflake. */
  ice: flake(),
};
