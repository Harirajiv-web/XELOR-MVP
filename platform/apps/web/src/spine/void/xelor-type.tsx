"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * THE XELOR TYPE SYSTEM — one voice across the sign-in page, the Brain and the map.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The sign-in page is Keycloak's, so its typography is written in CSS
 * (`infra/keycloak-themes/indcore/login/resources/css/indcore.css`) and the void's is
 * written in React. Two files, one identity — which is exactly the arrangement that drifts,
 * and had already drifted: the wordmark on the Brain screen was rendering at weight 600
 * while the same word on the sign-in page rendered at 800. Nobody would name the fault, but
 * the two screens did not look like the same product.
 *
 * The four steps below are transcribed from that stylesheet. If one of them changes there,
 * it changes here.
 *
 *   MARK     800 · 0.20em · uppercase   the product name, and the hub that carries it
 *   NAME     700 · 0.20em · uppercase   a department: secondary to the hub, above its own copy
 *   BYLINE   600 · 0.34em · uppercase   the second shade — AIKYANTRA, and the hub's subtitle
 *   NOTE     600 · 0.14em · uppercase   the smallest thing on screen, and the most restrained
 *
 * WHY UPPERCASE THROUGHOUT. The identity is a wide-tracked capital wordmark; a sentence-case
 * label beside it reads as a different system's furniture. The one place this is relaxed is
 * genuine prose — the "no department is licensed for you" paragraph — because tracked
 * capitals across three lines of explanation is a poster, not a message.
 *
 * There is no font family here on purpose. Everything inherits `--font-ui` from the page,
 * which is the same Inter the sign-in page asks for. Naming it again in a second place is
 * how a family drifts.
 */

import type { CSSProperties } from "react";

/** The product name, and the ONYX hub that stands in the same relationship to the map. */
export const MARK: CSSProperties = {
  fontWeight: 800,
  letterSpacing: "0.2em",
  textTransform: "uppercase",
  lineHeight: 1,
};

/** A department: the same shape as the mark, one step down in weight. */
export const NAME: CSSProperties = {
  fontWeight: 700,
  letterSpacing: "0.2em",
  textTransform: "uppercase",
  lineHeight: 1,
};

/**
 * ONYX AT THE HUB — the same face, deliberately UNBOLDED.
 *
 * It carried `MARK`'s 800 and now carries 500, which removes the one cue it had been leaning
 * on. So the hierarchy has to come from somewhere, and it comes from the two things that
 * actually made it the hub in the first place: it is at the CENTRE of a radial layout with
 * six lines converging on it, and it is set LARGER than any department around it. Weight was
 * never doing that work; it was only shouting over it.
 *
 * The tracking widens from 0.20em to 0.26em. A lighter weight at the same tracking reads as
 * smaller and less deliberate — opening the letters back up is what keeps it feeling
 * placed rather than merely thinner.
 */
export const HUB: CSSProperties = {
  fontWeight: 500,
  letterSpacing: "0.26em",
  textTransform: "uppercase",
  lineHeight: 1,
};

/** The second shade. BY AIKYANTRA under the mark; THE BRAIN under ONYX. */
export const BYLINE: CSSProperties = {
  fontWeight: 600,
  letterSpacing: "0.34em",
  textTransform: "uppercase",
  lineHeight: 1,
};

/** Supporting microcopy — a department's full name, the way back, the interaction hint. */
export const NOTE: CSSProperties = {
  fontWeight: 600,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  lineHeight: 1.45,
};

/**
 * THE MARK ON THE WALL.
 *
 * Rendered by the Gateway rather than by either stance, and it never fades. That is the
 * cheapest possible answer to "one continuous intelligent system": the Brain leaves, the
 * map arrives, and the one thing that does not move is the product's name. An earlier
 * version faded it out for the travel and the screen briefly belonged to nobody.
 *
 * `pointer-events-none` because the Brain is the only control on that stance and a dead
 * click on a logo beside it is a person concluding the page is broken.
 */
export function Wordmark(): React.JSX.Element {
  return (
    <div
      className="pointer-events-none absolute top-[clamp(1.75rem,4vh,3rem)] left-[clamp(1.5rem,3.5vw,3rem)] z-20 select-none"
      data-xelor-wordmark
    >
      <div
        className="text-(--void-ink)"
        style={{ ...MARK, fontSize: "clamp(1.25rem, 1.8vw, 1.75rem)" }}
      >
        XELOR
      </div>
      {/* Cool grey rather than charcoal: on a near-black void a charcoal subtitle is not
          understated, it is invisible. This measures about 7:1 against the void. */}
      <div
        className="mt-[0.7rem] text-(--void-ink-soft)"
        style={{ ...BYLINE, fontSize: "0.6rem" }}
      >
        By Aikyantra
      </div>
    </div>
  );
}
