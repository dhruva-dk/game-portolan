// The caravel's hull and sails as node materials: paint, cloth and wear read from caravel.ts's uniforms, lit by the atmosphere's lights and shadowed by the sun's cascades.
//
// The hull is one mesh coloured by part (aPart): planks under a coloured lacquer with the gun deck's band, the castles'
// gilt lattice and the copper below the water; gilt, the deck, dark wood, rope, iron, bronze, the stern's windows, the
// lanterns' glass and the wisp.
// Every part's colour, roughness, metalness and normal strength is worked out as a chain of selects rather than
// branches, so the four outputs share one evaluation of the planks.
//
// The lateens and the flags are cloth simulated on the GPU (cloth.ts): the vertex stage reads each vertex's particle
// from the fleet's buffer by the ship's slot, and takes its normal across its neighbours in the grid. The yards are
// spars, hung on the lee side of the mast and swung round it with the sheet, as the cloth's lashings are. The same
// motion is used when the sun's shadow maps are drawn, and the holes shot through the cloth are cut from those as
// well, so the shadow on the deck is torn where the sail is. The sails let the light through from behind
// (ClothLight), so a sail against the sun glows.
//
// The mainmast and everything on it (aMain) can be shot away: uMast turns it over the side about her length through
// its foot, scales it about the foot (a jury mast is a short spar; gone is nothing), and lets it sink and drag astern
// where it lies in the water. Shot-torn canvas (uTorn) opens holes in the lateens as hull damage does.
import {
  DoubleSide, MeshPhysicalNodeMaterial, PhysicalLightingModel, type LightingModelDirectInput, type Node, type NodeBuilder, type Texture,
} from 'three/webgpu';
import {
  Fn, abs, atan, attribute, cameraPosition, clamp, cos, cross, diffuseColor, dot, float, floor, fract, fwidth, length, max, min, mix, mod,
  modelWorldMatrix, normalLocal, normalMap, int, normalGeometry, normalView, positionGeometry, positionLocal, positionViewDirection, positionWorld, pow,
  screenUV, select, sin, smoothstep, step, texture, uv, vec2, vec3, vec4,
} from 'three/tsl';
import { EXPOSURE } from '../../gpu/grade.ts';
import { LAMP, P } from '../../gpu/uniforms.ts';
import type { ActorTextures } from '../common.ts';
import { HOLES, MAIN_FOOT, WL } from '../caravel.ts';
import { HUNG, type Cloth } from '../cloth.ts';
import { dither, pick, read, readArray, readTexture, type B, type F, type Uniforms, type V3 } from './kit.ts';

/**
 * A point in ship space, and normalLocal with it, as the mainmast stands this frame: uMast is the angle it has gone
 * over through (about her length, positive to starboard, which is toward -x), its scale about the foot, how far it
 * has sunk and how far it has dragged astern. Points off the mainmast stay where they are.
 */
function mainmast(u: Uniforms, p: V3): V3 {
  const mast = read(u, 'uMast', 'vec4'), on = attribute<'float'>('aMain');
  const foot = vec3(MAIN_FOOT.x, MAIN_FOOT.y, MAIN_FOOT.z);
  const a = mast.x.mul(on), k = mix(float(1), mast.y, on);
  const c = cos(a), s = sin(a);
  const q = p.sub(foot).mul(k);
  const n = normalLocal;
  normalLocal.assign(vec3(n.x.mul(c).sub(n.y.mul(s)), n.x.mul(s).add(n.y.mul(c)), n.z));
  return vec3(q.x.mul(c).sub(q.y.mul(s)), q.x.mul(s).add(q.y.mul(c)), q.z).add(foot).sub(vec3(0, mast.z, mast.w).mul(on));
}

/** The scan's mean luminance (linear), which the grain is read against. */
const WOOD_LUM = 0.083;
/** How much of the colour on the planks is the lacquer's; the rest is the wood's own. */
const LACQUER = 0.86;
/** The planks' normal-map strength. */
const PLANK_RELIEF = 1.8;

/**
 * A stern lantern's glass: dimly lit from within, and the wisp seen through it, a small hot core found where the
 * ray through the pane passes the lantern's middle, so it sits right from every side. The glass carries the
 * lantern's size (aux), and its middle lies back from the pane along the normal, and level with the pane's middle.
 * The core never grows narrower than a pixel and a half, keeping its light, so a far lantern holds a steady point.
 * Both are given as they come out on the screen, whatever the exposure: the core a few times the screen's white,
 * the glass well under it, so the bloom they make stays a small one.
 */
