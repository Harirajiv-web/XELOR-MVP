/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * THE GAUSSIAN FIELD — a 3D Gaussian Splatting background for the void.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This is EWA splatting, the technique behind 3D Gaussian Splatting, implemented directly:
 * every particle is an anisotropic 3D Gaussian with its own covariance, projected to a 2D
 * screen-space Gaussian per frame through the local affine approximation of the perspective
 * projection, then composited back-to-front. It is NOT a billboard particle system with a
 * blurry sprite — the shape of each splat on screen is derived from its 3D covariance and
 * the camera, so a splat lying edge-on to the viewer genuinely renders as a thin sliver and
 * turns into a disc as the camera comes around it.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * WHERE THE GAUSSIANS COME FROM, AND WHAT THIS IS NOT
 * ───────────────────────────────────────────────────────────────────────────────
 * A published 3DGS scene is TRAINED: photographs → structure-from-motion → gradient descent
 * on millions of Gaussians until they reproduce the photographs. There is no such asset in
 * this repository and one cannot be conjured, so the Gaussians here are AUTHORED — placed on
 * a seeded lattice of drifting shells, with covariances stretched along their orbit so the
 * field reads as flowing rather than as fog.
 *
 * That distinction matters and should not be blurred in a demo: this is a real splat
 * renderer showing synthetic data, not a photoscan of anybody's factory. Nobody should be
 * told otherwise in a room with investors in it.
 *
 * Swapping in a trained scene is a reader, not a rewrite: `buildField()` is the only thing
 * that invents Gaussians, and it returns the same `Splat[]` — position, covariance, colour,
 * opacity — that a `.ply` from the reference 3DGS implementation stores per row. A loader
 * that parses that file into this shape is the entire change.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * WHY IT IS ALLOWED TO EXIST AT ALL
 * ───────────────────────────────────────────────────────────────────────────────
 * `CLAUDE.md` is explicit that a scene must never be able to make this page unresponsive —
 * on a machine with no GPU the login backdrop's bloom pass once saturated the main thread so
 * completely that the Sign In button stopped responding to clicks. The same obligation is
 * inherited here and discharged the same way:
 *
 *   · No WebGL2 → nothing mounts, and the CSS aurora washes behind it are the whole
 *     background. The scene is decorative and its absence costs nothing.
 *   · A software renderer, ≤4 cores or ≤4 GB → `budget()` returns 0 and nothing mounts.
 *   · `prefers-reduced-motion` → the field is drawn ONCE and the loop never starts. A person
 *     who has asked for stillness gets a still picture, not a slower drift.
 *   · A frame watchdog: if drawing costs more than `FRAME_BUDGET_MS` over a sustained
 *     window, the field halves its splat count, and if it is still slow it stops for good.
 *
 * Sorting is the other half of the cost. Correct alpha compositing needs back-to-front
 * order, which changes as the camera moves, so it is a per-frame O(n) counting sort over
 * quantised view depth rather than a comparison sort — at these counts it costs under a
 * tenth of a millisecond and does not allocate.
 */

import {
  BufferAttribute,
  Color,
  CustomBlending,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderer,
} from "three";

/* ───────────────────────────────── tuning ───────────────────────────────── */

/** Splats at full budget. Chosen against the frame watchdog, not by eye. */
const FULL_COUNT = 2600;
/** Above this, a frame is costing more than a third of a 60 Hz budget on drawing alone. */
const FRAME_BUDGET_MS = 5.5;
/** How many consecutive slow frames before the field sheds load. */
const SLOW_FRAMES_BEFORE_SHED = 45;
/** The Gaussian is truncated here; past 3σ it contributes less than 1.2% of its peak. */
const CUTOFF_SIGMA = 3;

export interface GaussianFieldHandle {
  /** Repaint for a new theme without rebuilding the geometry. */
  setTheme(theme: "dark" | "light"): void;
  /** Release the GL context, the buffers and every listener. */
  dispose(): void;
  /** Diagnostics the harness reads instead of inferring from a picture. */
  stats(): { splats: number; running: boolean; shed: number };
}

