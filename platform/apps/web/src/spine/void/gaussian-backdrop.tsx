"use client";

/**
 * The Gaussian field, mounted behind the void.
 *
 * Everything expensive lives in `gaussian-field.ts`; this file's whole job is to own a
 * canvas, hand the renderer the two facts it cannot read for itself — the current theme and
 * the department palette — and take it down cleanly. It renders nothing at all on the server
 * and nothing on a machine that cannot afford it, which is why the caller must treat it as
 * decoration that may simply not be there.
 *
 * IT IS LOADED LAZILY AND ON PURPOSE. `three` is ~600 kB and this is a background; putting
 * it in the entry bundle would put half a megabyte in front of the first paint of the
 * product's front door, which is exactly the mistake `theme.properties` warns about for the
 * sign-in scene. The import happens after mount, so the void is already on screen — and if
 * it never resolves, the CSS aurora washes are still the background and nothing is broken.
 */

import { useEffect, useRef } from "react";
import { DEPARTMENTS } from "../registry/departments";
import type { GaussianFieldHandle } from "./gaussian-field";

export interface GaussianBackdropProps {
  theme: "dark" | "light";
  reduced: boolean;
  lowPower: boolean;
}

export function GaussianBackdrop({
  theme,
  reduced,
  lowPower,
}: GaussianBackdropProps): React.JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handleRef = useRef<GaussianFieldHandle | null>(null);

  // The field is built ONCE and repainted for theme changes, never rebuilt for them. A
  // rebuild would re-seed the whole sky and the light/dark toggle would look like a cut to a
  // different background rather than the same room under a different light.
  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    void (async () => {
      const { createGaussianField } = await import("./gaussian-field");
      if (cancelled) return;
      handleRef.current = createGaussianField(canvas, {
        theme,
        reduced,
        lowPower,
        accents: DEPARTMENTS.map((d) => d.accent),
      });
    })();

    return () => {
      cancelled = true;
      handleRef.current?.dispose();
      handleRef.current = null;
    };
    // `theme` is deliberately absent: it is applied through `setTheme` below rather than by
    // remounting. Including it here is what would cause the re-seed described above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, lowPower]);

  useEffect(() => {
    handleRef.current?.setTheme(theme);
  }, [theme]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      data-gaussian-field
      className="pointer-events-none absolute inset-0 h-full w-full"
      // Behind the aurora washes and the map, in front of the flat background colour. The
      // field is a volume the scene sits inside, not a picture hung behind it.
      style={{ zIndex: 0 }}
    />
  );
}
