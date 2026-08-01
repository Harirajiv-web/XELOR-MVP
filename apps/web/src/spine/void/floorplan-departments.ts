/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * WHO OWNS EACH AREA OF THE FLOOR, AND WHAT COLOUR IT IS.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * `floorplan-data.ts` is traced from the plan and marked "do not hand-edit". This is the
 * editorial layer that sits beside it: the mapping from a physical area to the department
 * that owns its system of record, the one solid colour that area is filled with, and how
 * many people are on it.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * THE MAPPING IS REAL, AND IT IS NOT ONE-TO-ONE
 * ───────────────────────────────────────────────────────────────────────────────
 * `NAME.md` defines seven departments — HEXA, MICA, SPAR, AXLE, KILN, RASP, ONYX — cut by
 * SYSTEM-OF-RECORD OWNERSHIP, not by physical geography. The plan has six physical areas.
 * The two sets do not correspond, and pretending they do would mean inventing departments
 * for a picture:
 *
 *   · KILN owns three areas, because Manufacturing Operations genuinely owns the machine
 *     shop, fabrication and the paint shop. Repeating the name is the truth, not an error.
 *   · SPAR owns two, because Supply Chain owns both goods inward and the stores that feed
 *     the line.
 *   · MICA owns despatch, because Commercial owns dispatch and invoicing.
 *   · HEXA, AXLE, RASP and ONYX own NO floor area, and that is correct — platform and
 *     governance, engineering and planning, people and money, and AI operations are not
 *     places on a shop floor. Putting them on the map would be drawing an org chart and
 *     calling it a factory.
 *
 * So every division carries two labels: the area's own name, and the department that owns
 * it. That satisfies "name every division" without fabricating a correspondence.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * WHY THESE COLOURS
 * ───────────────────────────────────────────────────────────────────────────────
 * Every one is held under the bloom pass's 0.5 luminance threshold on purpose. Above it the
 * fill itself starts to glow, and a glowing fill bleeds across its own boundary into the
 * area next door — which is precisely the ambiguity between neighbouring regions the design
 * forbids. Under the threshold the fills stay flat and only the white edges bloom, so the
 * separators read as separators.
 *
 * They are also separated in LIGHTNESS as well as hue, not just hue. Sage and coral are the
 * pair that collapses under red-green colour blindness; giving them different luminances
 * means they remain tellable apart when their hues do not. The labels carry the real
 * identity regardless — colour is the fast cue, never the only one.
 */

export interface ZoneAnnotation {
  /** Matches a `FloorplanZone.id` in `floorplan-data.ts`. */
  readonly id: string;
  /** The four-letter department owning this area's system of record (`NAME.md` §2). */
  readonly department: string;
  /** One solid fill colour on the DARK panel. Held under the bloom threshold — see above. */
  readonly color: number;
  /**
   * The same region on the LIGHT panel, and it is a different value rather than the same one
   * dimmed. See the note below `ZONE_ANNOTATIONS_LIGHT`.
   */
  readonly colorLight: number;
  /**
   * People on this floor. Occupancy, not capacity — the despatch bay and goods inward are
   * deliberately sparse because that is what they look like at a given moment, and a map
   * where every area is equally busy tells a viewer nothing.
   */
  readonly heads: number;
}

