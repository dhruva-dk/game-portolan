// Many lights: clustered forward shading (Olsson, Billeter and Assarsson, "Clustered Deferred and Forward Shading",
// HPG 2012), for the lanterns of every ship, fire, muzzle flashes, shot striking home and lightning.
//
// The frame is cut into tiles 32 pixels square and each tile into slices of depth spaced evenly in the logarithm of
// the distance, so near slices are thin and far ones deep. A compute pass finds, for every cluster, the point lights
// whose spheres reach into its box; a fragment then looks up its own cluster and lights itself by those alone, so a
// lantern costs only the pixels it can reach. The lights are sorted by depth on the CPU first, and each slice keeps
// the range of them that can reach it, so a cluster tests only those.
//
// This is three's ClusteredLightsNode with its grid fitted to the frame as it is really drawn: the scene is drawn
// below the screen's resolution (post.ts), and the frame is rarely a whole number of tiles across. Three's sizes the
// grid from the screen and stretches whole tiles over the frame's width, which shifts a cluster's box from the
// pixels that look it up by up to a tile toward the right and bottom edges, and cuts a light off there. Here each
// tile's box is built from the pixels it really covers, the last one short.
//
// Point lights that cast no shadow are clustered; the sun, the moon and anything casting a shadow stay as three
// lights them. Adding or removing a clustered light changes no material, since only the lights the materials see
// directly are in their cache key.
import { Lighting, Vector2, type Light, type LightsNode, type WebGPURenderer } from 'three/webgpu';
import {
  Fn, If, Loop, Return, attributeArray, clamp, dot, float, floor, instanceIndex, int, ivec2, ivec4, log, max, min, positionView, pow,
  screenCoordinate, textureLoad, vec3,
} from 'three/tsl';
import ClusteredLightsNode from 'three/addons/tsl/lighting/ClusteredLightsNode.js';

const TILE = 32;
const SLICES = 24;
/** Point lights in the scene at once, and in any one cluster. */
const MAX_LIGHTS = 256;
const PER_CLUSTER = 32;

const _size = new Vector2();

/** Three's clustered node's own state, which the grid is rebuilt into. */
interface Inner {
  _bufferSize: Vector2 | null;
  _lightIndexes: unknown;
  _screenClusterIndex: unknown;
  _compute: { dispose(): void; getCacheKey(): number } | null;
  _gridDimensions: { value: Vector2 };
  _cameraNear: ReturnType<typeof float>;
  _cameraFar: ReturnType<typeof float>;
  _cameraProjectionMatrix: { element(i: number): { element(j: number): ReturnType<typeof float> } };
  _zSliceRangesTexture: unknown;
  _chunksPerCluster: number;
  getLightData(i: unknown): { viewPosition: ReturnType<typeof vec3>; distance: ReturnType<typeof float> };
}

/** The share of the screen the scene is drawn at just now. */
interface Share {
  readonly scale: number;
}

class FittedClusters extends ClusteredLightsNode {
  readonly #share: Share;
  #width = 0;
  #height = 0;

  constructor(share: Share) {
    super(MAX_LIGHTS, TILE, SLICES, PER_CLUSTER);
    this.#share = share;
  }