export interface GaussianFieldOptions {
  theme: "dark" | "light";
  /** A person asked for stillness: draw one frame, never start the loop. */
  reduced: boolean;
  /** Weak machine: halve the field before it ever runs. */
  lowPower: boolean;
  /** Accent colours the field is tinted with — the department palette, so the background
   *  belongs to the same picture as the map in front of it. */
  accents: readonly string[];
}

/* ─────────────────────────── capability, up front ─────────────────────────── */

/**
 * Is this a software rasteriser pretending to be a GPU?
 *
 * SwiftShader, llvmpipe and Microsoft's Basic Render Driver all answer WebGL calls perfectly
 * and then draw at four frames a second. The renderer string is the only honest signal
 * available before anything has been drawn, and getting this wrong is not a cosmetic
 * mistake — it is the login-form-stops-responding bug in `floorplan-scene.ts`.
 */
function isSoftwareRenderer(gl: WebGL2RenderingContext): boolean {
  try {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return false;
    const raw = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? "").toLowerCase();
    return (
      raw.includes("swiftshader") ||
      raw.includes("llvmpipe") ||
      raw.includes("software") ||
      raw.includes("basic render") ||
      raw.includes("microsoft basic")
    );
  } catch {
    return false;
  }
}

/** How many splats this machine has earned. Zero means: do not mount at all. */
function budget(gl: WebGL2RenderingContext, lowPower: boolean): number {
  if (isSoftwareRenderer(gl)) return 0;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 8;
  const memory = nav.deviceMemory ?? 8;
  if (cores <= 4 || memory <= 4) return 0;
  if (lowPower) return Math.round(FULL_COUNT / 2);
  return FULL_COUNT;
}

/* ──────────────────────────── the authored field ──────────────────────────── */

/**
 * A deterministic PRNG.
 *
 * `Math.random()` would give a different sky on every reload, which sounds harmless and is
 * not: this screen is the frame somebody stands in front of while they present, and a
 * background that is subtly different in every screenshot of the same slide is a background
 * nobody can sign off. Seeded, so the field is a fact about the build.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Splat {
  p: Vector3;
  /** Upper triangle of the symmetric 3×3 covariance: xx, xy, xz, yy, yz, zz. */
  cov: [number, number, number, number, number, number];
  color: Color;
  opacity: number;
  /** Radians per second around Y — the field drifts rather than sits. */
  spin: number;
  radius: number;
  height: number;
  phase: number;
}

/**
 * Σ = R·S·Sᵀ·Rᵀ for a Gaussian scaled by `s` and rotated by the quaternion `q`.
 *
 * Written out rather than assembled from matrix classes because only the upper triangle is
 * ever needed and this runs once per splat at build time; the shader consumes the six
 * numbers directly.
 */
function covarianceOf(
  s: [number, number, number],
  q: [number, number, number, number],
): [number, number, number, number, number, number] {
  const [x, y, z, w] = q;
  // Rotation matrix from the quaternion, column-major by rows below.
  const r00 = 1 - 2 * (y * y + z * z);
  const r01 = 2 * (x * y - w * z);
  const r02 = 2 * (x * z + w * y);
  const r10 = 2 * (x * y + w * z);
  const r11 = 1 - 2 * (x * x + z * z);
  const r12 = 2 * (y * z - w * x);
  const r20 = 2 * (x * z - w * y);
  const r21 = 2 * (y * z + w * x);
  const r22 = 1 - 2 * (x * x + y * y);
  // M = R·S, then Σ = M·Mᵀ.
  const m00 = r00 * s[0];
  const m01 = r01 * s[1];
  const m02 = r02 * s[2];
  const m10 = r10 * s[0];
  const m11 = r11 * s[1];
  const m12 = r12 * s[2];
  const m20 = r20 * s[0];
  const m21 = r21 * s[1];
  const m22 = r22 * s[2];
  return [
    m00 * m00 + m01 * m01 + m02 * m02,
    m00 * m10 + m01 * m11 + m02 * m12,
    m00 * m20 + m01 * m21 + m02 * m22,
    m10 * m10 + m11 * m11 + m12 * m12,
    m10 * m20 + m11 * m21 + m12 * m22,
    m20 * m20 + m21 * m21 + m22 * m22,
  ];
}

