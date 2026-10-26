import { Pipeline } from '../../src/render/pipeline.ts';
import { Harbour3D } from '../../src/render/harbour3d.ts';
import { PIGMENTS, type RGB } from '../../src/style/palette.ts';

const canvas = document.querySelector('canvas') ?? document.body.appendChild(document.createElement('canvas'));
canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh';
const pipeline = new Pipeline(canvas);
pipeline.pinScale(1);
pipeline.setSize(innerWidth, innerHeight, devicePixelRatio);
const harbour = new Harbour3D(pipeline.style, { form: 0, pigments: null, marks: {} }, 1);
harbour.layout(innerWidth, innerHeight);
const PIG = PIGMENTS as unknown as Record<string, RGB>;
const keys = Object.keys(PIG);
let t = 30;
function draw(n: number, open: number, still: boolean): { calls: number; tris: number } {
  for (let k = 0; k < n; k++) {
    t += 1 / 30;
    harbour.frame(t, 1 / 30, still, open);
    pipeline.render(harbour.scene, harbour.camera, 1 / 30);
  }
  return { calls: pipeline.stats.calls, tris: pipeline.stats.triangles };
}
const hook = {
  ready: true,
  keys: () => keys,
  measure(detail: number, open: number) {
    harbour.setDetail(detail);
    return draw(4, open, true);
  },
  look(form: number, pig: readonly [number, number] | null, marks: string[]) {
    harbour.setCareer({ form, pigments: pig ? [PIG[keys[pig[0]]!]!, PIG[keys[pig[1]]!]!] : null, marks: { marks } });
    const r = draw(3, 0, true);
    return { ...r, form: harbour.shipForm, pigments: harbour.shipPigments, ship: harbour.ship?.uuid ?? '', gull: harbour.gullKey };
  },
  show(seconds: number) {
    draw(Math.round(seconds * 30), 0, false);
  },
};
(window as unknown as { __harbour: typeof hook }).__harbour = hook;