  /** The frame as the scene pass draws it (PassNode floors the scaled screen). */
  updateProgram(renderer: WebGPURenderer): void {
    renderer.getDrawingBufferSize(_size);
    const scale = this.#share.scale, w = Math.max(1, Math.floor(_size.width * scale)), h = Math.max(1, Math.floor(_size.height * scale));
    if (w === this.#width && h === this.#height && (this as unknown as Inner)._bufferSize) return;
    this.#width = w;
    this.#height = h;
    this.#build(w, h);
  }

  #build(width: number, height: number): void {
    const self = this as unknown as Inner;
    const nx = Math.ceil(width / TILE), ny = Math.ceil(height / TILE), nz = SLICES, clusters = nx * ny * nz;
    const chunks = self._chunksPerCluster;
    self._gridDimensions.value.set(nx, ny);
    if (self._compute) self._compute.dispose();

    const length = clusters * chunks * 4;
    let indexes = self._lightIndexes as unknown;
    if (!indexes || (indexes as unknown as { value: { array: Int32Array } }).value.array.length < length) {
      indexes = attributeArray(new Int32Array(length), 'ivec4').setName('lightIndexes');
    }
    const list = indexes as unknown as { element(i: unknown): { assign(v: unknown): void; element(j: unknown): { assign(v: unknown): void } } };
    const id = int(instanceIndex);
    const chunk = (k: unknown) => list.element(id.mul(chunks).add(int(k as never)));
    const slot = (k: { div(n: number): unknown; mod(n: number): unknown }) => list.element(id.mul(chunks).add(k.div(4) as never)).element(k.mod(4));

    const proj = self._cameraProjectionMatrix, near = self._cameraNear, far = self._cameraFar;
    const compute = Fn(() => {
      const invFocalX = float(1).div(proj.element(0).element(0));
      const invFocalY = float(1).div(proj.element(1).element(1));
      const cx = id.mod(nx), cy = id.div(nx).mod(ny), cz = id.div(nx * ny);
      // the tile's box from the pixels it covers, the last row and column cut short at the frame's edge; y runs down
      // the frame and up in NDC
      const x0 = float(cx).mul(TILE), x1 = min(float(cx.add(1)).mul(TILE), width);
      const y0 = float(cy).mul(TILE), y1 = min(float(cy.add(1)).mul(TILE), height);
      const ndcXmin = x0.mul(2 / width).sub(1), ndcXmax = x1.mul(2 / width).sub(1);
      const ndcYmax = float(1).sub(y0.mul(2 / height)), ndcYmin = float(1).sub(y1.mul(2 / height));
      // the slice: evenly spaced in log depth
      const ratio = far.div(near);
      const zNear = near.mul(pow(ratio, float(cz).mul(1 / nz))).negate();
      const zFar = near.mul(pow(ratio, float(cz.add(1)).mul(1 / nz))).negate();
      const sxN = zNear.negate().mul(invFocalX), sxF = zFar.negate().mul(invFocalX);
      const syN = zNear.negate().mul(invFocalY), syF = zFar.negate().mul(invFocalY);
      const lo = vec3(min(ndcXmin.mul(sxN), ndcXmin.mul(sxF)), min(ndcYmin.mul(syN), ndcYmin.mul(syF)), zFar);
      const hi = vec3(max(ndcXmax.mul(sxN), ndcXmax.mul(sxF)), max(ndcYmax.mul(syN), ndcYmax.mul(syF)), zNear);
      Loop(chunks, ({ i }: { i: unknown }) => { chunk(i).assign(ivec4(0)); });
      const count = int(0).toVar();
      const range = textureLoad(self._zSliceRangesTexture as never, ivec2(cz, 0));
      const first = int(range.x), end = int(range.y);
      Loop(MAX_LIGHTS, ({ i }: { i: unknown }) => {
        const index = first.add(i as never);
        If(count.greaterThanEqual(PER_CLUSTER).or(index.greaterThanEqual(end)), () => { Return(); });
        const { viewPosition, distance } = self.getLightData(index);
        // the light's sphere against the cluster's box
        const d = viewPosition.sub(max(lo, min(viewPosition, hi)));
        If(dot(d, d).lessThanEqual(distance.mul(distance)), () => {
          slot(count).assign(index.add(1));
          count.addAssign(1);
        });
      });
    })().compute(clusters).setName('Clustered lights');

    const clusterIndex = Fn(() => {
      const tile = floor(screenCoordinate.div(TILE));
      const slice = clamp(floor(log(positionView.z.negate().div(near)).div(log(far.div(near))).mul(nz)), 0, nz - 1);
      return int(tile.x).add(int(tile.y).mul(nx)).add(int(slice).mul(nx * ny));
    })().toVar();

    self._bufferSize = new Vector2(nx * TILE, ny * TILE);
    self._lightIndexes = indexes;
    self._screenClusterIndex = clusterIndex;
    self._compute = compute as unknown as Inner['_compute'];
  }
}

/** The renderer's lighting: clustered point lights, sized to a scene drawn at its share of the screen. */
export class ClusteredLighting extends Lighting {
  readonly #share: Share;

  constructor(share: Share) {
    super();
    this.#share = share;
  }

  createNode(lights: Light[] = []): LightsNode {
    return new FittedClusters(this.#share).setLights(lights);
  }
}
