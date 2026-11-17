// PROTOTYPE (throwaway): a penguin from code. One lathed surface from feet to crown (no joins), its markings painted
// by position in TSL, then eyes, a two-part beak, flippers, feet, a crew scarf and (some styles) a crest.
import {
  CapsuleGeometry, CatmullRomCurve3, Group, LatheGeometry, Mesh, MeshStandardNodeMaterial, SphereGeometry,
  SplineCurve, TorusGeometry, TubeGeometry, Vector2, Vector3, type BufferGeometry,
} from 'three/webgpu';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { color, float, fwidth, length, max, mix, positionLocal, smoothstep, vec2, vec3, type Node } from 'three/tsl';

export interface Style {
  key: string;
  name: string;
  /** (radius, height) control points from the feet to the crown. Heights must rise. */
  profile: [number, number][];
  neck: number; // height where the head begins
  lean: number; // how far forward the head sits
  belly: number; // front pushed out by this, back pulled in
  bib: number; // the white front's top edge
  bibWide: number; // -1..1: the lower, the further the white wraps round
  band: boolean; // a white band over the crown from eye to eye (gentoo)
  eye: { y: number; around: number; size: number; ring: number; iris: string; cartoon: boolean };
  beak: { y: number; length: number; width: number; tall: number; colour: string; hook: number };
  flipper: { length: number; width: number; y: number };
  feet: string;
  crest: boolean;
  scarf: number;
}

export interface Crew { name: string; primary: string; secondary: string }

const FEATHER = '#2a3142';
const WHITE = '#f2eee4';
const deg = Math.PI / 180;

function radiusAt(pts: Vector2[], y: number): number {
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].y >= y) {
      const a = pts[i - 1], b = pts[i];
      const t = (y - a.y) / Math.max(b.y - a.y, 1e-6);
      return a.x + (b.x - a.x) * t;
    }
  }
  return 0;
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}

/** The body's own deformation: the belly out, the back in, the head forward. Used by the mesh and by placement. */
function deform(s: Style, p: Vector3): Vector3 {
  const z = p.z > 0 ? p.z * s.belly : p.z * (2 - s.belly);
  return new Vector3(p.x, p.y, z + s.lean * smooth(s.neck - 0.08, s.neck + 0.1, p.y));
}

/** A point on the surface at height y, turned `around` radians from the front (+z) toward +x. */
function surface(s: Style, pts: Vector2[], y: number, around: number): Vector3 {
  const r = radiusAt(pts, y);
  return deform(s, new Vector3(Math.sin(around) * r, y, Math.cos(around) * r));
}

function normalAt(s: Style, pts: Vector2[], y: number, around: number): Vector3 {
  const p = surface(s, pts, y, around);
  const da = surface(s, pts, y, around + 0.01).sub(p);
  const dy = surface(s, pts, y + 0.005, around).sub(p);
  const n = new Vector3().crossVectors(dy, da).normalize();
  const axis = new Vector3(0, y, s.lean * smooth(s.neck - 0.08, s.neck + 0.1, y));
  return n.dot(p.clone().sub(axis)) < 0 ? n.negate() : n;
}

const aa = (v: Node): Node => {
  const w = max(fwidth(v), 0.0015);
  return smoothstep(w.negate(), w, v);
};

function lathe(pts: Vector2[], segments: number): BufferGeometry {
  const g = new LatheGeometry(pts, segments);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  const m = mergeVertices(g);
  m.computeVertexNormals();
  return m;
}

function standard(hex: string, roughness: number): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ roughness });
  m.colorNode = color(hex);
  return m;
}

