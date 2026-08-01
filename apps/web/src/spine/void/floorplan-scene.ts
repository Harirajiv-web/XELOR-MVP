/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * THE FLOOR PLAN SCENE — the factory, revolving, with no framework underneath it.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * A hollow white edge model of the real ground-floor plan (machine shop, paint shop,
 * fabrication, materials, goods out), turning slowly in a near-black void.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT A REACT COMPONENT ANY MORE
 * ───────────────────────────────────────────────────────────────────────────────
 * It used to be one, and it lived behind the Brain. It now lives behind the SIGN-IN FORM,
 * and that page is not ours: it is rendered by Keycloak from a FreeMarker template, with no
 * React on it and no bundler in front of it. A React component cannot mount there.
 *
 * So the scene is a plain function — hand it an element, it fills it and returns the way to
 * take it down again. That is the whole interface, and it is deliberately the smallest one
 * that works, because it now has to satisfy two callers that share nothing else: a Keycloak
 * theme, and (should it ever be wanted again) a React wrapper of about ten lines.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * WHAT IT REFUSES TO COST
 * ───────────────────────────────────────────────────────────────────────────────
 * This is now the FIRST screen of the product — before sign-in, on the one machine we do not
 * get to choose. So:
 *
 *   `reduced`  — a PERSON asking for less motion. The plan stops revolving and holds a still
 *                frame. It is not removed; they asked for stillness, not a blank screen.
 *   `lowPower` — a MACHINE that will stutter. The bloom pass goes (it is the expensive part
 *                by a wide margin) and the pixel ratio is capped harder. The lines stay,
 *                just without the halo.
 *
 * And if WebGL cannot start at all — an old office PC, a blocked context, a driver the
 * browser has blacklisted — `mount` returns null and says nothing. Scenery that takes the
 * sign-in form down with it would be an absurd trade, and it is a far worse trade here than
 * it was behind the Brain: nobody can work around a login page that will not paint.
 */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { buildFloorPlan, SCENE_PALETTE, type SceneTheme } from "./floorplan-geometry";

/**
 * The void's own near-black. Not pure #000: on an OLED panel that is a hole with hard edges
 * where the glow stops.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * AND THE CANVAS DOES NOT PAINT IT — THE PAGE UNDERNEATH DOES
 * ───────────────────────────────────────────────────────────────────────────────
 * This used to be the renderer's clear colour. Measured on the composited frame, the corner
 * of the canvas came out `rgb(32, 39, 57)` — a washed-out slate, nowhere near the near-black
 * it was set to, and unmistakably `#04060c` with the sRGB encode applied to it one extra
 * time (4 → 30, 6 → 38, 12 → 57; measured 32, 39, 57).
 *
 * The cause is the post-processing chain: `OutputPass` exists to convert the composer's
 * LINEAR working buffer to sRGB on the way out, and the clear colour was reaching that
 * buffer already sRGB-encoded, so it was encoded twice. Compensating by pre-dividing the
 * value would work today and silently turn the scene too dark the moment three.js corrects
 * the round trip.
 *
 * So the canvas clears to (0, 0, 0, 0) instead and the SURFACE BEHIND IT supplies the
 * colour. Black is a fixed point of every transfer function there is — encode it as many
 * times as you like and it stays black — so the one pixel value the pipeline cannot get
 * wrong is the one it is now asked for.
 *
 * Transparency alone was not enough: measured again, the frame arrived as flat `rgb(3,3,3)`,
 * because the post-processing chain writes an opaque alpha whatever the clear alpha was. So
 * the CALLER composites the canvas with `mix-blend-mode: screen`, for which black is the
 * identity — `1-(1-a)(1-b)` with b = 0 is a. Empty frame cannot tint the void; lit frame
 * adds light to it.
 *
 * The constant stays exported because that surface has to agree with it, and a caller that
 * guesses gets a visible seam at the canvas edge. Any caller must do BOTH: paint `VOID_BG`
 * behind the canvas, and screen the canvas onto it.
 */
export const VOID_BG = 0x04060c;

