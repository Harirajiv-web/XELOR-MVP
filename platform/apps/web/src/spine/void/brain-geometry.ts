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
const NEIGHBOURS = 3;

const dist2 = (a: Vec3, b: Vec3): number =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;

/**
 * The mesh, in two passes: nearest neighbours, then a repair that guarantees ONE piece.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * WHY THREE — AND WHAT WAS ACTUALLY WRONG WITH TWO
 * ───────────────────────────────────────────────────────────────────────────────
 * The obvious diagnosis for a silhouette that looks broken is that the graph is in pieces.
 * Measured over these 202 points, that was NOT the problem:
 *
 *     k = 1   150 edges   52 components   broken
 *     k = 2   258 edges    1 component    whole
 *     k = 3   365 edges    1 component    whole
 *
 * Two neighbours already produced a single connected object. What it did not produce was a
 * COHESIVE one: 258 filaments over 202 points is barely more than a spanning path, so most
 * points sat on a thread with one way in and one way out. Connected is a property of the
 * graph; cohesive is a property of the picture, and a thin wandering thread reads as gaps
 * and floating fragments however provably joined it is.
 *
 * Three neighbours adds a hundred more filaments and closes the lattice into something that
 * holds an edge from any angle — without filling it in, which is the other failure mode.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * THE REPAIR PASS IS A GUARANTEE, NOT A FIX
 * ───────────────────────────────────────────────────────────────────────────────
 * Union-find finds any components that remain and stitches each to the rest by its single
 * shortest crossing edge — the fewest lines that can make the figure whole. On the current
 * geometry it adds ZERO, because k = 3 was already connected. It is kept because whether a
 * point set is connected at a given k is a property of that point set: tune the anatomy and
 * the guarantee still holds, instead of a silent island appearing at one rotation angle.
 *
 * `BRAIN_MESH` reports the outcome and the Brain publishes it to the DOM, so the harness
 * checks facts rather than inferring them from a picture.
 */
const buildMesh = (): { edges: [number, number][]; components: number; repaired: number } => {
  const out = new Set<string>();
  const key = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

  BRAIN_POINTS.forEach((p, i) => {
    const near = BRAIN_POINTS.map((q, j) => ({ j, d: dist2(p, q) }))
      .filter((n) => n.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, NEIGHBOURS);
    for (const n of near) out.add(key(i, n.j));
  });

  // ── union-find ──────────────────────────────────────────────────────────────
  const parent = BRAIN_POINTS.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r] as number;
    let c = i;
    while (parent[c] !== r) {
      const next = parent[c] as number;
      parent[c] = r;
      c = next;
    }
    return r;
  };
  const union = (a: number, b: number): boolean => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return false;
    parent[rb] = ra;
    return true;
  };
  for (const k of out) {
    const [a, b] = k.split(":");
    union(Number(a), Number(b));
  }

  const componentsBefore = new Set(BRAIN_POINTS.map((_, i) => find(i))).size;

  // ── repair: stitch each remaining component by its shortest crossing edge ────
  let repaired = 0;
  let guard = 0;
  while (new Set(BRAIN_POINTS.map((_, i) => find(i))).size > 1 && guard++ < BRAIN_POINTS.length) {
    let bestA = -1;
    let bestB = -1;
    let bestD = Infinity;
    for (let i = 0; i < BRAIN_POINTS.length; i++) {
      const pi = BRAIN_POINTS[i];
      if (!pi) continue;
      for (let j = i + 1; j < BRAIN_POINTS.length; j++) {
        const pj = BRAIN_POINTS[j];
        if (!pj || find(i) === find(j)) continue;
        const d = dist2(pi, pj);
        if (d < bestD) {
          bestD = d;
          bestA = i;
          bestB = j;
        }
      }
    }
    if (bestA < 0 || bestB < 0) break;
    out.add(key(bestA, bestB));
    union(bestA, bestB);
    repaired++;
  }

  const edges = [...out].map((k) => {
    const [a, b] = k.split(":");
    return [Number(a), Number(b)] as [number, number];
  });
  return { edges, components: componentsBefore, repaired };
};

const MESH = buildMesh();

export const BRAIN_EDGES: readonly (readonly [number, number])[] = MESH.edges;

/**
 * What the mesh actually came out as. Published to the DOM by the Brain so connectivity can
 * be asserted rather than eyeballed — a broken silhouette is invisible from most angles and
 * obvious from one, which is the worst way for a defect to behave.
 */
export const BRAIN_MESH = {
  nodes: BRAIN_POINTS.length,
  edges: MESH.edges.length,
  /** Components BEFORE the repair. Reported for interest; after the repair it is always 1. */
  componentsBeforeRepair: MESH.components,
  /** Edges the repair had to add to make the figure one object. */
  repairEdges: MESH.repaired,
} as const;

/**
 * The brainstem, as a short chain of points hanging below and behind the mass. Three
 * segments is enough to read; more starts to look like a tail.
 */
export const BRAIN_STEM: readonly Vec3[] = [
  { x: 0.3, y: -0.72, z: 0.02 },
  { x: 0.34, y: -0.92, z: 0.03 },
  { x: 0.36, y: -1.12, z: 0.04 },
];

/**
 * A viewBox that centres the figure on what it actually SWEEPS, not on the origin.
 *
 * The geometry is not symmetric about (0,0): the cerebellum is offset behind and below, the
 * frontal pole drops, and the brainstem hangs underneath. So a hand-written viewBox centred
 * on the origin puts the drawing off-centre — and the correction is not a constant, because
 * the silhouette changes shape as the model turns.
 *
 * Sampling the projection right around one revolution and framing the UNION is what makes it
 * sit still: centring each frame individually would keep the figure nailed to the middle
 * while its outline visibly slid around inside it, which is a worse artefact than a fixed
 * offset. This is the same reasoning the floor plan's camera fit uses.
 */
export function brainViewBox(scale: number, fov: number, pad = 1.06): string {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const all = [...BRAIN_POINTS, ...BRAIN_STEM];
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 36) {
    for (const p of all) {
      const q = project(p, a, scale, fov);
      if (q.x < minX) minX = q.x;
      if (q.x > maxX) maxX = q.x;
      if (q.y < minY) minY = q.y;
      if (q.y > maxY) maxY = q.y;
    }
  }
  // One square box around the union, so the figure keeps its proportions inside a square
  // button and the breathing animation has room at every edge.
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const half = (Math.max(maxX - minX, maxY - minY) / 2) * pad;
  return `${(cx - half).toFixed(1)} ${(cy - half).toFixed(1)} ${(half * 2).toFixed(1)} ${(half * 2).toFixed(1)}`;
}

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
