// What the frame has been cut back from to fit the M1 iPad (the first Portolan's pass list, #36). Each effect here is
// parked, not deleted: its code stays where it was, and it comes back by setting its line to false once the frame log
// (shape.ts) shows it fits.
export const PARKED = {
  /** Screen-space global illumination (post.ts): half-resolution ambient occlusion stands in for it. */
  bounce: true,
  /** Screen-space contact shadows (post.ts). */
  contact: true,
  /** The froxel fog round the eye (fog.ts): the mist is worked out along each ray instead. */
  volumeFog: true,
  /** The clouds marched as volumes (clouds.ts): each system is a thin layer instead. */
  cloudVolumes: true,
  /** The lens's depth of field over the lobby and the ceremonies (post.ts). */
  focus: true,
  /** Motion blur and the heat haze bent into it (post.ts). */
  motionBlur: true,
  /** The lens flare's ghosts and the dirt they light (post.ts). */
  flare: true,
  /** The sea's screen-space reflections of the ships and islands (ocean/reflect.ts): it mirrors the sky's probe. */
  seaReflections: true,
  /** The shadow cascades past the second (shadows.ts). */
  farCascades: true,
} as const;