/**
 * The scene itself: three nested shells of Gaussians on slow retrograde orbits.
 *
 * Each splat is stretched ALONG its own orbit (the long axis of the covariance is the
 * tangent, not an arbitrary direction) which is what makes the field read as current rather
 * than as dust. The innermost shell is sparse and bright and sits behind the hub; the outer
 * two are wide, dim and large, and do the work of removing the flat rectangle.
 */
function buildField(
  count: number,
  accents: readonly string[],
  rand: () => number,
): Splat[] {
  const palette = accents.map((hex) => new Color(hex));
  const splats: Splat[] = [];

  for (let i = 0; i < count; i++) {
    // Three shells, weighted so most of the field is in the wide outer band.
    const band = rand();
    const shell = band < 0.18 ? 0 : band < 0.55 ? 1 : 2;
    const radius =
      shell === 0 ? 1.6 + rand() * 1.5 : shell === 1 ? 3.4 + rand() * 2.6 : 6.2 + rand() * 4.4;

    const theta = rand() * Math.PI * 2;
    // Flattened vertically: the map in front is an ellipse and so is the volume behind it.
    const height = (rand() - 0.5) * (shell === 0 ? 1.5 : shell === 1 ? 3.0 : 4.6);

    const p = new Vector3(radius * Math.cos(theta), height, radius * Math.sin(theta));

    // The long axis follows the tangent of the orbit; the other two are thin, so each splat
    // is a streak in the direction it is travelling.
    const tangent = new Vector3(-Math.sin(theta), 0, Math.cos(theta)).normalize();
    const half = Math.acos(Math.max(-1, Math.min(1, tangent.dot(new Vector3(1, 0, 0)))));
    const axis = new Vector3(1, 0, 0).cross(tangent).normalize();
    const sinH = Math.sin(half / 2);
    const q: [number, number, number, number] = [
      axis.x * sinH,
      axis.y * sinH,
      axis.z * sinH,
      Math.cos(half / 2),
    ];

    const long = (shell === 0 ? 0.085 : shell === 1 ? 0.17 : 0.30) * (0.55 + rand());
    const short = long * (0.12 + rand() * 0.22);
    const cov = covarianceOf([long, short, short], q);

    const base = palette[Math.floor(rand() * palette.length)] ?? new Color("#3ddc97");
    const color = base.clone();
    // The accents are chosen to sit on a near-black panel as line work. Composited at two
    // percent alpha and stacked they collapse to grey, so the field is given back the
    // saturation the compositing takes away — otherwise the department palette is present in
    // the data and invisible on the screen, which is the same as not being there.
    // Push a third of the field toward white so the palette reads as light passing through
    // the accents rather than as six coloured clouds.
    color.offsetHSL(0, 0.22, 0.06);
    if (rand() < 0.16) color.lerp(new Color("#ffffff"), 0.18 + rand() * 0.24);

    splats.push({
      p,
      cov,
      color,
      opacity:
        (shell === 0 ? 0.072 : shell === 1 ? 0.040 : 0.022) * (0.45 + rand() * 0.75),
      // Retrograde and slower further out, so the shells shear against each other. A field
      // rotating rigidly reads as a spinning object rather than as a volume.
      spin: (shell === 0 ? -0.055 : shell === 1 ? -0.032 : -0.018) * (0.7 + rand() * 0.6),
      radius,
      height,
      phase: theta,
    });
  }
  return splats;
}

/* ─────────────────────────────── the shaders ─────────────────────────────── */

/**
 * The projection is the whole technique, so it is worth naming what each step is.
 *
 * `J` is the Jacobian of the perspective divide at this splat's view-space position — the
 * best affine approximation of the projection near that point. `Σ' = J·W·Σ·Wᵀ·Jᵀ` carries
 * the 3D covariance into screen space through it. The `+ 0.3·I` is the standard low-pass
 * term: without it a splat smaller than a pixel aliases into a flickering dot as the camera
 * moves, and this scene moves continuously.
 *
 * The quad is then sized from the EIGENVALUES of Σ' — its true screen-space axes — rather
 * than from a bounding circle, which is what keeps a near-edge-on splat cheap instead of
 * reserving a full disc of fragments it will not use.
 */
