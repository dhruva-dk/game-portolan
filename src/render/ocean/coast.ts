// The coastline on the GPU: coastField.ts's field (the ground's height and the signed distance to the coast at mean
// tide, on the height grid's six cube faces) as a texture array, built in a worker while the game starts, and read
// by direction. Until it arrives the field says open water everywhere, so nothing foams.
import { DataArrayTexture, HalfFloatType, LinearFilter, RGFormat, ClampToEdgeWrapping, DataUtils, type Node } from 'three/webgpu';
import { abs, atan, float, int, select, texture, uniform, vec2 } from 'three/tsl';
import { COAST_NODES, REACH } from './coastField.ts';

type V2 = Node<'vec2'>;
type V3 = Node<'vec3'>;

const ROW = COAST_NODES, N = ROW - 1;

export class Coast {
  readonly texture: DataArrayTexture;
  /** 1 once the field has arrived. */
  readonly on = uniform(0);
  readonly ready: Promise<void>;

  constructor() {
    const open = new Uint16Array(ROW * ROW * 6 * 2);
    const deep = DataUtils.toHalfFloat(-50), far = DataUtils.toHalfFloat(REACH);
    for (let i = 0; i < open.length; i += 2) (open[i] = deep), (open[i + 1] = far);
    const t = new DataArrayTexture(open, ROW, ROW, 6);
    t.format = RGFormat;
    t.type = HalfFloatType;
    t.magFilter = t.minFilter = LinearFilter;
    t.wrapS = t.wrapT = ClampToEdgeWrapping;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    this.texture = t;
    this.ready = new Promise((done) => {
      const w = new Worker(new URL('./coast-worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<Uint16Array>) => {
        (t.image as { data: Uint16Array }).data = e.data;
        t.needsUpdate = true;
        this.on.value = 1;
        w.terminate();
        done();
      };
      w.onerror = (e) => {
        console.error('the coast worker failed', e.message);
        w.terminate();
        done();
      };
      w.postMessage(0);
    });
  }

  /** The ground's height (x) and the distance to the coast at mean tide (y, metres, positive over the water) under
   *  `up`, a unit direction from the planet's centre: the face it lies over and its place there, as sim/sphere.ts
   *  faceUV, then the field filtered between the nodes. */
  at(up: V3): V2 {
    const a = abs(up);
    const xm = a.x.greaterThanEqual(a.y).and(a.x.greaterThanEqual(a.z));
    const ym = xm.not().and(a.y.greaterThanEqual(a.z));
    const face = select(xm, select(up.x.greaterThanEqual(0), int(0), int(1)),
      select(ym, select(up.y.greaterThanEqual(0), int(2), int(3)), select(up.z.greaterThanEqual(0), int(4), int(5))));
    const major = select(xm, a.x, select(ym, a.y, a.z));
    const gu = select(xm, select(up.x.greaterThanEqual(0), up.z.negate(), up.z),
      select(ym, up.x, select(up.z.greaterThanEqual(0), up.x, up.x.negate())));
    const gv = select(xm, up.y, select(ym, select(up.y.greaterThanEqual(0), up.z.negate(), up.z), up.y));
    // equal-angle coordinates, −1…1 across the face, to the texel centres of the nodes
    const eq = atan(vec2(gu, gv), vec2(major, major)).mul(4 / Math.PI);
    const uv = eq.add(1).mul(N / 2).add(0.5).div(ROW);
    return texture(this.texture, uv).depth(face).level(float(0)).xy as unknown as V2;
  }
}