/** Radians per second. A full revolution takes about two minutes — a drift, not a spin. */
const REVOLVE_SPEED = 0.055;

/** The opening camera move is long enough to feel intentional and short enough that the
 * credentials are never waiting for it. The form paints before this bundle loads. */
const INTRO_SECONDS = 2.35;

/** Elevation ~40°, looking along +Z. High enough to read as a plan, low enough to read as a
 *  building rather than a drawing. */
const VIEW_DIR = new THREE.Vector3(0, 0.6, 0.72).normalize();

/** Fraction of the frame the plan occupies at its widest point in the revolution. */
const FIT = 0.92;

export interface FloorPlanSceneOptions {
  /** `prefers-reduced-motion` — hold a still frame instead of revolving. */
  readonly reduced?: boolean;
  /** Weak machine — drop the bloom pass and cap the pixel ratio harder. */
  readonly lowPower?: boolean;
  /**
   * How brightly the LINES burn — or, on the light panel, how firmly they are drawn.
   *
   * Left UNDEFINED means "whatever this panel's palette says", which is the only sane default
   * now that there are two: 0.9 is a confident white line on near-black and a heavy slate
   * scribble on near-white. A caller that sets it is overriding both panels at once and should
   * mean to.
   */
  readonly intensity?: number;
  /** Which panel this is drawn on. Decides the palette, the clear colour, the blend mode and
   *  whether a bloom pass is built at all. */
  readonly theme?: SceneTheme;
  /**
   * How far the light bleeds off those lines — the bloom pass's strength.
   *
   * Separate from `intensity`, because they are separate wishes. "The plan is too bright"
   * and "the plan is too hazy" have different answers: the first wants dimmer strokes, the
   * second wants a tighter halo around strokes that may be exactly right. While the two were
   * one number, turning down the glow also faded the drawing and turning up the drawing also
   * fogged the frame.
   *
   * Defaults to the old coupled value, so a caller that does not care is unaffected.
   */
  readonly glow?: number;
  /** Fraction of the frame the model fills. Lower pushes it further away. */
  readonly fit?: number;
}

export interface FloorPlanScene {
  /** Change the stillness answer without rebuilding the WebGL context. */
  setReduced(reduced: boolean): void;
  /** Frees the context, the geometry, the materials and the canvas. */
  dispose(): void;
}

/**
 * Fill `host` with the revolving plan.
 *
 * Returns `null` — not a throw — when WebGL is unavailable. A caller that has to remember to
 * wrap scenery in a try/catch will one day forget, and the page that pays for it is the one
 * nobody can get past.
 */
