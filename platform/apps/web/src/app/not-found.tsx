"use client";

import Link from "next/link";
import { FileQuestion } from "lucide-react";

/**
 * A branded not-found page.
 *
 * Next's default is a black screen reading "404 — This page could not be found", with no
 * navigation and nothing of the product on it. In an ERP that is a dead end: the user
 * mistyped a URL or followed a link to a module this build does not contain, and what they
 * get looks like the whole application fell over.
 *
 * This one says which address failed, explains the two ordinary reasons, and offers the
 * way back.
 */
export default function NotFound(): React.JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <span className="grid h-9 w-9 place-items-center rounded-[8px] bg-[var(--brand)] text-[15px] font-bold text-[var(--text-on-brand)]">
          A
        </span>
        <FileQuestion className="h-8 w-8 text-[var(--text-muted)]" aria-hidden />
        <h1 className="text-[18px] font-bold text-[var(--text-primary)]">
          That page isn&apos;t here
        </h1>
        <p className="text-[13px] leading-5 text-[var(--text-secondary)]">
          Either the address is wrong, or it belongs to a module this installation does not
          include. Modules can be left out for a company that does not need them.
        </p>
        <Link
          href="/"
          className="mt-1 rounded-[var(--radius-control)] bg-[var(--brand)] px-3.5 py-2 text-[13px] font-semibold text-[var(--text-on-brand)] transition-colors hover:bg-[var(--brand-hover)]"
        >
          Go to the first screen you can open
        </Link>
      </div>
    </div>
  );
}