function lanternLight(wisp: V3, night: F, flick: F): V3 {
  const size = attribute<'float'>('aAux');
  const n = normalGeometry, out = vec3(n.x, 0, n.z).normalize();
  const middle = positionGeometry.sub(out.mul(size.mul(0.34))).sub(vec3(0, uv().y.sub(0.5).mul(size.mul(0.8)), 0));
  const centre = modelWorldMatrix.mul(vec4(middle, 1)).xyz;
  const ray = positionWorld.sub(cameraPosition).normalize(), to = centre.sub(cameraPosition);
  const miss = length(to.sub(ray.mul(dot(to, ray))));
  const r = size.mul(0.1), spread = max(r, fwidth(miss).mul(1.5));
  const core = smoothstep(spread, spread.mul(0.25), miss).mul(r.div(spread).pow(2));
  const halo = smoothstep(size.mul(0.4), 0, miss).pow(2);
  const glass = wisp.mul(night.mul(0.35).add(0.25)).mul(halo.mul(0.7).add(0.3));
  return glass.add(mix(wisp, vec3(1), 0.55).mul(core).mul(night.add(2.5))).mul(flick).div(EXPOSURE);
}

/** The hull, figurehead and turret: one material a ship, coloured by part. */
export function hullNodeMaterial(u: Uniforms, tex: ActorTextures): MeshPhysicalNodeMaterial {
  const m = new MeshPhysicalNodeMaterial();
  const hull = read(u, 'uHull', 'color'), accent = read(u, 'uAccent', 'color'), trim = read(u, 'uTrim', 'color');
  const wisp = read(u, 'uWisp', 'color');
  const damage = read(u, 'uDamage', 'float'), hit = read(u, 'uHit', 'float'), hitAt = read(u, 'uHitAt', 'vec3');
  const night = read(u, 'uNight', 'float'), reach = read(u, 'uWet', 'float'), ice = read(u, 'uIce', 'float');
  // the standing rigging grows a coat of ice as it builds, hanging heavier under the rope than over it
  m.positionNode = Fn(() => {
    const rope = select(floor(attribute<'float'>('aPart').add(0.5)).equal(8), float(1), float(0));
    const n = normalGeometry, coat = ice.mul(rope);
    const p = positionLocal.add(n.mul(coat.mul(0.022))).add(vec3(0, min(n.y, 0).mul(coat).mul(0.03), 0));
    return mainmast(u, p);
  })();

  const part = floor(attribute<'float'>('aPart').add(0.5)).toVar('shipPart');
  const is = (k: number): B => part.equal(k);
  // the height over the main deck's line, so the paint follows the sheer; and the point in the ship's own frame
  const h = attribute<'float'>('aAux');
  const lp = positionGeometry;
  const wood = texture(tex.hull_d).rgb.toVar('shipWood');
  const lum = dot(wood, vec3(0.3, 0.55, 0.15)).toVar('shipLum');

  // the planks are the scan's own, warmed as oiled oak; the captain's colour is a lacquer over them, thin enough that
  // each plank's tone, its seams and its grain come through it, and a little of the wood's own brown with them
  const bare = wood.mul(vec3(1.3, 1.02, 0.76));
  const grain = clamp(lum.div(WOOD_LUM), 0.2, 2);
  const stain = (c: V3): V3 => mix(bare, c.mul(grain), LACQUER);
  const lacquer = stain(select(is(6), accent, hull));
  // the gun deck's band between the wales, in the accent
  const band = smoothstep(-0.36, -0.33, h).mul(float(1).sub(smoothstep(0.86, 0.89, h)));
  // the castles' sides: a gilt lattice over the lacquer, and gilt mouldings under the band and at the water
  const q = lp.z.add(lp.x);
  const dl = fract(vec2(q.add(h.mul(1.3)), q.sub(h.mul(1.3))).mul(0.5)).sub(0.5);
  const gold = clamp(
    smoothstep(0.98, 1.04, h).mul(smoothstep(0.035, 0, min(abs(dl.x), abs(dl.y)))).mul(0.85)
      .add(smoothstep(0.035, 0, abs(h.add(0.5))))
      .add(smoothstep(0.045, 0, abs(lp.y.sub(WL + 0.05)))),
    0, 1,
  ).toVar('shipGold');
  // below the water: dark copper sheathing
  const bottom = smoothstep(WL - 0.02, WL - 0.06, lp.y).toVar('shipBottom');
  const planks = mix(mix(mix(lacquer, stain(accent), band), trim, gold), vec3(0.13, 0.17, 0.15).mul(lum.add(0.5)), bottom);

  const flickWin = sin(P.time.mul(5).add(lp.x.mul(4)).add(lp.z)).mul(0.1).add(0.9);
  const flickWisp = sin(P.time.mul(7).add(lp.y.mul(3))).mul(sin(P.time.mul(3.1))).mul(0.15).add(0.85);

  const colour = pick<V3>([
    [is(0), planks],
    [is(2), lacquer.mul(0.7)],
    [is(6), lacquer],
    [is(1), trim],
    [is(3), texture(tex.deck_d).rgb.mul(vec3(1.05, 0.95, 0.85))],
    [is(7), wood.mul(vec3(0.55, 0.45, 0.38))],
    [is(8), vec3(0.16, 0.12, 0.09)],
    [is(9), vec3(0.045, 0.035, 0.03).mul(lum.add(0.6))],
    [is(14), vec3(0.02)],
    [is(15), vec3(0.02, 0.024, 0.024)],
    [is(11), wisp.mul(0.4)],
    [is(12), vec3(0.62, 0.42, 0.22).mul(lum.mul(0.4).add(0.8))],
    [is(13), vec3(0.08, 0.085, 0.09)],
  ], wood).toVar('shipColour');
  const rough = pick<F>([
    [is(0), mix(lum.mul(0.3).add(0.32), 0.55, bottom)],
    [is(2), float(0.6)],
    [is(6), lum.mul(0.3).add(0.32)],
    [is(1), float(0.28)], [is(3), float(0.7)], [is(7), float(0.8)], [is(8), float(0.95)], [is(9), float(0.45)],
    [is(14), float(0.15)], [is(15), float(0.06)], [is(11), float(0.6)], [is(12), float(0.32)], [is(13), float(0.45)],
  ], float(0.75));
  const metal = pick<F>([[is(0), gold.mul(0.9)], [is(1), float(0.95)], [is(12), float(1)], [is(13), float(0.7)]], float(0));
  const bumps = pick<F>([
    [is(1), float(0)], [is(8), float(0)], [is(14), float(0)], [is(15), float(0)], [is(11), float(0)], [is(12), float(0.3)], [is(13), float(0.3)],
  ], float(1));

  // the windows, lit by the wisp and a warmer lamp behind; the wisp itself
  const lamps = pick<V3>([
    [is(14), wisp.mul(night.mul(2.2).add(0.45)).add(vec3(1, 0.55, 0.22).mul(night.mul(0.9).add(0.2))).mul(flickWin)],
    [is(11), wisp.mul(night.mul(3).add(1.6)).mul(flickWisp)],
  ], vec3(0));

  // scorched where she has been hurt, embers in the worst of it
  const dn = texture(tex.noise, lp.xz.mul(0.11).add(lp.y.mul(0.07))).r.mul(0.7).add(texture(tex.noise, lp.zy.mul(0.3)).g.mul(0.3));
  const scorch = smoothstep(float(1.02).sub(damage.mul(0.75)), float(1.1).sub(damage.mul(0.75)), dn)
    .mul(step(0.0001, damage)).mul(select(is(11), float(0), float(1))).toVar('shipScorch');
  const embers = vec3(1, 0.32, 0.06).mul(pow(scorch, 6)).mul(damage).mul(sin(P.time.mul(5).add(dn.mul(20))).add(1.5));
  const charred = colour.mul(float(1).sub(scorch.mul(0.82)));

  // shot holes that stay: a dark hole torn ragged, a ring of fresh splintered wood round it, soot beyond; a burn is a
  // broad black scorch. Each is a point on her skin (caravel.ts struck), so they sit where the shots went in.
  const holes = readArray(u, 'uHoles', 'vec4');
  // the grain of the planking: what a hole's edge splits along, and the long splinters it leaves
  const grainJag = texture(tex.noise, vec2(lp.z.mul(0.35), lp.y.mul(3.1))).r.toVar('shipJag');
  let pierced: F = float(0), splinters: F = float(0), soot: F = float(0);
  for (let i = 0; i < HOLES; i++) {
    const c = holes.element(i) as unknown as Node<'vec4'>, r = abs(c.w), off = lp.sub(c.xyz), d = length(off);
    // ragged all round, differently for each hole: a few sines of the angle about it, and the planking's grain
    const a = atan(off.y, off.z.add(off.x.mul(0.5)));
    const edge = sin(a.mul(3).add(i * 1.7)).mul(0.22).add(sin(a.mul(7).add(i * 2.9)).mul(0.14)).add(sin(a.mul(13).add(i * 4.3)).mul(0.08));
    const reach = d.div(max(r, 1e-3)).sub(edge).sub(grainJag.sub(0.5).mul(0.5));
    const shot = step(0, c.w);
    pierced = max(pierced, smoothstep(0.62, 0.5, reach).mul(shot));
    splinters = max(splinters, smoothstep(1.05, 0.8, reach).mul(shot));
    soot = max(soot, smoothstep(mix(float(1.1), float(2.6), shot), float(0.45), reach).mul(mix(float(0.94), float(0.85), shot)));
  }
  pierced = pierced.toVar('shipPierced');
  splinters = splinters.toVar('shipSplinters');
  soot = soot.toVar('shipSoot');
  const mark = select(is(11).or(is(14)).or(is(15)).or(is(1)).or(is(12)), float(0), float(1));
  const fresh = vec3(0.24, 0.15, 0.075).mul(lum.mul(0.5).add(0.75));
  const holed = mix(mix(charred.mul(float(1).sub(soot.mul(mark).mul(0.85))), fresh, splinters.mul(mark)), vec3(0.008, 0.006, 0.005), pierced.mul(mark));

  // struck: a hot glow where the shot went in, and the rest of her lit a moment in her own colours
  const struck = smoothstep(4.5, 0, lp.distance(hitAt));
  const flash = charred.mul(0.5).add(vec3(1, 0.45, 0.15).mul(1.8).mul(struck).mul(struck)).mul(hit);

  // her sides wet as high as the sea and her bow wave throw it (higher forward, and in runs down the planking), the
  // whole of her in rain, the deck most; above the wet, the salt the sea has left dried white in the grain. Water
  // darkens bare wood more than lacquer, and lies on both as a second, glassy coat.
  const lacquered = is(0).and(bottom.lessThan(0.5)).or(is(2)).or(is(6));

  // ice, as the sim builds it in falling snow north of the snow line (uIce, 0…1). Snow settles first on whatever faces
  // up (the decks, the rail's cap, the castles' tops, the tops of the casks and the capstan), deeper where it drifts;
  // then the spray freezes on her as glaze, thickest forward where it flies and on the faces that stand up to it. Where
  // either lies the water on her is ice, not wet. Nothing settles on the lit windows or the wisp.
  const lamp = select(is(11).or(is(14)).or(is(15)), float(0), float(1));
  const drift = texture(tex.noise, lp.xz.mul(0.37)).g.mul(0.6).add(texture(tex.noise, lp.xz.mul(1.9).add(lp.y)).r.mul(0.4)).toVar('shipDrift');
  const up = normalGeometry.y;
  const snow = smoothstep(0.35, 0.75, up.add(drift.sub(0.5).mul(0.7)))
    .mul(smoothstep(drift.mul(0.4), drift.mul(0.4).add(0.22), ice))
    .mul(smoothstep(WL + 0.4, WL + 0.9, lp.y)).mul(lamp).toVar('shipSnow');
  const forward = smoothstep(-7, 9, lp.z);
  // (the spray freezes in streaks laid aft along her, as it flies)
  // (from the noise's smoother channels: its finest octaves are only a couple of texels across)
  const feather = texture(tex.noise, vec2(lp.z.mul(0.9).add(lp.x.mul(0.5)), lp.y.mul(6.5))).r.mul(0.55)
    .add(texture(tex.noise, vec2(lp.z.mul(2.3), lp.y.mul(11)).add(lp.x)).r.mul(0.25)).add(drift.mul(0.2)).toVar('shipFeather');
  // glaze: a clear coat over everything above the water, the wood showing through it
  const glaze = smoothstep(0.05, 0.35, ice.mul(mix(0.6, 1.2, forward)).sub(feather.mul(0.3)))
    .mul(smoothstep(WL + 0.12, WL + 0.4, lp.y)).mul(lamp).mul(float(1).sub(snow)).toVar('shipGlaze');
  // rime: white and feathered, in patches where the spray flies, the bow most, the faces standing up to it
  const rime = smoothstep(0.6, 0.8, feather.add(ice.mul(forward.mul(0.13).add(0.08))).sub(abs(up).mul(0.2)))
    .mul(step(0.02, ice)).mul(smoothstep(WL + 0.15, WL + 0.5, lp.y)).mul(lamp).mul(float(1).sub(snow)).mul(select(is(7), float(0.4), float(1))).toVar('shipRime');
  const frozen = max(snow, max(glaze, rime));
  // (snow glints where a flake's face catches the light)
  const glint = step(0.93, texture(tex.noise, lp.xz.mul(11).add(lp.y.mul(3))).r);

  const runs = texture(tex.noise, vec2(lp.z.mul(0.7), lp.y.mul(0.12))).g;
  const top = float(WL + 0.3).add(reach.mul(smoothstep(1, 8, lp.z).mul(1.2).add(0.4)));
  const sides = smoothstep(top.add(0.12), top.sub(0.12), lp.y.sub(runs.sub(0.5).mul(0.6)));
  const rained = P.rain.mul(mix(float(0.55), float(1), smoothstep(0.4, 0.9, normalGeometry.y)));
  const wet = clamp(max(sides.mul(select(is(0).or(is(2)).or(is(6)).or(is(9)), float(1), float(0))), rained), 0, 1).mul(float(1).sub(scorch)).mul(float(1).sub(frozen)).toVar('shipWet');
  // (a tide-line just over the wet, frayed into drips where the spray ran down and dried)
  const drips = texture(tex.noise, vec2(lp.z.mul(3.1), lp.y.mul(0.35))).r;
  const fine = texture(tex.noise, lp.zy.mul(vec2(2.7, 5.5))).b;
  const line = smoothstep(top.sub(0.02), top.add(0.06), lp.y).mul(smoothstep(top.add(drips.mul(0.5)).add(0.12), top.add(0.08), lp.y));
  const crust = line.mul(smoothstep(0.35, 0.7, fine.mul(0.6).add(drips.mul(0.5))))
    .mul(select(is(0), float(1), float(0))).mul(float(1).sub(gold)).mul(float(1).sub(wet)).mul(float(1).sub(scorch)).mul(0.45).toVar('shipSalt');
  const soaked = holed.mul(mix(float(1), select(lacquered, float(0.82), float(0.55)), wet));
  const salted = mix(soaked, vec3(0.74, 0.73, 0.69).mul(lum.mul(0.25).add(0.85)), crust);
  // glaze is clear ice: what is under it shows through, a little cooled; rime and snow cover it
  const glazed = mix(salted, salted.mul(vec3(0.86, 0.92, 0.98)).add(vec3(0.012, 0.018, 0.024)), glaze);
  const rimed = mix(glazed, vec3(0.78, 0.83, 0.88).mul(feather.mul(0.2).add(0.85)), rime);
  m.colorNode = mix(rimed, vec3(0.86, 0.9, 0.95).mul(drift.mul(0.12).add(0.9)), snow);
  m.roughnessNode = mix(mix(mix(mix(mix(rough, 0.95, max(scorch, max(soot, pierced).mul(mark))), 0.9, crust), 0.18, glaze), 0.6, rime), mix(float(0.72), float(0.18), glint), snow);
  m.metalnessNode = metal.mul(float(1).sub(crust)).mul(float(1).sub(frozen));
  m.clearcoatNode = max(max(select(lacquered, float(0.75), float(0)).mul(float(1).sub(max(scorch, soot.mul(mark)))), wet).mul(float(1).sub(crust)), glaze).mul(float(1).sub(max(snow, rime)));
  m.clearcoatRoughnessNode = mix(mix(lum.mul(0.08).add(0.08), float(0.03), wet), float(0.05), glaze);
  // (the planks' relief deeper than the rest, so the seams still read at the scene's three quarters)
  const relief = mix(select(lacquered, float(PLANK_RELIEF), float(0.8)), float(0.8), gold);
  m.normalNode = normalMap(select(is(3), texture(tex.deck_n), texture(tex.hull_n)).xyz, vec2(relief).mul(bumps).mul(float(1).sub(max(snow, rime).mul(0.85))).mul(float(1).sub(glaze.mul(0.4))));
  m.emissiveNode = lamps.add(embers).add(flash).mul(LAMP).add(select(is(15), lanternLight(wisp, night, flickWisp), vec3(0)));
  return m;
}

