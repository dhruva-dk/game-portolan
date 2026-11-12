// The sun's shadows on an island: what stands on it (rocks, palms, shrubs), seen from the sun into a depth map over
// the island. One map, over the nearest island in view (site.ts orders them): on a globe each island faces the sun
// its own way and the islands lie hundreds of metres apart, so one map round one island keeps its texels small,
// and the others, farther off, go without. Nothing on the islands moves, so the map is drawn again only when the sun
// has moved or the nearest island has changed.
//
// It draws stand-ins for the casters (each shares its caster's geometry and instance matrices, plain black), so the
// casters themselves are untouched and the depth pass costs no more than their vertices: just the nearest island's,
// which come first among each caster's instances.

import {
  DepthTexture, DoubleSide, FloatType, InstancedMesh, LessEqualCompare, Matrix4, MeshBasicNodeMaterial,
  OrthographicCamera, RedFormat, RenderTarget, Scene, Vector3, WebGPUCoordinateSystem,
} from 'three/webgpu';
import { float, select, texture, uniform, vec2, vec3, vec4 } from 'three/tsl';
import type { Draw } from '../gpu';
import type { IslandSite } from '../world/planet';
import { place } from '../world/sphere';
import type { Instances } from './site';

type N = any;

/** Texels across the map. */
const SIZE = 2048;
/** How far past the coast the map reaches, metres: palms lean over the water. */
const MARGIN = 15;
/** How far along the sun's ray the map holds casters, either side of the island, metres. */
const SPAN = 200;
/** A receiving point is looked up this far off its surface, metres (about a texel), and this much nearer the sun
 * (of the map's depth range), so a surface doesn't shadow itself. */
const OFFSET = 0.12;
const BIAS = 0.3 / (2 * SPAN);
/** Redrawn once the sun has moved this far, radians. */
const MOVED = 0.002;

export interface Shadow {
  /** 0…1: how much of the sun reaches world position p on a surface facing n. */
  visible(p: N, n: N): N;
  /** Adds things that cast shadows. */
  cast(...casters: Instances[]): void;
  /** The map's draw if it is due: if the sun has moved or the island has changed (sun: unit vector toward it; island:
   * the nearest in view, or null); else null. */
  update(sun: Vector3, island: IslandSite | null): Draw | null;
}

export function createShadow(): Shadow {
  const target = new RenderTarget(SIZE, SIZE, { format: RedFormat });
  target.depthTexture = new DepthTexture(SIZE, SIZE, FloatType);
  target.depthTexture.compareFunction = LessEqualCompare;
  const camera = new OrthographicCamera(-1, 1, 1, -1, 1, 2 * SPAN);
  // the map's projection is worked out in the renderer's coordinates, which are WebGPU's (main.ts takes no other)
  camera.coordinateSystem = WebGPUCoordinateSystem;
  const scene = new Scene();
  const draw: Draw = { scene, camera, target };
  const black = new MeshBasicNodeMaterial({ side: DoubleSide });
  black.colorNode = vec3(0);

  const matrix = uniform(new Matrix4());
  const map = texture(target.depthTexture);
  const stands: { stand: InstancedMesh; caster: Instances }[] = [];
  const centre = new Vector3(), up = new Vector3(), north = new Vector3(), last = new Vector3();
  let covered: IslandSite | null = null;

  return {
    visible(p, n) {
      const clip = matrix.mul(vec4(p.add(n.mul(OFFSET)), 1));
      const uv = vec2(clip.x.mul(0.5).add(0.5), clip.y.mul(-0.5).add(0.5));
      const ref = clip.z.sub(BIAS);
      // four filtered look-ups a texel apart: soft-edged over about four texels
      const texel = 1 / SIZE;
      const lit = [[-1, -1], [1, -1], [-1, 1], [1, 1]]
        .map(([x, y]) => map.sample(uv.add(vec2(x * texel * 0.75, y * texel * 0.75))).compare(ref))
        .reduce((a: N, b: N) => a.add(b)).mul(0.25);
      const inside = uv.x.greaterThan(0).and(uv.x.lessThan(1)).and(uv.y.greaterThan(0)).and(uv.y.lessThan(1));
      return select(inside, lit, float(1));
    },
    cast(...casters) {
      for (const caster of casters) {
        const m = caster.mesh, stand = new InstancedMesh(m.geometry, black, m.instanceMatrix.count);
        stand.instanceMatrix = m.instanceMatrix;
        stand.frustumCulled = false;
        stands.push({ stand, caster });
        scene.add(stand);
      }
    },
    update(sun, island) {
      if (!island || (island === covered && sun.angleTo(last) < MOVED)) return null;
      if (island !== covered) {
        // looking down the sun's rays at the island's centre, its up kept up the map's, out past its coast
        covered = island;
        const reach = Math.max(...Array.from({ length: 360 }, (_, i) => island.coast((i / 180) * Math.PI))) + MARGIN;
        camera.left = camera.bottom = -reach;
        camera.right = camera.top = reach;
        centre.set(...place(island.chart.at, 0));
        up.set(...island.chart.at);
        north.copy(up).cross(new Vector3(...island.chart.axis));
      }
      for (const { stand, caster } of stands) stand.count = caster.near;
      last.copy(sun);
      camera.position.copy(centre).addScaledVector(sun, SPAN);
      camera.up.copy(Math.abs(sun.dot(up)) > 0.99 ? north : up);
      camera.lookAt(centre);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();
      matrix.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      return draw;
    },
  };
}
