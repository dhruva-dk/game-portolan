// The sun's shadows on the land: what stands on it (rocks, palms, shrubs), seen
// from the sun into a depth map over one place (a Shade): the land's tiles
// round the eye (groves.ts). On a globe each place faces the sun its own way,
// so one map over one place keeps its texels small, and those farther off go
// without. Nothing on the land moves, so the map is drawn again only when the
// sun has moved or the place has changed.
//
// It draws stand-ins for the casters (each shares its caster's geometry, plain
// black, with its own instances: those on the tiles the map covers, seen or
// not, site.ts casting), so the casters themselves are untouched and the depth
// pass costs no more than the covered tiles' vertices.

import {
  DepthTexture,
  DoubleSide,
  FloatType,
  InstancedMesh,
  LessEqualCompare,
  Matrix4,
  MeshBasicNodeMaterial,
  OrthographicCamera,
  RedFormat,
  RenderTarget,
  Scene,
  Vector3,
  WebGPUCoordinateSystem,
} from 'three/webgpu';
import { float, select, texture, uniform, vec2, vec3, vec4 } from 'three/tsl';
import type { Draw } from '../gpu.ts';
import { place, type Chart } from '../world/sphere.ts';
import type { Instances } from './site.ts';
import type { FloatNode, Vec3Node } from '../tsl.ts';

/** Texels across the map. */
const SIZE = 2048;
/**
 * How far along the sun's ray the map holds casters, either side of the place,
 * metres.
 */
const SPAN = 200;
/**
 * A receiving point is looked up this far off its surface, metres (about a
 * texel), and this much nearer the sun (of the map's depth range), so a surface
 * doesn't shadow itself.
 */
const OFFSET = 0.12;
const BIAS = 0.3 / (2 * SPAN);
/** Redrawn once the sun has moved this far, radians. */
const MOVED = 0.002;

/**
 * What a map covers: a square `reach` metres out each way from its chart's
 * centre, its things' instances each caster's casting() (site.ts). One object
 * for each place, so a place is known again by being the same.
 */
export interface Shade {
  chart: Chart;
  reach: number;
}

interface Shadow {
  /**
   * 0…1: how much of the sun reaches world position p on a surface facing n.
   */
  visible(p: Vec3Node, n: Vec3Node): FloatNode;
  /** Adds things that cast shadows. */
  cast(...casters: Instances[]): void;
  /**
   * The map's draw if it is due: if the sun has moved or the place has changed
   * (sun: unit vector toward it; place: what to cover, or null); else null.
   */
  update(sun: Vector3, place: Shade | null): Draw | null;
}

export function createShadow(): Shadow {
  const target = new RenderTarget(SIZE, SIZE, { format: RedFormat });
  target.depthTexture = new DepthTexture(SIZE, SIZE, FloatType);
  target.depthTexture.compareFunction = LessEqualCompare;
  const camera = new OrthographicCamera(-1, 1, 1, -1, 1, 2 * SPAN);
  // the map's projection is worked out in the renderer's coordinates, which are
  // WebGPU's (main.ts takes no other)
  camera.coordinateSystem = WebGPUCoordinateSystem;
  const scene = new Scene();
  const draw: Draw = { scene, camera, target };
  const black = new MeshBasicNodeMaterial({ side: DoubleSide });
  black.colorNode = vec3(0);

  const matrix = uniform(new Matrix4());
  // a depth texture reads as a float (NodeUtils getTextureType), as does its
  // comparison
  const map = texture<'float'>(target.depthTexture);
  const stands: { stand: InstancedMesh; caster: Instances }[] = [];
  const centre = new Vector3(),
    up = new Vector3(),
    north = new Vector3(),
    axis = new Vector3(),
    last = new Vector3();
  let covered: Shade | null = null;

  return {
    visible(p, n) {
      const clip = matrix.mul(vec4(p.add(n.mul(OFFSET)), 1));
      const uv = vec2(clip.x.mul(0.5).add(0.5), clip.y.mul(-0.5).add(0.5));
      const ref = clip.z.sub(BIAS);
      // four filtered look-ups a texel apart: soft-edged over about four texels
      const texel = 1 / SIZE;
      const lit = [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]
        .map(
          ([x, y]): FloatNode =>
            map
              .sample(uv.add(vec2(x * texel * 0.75, y * texel * 0.75)))
              .compare(ref)
        )
        .reduce((a, b) => a.add(b))
        .mul(0.25);
      // in the map's box: its square across, and its depth along the sun's
      // rays. The square alone is a column through the whole planet, and where
      // it came out again, far past the map's depth, every point read as
      // shadowed: a dark band with straight sides across the sea seen from high
      // up
      const inside = uv.x
        .greaterThan(0)
        .and(uv.x.lessThan(1))
        .and(uv.y.greaterThan(0))
        .and(uv.y.lessThan(1))
        .and(clip.z.greaterThan(0))
        .and(clip.z.lessThan(1));
      return select(inside, lit, float(1));
    },
    cast(...casters) {
      for (const caster of casters) {
        const m = caster.mesh,
          stand = new InstancedMesh(m.geometry, black, m.instanceMatrix.count);
        stand.instanceMatrix = caster.casting().matrices;
        stand.frustumCulled = false;
        stands.push({ stand, caster });
        scene.add(stand);
      }
    },
    update(sun, shade) {
      if (!shade || (shade === covered && sun.angleTo(last) < MOVED))
        return null;
      if (shade !== covered) {
        // looking down the sun's rays at the place's centre, its up kept up the
        // map's, out to its reach
        covered = shade;
        camera.left = camera.bottom = -shade.reach;
        camera.right = camera.top = shade.reach;
        centre.set(...place(shade.chart.at, 0));
        up.set(...shade.chart.at);
        north.copy(up).cross(axis.set(...shade.chart.axis));
      }
      for (const { stand, caster } of stands)
        stand.count = caster.casting().count;
      last.copy(sun);
      camera.position.copy(centre).addScaledVector(sun, SPAN);
      camera.up.copy(Math.abs(sun.dot(up)) > 0.99 ? north : up);
      camera.lookAt(centre);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();
      matrix.value.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse
      );
      return draw;
    },
  };
}
