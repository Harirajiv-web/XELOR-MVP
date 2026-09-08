/**
 * The factory floor plan, as a hollow edge model.
 *
 * Ported from the standalone `floorplan-3d` project, trimmed to the one mode this screen
 * uses. The original could also build solid, colour-filled massing; a backdrop never wants
 * that, and carrying an unused second code path into the spine would be dead weight in a
 * file nothing else has a reason to open.
 *
 * "Hollow" means exactly that: no floor slabs and no wall surfaces, only lines — each zone's
 * floor outline, the same outline at wall height, and a vertical riser joining the two at
 * every corner. Straight runs get no intermediate verticals, so a long wall reads as one
 * clean plane instead of a ladder.
 *
 * This module owns geometry and nothing else. It builds no renderer, no camera and no
 * lights, so it can be pointed at any scene — see `floorplan-backdrop.tsx` for the one that
 * currently does.
 */

import * as THREE from "three";
import { FLOORPLAN, type Floorplan, type ZoneRect } from "./floorplan-data";
import { annotationFor, zoneColor } from "./floorplan-departments";

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * THE SAME MODEL, LIT TWO OPPOSITE WAYS.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * A dark-mode hologram and a light-mode one are not the same drawing with the colours
 * swapped, and pretending otherwise is how a light theme ends up looking washed out. They
 * differ in the ARITHMETIC:
 *
 *   DARK    the canvas is composited with `screen`, whose identity is BLACK. Everything the
 *           scene draws ADDS light to the panel. Lines are bright, markers are additive, and
 *           a bloom pass makes the strokes burn — the whole idiom is emission.
 *
 *   LIGHT   the canvas is composited with `multiply`, whose identity is WHITE. Everything the
 *           scene draws SUBTRACTS light. Bright strokes are invisible — white multiplied by
 *           anything is that thing — so lines must be dark, markers must be solid rather than
 *           additive, and the bloom pass must be OFF, because adding light on a subtractive
 *           blend erases the very thing it is trying to emphasise.
 *
 * That is why the brief's "crisp, gentle coloured halo or shadow" is the right instruction
 * for the light panel and a glow is not: a pale surface does not emit, it casts. The depth
 * that bloom gives the dark panel is given to the light one by a soft drop shadow under the
 * whole canvas — see `login-backdrop.ts`.
 *
 * The caller MUST honour `clear` and `blend` together. They are two halves of one decision,
 * and a canvas cleared white but composited with `screen` is a solid white rectangle over the
 * sign-in page.
 */
export type SceneTheme = "light" | "dark";

export interface ScenePalette {
  /** What the renderer clears to: the identity of the blend mode below. */
  readonly clear: number;
  /** How the canvas must be composited onto the panel behind it. */
  readonly blend: "screen" | "multiply";
  /** Whether a bloom pass is meaningful at all on this panel. */
  readonly bloom: boolean;
  readonly edgeColor: number;
  readonly edgeOpacity: number;
  /** Region fill alpha on the bloom (linear-blending) path. */
  readonly fillAlphaLinear: number;
  /** Region fill alpha on the direct (sRGB-blending) path. */
  readonly fillAlphaSrgb: number;
  /** The occupancy marker: its tint, and whether it emits or sits on the floor. */
  readonly dot: { readonly color: number; readonly additive: boolean };
  /** The label plate, the name on it, and the lightness its department caption is forced to. */
  readonly label: {
    readonly plate: string;
    readonly ink: string;
    readonly captionLightness: number;
  };
}

export const SCENE_PALETTE: Readonly<Record<SceneTheme, ScenePalette>> = {
  dark: {
    clear: 0x000000,
    blend: "screen",
    bloom: true,
    // Ice-blue structure belongs to the surrounding cyan/indigo aurora and is gentler than
    // pure white under bloom, so the room fills remain visible instead of being washed out.
    edgeColor: 0xc9efff,
    edgeOpacity: 0.82,
    fillAlphaLinear: 0.055,
    fillAlphaSrgb: 0.3,
    dot: { color: 0x99f6e4, additive: true },
    label: { plate: "rgba(3,7,18,0.66)", ink: "#f0f9ff", captionLightness: 0.72 },
  },
  light: {
    clear: 0xffffff,
    blend: "multiply",
    bloom: false,
    // Slate rather than black. A pure-black wireframe on near-white is a technical drawing;
    // the panel is meant to read as a lit model seen through glass, and slate keeps the
    // structure clearly subordinate to the coloured floors.
    edgeColor: 0x34556f,
    edgeOpacity: 0.5,
    // Only the sRGB figure is ever used — `bloom: false` means the linear path is never
    // taken here — but it is stated rather than left to a default, because a default that is
    // never exercised is a value nobody has checked.
    fillAlphaLinear: 0.38,
    fillAlphaSrgb: 0.38,
    dot: { color: 0x0f4c5c, additive: false },
    // A white plate is `multiply`'s identity, which is exactly what is wanted: it restores
    // the panel colour behind the type, so contrast under a label is constant at every angle
    // of the revolution — the same job the dark plate does, achieved by the opposite means.
    label: { plate: "rgba(255,255,255,0.88)", ink: "#12202e", captionLightness: 0.32 },
  },
};

