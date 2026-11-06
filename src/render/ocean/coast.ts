// The coastline on the GPU: coastField.ts's field (the ground's height and the signed distance to the coast at mean
// tide, on the height grid's six cube faces) as a texture array, built in a worker while the game starts, and read
// by direction. Until it arrives the field says open water everywhere, so nothing foams.
import { DataArrayTexture, HalfFloatType, LinearFilter, RGFormat, ClampToEdgeWrapping, DataUtils, type Node } from 'three/webgpu';
import { float, texture, uniform } from 'three/tsl';
import { COAST_NODES, REACH } from './coastField.ts';
import { cubeFace } from '../gpu/cube.ts';

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
    const { face, eq } = cubeFace(up);
    // to the texel centres of the nodes
    const uv = eq.add(1).mul(N / 2).add(0.5).div(ROW);
    return texture(this.texture, uv).depth(face).level(float(0)).xy as unknown as V2;
  }
}
