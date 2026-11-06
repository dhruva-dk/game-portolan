// The current lanes as a field over the planet, for the sea's surface to stream along: at every node of six
// equal-angle cube faces (as sim/sphere.ts faceUV), the lanes' flow there at their charted speed, metres a second
// along the surface, and the region whose lane it is, so an event that sends one region's lanes into spate can scale
// them on the GPU. The Great Current and the Maelstrom's whirl are smooth enough to be worked out where they are drawn
// (flow.ts) and are left out. Pure arithmetic over the simulation's lanes: it runs in a worker and in node.
import { CURRENTS, currentAt } from '../../sim/world/index.ts';
import { v3 } from '../../sim/math.ts';

/** Nodes along each face's side: about 4.6 m apart at a face's middle, against lanes 16 to 30 m wide. */
export const FLOW_NODES = 193;

const ROW = FLOW_NODES, N = ROW - 1, FACE = ROW * ROW;

/** The direction of node (i, j) of `face`. */
function nodeDir(face: number, i: number, j: number, out: { x: number; y: number; z: number }): void {
  const gu = Math.tan(((i / N) * 2 - 1) * (Math.PI / 4)), gv = Math.tan(((j / N) * 2 - 1) * (Math.PI / 4));
  let x: number, y: number, z: number;
  switch (face) {
    case 0: x = 1; y = gv; z = -gu; break;
    case 1: x = -1; y = gv; z = gu; break;
    case 2: x = gu; y = 1; z = -gv; break;
    case 3: x = gu; y = -1; z = gv; break;
    case 4: x = gu; y = gv; z = 1; break;
    default: x = -gu; y = gv; z = -1;
  }
  const l = Math.hypot(x, y, z);
  out.x = x / l;
  out.y = y / l;
  out.z = z / l;
}

/**
 * Four floats a node, face by face, row (j) by row, node (i) by node: the lanes' flow (x, y, z, m/s, a tangent) and
 * the region whose lane moves the water there most, or, where none does, whose lane's cap (which reaches well past
 * the water that moves) is nearest, so the region holds steady across a lane's edges where the flow fades out.
 */
export function flowField(): Float32Array {
  const out = new Float32Array(6 * FACE * 4);
  const none = new Array<number>(CURRENTS.length).fill(0), one = none.slice();
  const p = v3(), lane = v3(), base = v3();
  for (let f = 0; f < 6; f++) {
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        nodeDir(f, i, j, p);
        const o = (f * FACE + j * ROW + i) * 4;
        let region = 0, near = -2, most = 0, base0 = false;
        for (let k = 0; k < CURRENTS.length; k++) {
          const l = CURRENTS[k];
          const d = p.x * l.centre.x + p.y * l.centre.y + p.z * l.centre.z;
          if (d < l.cos) continue;
          if (!base0) (currentAt(p, base, none, 0), (base0 = true));
          one[k] = 1;
          currentAt(p, lane, one, 0);
          one[k] = 0;
          const x = lane.x - base.x, y = lane.y - base.y, z = lane.z - base.z, s = Math.hypot(x, y, z);
          out[o] += x;
          out[o + 1] += y;
          out[o + 2] += z;
          if (s > most) (most = s), (region = l.region);
          else if (most === 0 && d > near) (near = d), (region = l.region);
        }
        out[o + 3] = region;
      }
    }
  }
  return out;
}