export interface FloorPlanOptions {
  /** World units across the plan's long axis. */
  readonly width?: number;
  /** Base wall height, before the per-zone multiplier. */
  readonly wallHeight?: number;
  readonly edgeColor?: number;
  readonly edgeOpacity?: number;
  /**
   * Solid ground-plane fills, department labels and occupancy dots.
   *
   * On by default — it is what turns a wireframe into a plan somebody can read. Turning it
   * off leaves the hollow edge model exactly as it was, which is what a small decorative
   * instance would want.
   */
  readonly annotate?: boolean;
  /**
   * How opaque the region fills are. MUST be chosen by pipeline — see `FILL_ALPHA_LINEAR`
   * and `FILL_ALPHA_SRGB`. Defaults to the linear (bloom) value.
   */
  readonly fillAlpha?: number;
  /**
   * Which panel this is being drawn on. Decides the region colours, the line colour, the
   * marker treatment and both label inks — see `SCENE_PALETTE`. Defaults to dark, which is
   * what every existing caller was implicitly asking for.
   */
  readonly theme?: SceneTheme;
}

export interface BuiltFloorPlan {
  readonly group: THREE.Group;
  readonly size: { readonly x: number; readonly z: number };
  /**
   * The box a camera should frame — the BUILDING, and nothing else.
   *
   * Deliberately not `new Box3().setFromObject(group)`, which is what the scene used to do
   * and what broke the moment labels appeared. A `Box3` over the group includes the label
   * sprites and the people markers: sprites are billboards whose bounds are derived from
   * their scale rather than from anything on the floor, so they inflated the box, moved its
   * centre, and slid the whole plan off the middle of the panel — a framing regression with
   * no visible cause in the framing code.
   *
   * Annotations decorate the building. They must never decide where the camera points.
   */
  readonly fitBox: THREE.Box3;
  /** Frees every geometry, material and texture this build created. */
  dispose(): void;
}

/**
 * How far the coloured ground plane sits BELOW the floor outlines.
 *
 * Small enough to read as the same surface, large enough that the two never fight for the
 * same depth value. Coplanar, the separators flicker in and out as the plan turns, which
 * looks like a rendering fault rather than a design.
 */
const FLOOR_DROP = 0.06;

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TWO FILL ALPHAS, BECAUSE THERE ARE TWO PIPELINES.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Neither of these numbers is the coverage you see, and they are not interchangeable.
 *
 * WITH the bloom composer, the scene renders into a LINEAR float target and `OutputPass`
 * encodes to sRGB at the end — so the fill blends in linear light. A third of the light is
 * nowhere near a third of the pixel value:
 *
 *     seen  =  sRGB( linear(colour) × alpha )
 *
 * Measured, `0.34` on this path produced fills reading at about **0.64** coverage, which is
 * why regions asked to be glass kept coming back looking like painted card. 0.055 measures
 * at roughly a quarter — a real glass finish.
 *
 * WITHOUT the composer — the low-power path, an old shop-floor PC — the scene draws straight
 * to an sRGB framebuffer and blends THERE. On that path alpha is very nearly the coverage
 * you see, so the same 0.055 renders the entire colour code all but invisible. That is not a
 * cosmetic difference: it is the map losing the thing that identifies its regions, on
 * precisely the machine least able to spare a second look.
 *
 * Hence two constants, and `floorplan-scene.ts` picking between them by which pipeline it
 * built. Both are tuned to land at the SAME apparent coverage of about 0.30.
 *
 * Do not tune either by eye. `_scratch/probe-fill.mjs` samples the composited frame and
 * reports the apparent alpha per region, and takes `HEADLESS=1` to render the other path.
 */