/**
 * Sailcloth's light: the standard model, and the light that comes through the cloth from its far side. Linen lets
 * about a third of the light falling on its back through, spread evenly, and more again looking straight into the
 * light through it; the direct lights come with their shadows already on them, so the sun's and the moon's light both
 * come through, and neither through a sail in the lee of an island.
 */
class ClothLight extends PhysicalLightingModel {
  /** How much of that light gets through: less through canvas stiff with frost. */
  through: F = float(1);
  override direct(input: LightingModelDirectInput, builder: NodeBuilder): void {
    super.direct(input, builder);
    const l = input.lightDirection as V3, lightColor = input.lightColor as V3;
    const reflectedLight = input.reflectedLight as unknown as { directDiffuse: V3 };
    const back = max(dot(normalView, l).negate(), 0).mul(0.35);
    const straight = pow(max(dot(positionViewDirection, l).negate(), 0), 4).mul(0.4);
    reflectedLight.directDiffuse.addAssign(lightColor.mul(diffuseColor.rgb).mul(back.add(straight)).mul(this.through).mul(1 / Math.PI));
  }
}

/**
 * Ice's light: the standard model, and what comes through it. An icicle is clear, so light from behind it comes
 * through nearly whole, bent and scattered inside into a glow tinted by the ice's own faint blue, and brightest looking
 * straight into the light along it.
 */