export function mountFloorPlan(
  host: HTMLElement,
  options: FloorPlanSceneOptions = {},
): FloorPlanScene | null {
  const intensity = options.intensity;
  const theme: SceneTheme = options.theme ?? "dark";
  const pal = SCENE_PALETTE[theme];
  const lowPower = options.lowPower ?? false;
  /**
   * BLOOM IS A DARK-PANEL EFFECT, and this is the one gate that decides it.
   *
   * On the light panel the canvas is composited with `multiply`, whose identity is white —
   * so a pass whose entire job is to add light is a pass that erases the drawing it was
   * meant to emphasise. It is not "less useful" there; it is backwards. `lowPower` still
   * turns it off for cost, which is a different reason, and the two are `||`-ed rather than
   * conflated so neither can be mistaken for the other later.
   */
  const wantsBloom = pal.bloom && !lowPower;
  const fitTo = options.fit ?? FIT;
  let reduced = options.reduced ?? false;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: !lowPower,
      powerPreference: "low-power",
      // See the note on VOID_BG. The page behind supplies the colour; this only draws light.
      alpha: true,
    });
  } catch {
    return null;
  }

  /**
   * PIXEL RATIO, and 1.75 was too greedy by a wide margin.
   *
   * Measured on Intel Iris Xe — ordinary laptop hardware, not a weak machine — the scene at
   * 1.75× could not hold thirty frames a second with the bloom pass, and the watchdog below
   * duly took the bloom away. The glow is most of what makes this look like anything, so
   * losing it on a mainstream GPU is losing it for most people.
   *
   * The bloom pass is several full-screen gaussian blurs, so its cost is the square of this
   * number: 1.75² is 3.06, 1.25² is 1.56 — a little over half the work. And of all the
   * things that might want extra pixel density, a deliberately BLURRED glow around
   * hairline strokes is close to the least deserving. There is no visible difference and the
   * effect survives, which is the whole trade.
   */
  const maxRatio = lowPower ? 1 : 1.25;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxRatio));
  /**
   * The clear colour is the BLEND MODE'S IDENTITY, not a background.
   *
   * Black for `screen`, white for `multiply` — in each case the value that leaves the panel
   * behind untouched wherever the scene drew nothing. Alpha stays 0 so the untouched case is
   * exact on the direct path; the composer forces an opaque alpha whatever is asked for,
   * which is precisely why the colour underneath has to be the identity rather than merely
   * transparent. See the note on `SCENE_PALETTE`.
   */
  renderer.setClearColor(pal.clear, 0);
  // Published so the caller cannot get the other half of the decision wrong, and so the
  // harness can assert the pair rather than infer it from a screenshot.
  host.dataset.blend = pal.blend;
  host.dataset.theme = theme;
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 4000);

  /**
   * The fill alpha follows the PIPELINE, not taste. `lowPower` is exactly what decides
   * whether a bloom composer is built below, and the two paths blend in different colour
   * spaces — so the same opacity means a glass floor on one and an invisible one on the
   * other. Chosen here rather than there because the plan is built first.
   */
  const plan = buildFloorPlan({
    width: 120,
    wallHeight: 7,
    edgeOpacity: intensity,
    theme,
    fillAlpha: wantsBloom ? pal.fillAlphaLinear : pal.fillAlphaSrgb,
  });

  // The pivot carries the revolution, so the model's own transform stays clean.
  const pivot = new THREE.Group();
  pivot.add(plan.group);
  scene.add(pivot);

  // Corner samples through a FULL revolution, so the framing holds at every angle of the
  // spin rather than only at the one it starts on.
  // The BUILDING's box, from the plan itself — not `setFromObject(group)`. See the note on
  // `fitBox`: measuring the group includes the label billboards, whose bounds come from
  // their own scale rather than from the floor, and framing then follows the labels instead
  // of the factory.
  const box = plan.fitBox;
  const size = box.getSize(new THREE.Vector3());
  const target = new THREE.Vector3(0, size.y * 0.4, 0);

  /**
   * A QUIET DATA FIELD around the physical plant.
   *
   * The factory remains the subject; these points and orbital traces make it read as a live
   * digital twin rather than a CAD file placed behind a form. Everything is deterministic,
   * shares two GPU resources, and is omitted on low-power hardware. That gives the richer
   * first impression without changing the scene's failure contract or its draw-call budget.
   */
  const atmosphere = new THREE.Group();
  const atmosphereResources: Array<THREE.BufferGeometry | THREE.Material> = [];
  if (!lowPower) {
    const pointCount = 132;
    const positions = new Float32Array(pointCount * 3);
    for (let i = 0; i < pointCount; i++) {
      // Golden-angle distribution: even enough to look designed, irregular enough not to
      // become a visible grid when the group turns.
      const angle = i * 2.399963229728653;
      const radius = (0.18 + ((i * 47) % 83) / 100) * Math.max(size.x, size.z) * 0.52;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = 1.5 + ((i * 29) % 71) / 4.4;
      positions[i * 3 + 2] = Math.sin(angle) * radius * 0.68;
    }
    const pointsGeometry = new THREE.BufferGeometry();
    pointsGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const pointsMaterial = new THREE.PointsMaterial({
      color: theme === "dark" ? 0x8be9fd : 0x446b91,
      size: theme === "dark" ? 0.46 : 0.32,
      transparent: true,
      opacity: theme === "dark" ? 0.5 : 0.28,
      depthWrite: false,
      blending: theme === "dark" ? THREE.AdditiveBlending : THREE.NormalBlending,
      sizeAttenuation: true,
    });
    atmosphere.add(new THREE.Points(pointsGeometry, pointsMaterial));
    atmosphereResources.push(pointsGeometry, pointsMaterial);

    const orbitMaterial = new THREE.LineBasicMaterial({
      color: theme === "dark" ? 0x55d7ff : 0x6d87a3,
      transparent: true,
      opacity: theme === "dark" ? 0.2 : 0.16,
      depthWrite: false,
      blending: theme === "dark" ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    atmosphereResources.push(orbitMaterial);
    for (const [scaleX, scaleZ, height, phase] of [
      [0.5, 0.36, 0.35, 0],
      [0.64, 0.48, 5.8, Math.PI / 5],
      [0.78, 0.58, 11.2, Math.PI / 2],
    ] as const) {
      const vertices: THREE.Vector3[] = [];
      for (let segment = 0; segment < 96; segment++) {
        const a = (segment / 96) * Math.PI * 2 + phase;
        vertices.push(
          new THREE.Vector3(
            Math.cos(a) * size.x * scaleX,
            height + Math.sin(a * 3) * 0.35,
            Math.sin(a) * size.z * scaleZ,
          ),
        );
      }
      const orbitGeometry = new THREE.BufferGeometry().setFromPoints(vertices);
      atmosphere.add(new THREE.LineLoop(orbitGeometry, orbitMaterial));
      atmosphereResources.push(orbitGeometry);
    }
    scene.add(atmosphere);
  }

  /**
   * HOLOGRAPHIC INSTRUMENT LAYER.
   *
   * The model now behaves like a live digital twin instead of a rotating CAD export: a
   * grounded coordinate grid, a thin scan band and an expanding verification pulse. These
   * use three simple materials and geometries—no extra post-processing pass, texture fetch
   * or per-frame allocation—and disappear entirely on low-power hardware.
   */
  const instruments = new THREE.Group();
  const instrumentResources: Array<THREE.BufferGeometry | THREE.Material> = [];
  let scanBand: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null;
  let pulseRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> | null = null;
  if (!lowPower) {
    const span = Math.max(size.x, size.z) * 1.34;
    const grid = new THREE.GridHelper(
      span,
      28,
      theme === "dark" ? 0x62f5d0 : 0x365f7d,
      theme === "dark" ? 0x315d73 : 0x8aa0b5,
    );
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    for (const material of gridMaterials) {
      material.transparent = true;
      material.opacity = theme === "dark" ? 0.12 : 0.08;
      material.depthWrite = false;
      instrumentResources.push(material);
    }
    grid.position.y = box.min.y - 0.28;
    instruments.add(grid);
    instrumentResources.push(grid.geometry);

    const scanGeometry = new THREE.PlaneGeometry(
      size.x * 1.24,
      Math.max(1.25, size.z * 0.026),
    );
    const scanMaterial = new THREE.MeshBasicMaterial({
      color: theme === "dark" ? 0x70ffdc : 0x167f78,
      transparent: true,
      opacity: theme === "dark" ? 0.22 : 0.12,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: theme === "dark" ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    scanBand = new THREE.Mesh(scanGeometry, scanMaterial);
    scanBand.rotation.x = -Math.PI / 2;
    scanBand.position.y = box.max.y + 0.8;
    instruments.add(scanBand);
    instrumentResources.push(scanGeometry, scanMaterial);

    const ringGeometry = new THREE.RingGeometry(4.6, 5.05, 96);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: theme === "dark" ? 0x76e9ff : 0x315f86,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: theme === "dark" ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    pulseRing = new THREE.Mesh(ringGeometry, ringMaterial);
    pulseRing.rotation.x = -Math.PI / 2;
    pulseRing.position.y = box.max.y + 0.55;
    instruments.add(pulseRing);
    instrumentResources.push(ringGeometry, ringMaterial);

    pivot.add(instruments);
  }

  const samples: THREE.Vector3[] = [];
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      const x = (sx * size.x) / 2;
      const z = (sz * size.z) / 2;
      const rx = x * ca - z * sa;
      const rz = x * sa + z * ca;
      samples.push(new THREE.Vector3(rx, box.min.y, rz), new THREE.Vector3(rx, box.max.y, rz));
    }
  }

  /**
   * ───────────────────────────────────────────────────────────────────────────────
   * FIT — measure what the camera actually sees, then centre it and size it.
   * ───────────────────────────────────────────────────────────────────────────────
   *
   * Analytic bounding-sphere fitting is wrong here: the plan is a wide flat plate seen from
   * above, so perspective makes its near edge project far larger than its far edge and a
   * centre-symmetric fit overshoots badly. So the corners are projected and the distance is
   * iterated instead.
   *
   * AND THE CENTRING IS PART OF THE SAME LOOP, which it was not before. The earlier version
   * only scaled — it assumed the model's 3D centroid projects to the middle of the frame.
   * For a wide flat plate viewed from 40° elevation it does not: measured in the panel, the
   * plan's visual centre sat about 6% of the frame height BELOW the middle. Small enough to
   * argue about, obvious enough that a designer sees it immediately, and impossible to fix
   * by nudging a constant because the offset changes with the panel's aspect ratio.
   *
   * So each iteration measures the projected BOUNDS rather than just the worst extent, and
   * does two things with them: slides `target` sideways and vertically so the bounds are
   * centred, then rescales the distance from the now-centred extent. The two corrections
   * interact — moving the camera changes the projection — which is why they are interleaved
   * for fourteen rounds rather than applied once each.
   *
   * The samples span a FULL revolution, so what gets centred is the union of every angle the
   * plan will pass through. It stays centred as it turns, rather than being centred only in
   * the frame it happened to be fitted on.
   */
  const scratch = new THREE.Vector3();
  const camRight = new THREE.Vector3();
  const camUp = new THREE.Vector3();
  const finalCameraPosition = new THREE.Vector3();
  const finalTarget = new THREE.Vector3();

  const fit = (): void => {
    // RESET FIRST. `target` is now an output of this routine as well as an input, and `fit`
    // runs again on every resize. Starting each solve from the same place makes the result a
    // function of the panel alone — otherwise the answer would depend on how many times the
    // window had been dragged, which is the kind of bug that only ever reproduces for the
    // person demonstrating it.
    target.set(0, size.y * 0.4, 0);

    let dist = Math.hypot(size.x, size.z);

    for (let i = 0; i < 14; i++) {
      camera.position.copy(VIEW_DIR).multiplyScalar(dist).add(target);
      camera.lookAt(target);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);

      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of samples) {
        scratch.copy(p).project(camera);
        if (scratch.x < minX) minX = scratch.x;
        if (scratch.x > maxX) maxX = scratch.x;
        if (scratch.y < minY) minY = scratch.y;
        if (scratch.y > maxY) maxY = scratch.y;
      }
      if (!Number.isFinite(minX) || !Number.isFinite(minY)) break;

      // 1. CENTRE. The offset is in normalised device coordinates, where ±1 spans the frame;
      //    converting it to world units needs the size of the frame AT THE TARGET PLANE,
      //    which is what the camera's field of view and the panel's aspect give.
      const halfH = dist * Math.tan((camera.fov * Math.PI) / 360);
      const halfW = halfH * camera.aspect;
      camRight.setFromMatrixColumn(camera.matrixWorld, 0);
      camUp.setFromMatrixColumn(camera.matrixWorld, 1);
      target
        .addScaledVector(camRight, ((minX + maxX) / 2) * halfW)
        .addScaledVector(camUp, ((minY + maxY) / 2) * halfH);

      // 2. SIZE, from the half-extent of the centred bounds rather than from the distance to
      //    the furthest corner — which is the same number only when the model is already
      //    centred, and was quietly inflating the fit while it was not.
      const extent = Math.max((maxX - minX) / 2, (maxY - minY) / 2);
      if (!Number.isFinite(extent) || extent <= 0) break;
      dist *= extent / fitTo;
    }

    camera.position.copy(VIEW_DIR).multiplyScalar(dist).add(target);
    camera.lookAt(target);
    finalCameraPosition.copy(camera.position);
    finalTarget.copy(target);
  };

  // Bloom is what turns the white lines into a glow. It is also the single most expensive
  // thing on this screen, which is why a weak machine simply does without it.
  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  if (wantsBloom) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      options.glow ?? 0.9 * Math.max(intensity ?? pal.edgeOpacity, 0.25) * 2.2,
      // RADIUS 0.3, halved from 0.6 to pay for the half-resolution pass below.
      //
      // The blur kernel is measured in the bloom's own pixels, so running it at half size
      // makes every one of those pixels cover twice as much screen — the same radius spreads
      // twice as far. Left at 0.6 the result was a broad grey fog over the whole frame with
      // visible mip-level blocking in it, instead of light around the walls.
      0.3,
      0.5,
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  /**
   * The bloom runs at HALF the resolution of everything else, and this is the difference
   * between a scene that glows and one that quietly gives up glowing.
   *
   * `EffectComposer.setSize` hands every pass the full frame size, and at full size the
   * blur chain could not hold thirty frames a second on Intel Iris Xe — perfectly ordinary
   * laptop hardware — so the watchdog kept taking it away. Quartering the pixels it touches
   * makes it affordable there.
   *
   * There is no visible cost, and that is not a hopeful claim: the pass exists to produce a
   * wide, soft halo, and the one thing a wide soft halo cannot carry is detail. It is
   * upsampled back over a wireframe that is still drawn at full resolution, so the crisp
   * part stays crisp and only the glow is cheap.
   */
  const HALF = 2;

  /**
   * Which pipeline actually ran, published on the host element.
   *
   * The two paths do not merely differ in glow. WITH the composer, blending happens in a
   * linear float render target and `OutputPass` encodes at the end; WITHOUT it, the scene
   * draws straight to an sRGB framebuffer and blends there. The same `opacity` therefore
   * produces a very different apparent coverage on each — which is invisible from the
   * outside and was diagnosed only by screenshotting both.
   *
   * A harness that infers the pipeline from a lit-pixel count is guessing. This is a fact.
   */
  host.dataset.bloom = composer ? "on" : "off";

  const resize = (): void => {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    // AFTER the composer, which would otherwise overwrite this with the full frame size.
    bloom?.setSize(Math.max(1, Math.round(w / HALF)), Math.max(1, Math.round(h / HALF)));
    fit();
  };
  resize();

  const observer = new ResizeObserver(resize);
  observer.observe(host);

  /**
   * ───────────────────────────────────────────────────────────────────────────────
   * THE WATCHDOG — the scene is allowed to give up on itself.
   * ───────────────────────────────────────────────────────────────────────────────
   *
   * `login-backdrop.ts` refuses the bloom pass up front on a machine it can identify as
   * having no GPU, and that catches the case that was actually observed. It cannot catch
   * every case: a throttled tab, a laptop on its last 3% of battery, a driver that degrades
   * under thermal load, a machine whose renderer string names hardware it is no longer
   * really using. None of those are visible at mount.
   *
   * So the loop measures itself, twice, against two DIFFERENT bars — and they are far apart
   * on purpose:
   *
   *   under ~29 fps  →  drop the bloom pass, which is the expensive part by a wide margin
   *   under ~12 fps  →  stop rendering entirely, leaving the last frame painted
   *
   * The first bar is about beauty and the second is about access, so calibrating them the
   * same was wrong. A backdrop drifting at 25 fps looks completely fine — nobody is reading
   * it — and the first version of this switched such a scene off within three seconds, which
   * is a self-inflicted regression on machines that were coping. Twelve frames a second is a
   * different claim: at that point the main thread is being starved, and the thing being
   * starved is a password field.
   *
   * A still frame of the factory is a perfectly good backdrop. A moving one that costs
   * somebody their login is not, and this scene sits behind a form where "the page went
   * unresponsive" has no workaround — you cannot scroll past a login, or ignore it, or come
   * back to it later.
   *
   * The first frames are skipped on purpose: shader compilation and the first texture upload
   * land there, and judging a machine by them would condemn every machine.
   */
  const WARMUP = 12;
  const SAMPLE = 45;
  /** ~29 fps — the bar for keeping the bloom. */
  const SLOW_MS = 34;
  /** ~12 fps — the bar for keeping the render loop at all. */
  const STALL_MS = 80;

  let seen = 0;
  let taken = 0;
  let accrued = 0;
  /** Once true the loop stops measuring itself for good, in either direction. */
  let settled = false;

  const clock = new THREE.Clock();
  let frame = 0;
  let introElapsed = reduced ? INTRO_SECONDS : 0;
  let pointerX = 0;
  let pointerY = 0;
  let pointerTargetX = 0;
  let pointerTargetY = 0;
  const introStart = new THREE.Vector3();
  const cameraFrame = new THREE.Vector3();
  const cameraAim = new THREE.Vector3();
  const cameraOffset = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  /** Pointer input changes a target only; the render loop applies the eased motion. That
   * keeps event frequency out of the rendering path and prevents a jittery factory on a
   * high-polling-rate mouse. */
  const onPointerMove = (event: PointerEvent): void => {
    pointerTargetX = (event.clientX / Math.max(window.innerWidth, 1) - 0.5) * 2;
    pointerTargetY = (event.clientY / Math.max(window.innerHeight, 1) - 0.5) * 2;
  };
  window.addEventListener("pointermove", onPointerMove, { passive: true });

  const judge = (ms: number): void => {
    if (settled) return;

    /**
     * A HIDDEN TAB IS NOT A SLOW MACHINE, and this was caught by accident — a browser window
     * positioned off-screen for a screenshot came back with the bloom already conceded. The
     * scene was fine; the compositor had simply stopped asking for frames.
     *
     * Browsers throttle `requestAnimationFrame` to a crawl in a background tab, and on a
     * login page that is completely normal: somebody opens the sign-in, goes to find their
     * password, and comes back. Measuring that as hardware weakness would permanently strip
     * the scene of everything it has, for the sin of not being looked at.
     *
     * The part-collected sample is thrown away rather than paused, because the frames either
     * side of a tab switch belong to two different situations and averaging across them
     * describes neither.
     */
    if (document.hidden) {
      taken = 0;
      accrued = 0;
      return;
    }

    /**
     * And one enormous frame is an EVENT, not a trend — the first frame back from a hidden
     * tab, a garbage collection, the machine waking up, another application grabbing the GPU
     * for a moment. A single 4-second frame drags an average of 45 past any threshold on its
     * own, so outliers are discarded instead of being allowed to decide.
     */
    if (ms > 250) return;

    seen++;
    if (seen <= WARMUP) return;
    taken++;
    accrued += ms;
    if (taken < SAMPLE) return;

    const average = accrued / taken;
    taken = 0;
    accrued = 0;

    /**
     * The bar is set by WHAT IS LEFT TO GIVE UP, not by how many strikes have been counted.
     *
     * While the bloom is still on there is a cheap concession available, so the bar is the
     * comfortable one — 29 fps is reason enough to drop an expensive effect. Once it is
     * gone the only remaining move is to stop the scene altogether, so the bar drops to the
     * point where the page is genuinely being starved.
     *
     * Counting strikes instead got this wrong for exactly the machines it was written for:
     * a low-power machine starts with no bloom at all, so its FIRST measurement is also its
     * last chance, and judging that one against the comfortable bar switched the scene off
     * on hardware that was coping perfectly well.
     */
    const canConcede = composer !== null;

    if (average <= (canConcede ? SLOW_MS : STALL_MS)) {
      // Fast enough. Stop judging — a scene that keeps re-testing itself for the life of the
      // page is a scene that can decide to switch itself off an hour into somebody's day.
      settled = true;
      return;
    }

    if (canConcede) {
      composer?.dispose();
      composer = null;
      // Dropped with it, so `resize` stops sizing a pass that is no longer in any chain.
      bloom = null;
    } else {
      settled = true;
      cancelAnimationFrame(frame);
    }
  };

  const tick = (): void => {
    frame = requestAnimationFrame(tick);
    const dt = clock.getDelta();
    if (!reduced) {
      introElapsed = Math.min(INTRO_SECONDS, introElapsed + dt);
      pointerX += (pointerTargetX - pointerX) * Math.min(1, dt * 2.8);
      pointerY += (pointerTargetY - pointerY) * Math.min(1, dt * 2.8);
      pivot.rotation.y += REVOLVE_SPEED * dt;
      // A few degrees of independent response is enough to establish depth without making
      // the plan chase the cursor or interfering with its slow automatic revolution.
      pivot.rotation.z = -pointerX * 0.012;
      pivot.rotation.x = pointerY * 0.009;
      atmosphere.rotation.y -= REVOLVE_SPEED * 0.22 * dt;

      const time = clock.elapsedTime;
      if (scanBand) {
        const progress = (time % 5.8) / 5.8;
        scanBand.position.z = THREE.MathUtils.lerp(
          box.min.z - size.z * 0.16,
          box.max.z + size.z * 0.16,
          progress,
        );
        scanBand.material.opacity =
          (theme === "dark" ? 0.22 : 0.12) * Math.sin(progress * Math.PI);
      }
      if (pulseRing) {
        const wave = (time % 4.4) / 4.4;
        const scale = 0.7 + wave * Math.max(size.x, size.z) / 8.2;
        pulseRing.scale.setScalar(scale);
        pulseRing.material.opacity =
          (theme === "dark" ? 0.24 : 0.11) * Math.sin(wave * Math.PI);
      }
    }

    /**
     * CAMERA CHOREOGRAPHY.
     *
     * The first two seconds move from a slightly wider, off-axis inspection angle into the
     * measured final composition. After that, pointer parallax shifts the camera by less
     * than two percent of the model span. All values derive from the fitted scene, so resize
     * and responsive layouts keep the same visual move without viewport-specific constants.
     */
    const intro = reduced ? 1 : Math.min(1, introElapsed / INTRO_SECONDS);
    const eased = 1 - Math.pow(1 - intro, 4);
    introStart
      .copy(finalCameraPosition)
      .sub(finalTarget)
      .multiplyScalar(1.22)
      .applyAxisAngle(UP, -0.16)
      .add(finalTarget);
    introStart.y += size.y * 0.72;
    cameraFrame.lerpVectors(introStart, finalCameraPosition, eased);
    cameraOffset.set(
      pointerX * size.x * 0.016 * eased,
      -pointerY * Math.max(size.y, 8) * 0.026 * eased,
      pointerX * size.z * 0.006 * eased,
    );
    camera.position.copy(cameraFrame).add(cameraOffset);
    cameraAim
      .copy(finalTarget)
      .addScaledVector(camRight, pointerX * size.x * 0.004 * eased)
      .addScaledVector(camUp, -pointerY * Math.max(size.y, 8) * 0.008 * eased);
    camera.lookAt(cameraAim);
    const reveal = 0.94 + eased * 0.06;
    pivot.scale.setScalar(reveal);
    pivot.position.y = (1 - eased) * -Math.max(size.y * 0.3, 2.4);

    if (composer) composer.render();
    else renderer.render(scene, camera);
    judge(dt * 1000);
  };
  tick();

  return {
    setReduced(next: boolean): void {
      reduced = next;
      if (next) {
        introElapsed = INTRO_SECONDS;
        pointerX = 0;
        pointerY = 0;
        pointerTargetX = 0;
        pointerTargetY = 0;
        pivot.rotation.x = 0;
        pivot.rotation.z = 0;
      }
    },
    dispose(): void {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      observer.disconnect();
      plan.dispose();
      for (const resource of atmosphereResources) resource.dispose();
      for (const resource of instrumentResources) resource.dispose();
      composer?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    },
  };
}