export const FILL_ALPHA_LINEAR = 0.055;
export const FILL_ALPHA_SRGB = 0.3;

/**
 * How far a label floats above the top of its OWN walls.
 *
 * Not a single shared height, which is what this was first. Six labels all at one altitude
 * collide constantly in projection — despatch and the paint shop overlapped through most of
 * the revolution — and no amount of shrinking the plates fixes it, because the problem is
 * that they occupy the same plane.
 *
 * Hanging each label over its own room separates them by the wall heights the plan already
 * varies (despatch 5.0 up to the paint shop's 8.3), so they slide past each other as the
 * model turns instead of stacking. It also reads correctly: the label belongs to the room
 * it is above.
 */
const LABEL_LIFT = 1.8;

/** People stand just clear of the floor, so a marker never half-sinks into its own fill. */
const HEAD_HEIGHT = 0.25;

/**
 * Per-zone wall height multipliers, so the massing reads as a building rather than a slab of
 * uniform extrusions. Keyed by zone id; anything unlisted falls back to 1. These also space
 * the labels apart — see `LABEL_LIFT`.
 */
const ZONE_HEIGHTS: Readonly<Record<string, number>> = {
  machine_shop: 1.0,
  paint_shop: 1.18,
  fabrication: 0.88,
  materials_prep: 1.06,
  materials_in: 0.98,
  goods_out: 0.72,
};

/**
 * A deterministic low-discrepancy sequence (Halton), used to scatter the occupancy dots.
 *
 * `Math.random` is deliberately absent from this whole module: the plan must look the same
 * on every load, because it is a thing the company owns rather than a different scribble
 * each time somebody signs in. Halton also beats random for this job on its own merits —
 * random clumps, and a clump of people markers reads as a crowd standing in one spot.
 */
function halton(index: number, base: number): number {
  let result = 0;
  let f = 1 / base;
  let i = index;
  while (i > 0) {
    result += f * (i % base);
    i = Math.floor(i / base);
    f /= base;
  }
  return result;
}

/**
 * A soft round dot, drawn once and shared by every people marker.
 *
 * A radial gradient rather than a hard circle: at the size these render, a hard-edged disc
 * aliases into a square and reads as a pixel rather than as a light.
 */
function dotTexture(theme: SceneTheme): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    if (theme === "light") {
      // A marker on the light panel is a THING ON THE FLOOR, not a light above it. The core
      // is opaque and dark so it survives `multiply`; the falloff is tighter than the dark
      // panel's because a soft dark edge on white reads as a smudge rather than as a glow.
      grad.addColorStop(0, "rgba(15,42,51,0.95)");
      grad.addColorStop(0.45, "rgba(13,148,136,0.55)");
      grad.addColorStop(1, "rgba(13,148,136,0)");
    } else {
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.35, "rgba(224,248,255,0.85)");
      grad.addColorStop(1, "rgba(190,240,255,0)");
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * A two-line label drawn into a canvas: the area's own name, and the department that owns
 * it beneath. Rendered at 4× and scaled down, because a sprite drawn at its display size is
 * soft the moment the camera moves nearer than the frame it was authored for.
 */