class IceLight extends PhysicalLightingModel {
  override direct(input: LightingModelDirectInput, builder: NodeBuilder): void {
    super.direct(input, builder);
    const l = input.lightDirection as V3, lightColor = input.lightColor as V3;
    const reflectedLight = input.reflectedLight as unknown as { directDiffuse: V3 };
    const back = max(dot(normalView, l).negate(), 0).mul(0.5);
    const straight = pow(max(dot(positionViewDirection, l).negate(), 0), 6).mul(1.6);
    reflectedLight.directDiffuse.addAssign(lightColor.mul(vec3(0.75, 0.9, 1)).mul(back.add(straight)).mul(1 / Math.PI));
  }
}

/**
 * The icicles (caravel.ts icicleGeometry): each grows from its root once the ice passes its own share, its girth
 * first and then its length, so the bow's come first and the stern's last. Clear ice, faintly blue, with a glassy coat;
 * light comes through it from behind (IceLight).
 */
export function iceNodeMaterial(u: Uniforms): MeshPhysicalNodeMaterial {
  const m = new MeshPhysicalNodeMaterial({ roughness: 0.1, metalness: 0 });
  const ice = read(u, 'uIce', 'float'), grow = attribute<'vec4'>('aIce');
  m.positionNode = Fn(() => {
    const k = smoothstep(grow.w, grow.w.add(0.28), ice), girth = min(k.mul(2.2), 1);
    return positionLocal.add(vec3(grow.x.mul(girth), grow.y.mul(k), grow.z.mul(girth)));
  })();
  // (thicker at the root, clearer toward the tip)
  const tip = smoothstep(0, -0.3, grow.y);
  m.colorNode = mix(vec3(0.74, 0.82, 0.88), vec3(0.5, 0.64, 0.74), tip);
  m.clearcoatNode = float(1);
  m.clearcoatRoughnessNode = float(0.04);
  m.setupLightingModel = () => new IceLight(true);
  return m;
}

