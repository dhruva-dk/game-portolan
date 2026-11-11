// The sun's shadows on the island: what stands on it (rocks, palms), seen from the sun into a depth map over the
// island. Nothing on the island moves, so the map is drawn again only when the sun has.
//
// It draws stand-ins for the casters (each shares its caster's geometry and instance matrices, plain black), so the
// casters themselves are untouched and the depth pass costs no more than their vertices.

import {
  DepthTexture, DoubleSide, FloatType, InstancedMesh, LessEqualCompare, Matrix4, Mesh, MeshBasicNodeMaterial,
  OrthographicCamera, RedFormat, RenderTarget, Scene, Vector3, type WebGPURenderer,
} from 'three/webgpu';
import { float, select, texture, uniform, vec2, vec3, vec4 } from 'three/tsl';
import type { Island } from './terrain';

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
  cast(...meshes: Mesh[]): void;
  /** Redraws the map if the sun has moved (sun: unit vector toward it). */
  update(sun: Vector3): void;
}

export function createShadow(renderer: WebGPURenderer, island: Island): Shadow {
  const reach = Math.max(...Array.from({ length: 360 }, (_, i) => island.coast((i / 180) * Math.PI))) + MARGIN;
  const target = new RenderTarget(SIZE, SIZE, { format: RedFormat });
  target.depthTexture = new DepthTexture(SIZE, SIZE, FloatType);
  target.depthTexture.compareFunction = LessEqualCompare;
  const camera = new OrthographicCamera(-reach, reach, reach, -reach, 1, 2 * SPAN);
  const scene = new Scene();
  const black = new MeshBasicNodeMaterial({ side: DoubleSide });
  black.colorNode = vec3(0);

  const matrix = uniform(new Matrix4());
  const map = texture(target.depthTexture);
  const centre = new Vector3(island.centre[0], 0, island.centre[1]);
  const last = new Vector3();
  let dirty = false;

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
    cast(...meshes) {
      for (const m of meshes) {
        const stand = m instanceof InstancedMesh ? new InstancedMesh(m.geometry, black, m.count) : new Mesh(m.geometry, black);
        if (m instanceof InstancedMesh) (stand as InstancedMesh).instanceMatrix = m.instanceMatrix;
        m.updateMatrixWorld();
        stand.matrixAutoUpdate = false;
        stand.matrix.copy(m.matrixWorld);
        stand.matrixWorldNeedsUpdate = true;
        stand.frustumCulled = false;
        scene.add(stand);
      }
      dirty = true;
    },
    update(sun) {
      if (!dirty && sun.angleTo(last) < MOVED) return;
      dirty = false;
      last.copy(sun);
      camera.position.copy(centre).addScaledVector(sun, SPAN);
      camera.up.set(0, 1, 0);
      if (Math.abs(sun.y) > 0.99) camera.up.set(0, 0, 1);
      camera.lookAt(centre);
      camera.updateMatrixWorld();
      camera.coordinateSystem = renderer.coordinateSystem;
      camera.updateProjectionMatrix();
      matrix.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      const before = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(before);
    },
  };
}
