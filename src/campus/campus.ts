// The rookery, drawn: a render folder like land/, in three's TSL node materials, each building generated in code from
// its kind and level (buildings.ts), in the palette (tests/architecture.test.ts LAYERS).
//
// What the snapshot says of the crew's rookery (snapshot.ts CampusDraw) is laid out on the campus's plots
// (world/rookery.ts) only when it changes: every finished building, plinth, scaffold and the quay into one mesh, the
// forms under way into another (cut off at the share built: material.ts), their vertices written in world metres
// into buffers made once for the most the campus can hold, so a change rebuilds no shader and makes no new buffer. The
// finished mesh casts into the island's shadow map (land/shadow.ts: it stands on the nearest island); what is under
// way does not. The flags fly from every flagpole up, the gulls wheel over the flight loft once it stands (drawn by
// the flight's gulls: life.ts), smoke rises from the stacks.

import { BufferAttribute, BufferGeometry, InstancedMesh } from 'three/webgpu';
import type { Light } from '../sky/light';
import type { CampusDraw } from '../snapshot';
import { BUILDINGS, type Campus, type Site } from '../world/rookery';
import { add, chartBasis, fromChart, place, scale, type Vec3 } from '../world/sphere';
import type { Wind } from '../world/wind';
import { formOf } from './buildings';
import { createFlags } from './flags';
import type { Form } from './kit';
import { createLife } from './life';
import { createMaterials } from './material';
import { plinthOf, quayOf, scaffoldOf } from './yard';

/** One mesh's buffers, made once for `most` vertices, and how to write forms into them. */
function buffers(most: number, rising: boolean) {
  const geometry = new BufferGeometry();
  const attr = (name: string, size: number) => {
    const a = new BufferAttribute(new Float32Array(most * size), size);
    geometry.setAttribute(name, a);
    return a;
  };
  const position = attr('position', 3), normal = attr('normal', 3), tone = attr('tone', 1);
  const rise = rising ? attr('rise', 1) : null, built = rising ? attr('built', 1) : null;
  geometry.setDrawRange(0, 0);
  let n = 0;
  return {
    geometry,
    begin() {
      n = 0;
    },
    /** A form laid on a site (its plot's chart, standing on its terrace's top), `share` of it built. */
    lay(f: Form, site: Site, share = 1) {
      const { chart, top } = site, [e1, e2] = chartBasis(chart, chart.at), up = chart.at;
      for (let i = 0; i < f.position.length / 3 && n < most; i++, n++) {
        const [x, y, z] = [f.position[3 * i], f.position[3 * i + 1], f.position[3 * i + 2]];
        position.setXYZ(n, ...place(fromChart(chart, x, z), top + y));
        const [a, b, c] = [f.normal[3 * i], f.normal[3 * i + 1], f.normal[3 * i + 2]];
        normal.setXYZ(n, ...add(add(scale(e1, a), up, b), e2, c));
        tone.setX(n, f.tone[i]);
        rise?.setX(n, y / f.top);
        built?.setX(n, share);
      }
    },
    end() {
      geometry.setDrawRange(0, n);
      for (const a of [position, normal, tone, rise, built]) if (a) a.needsUpdate = true;
    },
  };
}

/** The crew's rookery on a campus; `light` the shared toon light, `wind` the planet's (flags and smoke go with it). */
export function createCampus(campus: Campus, light: Light, wind: Wind) {
  const materials = createMaterials(light);
  const forms = BUILDINGS.map((b) => ([1, 2, 3] as const).map((l) => formOf(b, l)));
  const count = (f: Form) => f.position.length / 3;
  // room for the most each mesh can hold: every building at its largest, with its scaffold, the plinths and the quay
  const plinths = campus.plots.map(plinthOf), quay = quayOf(campus.quay);
  const largest = forms.map((l) => Math.max(...l.map(count)));
  const scaffolds = forms.map((l, i) => l.map((f) => scaffoldOf(f, campus.plots[i].water)));
  const most = largest.reduce((a, b, i) => a + b + Math.max(...scaffolds[i].map(count)), 0) + plinths.reduce((a, f) => a + count(f), 0) + count(quay);
  const whole = buffers(most, false), rising = buffers(largest.reduce((a, b) => a + b, 0), true);
  const wholeMesh = new InstancedMesh(whole.geometry, materials.whole, 1);
  const risingMesh = new InstancedMesh(rising.geometry, materials.rising, 1);
  [wholeMesh.name, risingMesh.name] = ['rookery', 'rookery rising'];
  for (const m of [wholeMesh, risingMesh]) m.frustumCulled = false;
  const flags = createFlags(light), life = createLife(light);
  const downwind = wind(campus.centre);
  /** What casts into the island's shadow map: the finished buildings (land/site.ts Instances' shape). */
  const caster = { mesh: wholeMesh, near: 1, show() {} };

  /** A point of a form on its site, world metres, and the way up there. */
  const at = (p: readonly [number, number, number], site: Site) => {
    const up = fromChart(site.chart, p[0], p[2]);
    return { at: place(up, site.top + p[1]), up: up as readonly [number, number, number] };
  };
  let shown = '';
  /** Lays out the rookery as `draw` has it. */
  function build(draw: CampusDraw) {
    materials.setCrew(draw.first, draw.second);
    flags.crew(draw.first, draw.second, draw.emblem);
    whole.begin();
    rising.begin();
    const heads: ReturnType<typeof at>[] = [], mouths: ReturnType<typeof at>[] = [];
    const loft: { over: ReturnType<typeof at> | null } = { over: null };
    campus.plots.forEach((site, i) => {
      whole.lay(plinths[i], site);
      const level = Math.min(Math.max(Math.round(draw.levels[i] ?? 0), 0), 3), share = draw.rising[i];
      if (level > 0) {
        const f = forms[i][level - 1];
        whole.lay(f, site);
        heads.push(...f.flags.map((p) => at(p, site)));
        mouths.push(...f.smoke.map((p) => at(p, site)));
        if (site.building === 'flightLoft') loft.over = at([0, f.top + 3, 0], site);
      }
      if (share !== null && share !== undefined && level < 3) {
        const next = level as 0 | 1 | 2;
        rising.lay(forms[i][next], site, Math.min(Math.max(share, 0), 1));
        whole.lay(scaffolds[i][next], site);
      }
    });
    whole.lay(quay, campus.quay);
    heads.push(...quay.flags.map((p) => at(p, campus.quay)));
    whole.end();
    rising.end();
    flags.fly(heads, downwind);
    life.set(loft.over && { ...loft.over, paint: draw.first, sail: draw.second }, mouths, downwind);
  }

  return {
    meshes: [wholeMesh, risingMesh, flags.mesh, ...life.meshes],
    casters: [caster],
    /** Draws the rookery as the snapshot has it (none: as it last had it), at the world's clock, s. */
    update(draw: CampusDraw | undefined, clock: number) {
      if (draw) {
        const key = JSON.stringify(draw);
        if (key !== shown) {
          shown = key;
          build(draw);
        }
      }
      flags.tick(clock);
      life.tick(clock);
    },
    /** The gulls wheeling over the flight loft, as of the last update: the frame has the flight's gulls draw them. */
    flock: life.flock,
    dispose() {
      whole.geometry.dispose();
      rising.geometry.dispose();
      materials.whole.dispose();
      materials.rising.dispose();
      flags.dispose();
      life.dispose();
    },
  };
}