/** The running rigging: tarred hemp, a tube built round each rope's particles in the vertex stage. */
export function ropeNodeMaterial(u: Uniforms, sim: Cloth): MeshPhysicalNodeMaterial {
  const m = new MeshPhysicalNodeMaterial({ roughness: 0.9, metalness: 0 });
  const slot = read(u, 'uClothSlot', 'float');
  const rope = attribute<'vec4'>('aRope'), radius = attribute<'float'>('aRopeR');
  const ice = read(u, 'uIce', 'float');
  // (each particle along a rope a bead of ice of its own size, and a hanging drip under some)
  const bead = fract(sin(rope.x.mul(12.9898)).mul(43758.5453));
  m.positionNode = Fn(() => {
    const first = int(slot).mul(sim.ropeCount);
    const at = (k: F): V3 => sim.ropePositions.element(first.add(int(k))).xyz;
    const p = at(rope.x), run = at(rope.z).sub(at(rope.y));
    const t = run.div(max(length(run), 1e-5));
    const across = select(abs(t.y).lessThan(0.9), vec3(0, 1, 0), vec3(1, 0, 0));
    const n = cross(t, across).normalize(), b = cross(t, n);
    const out = n.mul(cos(rope.w)).add(b.mul(sin(rope.w)));
    normalLocal.assign(out);
    // iced: thicker, beaded, and the ice hanging under it
    const coat = ice.mul(bead.mul(0.6).add(0.7));
    const hang = vec3(0, min(out.y, 0).mul(coat).mul(bead.mul(bead).mul(0.07).add(0.012)), 0);
    return mainmast(u, p.add(out.mul(radius.mul(coat.mul(1.5).add(1)))).add(hang));
  })();
  // laid strands, twisting round the rope
  const strand = sin(rope.w.mul(3).add(positionLocal.length().mul(40))).mul(0.5).add(0.5);
  const iced = smoothstep(0.08, 0.45, ice);
  m.colorNode = mix(vec3(0.16, 0.12, 0.09).mul(strand.mul(0.35).add(0.75)).mul(float(1).sub(P.rain.mul(0.3))), vec3(0.55, 0.62, 0.68), iced.mul(0.65));
  m.roughnessNode = mix(float(0.9), float(0.25), iced);
  // the fibres' soft sheen along the lay
  m.sheenNode = vec3(0.22, 0.19, 0.15).mul(strand.mul(0.5).add(0.5)).mul(float(1).sub(iced));
  m.sheenRoughnessNode = float(0.45);
  m.receivedShadowPositionNode = positionWorld.add(P.sunDir.mul(0.1));
  return m;
}

