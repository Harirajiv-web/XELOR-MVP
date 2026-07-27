/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * A BRAIN AS A VOLUME OF POINTS — built once, rotated for ever.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The first brain was a flat drawing. This one is a real three-dimensional surface: points
 * in x, y and z, connected into a mesh, spun about the vertical axis and projected through
 * a perspective camera every frame. Turn it and the far side genuinely goes away from you.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * WHY IT IS GENERATED AND NOT A MODEL FILE
 * ───────────────────────────────────────────────────────────────────────────────
 * A glTF brain would mean a new renderer, a new dependency, and a mesh asset this project
 * does not have — and a solid mesh is the one thing the brief rules out anyway. The form
 * has to be HOLLOW, which means a surface with nothing behind it, which is exactly what a
 * point set on a deformed ellipsoid is. Generating it also means the shape is tunable in
 * numbers rather than in a modelling package.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * DETERMINISTIC, ON PURPOSE
 * ───────────────────────────────────────────────────────────────────────────────
 * No randomness anywhere. A Fibonacci lattice distributes points over a sphere evenly by
 * arithmetic, and every deformation below is a function of position. Two consequences that
 * both matter: the server and the client render the same brain, so hydration is quiet; and
 * the brain looks the same on every load, so it is a thing the company owns rather than a
 * different scribble each time somebody signs in.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** How many points make the surface. Enough to read as a volume, few enough to spin. */
const COUNT = 168;

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/**
 * The deformation that turns a sphere into something brain-shaped.
 *
 * Four things happen, in order, and each is one recognisable feature:
 *
 *   1. THE PROPORTIONS. Wider than it is tall, and slightly longer front-to-back — the
 *      single change that stops it reading as a ball.
 *   2. THE GYRI. A two-frequency ripple over the surface. Cortical folding is what makes a
 *      brain a brain at a glance, and it is what the mesh lines pick out as it turns.
 *   3. THE LONGITUDINAL FISSURE. Points near the vertical midline plane are pulled inward,
 *      cutting the groove that separates the hemispheres. Only on the upper half, because
 *      that is where it is on a brain.
 *   4. THE TEMPORAL TUCK. The underside is drawn in and forward, so the lower rear reads as
 *      cerebellum rather than as the bottom of an egg.
 */
function shape(p: Vec3): Vec3 {
  const { x, y, z } = p;

  /**
   * 2. CORTICAL FOLDING, and this is the whole difference between a brain and a ball.
   *
   * The first attempt used a 5.5% ripple, on the reasoning that restraint was the brief.
   * Rendered and photographed, the result was an egg-shaped wireframe globe — every
   * brain-making deformation was there and none of them was visible past the regularity of
   * the mesh. Restraint applies to the LIGHT, not to the anatomy: a brain that does not
   * read as a brain is not restrained, it is unfinished.
   *
   * So the folds are now deep enough to see, and they run FRONT TO BACK — the direction
   * gyri actually run — rather than as a symmetric ripple in every direction, which is what
   * made the surface look machined.
   */
  const lon = Math.atan2(z, x);
  const fold =
    1 +
    0.15 * Math.sin(5 * lon + 2.4 * y) * Math.cos(2.6 * y * Math.PI) +
    0.075 * Math.sin(8.5 * y + 1.1) +
    0.05 * Math.cos(7 * lon);

  // 1. THE PROPORTIONS: half as long again as it is wide, and clearly flatter than tall.
  let nx = x * 1.34 * fold;
  let ny = y * 0.8 * fold;
  let nz = z * 0.92 * fold;

  /**
   * 3. THE LONGITUDINAL FISSURE — the single line that makes a shape read as a brain.
   *
   * A deep groove down the midline, cutting the top into two hemispheres. Three times its
   * previous depth, and it now pulls the surface DOWN as well as in, so it is visible in
   * silhouette as the form turns rather than only in plan.
   */
  const midline = Math.exp(-((nz / 0.16) ** 2));
  if (ny > -0.15) {
    const above = ny + 0.15;
    nz *= 1 - 0.55 * midline;
    ny -= 0.34 * midline * above;
  }

  // 4. THE FRONTAL POLE drops and narrows — a brain is not symmetrical front to back, and
  //    that asymmetry is most of what tells a viewer which way it is facing.
  if (nx < 0) {
    const t = Math.min(1, -nx / 1.3);
    nx *= 1 - 0.14 * t;
    ny -= 0.16 * t * t;
  }

  // 5. THE TEMPORAL LOBE: the underside tucks in hard and swings forward, which is what
  //    stops the bottom reading as the bottom of an egg.
  if (ny < -0.15) {
    const t = (-ny - 0.15) / 0.85;
    nx *= 1 - 0.34 * t;
    nz *= 1 - 0.42 * t;
    nx -= 0.16 * t;
    ny *= 0.9;
  }

  return { x: nx, y: ny, z: nz };
}

