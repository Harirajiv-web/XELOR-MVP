/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * THE SIGN-IN BACKDROP — entry point for the Keycloak login theme.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This file is not imported by the web application. It is the entry point of a SEPARATE
 * bundle, built by `apps/web/scripts/build/build-login-theme.mjs` and served by Keycloak from
 * `infra/keycloak-themes/indcore/login/resources/js/backdrop.js`.
 *
 * It lives here, next to the geometry it draws, rather than in the theme folder, for one
 * reason: there is exactly one floor plan, and a second copy of it in a second place is a
 * second copy that will drift. The theme folder holds the BUILT artefact; this holds the
 * source, beside the model it is a view of.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * THE ONE RULE THIS FILE OBEYS
 * ───────────────────────────────────────────────────────────────────────────────
 * The sign-in form must be usable if every line below fails.
 *
 * The dark treatment of the form — the glass card, the readable labels, the aurora button —
 * is entirely in `indcore.css` and needs no JavaScript at all. This file adds the moving
 * factory BEHIND that, and nothing else. So a blocked script, a refused WebGL context, a
 * corporate machine with hardware acceleration switched off, all land in the same harmless
 * place: a still, dark, perfectly usable login page.
 *
 * That is not defensive habit. This is now the first door of the product, and it is the one
 * screen where a person who cannot get past it has no way to work around it.
 */

import { mountFloorPlan, type FloorPlanScene } from "./floorplan-scene";
import { SCENE_PALETTE, type SceneTheme } from "./floorplan-geometry";

/** Marks the document once the canvas is genuinely painting, so CSS can respond to what
 *  actually happened rather than to what was attempted. */
const LIVE_CLASS = "ind-backdrop-live";

/**
 * IS THERE A GPU BEHIND THIS CONTEXT, OR IS THE CPU PRETENDING?
 *
 * This is not a nicety, and it was found the hard way. Rendered through SwiftShader —
 * Chrome's software rasteriser, which is what you get when there is no GPU, when the driver
 * is blacklisted, or when a group policy has turned hardware acceleration off — the bloom
 * pass saturated the main thread so completely that the SIGN IN BUTTON STOPPED RESPONDING TO
 * CLICKS. Not slow: dead. The button was on top, enabled, and hit-testing correctly, and the
 * page simply never got a turn to process the event.
 *
 * That is the single worst thing this feature could do, and no amount of "it looks lovely on
 * my machine" makes up for it. Bloom is several full-screen gaussian passes per frame; on a
 * CPU rasteriser it is hopeless, while the bare line drawing underneath is perfectly cheap.
 *
 * Fails OPEN — an unreadable or unrecognised renderer string is treated as a real GPU. The
 * cost of being wrong that way is a stutter; the cost of being wrong the other way is
 * penalising every machine whose browser simply will not name its hardware.
 */
function isSoftwareRenderer(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return false;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(
      (info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "") ||
        gl.getParameter(gl.RENDERER),
    );
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return /swiftshader|llvmpipe|software|basic render|mesa offscreen/i.test(
      name,
    );
  } catch {
    return false;
  }
}

/**
 * Two questions, and they are genuinely different — the same distinction the gateway draws.
 *
 * `prefers-reduced-motion` is a PERSON saying "stop moving things", and it is obeyed
 * absolutely. Low power is a MACHINE that will stutter through a bloom pass; it keeps the
 * motion and loses the expensive paint. Conflating them would either give a migraine
 * sufferer a moving scene or give an old office PC a slideshow.
 */
function readCapability(): { reduced: boolean; lowPower: boolean } {
  const reduced =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 8;
  const memory = nav.deviceMemory ?? 8;
  // Deliberately generous. A false "low power" costs a little beauty; a false "high power"
  // costs a stuttering first impression, and this screen only gets one.
  const lowPower = cores <= 4 || memory <= 4 || isSoftwareRenderer();
  return { reduced, lowPower };
}

/**
 * Which panel is being drawn on, read from the page rather than decided here.
 *
 * `data-theme` is written onto `<html>` by the blocking loader before the first paint, from
 * the shared cookie or the operating system. Reading it back means the canvas and the
 * stylesheet cannot disagree — and they must not, because the canvas is composited ONTO the
 * panel the stylesheet paints, and a mismatch is not a wrong tint, it is a solid rectangle
 * over the sign-in form.
 */