/** The lateens, their yards, the pennants and the ensign: one material a ship, double-sided cloth. */
export function sailNodeMaterial(u: Uniforms, tex: ActorTextures, sailNoise: Texture, sim: Cloth): MeshPhysicalNodeMaterial {
  const m = new MeshPhysicalNodeMaterial({ side: DoubleSide, roughness: 0.85, metalness: 0 });
  const side = read(u, 'uSide', 'float'), boom = read(u, 'uBoom', 'float'), slot = read(u, 'uClothSlot', 'float');
  const sailA = read(u, 'uSailA', 'color'), sailB = read(u, 'uSailB', 'color'), trimC = read(u, 'uTrimC', 'color');
  const pattern = read(u, 'uPattern', 'float'), emblem = read(u, 'uEmblem', 'float'), rect = read(u, 'uEmblemRect', 'vec4');
  const damage = read(u, 'uDamage', 'float'), fade = read(u, 'uFade', 'float'), torn = read(u, 'uTorn', 'float');

  const kind = attribute<'float'>('aKind');
  const rig = attribute<'vec4'>('aRig');
  const plane = attribute<'vec2'>('aPlane');
  const particle = rig.w, across = attribute<'vec4'>('aClothN');

  m.positionNode = Fn(() => {
    // the cloth, where the simulation has it, its normal across its neighbours
    const first = int(slot).mul(sim.count);
    const at = (k: F): V3 => sim.positions.element(first.add(int(k))).xyz;
    const cloth = particle.greaterThanEqual(0);
    const tangent = at(across.y).sub(at(across.x)), bitangent = at(across.w).sub(at(across.z));
    const normal = cross(tangent, bitangent);
    // a yard: hung on the lee side of the mast and swung round it with the sheet
    const p = positionLocal;
    const a = boom.mul(rig.z), c = cos(a), s = sin(a);
    const x = p.x.add(side.mul(HUNG)), z = p.z.sub(rig.x);
    const spar = vec3(x.mul(c).add(z.mul(s)), p.y, x.negate().mul(s).add(z.mul(c)).add(rig.x));
    const n = normalLocal;
    const sparNormal = vec3(n.x.mul(c).add(n.z.mul(s)), n.y, n.x.negate().mul(s).add(n.z.mul(c)));
    normalLocal.assign(select(cloth, normal.div(max(length(normal), 1e-6)), sparNormal));
    return mainmast(u, select(cloth, at(particle), spar));
  })();

  const su = uv(), sp = plane, size = rig.y;
  const yard = kind.greaterThan(0.5).and(kind.lessThan(1.5));
  const lin = texture(tex.linen_d, sp.mul(size).mul(0.3)).rgb.toVar('sailLinen');
  // the yards: oiled spars
  const spar = vec3(0.13, 0.085, 0.05).mul(texture(tex.linen_d, su.mul(vec2(6, 1))).r.mul(0.4).add(0.8));
  // the lateens are painted in the ship's pattern; the flags are in her second colour
  const stripe = sp.y.mul(size);
  const between = (lo: number, hi: number): B => pattern.greaterThan(lo).and(pattern.lessThan(hi));
  const painted = pick<V3>([
    [between(0.5, 1.5), select(mod(floor(stripe.div(2.4).add(0.5)), 2).lessThan(0.5), sailA, sailB)],
    [between(1.5, 2.5), select(su.x.greaterThan(0.8).or(su.y.lessThan(0.1)), sailB, sailA)],
    [between(2.5, 3.5), select(abs(sp.x).lessThan(0.14), sailB, sailA)],
    [between(3.5, 4.5), select(sp.x.mul(sp.y).greaterThan(0), sailB, sailA)],
    [pattern.greaterThan(4.5), select(mod(floor(sp.y.sub(abs(sp.x).mul(0.8)).mul(size).div(2.2)), 2).lessThan(0.5), sailA, sailB)],
  ], sailA);
  const base = pick<V3>([[kind.lessThan(0.5), painted], [kind.greaterThan(1.5), sailB]], sailA).toVar('sailBase');
  let cloth: V3 = base.mul(lin.mul(0.55).add(0.62));

  // the emblem, on the lateens and the ensign: its roundel in the trim, the charge in the second colour, inked
  const onLateen = kind.lessThan(0.5);
  const ep = sp.sub(vec2(0, select(onLateen, float(0.12), float(0)))).mul(select(onLateen, float(1), float(0.62)));
  const eq = ep.div(0.3).mul(0.5).add(0.5);
  const inside = eq.x.greaterThanEqual(0).and(eq.y.greaterThanEqual(0)).and(eq.x.lessThanEqual(1)).and(eq.y.lessThanEqual(1));
  const shown = inside.and(onLateen.or(kind.greaterThan(2.5))).and(emblem.greaterThan(-0.5));
  const roundel = readTexture(u, 'uEmblemAtlas', rect.xy.add(eq.clamp(0, 1).mul(rect.zw))).rgb;
  const e = select(shown, roundel, vec3(0));
  const field = mix(trimC, base, 0.35).mul(lin.mul(0.4).add(0.7));
  const charge0 = select(onLateen, sailB, sailA).mul(lin.mul(0.4).add(0.7));
  const charge = select(dot(charge0.sub(field), charge0.sub(field)).lessThan(0.02), vec3(0.08), charge0);
  cloth = mix(mix(mix(cloth, field, e.x.mul(0.92)), charge, e.y), vec3(0.05, 0.04, 0.035), e.z.mul(0.85));
  // the cloths' seams run down the sail; bolt-ropes round the edges
  const seam = smoothstep(0.05, 0, abs(fract(sp.x.mul(size).div(0.95)).sub(0.5)).sub(0.44)).mul(0.13);
  cloth = cloth.mul(float(1).sub(select(onLateen, seam, float(0))));
  const hem = select(onLateen, min(min(su.y, float(1).sub(su.y)).mul(6), float(1).sub(su.x)), min(min(su.x, float(1).sub(su.x)), min(su.y, float(1).sub(su.y))));
  cloth = cloth.mul(mix(0.68, 1, smoothstep(0, 0.03, hem)));
  const colour = select(yard, spar, cloth);

  // shot through: holes grow with damage and with the canvas torn by shot aloft, their edges scorched; torn canvas
  // goes in rags from the foot and the leech, where it flogs loose, before the head
  const hn = texture(sailNoise, sp.mul(vec2(0.7, 1.1)).add(kind.mul(0.37))).r;
  const rags = torn.mul(float(0.7).add(float(1).sub(su.y).mul(0.25)).add(su.x.mul(0.15))).sub(0.04);
  const cut = select(yard, float(-1), max(damage.mul(0.62).sub(0.05), select(kind.lessThan(0.5), rags, float(-1))));
  const whole = hn.greaterThanEqual(cut);
  // frost: as the ice builds the canvas pales and stiffens with rime, patchily at first, and lets less light through;
  // snow lies along the tops of the yards
  const ice = read(u, 'uIce', 'float');
  const fn = texture(sailNoise, sp.mul(vec2(2.3, 3.1)).add(kind.mul(0.71))).g;
  const frost = smoothstep(0.1, 0.5, ice.mul(1.1).sub(fn.mul(0.6))).mul(select(yard, float(0.4), float(1))).toVar('sailFrost');
  const yardSnow = select(yard, smoothstep(0.45, 0.8, normalGeometry.y).mul(smoothstep(0.05, 0.3, ice)), float(0));
  const rimed = mix(mix(colour, vec3(0.84, 0.87, 0.91).mul(lin.mul(0.2).add(0.85)), frost.mul(0.36)), vec3(0.88, 0.91, 0.95), yardSnow);
  // canvas darkens when it is rained on; the weave's sheen, the cloth's own colour at grazing light
  m.colorNode = rimed.mul(mix(1, 0.25, smoothstep(cut.add(0.06), cut, hn).mul(step(0, cut)))).mul(float(1).sub(P.rain.mul(select(yard, float(0.1), float(0.25))).mul(float(1).sub(frost))));
  m.sheenNode = select(yard, vec3(0), cloth.mul(0.45).add(0.08)).mul(float(1).sub(frost.mul(0.7)));
  m.roughnessNode = mix(float(0.85), float(0.62), frost);
  m.sheenRoughnessNode = float(0.55);
  // the player's own sail thins where it would hide the way ahead (round the crosshair only, so the rest of the rig
  // stays solid)
  const ndc = screenUV.mul(2).sub(1);
  const thin = fade.mul(float(1).sub(smoothstep(0.16, 0.5, length(ndc.mul(vec2(1, 0.75))))));
  m.maskNode = whole.and(dither().greaterThanEqual(thin));
  m.maskShadowNode = whole;

  // the light through the cloth (see ClothLight); its shadow is read sunward of the cloth, so a sail does not shade
  // the light coming through itself and only what stands between it and the sun does: a hand's breadth sunward close
  // by, and further with distance, where the far slices' texels and the bias along the normal that goes with them
  // grow coarse
  const away = positionWorld.distance(cameraPosition);
  m.receivedShadowPositionNode = positionWorld.add(P.sunDir.mul(away.mul(0.01).add(0.15)));
  m.setupLightingModel = () => {
    const light = new ClothLight(false, true);
    light.through = float(1).sub(frost.mul(0.55));
    return light;
  };
  return m;
}
