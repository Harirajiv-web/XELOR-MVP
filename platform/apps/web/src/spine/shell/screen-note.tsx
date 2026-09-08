"use client";

import { Disclosure } from "../ui/disclosure";

/**
 * Secondary guidance is available when needed without standing between the user and work.
 */
export function ScreenNote({
  moduleKey,
  moduleName,
  screenKey,
  label,
  description,
}: {
  moduleKey: string;
  moduleName: string;
  screenKey: string;
  label: string;
  description?: string;
}): React.JSX.Element | null {
  if (!description) return null;

  return (
    <Disclosure
      title="About this screen"
      hint={`${moduleName} · ${label}`}
      className="mb-3"
    >
      <p data-screen={`${moduleKey}/${screenKey}`}>{description}</p>
    </Disclosure>
  );
}
