"use client";

import { Gateway } from "@spine/void/gateway";

/**
 * `/` — the front door.
 *
 * It used to redirect straight into the first module screen the user could open, on the
 * reasoning that an empty dashboard is a bad first impression. That reasoning still holds,
 * and this is a better answer to it than a redirect: nobody lands on an empty anything,
 * and the first thing they see says what this product is before it shows them a table.
 *
 * Every ERP URL is untouched. `/inventory/stock` is still `/inventory/stock`, still inside
 * the full shell, still behind the same three gates. This adds a way in; it takes nothing
 * away.
 */
export default function VoidRoute(): React.JSX.Element {
  return <Gateway />;
}
