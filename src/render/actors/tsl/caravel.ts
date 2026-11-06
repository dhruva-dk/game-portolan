// The caravel's hull and sails as node materials, for the WebGPU planet: the same paint, cloth and wear as the GLSL in
// caravel.ts, read from the same uniforms, lit by the atmosphere's lights and shadowed by the sun's cascades.
//
// The hull is one mesh coloured by part (aPart): lacquered planks with the gun deck's band, the castles' gilt lattice
// and the copper below the water; gilt, the deck, dark wood, rope, iron, bronze, the stern's windows and the wisp.
// Every part's colour, roughness, metalness and normal strength is worked out as a chain of selects rather than
// branches, so the four outputs share one evaluation of the planks.
//
// The sails move in the vertex stage (bellying, flogging when she is slow, swung round the mast with the sheet; the
// flags streaming down her wind) and their normals are turned with them. The same motion is used when the sun's shadow
// maps are drawn, and the holes shot through the cloth are cut from those as well, so the shadow on the deck is torn
// where the sail is. The sails let the light through from behind (ClothLight), so a sail against the sun glows.
import {
  DoubleSide, MeshStandardNodeMaterial, PhysicalLightingModel, type LightingModelDirectInput, type NodeBuilder, type Texture,
} from 'three/webgpu';
import {
  Fn, PI, abs, attribute, cameraPosition, clamp, cos, diffuseColor, dot, float, floor, fract, length, max, min, mix, mod, normalLocal, normalMap,
  normalView, positionGeometry, positionLocal, positionViewDirection, positionWorld, pow, screenUV, select, sin, smoothstep, step, texture, uv, vec2,
  vec3,
} from 'three/tsl';
import { LAMP, P } from '../../gpu/uniforms.ts';
import type { ActorTextures } from '../common.ts';
import { WL } from '../caravel.ts';
import { dither, pick, read, readTexture, type B, type F, type Uniforms, type V3 } from './kit.ts';

/** The hull, figurehead and turret: one material a ship, coloured by part. */
export function hullNodeMaterial(u: Uniforms, tex: ActorTextures): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial();
  const hull = read(u, 'uHull', 'color'), accent = read(u, 'uAccent', 'color'), trim = read(u, 'uTrim', 'color');
  const wisp = read(u, 'uWisp', 'color');
  const damage = read(u, 'uDamage', 'float'), hit = read(u, 'uHit', 'float'), hitAt = read(u, 'uHitAt', 'vec3');
  const night = read(u, 'uNight', 'float');

  const part = floor(attribute<'float'>('aPart').add(0.5)).toVar('shipPart');
  const is = (k: number): B => part.equal(k);
  // the height over the main deck's line, so the paint follows the sheer; and the point in the ship's own frame
  const h = attribute<'float'>('aAux');
  const lp = positionGeometry;
  const wood = texture(tex.hull_d).rgb.toVar('shipWood');
  const lum = dot(wood, vec3(0.3, 0.55, 0.15)).toVar('shipLum');

  // lacquer over planks: the grain shows through the gloss
  const gloss = lum.mul(1.3).add(0.55);
  const lacquer = select(is(6), accent, hull).mul(gloss);
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
  const planks = mix(mix(mix(lacquer, accent.mul(gloss), band), trim, gold), vec3(0.13, 0.17, 0.15).mul(lum.add(0.5)), bottom);

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
    [is(11), wisp.mul(0.4)],
    [is(12), vec3(0.62, 0.42, 0.22).mul(lum.mul(0.4).add(0.8))],
    [is(13), vec3(0.08, 0.085, 0.09)],
  ], wood).toVar('shipColour');
  const rough = pick<F>([
    [is(0), mix(lum.mul(0.3).add(0.32), 0.55, bottom)],
    [is(2), float(0.6)],
    [is(6), lum.mul(0.3).add(0.32)],
    [is(1), float(0.28)], [is(3), float(0.7)], [is(7), float(0.8)], [is(8), float(0.95)], [is(9), float(0.45)],
    [is(14), float(0.15)], [is(11), float(0.6)], [is(12), float(0.32)], [is(13), float(0.45)],
  ], float(0.75));
  const metal = pick<F>([[is(0), gold.mul(0.9)], [is(1), float(0.95)], [is(12), float(1)], [is(13), float(0.7)]], float(0));
  const bumps = pick<F>([[is(1), float(0)], [is(8), float(0)], [is(14), float(0)], [is(11), float(0)], [is(12), float(0.3)], [is(13), float(0.3)]], float(1));

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

  // struck: a hot glow where the shot went in, and the rest of her lit a moment in her own colours
  const struck = smoothstep(4.5, 0, lp.distance(hitAt));
  const flash = charred.mul(0.5).add(vec3(1, 0.45, 0.15).mul(1.8).mul(struck).mul(struck)).mul(hit);

  m.colorNode = charred;
  m.roughnessNode = mix(rough, 0.95, scorch);
  m.metalnessNode = metal;
  m.normalNode = normalMap(select(is(3), texture(tex.deck_n), texture(tex.hull_n)).xyz, vec2(0.8).mul(bumps));
  m.emissiveNode = lamps.add(embers).add(flash).mul(LAMP);
  return m;
}