function labelTexture(
  area: string,
  department: string,
  tint: number,
  theme: SceneTheme,
): THREE.Texture {
  const pal = SCENE_PALETTE[theme].label;
  const W = 1024;
  const H = 288;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  if (g) {
    g.textAlign = "center";
    g.textBaseline = "middle";

    // A pad behind the type — dark on the dark panel, near-white on the light one. The label
    // sits over a coloured fill whose brightness changes as the plan turns, and contrast that
    // changes with an animation is not contrast; this holds it constant at every angle.
    g.fillStyle = pal.plate;
    const padW = W * 0.92;
    const padH = H * 0.74;
    g.beginPath();
    g.roundRect((W - padW) / 2, (H - padH) / 2, padW, padH, 26);
    g.fill();

    /**
     * FIT THE TYPE TO THE PLATE, rather than trusting one font size to suit every name.
     *
     * The names on this plan run from "GOODS OUT" to "MATERIALS PREPARATION" — more than
     * twice the width at the same size. A single hard-coded size either clips the long ones
     * or wastes the short ones, and the first version of this did clip: the label read
     * "ATERIALS PREPARATIO", which is worse than no label because it looks like a bug in
     * the product rather than in the text.
     */
    const fitFont = (text: string, ideal: number, weight: number, maxWidth: number): number => {
      let size = ideal;
      for (let i = 0; i < 24 && size > 12; i++) {
        g.font = `${weight} ${size}px system-ui, -apple-system, Segoe UI, sans-serif`;
        if (g.measureText(text).width <= maxWidth) break;
        size -= 4;
      }
      return size;
    };

    const inner = padW * 0.9;
    const name = area.toUpperCase();
    g.font = `600 ${fitFont(name, 96, 600, inner)}px system-ui, -apple-system, Segoe UI, sans-serif`;
    g.fillStyle = pal.ink;
    g.fillText(name, W / 2, H * 0.38);

    if (department) {
      // The department in its own area's colour, lifted well clear of the fill so it reads
      // as a caption rather than as part of the floor.
      /**
       * The department keeps its area's HUE but is forced to a fixed, readable LIGHTNESS.
       *
       * Lightening each colour by a relative amount was the first attempt and it failed on
       * exactly the colours that needed it most: the fills are deliberately held under the
       * bloom threshold, so the darker ones — the coral of despatch, the blue of the paint
       * shop — were still too dim to read as a caption. An absolute target means every
       * department is equally legible while the hue still ties it to its own floor.
       */
      const col = new THREE.Color(tint);
      const hsl = { h: 0, s: 0, l: 0 };
      col.getHSL(hsl);
      // The target LIGHTNESS flips with the panel — 0.74 to read as a caption on a dark
      // plate, 0.32 to read as one on a near-white plate. Same principle, opposite direction:
      // an absolute target is what keeps all six equally legible while the hue still ties
      // each caption to its own floor.
      col.setHSL(hsl.h, Math.min(1, hsl.s + 0.12), pal.captionLightness);
      g.fillStyle = `#${col.getHexString()}`;
      g.font = `700 ${fitFont(department, 62, 700, inner)}px system-ui, -apple-system, Segoe UI, sans-serif`;
      g.fillText(department, W / 2, H * 0.72);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildFloorPlan(
  options: FloorPlanOptions = {},
  data: Floorplan = FLOORPLAN,
): BuiltFloorPlan {
  const width = options.width ?? 120;
  const wallHeight = options.wallHeight ?? 7;
  const theme = options.theme ?? "dark";
  const pal = SCENE_PALETTE[theme];
  const edgeColor = options.edgeColor ?? pal.edgeColor;
  const edgeOpacity = options.edgeOpacity ?? pal.edgeOpacity;
  const annotate = options.annotate ?? true;
  const fillAlpha = options.fillAlpha ?? pal.fillAlphaLinear;

  // Centre on the traced CONTENT, not on the source image. The zones cover only part of the
  // original JPG — its right-hand side is empty — so centring on the image would leave the
  // model off-origin, and a model off-origin orbits the centre instead of spinning in place.
  const bounds = contentBounds(data);
  const scale = width / (bounds.maxX - bounds.minX);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minY + bounds.maxY) / 2;

  // grid space (x right, y down) -> world space (x right, z down), centred on origin
  const wx = (gx: number): number => (gx - cx) * scale;
  const wz = (gy: number): number => (gy - cz) * scale;

  const group = new THREE.Group();
  group.name = "FloorPlanEdges";

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  /** Every people marker in the plant, gathered into one draw call. */
  const dotPositions: number[] = [];
  const sharedDot = annotate ? dotTexture(theme) : null;
  if (sharedDot) textures.push(sharedDot);

  for (const zone of data.zones) {
    const top = wallHeight * (ZONE_HEIGHTS[zone.id] ?? 1);
    const note = annotationFor(zone.id);

    if (annotate) {
      /* ── the solid ground plane ─────────────────────────────────────────────
         Built from the zone's own rectangle decomposition, so the fill is exactly the area
         the trace found — no triangulation of the outline, and no chance of the colour
         escaping the boundary drawn around it. Two triangles per rectangle. */
      const fill: number[] = [];
      for (const r of zone.rects) {
        const [gx, gy, gw, gh] = r as ZoneRect;
        const x0 = wx(gx);
        const x1 = wx(gx + gw);
        const z0 = wz(gy);
        const z1 = wz(gy + gh);
        // FLOOR_DROP below the outlines. Coplanar with them, the two would z-fight and the
        // separators would flicker in and out as the plan turns.
        const y = -FLOOR_DROP;
        fill.push(x0, y, z0, x1, y, z0, x1, y, z1);
        fill.push(x0, y, z0, x1, y, z1, x0, y, z1);
      }

      const fillGeom = new THREE.BufferGeometry();
      fillGeom.setAttribute("position", new THREE.Float32BufferAttribute(fill, 3));
      const fillMat = new THREE.MeshBasicMaterial({
        color: zoneColor(note, theme),
        transparent: true,
        // TRANSLUCENT, not painted. At 0.86 the regions read as flat coloured card laid on
        // the floor and the model stopped looking like a hologram — the wireframe standing
        // in them lost its depth because the fill behind it was as solid as the lines. At
        // this weight the colour still identifies the region unambiguously (the harness
        // measures that) while the structure reads through it.
        opacity: fillAlpha,
        side: THREE.DoubleSide,
        // The fill must never occlude the wireframe standing on it.
        depthWrite: false,
        toneMapped: false,
      });
      const fillMesh = new THREE.Mesh(fillGeom, fillMat);
      fillMesh.name = `${zone.id}__fill`;
      fillMesh.renderOrder = 0;
      group.add(fillMesh);
      geometries.push(fillGeom);
      materials.push(fillMat);

      /* ── the department label ───────────────────────────────────────────── */
      const centre = areaWeightedCentre(zone.rects);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: labelTexture(zone.label, note.department, zoneColor(note, theme), theme),
          transparent: true,
          // ALWAYS LEGIBLE. The plan is a hollow wireframe, so there is nothing solid for a
          // label to hide behind — but a wall edge crossing a letter still costs a reader a
          // beat, and this is a map whose whole job is being read at a glance.
          depthTest: false,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      const labelW = width * 0.155;
      sprite.scale.set(labelW, (labelW * 288) / 1024, 1);
      sprite.position.set(wx(centre.x), top + LABEL_LIFT, wz(centre.y));
      sprite.renderOrder = 10;
      group.add(sprite);
      materials.push(sprite.material);
      const map = sprite.material.map;
      if (map) textures.push(map);

      /* ── the people ─────────────────────────────────────────────────────── */
      scatterHeads(zone.rects, note.heads, wx, wz, dotPositions);
    }

    const positions: number[] = [];
    for (const loop of zone.outlines) {
      for (let i = 0; i < loop.length - 1; i++) {
        const a = loop[i];
        const b = loop[i + 1];
        // noUncheckedIndexedAccess: the loop bound guarantees both, but the compiler
        // cannot see that, and a silent skip is better than a non-null assertion.
        if (!a || !b) continue;
        const ax = wx(a[0]);
        const az = wz(a[1]);
        const bx = wx(b[0]);
        const bz = wz(b[1]);
        positions.push(ax, 0, az, bx, 0, bz); // floor outline
        positions.push(ax, top, az, bx, top, bz); // wall-top outline
        positions.push(ax, 0, az, ax, top, az); // corner riser
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));

    const material = new THREE.LineBasicMaterial({
      color: edgeColor,
      transparent: true,
      opacity: edgeOpacity,
      // Full brightness regardless of tone mapping — this is what lets a bloom pass find
      // the lines and turn them into a glow.
      toneMapped: false,
      depthWrite: false,
    });

    const lines = new THREE.LineSegments(geometry, material);
    lines.name = zone.id;
    group.add(lines);

    geometries.push(geometry);
    materials.push(material);
  }

  /* ── the people, as one draw call ──────────────────────────────────────────
     Every marker in the plant is a single `Points` object rather than a mesh each. There
     are around thirty of them; thirty draw calls to place thirty dots is the kind of cost
     that shows up as a stutter on the one machine we do not get to choose. */
  if (annotate && sharedDot && dotPositions.length > 0) {
    const dotGeom = new THREE.BufferGeometry();
    dotGeom.setAttribute("position", new THREE.Float32BufferAttribute(dotPositions, 3));
    const dotMat = new THREE.PointsMaterial({
      map: sharedDot,
      // One treatment for every marker, as the hierarchy requires — but not the SAME
      // treatment on both panels.
      color: pal.dot.color,
      size: width * 0.014,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
      /**
       * ADDITIVE ON DARK, NORMAL ON LIGHT.
       *
       * Additive is what makes a marker read as a LIGHT on the floor rather than a painted
       * spot, and it is what keeps it visible over every fill colour beneath it without one
       * treatment per region. On the light panel it does the opposite of both: adding to a
       * near-white floor produces white, so thirty people become thirty invisible people —
       * and the whole canvas is then multiplied onto the page, where white is the identity.
       * Normal blending with a dark, opaque core is the same idea expressed subtractively.
       */
      blending: pal.dot.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      toneMapped: false,
    });
    const dots = new THREE.Points(dotGeom, dotMat);
    dots.name = "occupancy";
    dots.renderOrder = 5;
    group.add(dots);
    geometries.push(dotGeom);
    materials.push(dotMat);
  }

  // Computed from the traced extents and the tallest wall, rather than measured off the
  // scene graph. Exact, cheap, and immune to anything decorative being added later.
  const tallest = Math.max(...data.zones.map((z) => wallHeight * (ZONE_HEIGHTS[z.id] ?? 1)));
  const fitBox = new THREE.Box3(
    new THREE.Vector3(wx(bounds.minX), -FLOOR_DROP, wz(bounds.minY)),
    new THREE.Vector3(wx(bounds.maxX), tallest, wz(bounds.maxY)),
  );

  return {
    group,
    size: {
      x: (bounds.maxX - bounds.minX) * scale,
      z: (bounds.maxY - bounds.minY) * scale,
    },
    fitBox,
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      // Canvas textures hold a bitmap each and are NOT freed by disposing the material that
      // references them. A login page is navigated away from within seconds of loading, so
      // leaking seven of these per visit is a real number rather than a theoretical one.
      for (const t of textures) t.dispose();
    },
  };
}

/**
 * The area-weighted centre of a zone, in grid coordinates.
 *
 * Not the bounding-box centre, which for the L-shaped and C-shaped areas on this plan falls
 * in the notch — outside the zone entirely — and would put a label on the floor of the area
 * next door. Weighting each rectangle by its area puts the label where the room actually is.
 */
function areaWeightedCentre(rects: readonly ZoneRect[]): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  let total = 0;
  for (const r of rects) {
    const [x, y, w, h] = r;
    const a = w * h;
    sx += (x + w / 2) * a;
    sy += (y + h / 2) * a;
    total += a;
  }
  if (total === 0) return { x: 0, y: 0 };
  return { x: sx / total, y: sy / total };
}