const VERTEX = /* glsl */ `
precision highp float;

attribute vec2 corner;
attribute vec3 iPos;
attribute vec3 iCovA;   // xx, xy, xz
attribute vec3 iCovB;   // yy, yz, zz
attribute vec3 iColor;
attribute float iOpacity;

uniform vec2 uViewport;   // px
uniform vec2 uFocal;      // px
uniform float uCutoff;
uniform float uGain;

varying vec3 vColor;
varying float vOpacity;
varying vec3 vConic;
varying vec2 vDelta;

void main() {
  vec4 view = modelViewMatrix * vec4(iPos, 1.0);
  if (view.z > -0.15) {           // behind, or in the singular region of the divide
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  mat3 Sigma = mat3(
    iCovA.x, iCovA.y, iCovA.z,
    iCovA.y, iCovB.x, iCovB.y,
    iCovA.z, iCovB.y, iCovB.z
  );

  float zInv = 1.0 / view.z;
  float zInv2 = zInv * zInv;
  mat3 J = mat3(
    uFocal.x * zInv, 0.0,             -uFocal.x * view.x * zInv2,
    0.0,             uFocal.y * zInv, -uFocal.y * view.y * zInv2,
    0.0,             0.0,             0.0
  );

  mat3 W = mat3(modelViewMatrix);
  mat3 T = J * W;
  mat3 cov2 = T * Sigma * transpose(T);

  // Low-pass so a sub-pixel splat cannot alias into a flickering dot.
  float a = cov2[0][0] + 0.3;
  float b = cov2[0][1];
  float c = cov2[1][1] + 0.3;

  float det = a * c - b * b;
  if (det <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  // Eigenvalues of the 2x2 give the true screen-space axes.
  float mid = 0.5 * (a + c);
  float disc = sqrt(max(0.01, mid * mid - det));
  float l1 = mid + disc;
  float l2 = max(0.01, mid - disc);
  vec2 major = normalize(abs(b) < 1e-6 ? vec2(1.0, 0.0) : vec2(b, l1 - a));
  vec2 minorAxis = vec2(-major.y, major.x);

  vec2 offset = corner.x * major * uCutoff * sqrt(l1)
              + corner.y * minorAxis * uCutoff * sqrt(l2);

  vec4 clip = projectionMatrix * view;
  gl_Position = clip;
  gl_Position.xy += (offset / uViewport) * 2.0 * clip.w;

  // The conic is the inverse covariance; the fragment evaluates the Gaussian with it.
  vConic = vec3(c, -b, a) / det;
  vDelta = offset;
  vColor = iColor;
  vOpacity = iOpacity * uGain;
}
`;

const FRAGMENT = /* glsl */ `
precision highp float;

varying vec3 vColor;
varying float vOpacity;
varying vec3 vConic;
varying vec2 vDelta;

void main() {
  // The Gaussian itself: exp(-½ dᵀ Σ'⁻¹ d), evaluated in screen space.
  float power = -0.5 * (vConic.x * vDelta.x * vDelta.x + vConic.z * vDelta.y * vDelta.y)
              - vConic.y * vDelta.x * vDelta.y;
  if (power > 0.0) discard;
  float alpha = vOpacity * exp(power);
  if (alpha < 0.0035) discard;   // cheaper than compositing a splat nobody can see
  gl_FragColor = vec4(vColor * alpha, alpha);
}
`;

/* ────────────────────────────────── mount ────────────────────────────────── */