function readTheme(): SceneTheme {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

function start(): void {
  // Belt and braces: the theme could be applied twice by a template we do not control, and
  // two WebGL contexts fighting over the same page is a real way to lose one of them.
  if (document.getElementById("ind-backdrop")) return;

  const host = document.createElement("div");
  host.id = "ind-backdrop";
  host.setAttribute("aria-hidden", "true");
  /**
   * ONLY THE SAFETY PROPERTIES ARE SET HERE. The box — which panel, how wide, where it goes
   * when the layout stacks — belongs to the stylesheet, beside the gradient and the grid
   * that have to agree with it to the pixel. Three places describing one edge is two places
   * too many, and inline styles win over stylesheets, so a duplicate here would quietly
   * defeat every responsive rule.
   *
   * These three are the exception because they are what stops scenery moving the thing it
   * sits behind. `position: fixed` with no offsets collapses to nothing if the stylesheet
   * never arrives — invisible, which is the correct failure for a decoration, and far
   * better than a full-bleed canvas shouldering the sign-in form off the page.
   */
  host.style.position = "fixed";
  host.style.zIndex = "0";
  host.style.pointerEvents = "none";

  document.body.insertBefore(host, document.body.firstChild);

  const { reduced, lowPower } = readCapability();
  let theme = readTheme();

  /**
   * Everything about this scene EXCEPT which panel it is on. Named once so that the initial
   * mount and every theme rebuild are provably the same scene in different light — the two
   * used to be one call, and a rebuild that quietly differed from the original would look
   * like the theme had changed more than the theme.
   */
  const sceneOptions = {
    reduced,
    lowPower,
    /**
     * How firmly the lines are drawn — and it is now UNSET, which is the change.
     *
     * 0.62 was a confident white stroke on near-black. On the light panel the same number is
     * a heavy slate scribble, because the two panels are not drawing the same thing: one
     * emits and the other subtracts. Each palette states its own figure and this defers to
     * it, which is the only arrangement where "the lines look right" can be true twice.
     */
    // …while the HALO comes right down. At the coupled default this was about 1.4, and the
    // bleed off every wall turned the frame into a haze that the sign-in card then had to
    // fight its way out of. Dropping it to 0.45 keeps a clear glow on the strokes and gives
    // the void back its blackness. Unused on the light panel, which builds no bloom pass at
    // all — see `SCENE_PALETTE`.
    glow: 0.45,
    /**
     * FULLY CONTAINED, and this changed when the hologram got its own panel.
     *
     * It used to be 1.04 — deliberately bleeding past the edges of the frame, because the
     * form sat over the middle of it and the corners were all anybody could see. Now the
     * form is somewhere else entirely and the whole model is on show, so a value over 1
     * would simply amputate the plan at the panel edge.
     *
     * 0.94 fills the panel confidently and still clears every edge through a complete
     * revolution — the fit samples the projected corners at every angle of the turn, not
     * just the one it starts on, so "never clipped" holds while it is moving and not only
     * in the frame somebody screenshotted.
     */
    fit: 0.94,
  } as const;

  let scene: FloorPlanScene | null = null;
  try {
    scene = mountFloorPlan(host, { ...sceneOptions, theme });
  } catch {
    // A driver-level failure inside three.js, not just an absent context. Same answer.
    scene = null;
  }

  if (!scene) {
    host.remove();
    return;
  }

  document.documentElement.classList.add(LIVE_CLASS);

  // A person can change their mind about motion — or their OS can, at sunset, on a schedule
  // they set months ago. The scene is told; it is never rebuilt, because rebuilding it would
  // flash the front door.
  const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  motion?.addEventListener?.("change", (e) => scene?.setReduced(e.matches));

  /**
   * ───────────────────────────────────────────────────────────────────────────────
   * SWITCHING PANELS IS A REBUILD, AND IT IS THE ONE THING HERE THAT IS
   * ───────────────────────────────────────────────────────────────────────────────
   * Motion is told, never rebuilt, because rebuilding flashes the front door. The theme
   * cannot be told: the region colours are baked into vertex materials, both label inks are
   * baked into canvas textures, the marker's blending mode is fixed at material construction
   * and the bloom pass either exists or does not. Half of that is not mutable at all, and
   * mutating the other half would leave a scene whose parts disagreed.
   *
   * So it is torn down and rebuilt — and the flash is avoided a different way: the canvas
   * fades to nothing FIRST, the swap happens while it is invisible, and it fades back. What a
   * person sees is the hologram dissolving and reforming in the new light, which is the
   * "brief, refined colour/material transition" the brief asks for and is also simply the
   * truth about what happened.
   */
  const applyTheme = (next: SceneTheme): void => {
    if (next === theme) return;
    theme = next;
    host.style.transition = "opacity 260ms ease";
    host.style.opacity = "0";
    window.setTimeout(() => {
      scene?.dispose();
      scene = mountFloorPlan(host, { ...sceneOptions, theme });
      // A rebuild that fails leaves the panel empty rather than stuck at zero opacity — the
      // stylesheet alone is a complete, usable sign-in page, and that is the correct floor.
      host.style.opacity = "1";
    }, 280);
  };

  const themeWatch = new MutationObserver(() => applyTheme(readTheme()));
  themeWatch.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  // Free the context on the way out. A login page navigates away almost immediately — that
  // is its entire purpose — and a leaked WebGL context per attempt is how a browser reaches
  // its context limit and starts refusing new ones across every tab.
  window.addEventListener("pagehide", () => scene?.dispose(), { once: true });
}

/**
 * Keycloak renders `properties.scripts` as classic, non-deferred tags in `<head>`, so at the
 * moment this runs there is usually no `<body>` to attach to yet. Checked rather than
 * assumed, because a cached or bfcache-restored page can arrive already complete and a bare
 * `DOMContentLoaded` listener would then never fire.
 */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