/**
 * Place `count` people markers inside a zone, spread across its rectangles in proportion to
 * their area and positioned by a Halton sequence within each.
 *
 * Proportional distribution matters: a zone's decomposition is a few large rectangles and a
 * scatter of one-cell slivers along its edges, so spreading evenly per RECTANGLE would line
 * most of the people up against the walls.
 */
function scatterHeads(
  rects: readonly ZoneRect[],
  count: number,
  wx: (n: number) => number,
  wz: (n: number) => number,
  out: number[],
): void {
  if (count <= 0 || rects.length === 0) return;

  const areas = rects.map((r) => r[2] * r[3]);
  const total = areas.reduce((a, b) => a + b, 0);
  if (total <= 0) return;

  let placed = 0;
  for (let i = 0; i < rects.length && placed < count; i++) {
    const rect = rects[i];
    const area = areas[i];
    if (!rect || area === undefined) continue;
    const share = Math.round((area / total) * count);
    const want = Math.min(share, count - placed);
    const [x, y, w, h] = rect;
    for (let k = 0; k < want; k++) {
      // Offset the sequence by the rectangle index so neighbouring rectangles do not all
      // start from the same corner and form a visible grid across the zone.
      const u = halton(k + 1 + i * 7, 2);
      const v = halton(k + 1 + i * 7, 3);
      // Inset, so nobody stands in a wall.
      out.push(wx(x + 0.15 * w + u * 0.7 * w), HEAD_HEIGHT, wz(y + 0.15 * h + v * 0.7 * h));
      placed++;
    }
  }
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Union bounding box, in grid coords, of every zone's rectangles. */
function contentBounds(data: Floorplan): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const zone of data.zones) {
    for (const rect of zone.rects) {
      const [rx, ry, rw, rh] = rect;
      if (rx < minX) minX = rx;
      if (ry < minY) minY = ry;
      if (rx + rw > maxX) maxX = rx + rw;
      if (ry + rh > maxY) maxY = ry + rh;
    }
  }

  return { minX, minY, maxX, maxY };
}