export function createGaussianField(
  canvas: HTMLCanvasElement,
  opts: GaussianFieldOptions,
): GaussianFieldHandle | null {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    depth: false,
    premultipliedAlpha: true,
    powerPreference: "low-power",
  });
  if (!gl) return null;

  const count = budget(gl, opts.lowPower);
  if (count === 0) return null;

  const renderer = new WebGLRenderer({ canvas, context: gl, alpha: true, antialias: false });
  renderer.setClearColor(0x000000, 0);
  // Splats are large and soft; rendering them at 3× on a Retina panel buys nothing a person
  // can see and costs nine times the fragments.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

  const scene = new Scene();
  const camera = new PerspectiveCamera(46, 1, 0.1, 100);

  const splats = buildField(count, opts.accents, mulberry32(0x5eed));

  const geometry = new InstancedBufferGeometry();
  geometry.instanceCount = count;
  // One quad, expanded per instance to the splat's own screen-space axes.
  geometry.setAttribute(
    "corner",
    new BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2),
  );
  geometry.setIndex(new BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));

  const posArr = new Float32Array(count * 3);
  const covA = new Float32Array(count * 3);
  const covB = new Float32Array(count * 3);
  const colArr = new Float32Array(count * 3);
  const opaArr = new Float32Array(count);

  const posAttr = new InstancedBufferAttribute(posArr, 3);
  const colAttr = new InstancedBufferAttribute(colArr, 3);
  const opaAttr = new InstancedBufferAttribute(opaArr, 1);
  posAttr.setUsage(DynamicDrawUsage);
  colAttr.setUsage(DynamicDrawUsage);
  opaAttr.setUsage(DynamicDrawUsage);
  geometry.setAttribute("iPos", posAttr);
  geometry.setAttribute("iCovA", new InstancedBufferAttribute(covA, 3));
  geometry.setAttribute("iCovB", new InstancedBufferAttribute(covB, 3));
  geometry.setAttribute("iColor", colAttr);
  geometry.setAttribute("iOpacity", opaAttr);

  for (let i = 0; i < count; i++) {
    const s = splats[i];
    if (!s) continue;
    covA[i * 3] = s.cov[0];
    covA[i * 3 + 1] = s.cov[1];
    covA[i * 3 + 2] = s.cov[2];
    covB[i * 3] = s.cov[3];
    covB[i * 3 + 1] = s.cov[4];
    covB[i * 3 + 2] = s.cov[5];
  }

  const material = new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    // Premultiplied "over": the fragment shader already multiplies colour by alpha, so the
    // source factor is ONE. Using SRC_ALPHA here would multiply it a second time and the
    // field would go muddy exactly where it overlaps itself, which is everywhere.
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    uniforms: {
      uViewport: { value: [1, 1] },
      uFocal: { value: [1, 1] },
      uCutoff: { value: CUTOFF_SIGMA },
      uGain: { value: opts.theme === "dark" ? 1 : 0.30 },
    },
  });

  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  /* ───────────────────────── per-frame: orbit, sort, upload ───────────────────────── */

  const order = new Uint32Array(count);
  const depths = new Float32Array(count);
  const BUCKETS = 2048;
  const histogram = new Uint32Array(BUCKETS);
  const cursor = new Uint32Array(BUCKETS);
  const live = { x: new Float32Array(count), y: new Float32Array(count), z: new Float32Array(count) };

  for (let i = 0; i < count; i++) {
    const s = splats[i];
    if (!s) continue;
    live.x[i] = s.p.x;
    live.y[i] = s.p.y;
    live.z[i] = s.p.z;
  }

  /**
   * A COUNTING SORT ON QUANTISED DEPTH, back to front.
   *
   * Correct alpha compositing is order-dependent and the order changes every frame the
   * camera moves, so this runs every frame. `Array.prototype.sort` on 2600 elements with a
   * comparator allocates and costs roughly 0.6 ms; this is two linear passes over typed
   * arrays, allocates nothing, and does not care that the depths are floats because a
   * background field cannot show the difference between adjacent buckets.
   */
  function sortByDepth(): void {
    const m = camera.matrixWorldInverse.elements;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < count; i++) {
      const x = live.x[i] ?? 0;
      const y = live.y[i] ?? 0;
      const z = live.z[i] ?? 0;
      // Row 3 of the view matrix: the view-space z of the point.
      const d = (m[2] ?? 0) * x + (m[6] ?? 0) * y + (m[10] ?? 0) * z + (m[14] ?? 0);
      depths[i] = d;
      if (d < lo) lo = d;
      if (d > hi) hi = d;
    }
    const span = hi - lo || 1;
    histogram.fill(0);
    for (let i = 0; i < count; i++) {
      // Ascending view z == farthest first, which is the order "over" compositing needs.
      const b = Math.min(BUCKETS - 1, Math.max(0, ((((depths[i] ?? 0) - lo) / span) * (BUCKETS - 1)) | 0));
      histogram[b] = (histogram[b] ?? 0) + 1;
    }
    let running = 0;
    for (let b = 0; b < BUCKETS; b++) {
      cursor[b] = running;
      running += histogram[b] ?? 0;
    }
    for (let i = 0; i < count; i++) {
      const b = Math.min(BUCKETS - 1, Math.max(0, ((((depths[i] ?? 0) - lo) / span) * (BUCKETS - 1)) | 0));
      const at = cursor[b] ?? 0;
      order[at] = i;
      cursor[b] = at + 1;
    }
  }

  function writeInstances(): void {
    for (let k = 0; k < count; k++) {
      const i = order[k] ?? 0;
      const s = splats[i];
      if (!s) continue;
      posArr[k * 3] = live.x[i] ?? 0;
      posArr[k * 3 + 1] = live.y[i] ?? 0;
      posArr[k * 3 + 2] = live.z[i] ?? 0;
      colArr[k * 3] = s.color.r;
      colArr[k * 3 + 1] = s.color.g;
      colArr[k * 3 + 2] = s.color.b;
      opaArr[k] = s.opacity;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    opaAttr.needsUpdate = true;
  }

  function resize(): void {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const dpr = renderer.getPixelRatio();
    const pw = w * dpr;
    const ph = h * dpr;
    // Focal length in pixels, which is what the Jacobian is expressed in.
    const fy = ph / (2 * Math.tan((camera.fov * Math.PI) / 360));
    material.uniforms.uViewport!.value = [pw, ph];
    material.uniforms.uFocal!.value = [fy, fy];
  }

  let raf = 0;
  let running = false;
  let shed = 0;
  let slowFrames = 0;
  let t0 = 0;

  function drawAt(seconds: number): void {
    for (let i = 0; i < count; i++) {
      const s = splats[i];
      if (!s) continue;
      const a = s.phase + s.spin * seconds;
      live.x[i] = s.radius * Math.cos(a);
      live.z[i] = s.radius * Math.sin(a);
      // A slow vertical breathe, out of phase per splat, so the shells are not rigid discs.
      live.y[i] = s.height + Math.sin(seconds * 0.18 + s.phase * 2.1) * 0.16;
    }
    // A long, shallow camera arc. The parallax between shells is what says "volume"; the
    // camera barely moves and the field does most of the work.
    const orbit = seconds * 0.021;
    camera.position.set(Math.sin(orbit) * 2.2, 1.3 + Math.sin(seconds * 0.05) * 0.4, 12.5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    sortByDepth();
    writeInstances();
    renderer.render(scene, camera);
  }

  function frame(now: number): void {
    if (!running) return;
    if (t0 === 0) t0 = now;
    const started = performance.now();
    drawAt((now - t0) / 1000);
    const cost = performance.now() - started;

    // THE WATCHDOG. A background is never worth a janky foreground, so it sheds itself.
    if (cost > FRAME_BUDGET_MS) {
      slowFrames++;
      if (slowFrames >= SLOW_FRAMES_BEFORE_SHED) {
        slowFrames = 0;
        shed++;
        if (shed >= 2) {
          running = false;
          renderer.clear();
          return;
        }
        geometry.instanceCount = Math.max(200, Math.floor(geometry.instanceCount / 2));
      }
    } else if (slowFrames > 0) {
      slowFrames--;
    }
    raf = requestAnimationFrame(frame);
  }

  const onResize = (): void => {
    resize();
    if (!running) drawAt(0);
  };
  window.addEventListener("resize", onResize, { passive: true });

  // The tab going away should cost nothing. `requestAnimationFrame` already throttles in a
  // hidden tab in every current browser, but it is not specified to stop, and this loop
  // sorts 2600 splats per tick.
  const onVisibility = (): void => {
    if (document.hidden) {
      running = false;
      cancelAnimationFrame(raf);
    } else if (!opts.reduced && shed < 2) {
      running = true;
      t0 = 0;
      raf = requestAnimationFrame(frame);
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  resize();
  if (opts.reduced) {
    // One frame, then nothing. Stillness was asked for; a slower drift is not stillness.
    drawAt(0);
  } else {
    running = true;
    raf = requestAnimationFrame(frame);
  }

  return {
    setTheme(theme) {
      material.uniforms.uGain!.value = theme === "dark" ? 1 : 0.30;
      if (!running) drawAt(0);
    },
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    },
    stats: () => ({ splats: geometry.instanceCount, running, shed }),
  };
}