/**
 * Sailcloth's light: the standard model, and the light that comes through the cloth from its far side. Linen lets
 * about a third of the light falling on its back through, spread evenly, and more again looking straight into the
 * light through it; the direct lights come with their shadows already on them, so the sun's and the moon's light both
 * come through, and neither through a sail in the lee of an island.
 */
class ClothLight extends PhysicalLightingModel {
  override direct(input: LightingModelDirectInput, builder: NodeBuilder): void {
    super.direct(input, builder);
    const l = input.lightDirection as V3, lightColor = input.lightColor as V3;
    const reflectedLight = input.reflectedLight as unknown as { directDiffuse: V3 };
    const back = max(dot(normalView, l).negate(), 0).mul(0.35);
    const straight = pow(max(dot(positionViewDirection, l).negate(), 0), 4).mul(0.4);
    reflectedLight.directDiffuse.addAssign(lightColor.mul(diffuseColor.rgb).mul(back.add(straight)).mul(1 / Math.PI));
  }
}

/** The lateens, their yards, the pennants and the ensign: one material a ship, double-sided cloth. */
export function sailNodeMaterial(u: Uniforms, tex: ActorTextures, sailNoise: Texture): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ side: DoubleSide, roughness: 0.85, metalness: 0 });
  const fill = read(u, 'uFill', 'float'), side = read(u, 'uSide', 'float'), boom = read(u, 'uBoom', 'float');
  const luff = read(u, 'uLuff', 'float'), flag = read(u, 'uFlag', 'float');
  const sailA = read(u, 'uSailA', 'color'), sailB = read(u, 'uSailB', 'color'), trimC = read(u, 'uTrimC', 'color');
  const pattern = read(u, 'uPattern', 'float'), emblem = read(u, 'uEmblem', 'float'), rect = read(u, 'uEmblemRect', 'vec4');
  const damage = read(u, 'uDamage', 'float'), fade = read(u, 'uFade', 'float');

  const kind = attribute<'float'>('aKind');
  const rig = attribute<'vec3'>('aRig');
  const plane = attribute<'vec2'>('aPlane');

  m.positionNode = Fn(() => {
    const t = P.time, su = uv().x, sv = uv().y;
    const lateen = kind.lessThan(1.5), cloth = kind.lessThan(0.5), pennant = kind.lessThan(2.5);
    // a lateen (0) or its yard (1): hung on the lee side of the mast, the cloth bellying out between yard and foot
    // and flogging when she is slow, the whole swinging round the mast with the sheet
    const belly = select(cloth, sin(sv.mul(PI)).mul(sin(pow(su, 0.75).mul(PI)).mul(0.7).add(0.3)).mul(rig.y).mul(0.13), float(0));
    const flog = select(cloth, sin(t.mul(9).add(su.mul(9)).add(sv.mul(4))).mul(0.16).mul(su).mul(float(1).sub(sv)).mul(luff), float(0));
    const hung = side.mul(belly.mul(fill).add(0.38)).add(flog);
    // the pennants (2) and the ensign (3) stream down the wind that she feels, swung round their staffs
    const stream = select(pennant,
      sin(t.mul(7).sub(su.mul(7))).mul(0.35).mul(su).add(sin(t.mul(11).sub(su.mul(13))).mul(0.12).mul(su)),
      sin(t.mul(5.5).sub(su.mul(5))).mul(0.3).mul(su).add(sin(t.mul(9).sub(su.mul(9)).add(sv.mul(2))).mul(0.08).mul(su)));
    const droop = select(lateen, float(0), su.mul(su).mul(select(pennant, float(0.4), float(0.25))));
    const p = positionLocal;
    const x = p.x.add(select(lateen, hung, stream));
    const a = select(lateen, boom.mul(rig.z), flag);
    const c = cos(a), s = sin(a);
    const z = p.z.sub(rig.x);
    // the cloth's normals turn with it
    const n = normalLocal;
    normalLocal.assign(vec3(n.x.mul(c).add(n.z.mul(s)), n.y, n.x.negate().mul(s).add(n.z.mul(c))));
    return vec3(x.mul(c).add(z.mul(s)), p.y.sub(droop), x.negate().mul(s).add(z.mul(c)).add(rig.x));
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

  // shot through: holes grow with damage, their edges scorched
  const hn = texture(sailNoise, sp.mul(vec2(0.7, 1.1)).add(kind.mul(0.37))).r;
  const cut = select(yard, float(-1), damage.mul(0.62).sub(0.05));
  const whole = hn.greaterThanEqual(cut);
  m.colorNode = colour.mul(mix(1, 0.25, smoothstep(cut.add(0.06), cut, hn).mul(step(0, cut))));
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
  m.setupLightingModel = () => new ClothLight();
  return m;
}
