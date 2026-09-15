"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Grid3x3, ArrowUpRight } from "lucide-react";
import { Modal } from "../ui/modal";
import { cn } from "../ui/cn";
import {
  ALL_PRODUCT_PROFILES,
  PRODUCT_FAMILIES,
  PRODUCT_PROFILE,
  type ProductProfile,
} from "../product/profile";

/**
 * THE PRODUCT LAUNCHER — moving between ten products without reading ten rows.
 *
 * WHAT THIS REPLACES, and why it had to move. Switching products used to live inside the
 * account modal: click your avatar, read past your own name and company, and find a flat
 * list headed "Open a product". That worked while there were four. Ten turns it into the
 * exact failure the sidebar's own grouping file warns about — an undifferentiated list
 * long enough that you read all of it to find the one you open every morning. And its
 * placement said the wrong thing: switching products is not an account setting, it is
 * navigation, and navigation belongs in the chrome where navigation lives.
 *
 * SO: a dedicated control in the topbar, and a grid grouped into the four families.
 *
 * Three decisions worth recording, because each is a thing every mature product range
 * gets right and a hurried one gets wrong:
 *
 *   1. GROUPED, NOT LISTED. Four headings of one to six items each, in the order a person
 *      meets them — what you run the business on, what you add to it, what works alongside
 *      it, everything at once. A heading answers "what kind of thing is this" before the
 *      reader has to parse a product name they may not know yet.
 *
 *   2. EACH PRODUCT CARRIES ITS OWN COLOUR. The swatch is that product's real `themeColor`
 *      — the same value its palette paints its sidebar with. So the mark in the launcher
 *      and the chrome you land on are the same colour, and the range becomes recognisable
 *      by sight rather than by reading. This is why the six palettes were built to be
 *      distinguishable in the first place; without a launcher nobody would ever see them
 *      side by side.
 *
 *   3. THE CURRENT PRODUCT IS MARKED AND INERT. It renders as a non-link with a tick. A
 *      launcher whose current entry navigates is a launcher that reloads the page you are
 *      already on, which reads as a bug.
 *
 * WHY IT IS NOT GATED TO LOCALHOST. The old list only rendered on localhost, because the
 * ports it links to are a local-development fact. That is still true of the PORT, but not
 * of the NEED: a customer running two products on real hostnames still has to move between
 * them. The origin is therefore derived from wherever this page is actually being served —
 * same hostname, the target product's port — which is correct locally and is the honest
 * default anywhere else. A deployment that fronts products on different hostnames will
 * need a real origin per profile, and that is a deployment concern, not a shell concern.
 */

function originFor(profile: ProductProfile): string {
  if (typeof window === "undefined") return `http://localhost:${profile.port}/home`;
  return `${window.location.protocol}//${window.location.hostname}:${profile.port}/home`;
}

export function ProductLauncher(): React.JSX.Element {
  const [open, setOpen] = useState(false);

  const families = useMemo(
    () =>
      PRODUCT_FAMILIES.map((family) => ({
        ...family,
        products: ALL_PRODUCT_PROFILES.filter((profile) => profile.family === family.id),
      })).filter((family) => family.products.length > 0),
    [],
  );

  // Ctrl/⌘ + Shift + P. Shift is deliberate: ⌘K is already the screen search, and a
  // launcher that stole a single-modifier chord from search would be the more common
  // action losing to the rarer one.
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        className="x-icon-button"
        aria-label={`Switch product — currently ${PRODUCT_PROFILE.name}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Grid3x3 className="h-[18px] w-[18px]" aria-hidden />
      </button>

      {open ? (
        <Modal
          title="Your products"
          subtitle="One core, the packages that extend it, and the products that work alongside."
          onClose={() => setOpen(false)}
          width="max-w-3xl"
        >
          <div className="x-launcher">
            {families.map((family) => (
              <section key={family.id} className="x-launcher-family">
                <div className="x-launcher-family-head">
                  <h3>{family.name}</h3>
                  <p>{family.purpose}</p>
                </div>
                <div className="x-launcher-grid">
                  {family.products.map((profile) => {
                    const current = profile.phase === PRODUCT_PROFILE.phase;
                    const body = (
                      <>
                        <span
                          className="x-launcher-mark"
                          style={{ background: profile.themeColor }}
                          aria-hidden
                        />
                        <span className="x-launcher-text">
                          <strong>{profile.name}</strong>
                          <small>{profile.label}</small>
                        </span>
                        {current ? (
                          <Check className="x-launcher-icon" aria-hidden />
                        ) : (
                          <ArrowUpRight className="x-launcher-icon" aria-hidden />
                        )}
                      </>
                    );
                    return current ? (
                      <div
                        key={profile.phase}
                        className={cn("x-launcher-card", "is-current")}
                        aria-current="page"
                      >
                        {body}
                      </div>
                    ) : (
                      <a
                        key={profile.phase}
                        className="x-launcher-card"
                        href={originFor(profile)}
                        onClick={() => setOpen(false)}
                      >
                        {body}
                      </a>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          <p className="x-launcher-foot">
            Every product reads and writes the same company records, so a change made in one
            is visible in the others. Press <kbd>⌘ ⇧ P</kbd> to open this anywhere.
          </p>
        </Modal>
      ) : null}
    </>
  );
}