export function buildPenguin(s: Style, crew: Crew): Group {
  const g = new Group();
  const pts = new SplineCurve(s.profile.map(([r, y]) => new Vector2(r, y))).getPoints(120);
  pts[0].x = 0;
  pts[pts.length - 1].x = 0;

  // the body: one surface, seam at the back
  const body = new LatheGeometry(pts, 128);
  body.rotateY(Math.PI);
  const pos = body.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const d = deform(s, new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
    pos.setXYZ(i, d.x, d.y, d.z);
  }
  body.deleteAttribute('uv');
  body.deleteAttribute('normal');
  const bodyGeo = mergeVertices(body);
  bodyGeo.computeVertexNormals();

  const eyeY = s.eye.y, eyeA = s.eye.around * deg;
  const eyeR = surface(s, pts, eyeY, eyeA), eyeL = surface(s, pts, eyeY, -eyeA);

  // markings, painted by where a point is on the body
  const p = positionLocal;
  const shift = float(s.lean).mul(smoothstep(s.neck - 0.08, s.neck + 0.1, p.y));
  const front = p.z.sub(shift).div(max(length(vec2(p.x, p.z.sub(shift))), 1e-4));
  const bibTop = float(s.bib).sub(float(0.07).mul(float(1).sub(front)));
  let white: Node = aa(front.sub(s.bibWide)).mul(aa(bibTop.sub(p.y)));
  if (s.eye.ring > 0) {
    const ring = (e: Vector3) => aa(float(s.eye.ring).sub(length(p.sub(vec3(e.x, e.y, e.z)))));
    white = max(white, max(ring(eyeR), ring(eyeL)));
  }
  if (s.band) {
    // the gentoo's white patch above and behind each eye
    // one stroke from over the eye sweeping back: a brow stripe, not a spot
    const patch = (side: number) => {
      const a = surface(s, pts, eyeY + s.eye.size * 1.3, side * eyeA);
      const b = surface(s, pts, eyeY + s.eye.size * 1.8, side * (eyeA + 30 * deg));
      const ab = b.clone().sub(a);
      const A = vec3(a.x, a.y, a.z), AB = vec3(ab.x, ab.y, ab.z);
      const t = p.sub(A).dot(AB).div(ab.lengthSq()).clamp(0, 1);
      return aa(float(s.eye.size * 0.7).sub(length(p.sub(A.add(AB.mul(t))))));
    };
    white = max(white, max(patch(1), patch(-1)));
  }
  const skin = new MeshStandardNodeMaterial({ roughness: 0.48 });
  skin.colorNode = mix(color(FEATHER), color(WHITE), white);
  g.add(new Mesh(bodyGeo, skin));

  // eyes: set into the surface, looking a little forward
  for (const side of [1, -1]) {
    const at = surface(s, pts, eyeY, side * eyeA);
    const n = normalAt(s, pts, eyeY, side * eyeA);
    const look = n.clone().add(new Vector3(0, 0, s.eye.cartoon ? 1.4 : 0.5)).normalize();
    const eye = new Group();
    eye.position.copy(at).addScaledVector(n, -s.eye.size * (s.eye.cartoon ? 0.62 : 0.35));
    eye.lookAt(eye.position.clone().add(look));
    const z = s.eye.size;
    if (s.eye.cartoon) {
      eye.add(new Mesh(new SphereGeometry(z, 32, 16), standard(WHITE, 0.15)));
      const iris = new Mesh(new SphereGeometry(z * 0.68, 32, 16), standard(s.eye.iris, 0.2));
      iris.position.z = z * 0.42;
      eye.add(iris);
      const pupil = new Mesh(new SphereGeometry(z * 0.42, 24, 12), standard('#0b0b10', 0.1));
      pupil.position.z = z * 0.72;
      eye.add(pupil);
    } else {
      eye.add(new Mesh(new SphereGeometry(z, 32, 16), standard(s.eye.iris, 0.12)));
      const pupil = new Mesh(new SphereGeometry(z * 0.55, 24, 12), standard('#07070a', 0.1));
      pupil.position.z = z * 0.62;
      eye.add(pupil);
    }
    const glint = new Mesh(new SphereGeometry(z * 0.2, 12, 8), standard('#ffffff', 0.0));
    (glint.material as MeshStandardNodeMaterial).emissiveNode = color('#ffffff');
    glint.position.set(z * 0.3, z * 0.35, z * 0.88);
    eye.add(glint);
    g.add(eye);
  }

  // the beak: an upper and a lower half, the upper hooked
  const b = s.beak;
  const beakPts = Array.from({ length: 24 }, (_, i) => {
    const t = i / 23;
    return new Vector2(b.width * Math.pow(1 - t, 0.7), t * b.length);
  });
  const half = (len: number, hook: number, tall: number) => {
    const geo = lathe(beakPts.map(v => new Vector2(v.x, v.y * len)), 32);
    geo.rotateX(Math.PI / 2);
    geo.scale(0.85, tall, 1);
    const bp = geo.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const t = bp.getZ(i) / (b.length * len);
      bp.setY(i, bp.getY(i) - hook * b.length * t * t * t);
    }
    geo.computeVertexNormals();
    return geo;
  };
  const beak = new Group();
  const upper = new Mesh(half(1, b.hook, b.tall), standard(b.colour, 0.35));
  upper.position.y = b.width * 0.22 * b.tall;
  const lower = new Mesh(half(0.86, 0, b.tall * 0.8), standard(b.colour, 0.45));
  (lower.material as MeshStandardNodeMaterial).colorNode = color(b.colour).mul(0.78);
  lower.position.y = -b.width * 0.25 * b.tall;
  beak.add(upper, lower);
  const beakAt = surface(s, pts, b.y, 0);
  beak.position.copy(beakAt).add(new Vector3(0, 0, -b.width * 0.9));
  beak.rotation.x = 0.1;
  g.add(beak);

  // flippers: flat teardrops from the shoulders
  const f = s.flipper;
  const flipPts = Array.from({ length: 24 }, (_, i) => {
    const t = i / 23;
    return new Vector2(f.width * Math.pow(Math.sin(Math.PI * t), 0.8) * (1 - 0.45 * t), -t * f.length);
  });
  const flipGeo = lathe(flipPts, 32);
  flipGeo.scale(0.24, 1, 1);
  for (const side of [1, -1]) {
    const arm = new Group();
    const at = surface(s, pts, f.y, side * 90 * deg);
    arm.position.set(at.x + side * 0.004, f.y, at.z + 0.01);
    arm.rotation.z = side * 0.42;
    arm.rotation.x = -0.12;
    arm.add(new Mesh(flipGeo, standard(FEATHER, 0.6)));
    g.add(arm);
  }

  // feet, three toes each, and a short tail
  const foot = standard(s.feet, 0.5);
  for (const side of [1, -1]) {
    const pad = new Mesh(new SphereGeometry(1, 24, 12), foot);
    pad.scale.set(0.07, 0.03, 0.09);
    pad.position.set(side * 0.09, 0.025, 0.1);
    g.add(pad);
    for (const yaw of [-0.4, 0, 0.4]) {
      const toe = new Mesh(new CapsuleGeometry(0.022, 0.06, 4, 12), foot);
      toe.rotation.order = 'YXZ';
      toe.rotation.set(Math.PI / 2, side * 0.15 + yaw, 0);
      toe.scale.set(1, 1, 0.7);
      toe.position.set(side * 0.09 + Math.sin(side * 0.15 + yaw) * 0.08, 0.02, 0.1 + Math.cos(yaw) * 0.08);
      g.add(toe);
    }
  }
  const tail = new Mesh(new CapsuleGeometry(0.05, 0.1, 4, 12), standard(FEATHER, 0.6));
  tail.scale.set(1.4, 1, 0.5);
  tail.rotation.x = 0.9;
  tail.position.set(0, 0.07, surface(s, pts, 0.1, Math.PI).z - 0.03);
  g.add(tail);

  // the crew scarf: a knitted ring in the crew's colour, a tail with its second colour at the end
  const sy = s.scarf;
  const sr = radiusAt(pts, sy);
  const sShift = s.lean * smooth(s.neck - 0.08, s.neck + 0.1, sy);
  const ring = new Mesh(new TorusGeometry(sr * 0.99, 0.03, 16, 96), standard(crew.primary, 0.85));
  ring.rotation.x = Math.PI / 2;
  ring.scale.set(1, 1 + (s.belly - 1) * 0.15, 0.55);
  ring.position.set(0, sy, sShift + sr * (s.belly - 1) * 0.5);
  g.add(ring);
  const end = new MeshStandardNodeMaterial({ roughness: 0.85 });
  end.colorNode = mix(color(crew.primary), color(crew.secondary), aa(positionLocal.y.negate().sub(0.06)));
  for (const [dx, tilt, len] of [[0.05, 0.12, 0.2], [0.11, 0.32, 0.16]] as const) {
    const tailGeo = new CapsuleGeometry(0.035, len, 4, 12);
    tailGeo.translate(0, -len / 2, 0);
    const t = new Mesh(tailGeo, end);
    t.scale.set(1, 1, 0.45);
    const at = surface(s, pts, sy, 0.45);
    t.position.set(at.x + dx - 0.05, sy - 0.02, at.z + 0.02);
    t.rotation.z = tilt;
    t.rotation.x = -0.25;
    g.add(t);
  }

  // the rockhopper's crest: yellow plumes from above each eye, a black tuft on the crown
  if (s.crest) {
    const plume = standard('#f2c32e', 0.5);
    for (const side of [1, -1]) {
      const from = surface(s, pts, eyeY + 0.035, side * (eyeA - 18 * deg));
      for (let k = 0; k < 6; k++) {
        const out = normalAt(s, pts, eyeY + 0.035, side * eyeA);
        const pts3 = [
          from.clone(),
          from.clone().add(new Vector3(side * 0.03, 0.03 + k * 0.004, -0.05)).addScaledVector(out, 0.02),
          from.clone().add(new Vector3(side * (0.09 + k * 0.012), 0.02 - k * 0.012, -0.12 - k * 0.008)).addScaledVector(out, 0.03),
          from.clone().add(new Vector3(side * (0.13 + k * 0.02), -0.04 - k * 0.022, -0.16 - k * 0.012)),
        ];
        g.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(pts3), 20, 0.0075 - k * 0.0005, 6), plume));
      }
    }
    const tuft = standard(FEATHER, 0.6);
    // a spiky fan on the crown, splayed sideways and swept back
    const top = pts[pts.length - 1].y;
    for (let k = 0; k < 9; k++) {
      const a = (k - 4) / 4;
      const base = new Vector3(a * 0.05, top - 0.012, s.lean - 0.02 - Math.abs(a) * 0.015);
      const curve = new CatmullRomCurve3([
        base.clone().add(new Vector3(0, -0.01, 0)),
        base.clone().add(new Vector3(a * 0.03, 0.035, -0.015)),
        base.clone().add(new Vector3(a * 0.07, 0.055 - Math.abs(a) * 0.02, -0.05)),
      ]);
      g.add(new Mesh(new TubeGeometry(curve, 12, 0.006, 6), tuft));
    }
  }
  return g;
}