/**
 * THE CEREBELLUM — its own small, tightly folded lobe, tucked under and behind.
 *
 * Generated separately rather than deformed out of the main ellipsoid, because it is
 * genuinely a separate structure and trying to grow it from the same surface produced a
 * bulge rather than a lobe. Its folds are finer and denser than the cortex above it, which
 * is both anatomically right and the thing that makes it legible as a different organ at a
 * glance.
 */
function cerebellum(i: number, n: number): Vec3 {
  const y = 1 - (i / (n - 1)) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const a = GOLDEN * i;
  const ridge = 1 + 0.13 * Math.sin(11 * y);
  return {
    x: 0.62 + Math.cos(a) * r * 0.34 * ridge,
    y: -0.62 + y * 0.26 * ridge,
    z: Math.sin(a) * r * 0.36 * ridge,
  };
}

/** Points on the cerebellum. Enough to read as a dense little lobe, no more. */
const CEREBELLUM_COUNT = 34;

/**
 * The surface, as points. Hollow — nothing is generated inside it.
 *
 * Cortex first, cerebellum after. The mesh below joins nearest neighbours, so keeping the
 * two sets spatially separate is what stops filaments stitching straight across the gap
 * between them and welding the two structures into one blob.
 */
export const BRAIN_POINTS: readonly Vec3[] = [
  ...Array.from({ length: COUNT }, (_, i) => {
    // Fibonacci lattice: even coverage with no clumps and no seams, from arithmetic alone.
    const y = 1 - (i / (COUNT - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = GOLDEN * i;
    return shape({ x: Math.cos(a) * r, y, z: Math.sin(a) * r });
  }),
  ...Array.from({ length: CEREBELLUM_COUNT }, (_, i) => cerebellum(i, CEREBELLUM_COUNT)),
];

/**
 * The mesh. Every point joined to its two nearest neighbours, deduplicated.
 *
 * Nearest-neighbour rather than a triangulation because the result should read as neural
 * filaments, not as a polygon cage — an even triangle mesh looks like a 3D wireframe from
 * a modelling tool, which is precisely the "gaming look" the brief rules out. Two links per
 * point gives a wandering, organic web that still describes the surface.
 */
export const BRAIN_EDGES: readonly (readonly [number, number])[] = (() => {
  const out = new Set<string>();
  BRAIN_POINTS.forEach((p, i) => {
    const near = BRAIN_POINTS.map((q, j) => ({
      j,
      d: (p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2,
    }))
      .filter((n) => n.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    for (const n of near) out.add(i < n.j ? `${i}:${n.j}` : `${n.j}:${i}`);
  });
  return [...out].map((k) => {
    const [a, b] = k.split(":");
    return [Number(a), Number(b)] as const;
  });
})();

/**
 * The brainstem, as a short chain of points hanging below and behind the mass. Three
 * segments is enough to read; more starts to look like a tail.
 */
export const BRAIN_STEM: readonly Vec3[] = [
  { x: 0.3, y: -0.72, z: 0.02 },
  { x: 0.34, y: -0.92, z: 0.03 },
  { x: 0.36, y: -1.12, z: 0.04 },
];

/** Rotate about the vertical axis, then project through a simple perspective camera. */
export function project(
  p: Vec3,
  angle: number,
  scale: number,
  fov: number,
): { x: number; y: number; depth: number } {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const rx = p.x * c - p.z * s;
  const rz = p.x * s + p.z * c;
  // Nearer points are magnified; `depth` runs 0 (far) → 1 (near) and is what every visual
  // cue below reads from, so the sense of volume comes from one number rather than from
  // several that could disagree.
  const k = fov / (fov + rz);
  return {
    x: rx * scale * k,
    // NEGATED, and this was a real bug rather than a preference. The geometry above is
    // authored in world coordinates where +y is UP — that is what "the underside tucks in"
    // and "the frontal pole drops" mean. SVG's y-axis runs DOWNWARD. Projecting `p.y`
    // straight through rendered the entire brain upside down: the cerebellum sat on the
    // crown and the brainstem stuck up out of the top like an antenna, which is precisely
    // how the first screenshot of it looked and precisely why it was not reading as a brain.
    y: -p.y * scale * k,
    depth: (rz + 1.4) / 2.8,
  };
}
