// How every solid thing is lit: in two tones. A surface has a colour where the sun reaches it and another, chosen for
// it (palette.ts), where it does not, with a crisp edge between: where it turns from the sun, and where a shadow is
// cast on it (the island's, the clouds'), which is the same edge and shows the same shadow colour. Over both lies one
// brightness for the place and the hour (level): the sun and the sky on a white surface facing straight up there, so
// the frame's exposure holds at every height of the sun, the storm darkens what is in it, and the water dims what is
// under it, while a shadow keeps its chosen colour and never takes the sky's blue.
//
// A polished thing (gilding, a gun's metal) has a third tone: one small hard highlight where it mirrors the sun. A
// thin thing (a leaf, a sail) is lit from either side: its far side's sun shows through it.

import { cameraPosition, dot, float, fwidth, max, mix, normalize, saturate, smoothstep, vec3 } from 'three/tsl';
import type { FloatNode, Vec3Node } from '../tsl';
import type { Sky } from './sky';

/** The light under the water at a point, as a share of what is above it (water.below). */
export interface Below { sun(p: Vec3Node): Vec3Node; sky(p: Vec3Node): Vec3Node }

/** A thin thing's two sides: 1 where the sun reaches the side facing n, and where it comes through from the other. */
export interface Sides { front: FloatNode; back: FloatNode }

export interface Light {
  /** The radiance of a surface at world position p facing n (unit), of tone `lit` in the sun and `shadow` out of it. */
  toon(p: Vec3Node, n: Vec3Node, lit: Vec3Node, shadow: Vec3Node): Vec3Node;
  /** The same for a polished surface: `shine` where it mirrors the sun toward the eye. */
  polished(p: Vec3Node, n: Vec3Node, lit: Vec3Node, shadow: Vec3Node, shine: Vec3Node): Vec3Node;
  /** The same for a leaf: lit where the sun reaches either side of it. */
  leaf(p: Vec3Node, n: Vec3Node, lit: Vec3Node, shadow: Vec3Node): Vec3Node;
  /** 0 in shadow … 1 in the sun, the edge between crisp: a surface at p facing n. */
  band(p: Vec3Node, n: Vec3Node): FloatNode;
  /** The band on each side of a thin surface at p whose near side faces n. */
  sides(p: Vec3Node, n: Vec3Node): Sides;
  /** The brightness at p: what a tone is multiplied by to give radiance. */
  level(p: Vec3Node): Vec3Node;
}

/** Where a surface turns to its shadow tone (n · l), and half the width of the edge there: a pixel or two on a near
 *  ship, and never finer than the pixel (a far ship's normals turn within one). */
const TURN = 0.1, EDGE = 0.04;
/** The same for the sun through a thin thing from behind: only where it stands well behind it. */
const THROUGH = 0.35;
/** A cast shadow's edge: the share of the sun (0…1) at which a point is in it, and half the edge's width; the clouds'
 *  shadow's likewise. */
const CAST = 0.5, CAST_EDGE = 0.12, CLOUDED = 0.55, CLOUD_EDGE = 0.06;
/** How much of the light's own colour the level keeps: none would hold every tone as chosen at every hour, all of it
 *  would turn the tones amber under a low sun and blue in the shade. A low sun warms them by this much. */
const TINTED = 0.4;
/** A polished surface's highlight: where n · h passes this, half its edge's width. */
const SHINE = 0.94, SHINE_EDGE = 0.012;
const LUMA = [0.2126, 0.7152, 0.0722] as const;

/** visible(p, n): 0…1, how much of the sun reaches p past what stands on the island (shadow.visible). */
export function createLighting(sky: Sky, below: Below, visible: (p: Vec3Node, n: Vec3Node) => FloatNode): Light {
  /** 1 where no shadow is cast on p: the island's and the clouds', each cut to a crisp edge. */
  const open = (p: Vec3Node, n: Vec3Node): FloatNode => {
    // never finer than the pixel, or the shadow map's texels would show as steps far off
    const seen = visible(p, n).toVar(), w = max(fwidth(seen), CAST_EDGE);
    return smoothstep(w.negate(), w, seen.sub(CAST)).mul(smoothstep(CLOUDED - CLOUD_EDGE, CLOUDED + CLOUD_EDGE, sky.cloudCover(p)));
  };
  const turned = (nl: FloatNode, at: number): FloatNode => {
    const w = max(fwidth(nl), EDGE);
    return smoothstep(w.negate(), w, nl.sub(at));
  };
  const band = (p: Vec3Node, n: Vec3Node): FloatNode => turned(dot(n, sky.sun(p)), TURN).mul(open(p, n));
  const sides = (p: Vec3Node, n: Vec3Node): Sides => {
    const nl = dot(n, sky.sun(p)).toVar(), clear = open(p, n).toVar();
    return { front: turned(nl, TURN).mul(clear), back: turned(nl.negate(), THROUGH).mul(clear) };
  };
  const level = (p: Vec3Node): Vec3Node => {
    const up = normalize(p);
    const sun = sky.sunIlluminance(p).mul(sky.stormSun(p)).mul(below.sun(p)).mul(saturate(dot(up, sky.sun(p)))).div(Math.PI);
    const all = sun.add(sky.ambient(p, up).mul(below.sky(p)));
    return mix(vec3(dot(all, vec3(...LUMA))), all, TINTED);
  };
  const toon = (p: Vec3Node, n: Vec3Node, lit: Vec3Node, shadow: Vec3Node): Vec3Node => mix(shadow, lit, band(p, n)).mul(level(p));
  return {
    toon,
    band,
    sides,
    level,
    polished(p, n, lit, shadow, shine) {
      const l = sky.sun(p), sunlit = band(p, n).toVar();
      const nh = dot(n, normalize(normalize(cameraPosition.sub(p)).add(l)));
      const w = max(fwidth(nh), SHINE_EDGE);
      const glint = smoothstep(float(SHINE).sub(w), float(SHINE).add(w), nh).mul(sunlit);
      return mix(mix(shadow, lit, sunlit), shine, glint).mul(level(p));
    },
    leaf(p, n, lit, shadow) {
      const s = sides(p, n);
      return mix(shadow, lit, max(s.front, s.back)).mul(level(p));
    },
  };
}