/**
 * AUTHORED VIVID, SEEN AS GLASS. These values are far more saturated than the floor looks,
 * and that is the point: the fills render at `FILL_ALPHA` over a near-black panel, so about a
 * quarter of what is written here reaches the eye.
 *
 * The two decisions are linked and cannot be made separately. Thinning the fills until the
 * hologram reads as glass also pulls every region towards black — and towards EACH OTHER, in
 * absolute terms — until colour stops identifying anything, which is the ambiguity the design
 * forbids. At a quarter coverage a genuinely muted palette collapses: the closest pair fell
 * to about 20 levels apart on screen, which is not a colour difference anybody can name.
 * Chroma at the source is what buys the translucency back.
 *
 * Do not "tone these down" by reading the hex values. They are not what anyone sees.
 *
 * Two constraints hold the values in place, and the harness checks both:
 *
 *   · SEPARATION. Measured, not eyeballed — an earlier set read as six clearly different
 *     colours and was not, with sand and coral 33 apart and blue and teal 38. The closest
 *     pair here is 82, which survives being multiplied by the fill's alpha.
 *   · BLOOM. The rendered fill must stay under the bloom pass's threshold, or a region glows
 *     and bleeds across its own boundary into its neighbour. Thinner fills leave far more
 *     headroom here, which is what makes brighter sources safe.
 *
 * The two warm tones — the pair that collapses under red-green colour blindness — are also
 * separated in LIGHTNESS, so they stay tellable apart when their hues do not.
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * WHY THE LIGHT PANEL NEEDS ITS OWN SIX, AND NOT THESE SIX DARKENED
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * On the dark panel the canvas is composited with `screen`, which ADDS: a fill at alpha `a`
 * over black arrives as `a × c`. Every colour therefore travels TOWARDS BLACK, and the six
 * stay apart only because they were authored vivid enough to survive being quartered.
 *
 * On the light panel the canvas is composited with `multiply`, which SUBTRACTS: the same fill
 * over white arrives as `1 − a + a×c`. Every colour now travels TOWARDS WHITE — the opposite
 * direction — and the bright sources above are the worst possible starting point, because a
 * bright colour has almost nothing to subtract. `#ffc24d` at 38% over white is a barely-tinted
 * cream; `#00e5d0` is a pale mint. Six pale tints, four of which nobody could name.
 *
 * So the light set is the same six HUES at the 700 level, chosen so they still separate after
 * being lightened rather than after being darkened. Measured at the light path's own alpha,
 * on screen:
 *
 *     sand / coral      32.3      the closest pair, and the pair that collapses under
 *                                 red-green colour blindness — so they are separated in
 *                                 LIGHTNESS as well as hue, as on the dark panel
 *     blue / violet     37.7
 *     teal / blue       40.2
 *     teal / sage       52.7
 *
 * The dark path's measured closest pair is 30, so this is slightly better separated than what
 * already shipped — which is the bar, not a coincidence: the same harness measures both.
 *
 * Sage moved furthest from its dark counterpart, from a soft mint to a lime. A green that
 * works beside teal on black is a green that disappears beside teal on white, because the two
 * converge as they both approach the background rather than as they both approach it from the
 * other side.
 */
export const ZONE_ANNOTATIONS: readonly ZoneAnnotation[] = [
  // XELOR aurora: related jewel tones rather than six unrelated neon primaries. The cool
  // KILN sequence flows teal → sky → indigo, while supply and dispatch retain distinct
  // emerald, amber and rose cues. Each light-panel value is the accessible 700 counterpart.
  { id: "machine_shop", department: "KILN", color: 0x2dd4bf, colorLight: 0x0f766e, heads: 9 },
  { id: "paint_shop", department: "KILN", color: 0x38bdf8, colorLight: 0x0369a1, heads: 5 },
  { id: "fabrication", department: "KILN", color: 0x818cf8, colorLight: 0x4338ca, heads: 7 },
  { id: "materials_prep", department: "SPAR", color: 0xfbbf24, colorLight: 0xa16207, heads: 4 },
  { id: "materials_in", department: "SPAR", color: 0x34d399, colorLight: 0x047857, heads: 3 },
  { id: "goods_out", department: "MICA", color: 0xfb7185, colorLight: 0xbe123c, heads: 2 },
];

const BY_ID = new Map(ZONE_ANNOTATIONS.map((a) => [a.id, a]));

/**
 * Falls back to a neutral slate rather than throwing. The plan is traced art: if a re-trace
 * ever adds an area nobody has assigned yet, the right outcome is a grey region with no
 * department claimed — visibly unowned — not a sign-in page that fails to paint.
 */
export function annotationFor(zoneId: string): ZoneAnnotation {
  return (
    BY_ID.get(zoneId) ?? {
      id: zoneId,
      department: "",
      color: 0x4a5568,
      colorLight: 0x64748b,
      heads: 0,
    }
  );
}

/** The fill colour this zone takes on the panel currently being drawn. */
export function zoneColor(a: ZoneAnnotation, theme: "light" | "dark"): number {
  return theme === "light" ? a.colorLight : a.color;
}