export const STYLES: Style[] = [
  {
    key: 'A', name: 'Adélie (true to life)',
    profile: [[0, 0.03], [0.19, 0.05], [0.27, 0.14], [0.295, 0.28], [0.28, 0.42], [0.235, 0.55], [0.19, 0.64], [0.17, 0.71], [0.172, 0.79], [0.152, 0.87], [0.1, 0.935], [0, 0.965]],
    neck: 0.7, lean: 0.05, belly: 1.12, bib: 0.69, bibWide: -0.15, band: false,
    eye: { y: 0.835, around: 52, size: 0.02, ring: 0.034, iris: '#2a1d16', cartoon: false },
    beak: { y: 0.8, length: 0.14, width: 0.042, tall: 1.05, colour: '#6b4434', hook: 0.18 },
    flipper: { length: 0.34, width: 0.07, y: 0.6 }, feet: '#e7a39a', crest: false, scarf: 0.68,
  },
  {
    key: 'B', name: 'Rockhopper (character)',
    profile: [[0, 0.03], [0.22, 0.05], [0.32, 0.15], [0.34, 0.28], [0.31, 0.42], [0.25, 0.53], [0.205, 0.6], [0.195, 0.67], [0.2, 0.75], [0.17, 0.84], [0.11, 0.9], [0, 0.93]],
    neck: 0.62, lean: 0.04, belly: 1.1, bib: 0.63, bibWide: -0.05, band: false,
    eye: { y: 0.765, around: 50, size: 0.024, ring: 0, iris: '#b3202a', cartoon: false },
    beak: { y: 0.735, length: 0.12, width: 0.05, tall: 1.25, colour: '#d2462c', hook: 0.3 },
    flipper: { length: 0.3, width: 0.075, y: 0.55 }, feet: '#e6a58c', crest: true, scarf: 0.63,
  },
  {
    key: 'C', name: 'Chibi gentoo (mascot)',
    profile: [[0, 0.02], [0.18, 0.04], [0.25, 0.12], [0.26, 0.22], [0.23, 0.32], [0.215, 0.38], [0.26, 0.47], [0.29, 0.58], [0.28, 0.7], [0.22, 0.8], [0.12, 0.86], [0, 0.88]],
    neck: 0.4, lean: 0.02, belly: 1.06, bib: 0.42, bibWide: -0.2, band: true,
    eye: { y: 0.6, around: 33, size: 0.055, ring: 0, iris: '#3a2618', cartoon: true },
    beak: { y: 0.55, length: 0.11, width: 0.06, tall: 0.9, colour: '#f07a1a', hook: 0.06 },
    flipper: { length: 0.19, width: 0.06, y: 0.37 }, feet: '#f08a2a', crest: false, scarf: 0.4,
  },
];

export const CREWS: Crew[] = [
  { name: 'Ultramarine', primary: '#2547a8', secondary: '#e3b23c' },
  { name: 'Vermilion', primary: '#c8372b', secondary: '#f2e6c8' },
  { name: 'Verdigris', primary: '#2f8a73', secondary: '#d98a2b' },
  { name: 'Plum', primary: '#7a2f6b', secondary: '#8fc3e0' },
];

/** Head height and centre, for framing a portrait. */
export function headOf(s: Style): { y: number; z: number } {
  return { y: s.eye.y - 0.02, z: s.lean };
}
