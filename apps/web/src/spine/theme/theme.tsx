"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * LIGHT, DARK, OR WHATEVER THE MACHINE IS SET TO.
 *
 * Not a preference panel and not a novelty. This product is read in two places that could
 * not be less alike: a plant office at eleven in the morning with sun on the monitor, where
 * the light theme is the only legible one; and a supervisor's screen on the shop floor at
 * two in the morning, where a white page is a lamp pointed at somebody's face. "System" is
 * the default because the operating system already knows which of those it is.
 *
 * ------------------------------------------------------------------------------
 * WHY THE VALUE IS WRITTEN ONTO <html> AND NOT HELD IN REACT STATE
 * ------------------------------------------------------------------------------
 * Every colour in this product is a CSS custom property, and `:root[data-theme="dark"]`
 * redefines the whole set in one place. Switching themes is therefore one attribute write —
 * no component re-renders, no stylesheet swap, nothing to keep in sync. It also means a
 * screen written months from now is themed correctly without its author doing anything,
 * which is the only version of this that survives sixteen module folders.
 *
 * THE FLASH. If the first paint happened before this component mounted, everyone on dark
 * would get a white page for one frame — the effect the whole point of dark mode is to
 * avoid, delivered at the worst possible moment. `themeBootScript` below runs before the
 * body renders and settles it, and this provider then reads what that script already did
 * instead of deciding again. React never renders a value the DOM disagrees with, so
 * hydration stays quiet.
 */

export type ThemeChoice = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const KEY = "indcore.theme";

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * THE SAME CHOICE, ON TWO ORIGINS.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The sign-in page is Keycloak's and it is served from a different origin — `:8080` here,
 * an auth host in production. `localStorage` is scoped to an origin, so a person who
 * switches to light on the sign-in screen would arrive at a dark Brain a second later, and
 * a person who set light inside the product would meet a dark sign-in page every morning.
 * That is not a theme; that is two applications.
 *
 * COOKIES IGNORE THE PORT. A host-only cookie set on `localhost` is sent to `localhost:8080`
 * and `localhost:3001` alike — the one storage mechanism whose scope is the host rather than
 * the origin. In production the two live on sibling subdomains, so this needs
 * `domain=.<registrable-domain>` to keep working; that is the single line to change and it
 * is called out here because nothing will fail loudly when it is wrong. The theme will
 * simply stop following people across the front door.
 *
 * The cookie is therefore the SHARED record and `localStorage` is kept beside it: the cookie
 * is what makes the two screens agree, and the local copy is what still works when cookies
 * are refused by policy. Read prefers the cookie, because it is the only one of the two that
 * either screen can have written.
 */
const COOKIE = "xelor.theme";
/** A year. Long enough that "persist for future visits" means what it says. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

interface ThemeContextValue {
  /** What the person chose, including "system". */
  choice: ThemeChoice;
  /** What that resolves to right now. Never "system". */
  resolved: ResolvedTheme;
  setChoice: (c: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  choice: "system",
  resolved: "light",
  setChoice: () => {},
});

/**
 * Runs before the first paint, inlined into <head>.
 *
 * Deliberately tiny and deliberately defensive: it is the only script in the application
 * that runs outside React, and a throw here would leave the page unstyled rather than
 * merely unthemed. Private browsing modes and locked-down group policies both make
 * `localStorage` throw on read, so it is wrapped.
 */
/**
 * THE DOT IN `xelor.theme` HAS TO BE ESCAPED EXACTLY ONCE.
 *
 * This is a regex built by string concatenation inside a template literal, which is two
 * layers of escaping stacked on each other, and getting it wrong is silent: `"\\\\."` emits
 * `\\.` into the script, which the regex engine reads as "a literal backslash, then any
 * character" — so the pattern never matched, the cookie was never read, and a person who
 * chose light on the SIGN-IN page arrived at a dark Brain. Everything looked correct;
 * nothing threw. Measured end to end, which is the only way this class of fault surfaces.
 */
export const themeBootScript = `(function(){try{
var m=document.cookie.match(/(?:^|; )${COOKIE.replace(".", "\\.")}=(light|dark|system)/);
var c=(m&&m[1])||localStorage.getItem(${JSON.stringify(KEY)})||"system";
var d=c==="dark"||(c==="system"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);
document.documentElement.setAttribute("data-theme",d?"dark":"light");
document.documentElement.style.colorScheme=d?"dark":"light";
}catch(e){document.documentElement.setAttribute("data-theme","light");}})();`;

/** Writes the shared record. Silent on failure — see `setChoice`. */
function writeCookie(c: ThemeChoice): void {
  try {
    document.cookie = `${COOKIE}=${c}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  } catch {
    /* A browser that refuses cookies still gets a themed session from localStorage. */
  }
}

function readCookie(): ThemeChoice | null {
  if (typeof document === "undefined") return null;
  const m = new RegExp(`(?:^|; )${COOKIE.replace(".", "\\.")}=(light|dark|system)`).exec(
    document.cookie,
  );
  return (m?.[1] as ThemeChoice) ?? null;
}

function systemIsDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readChoice(): ThemeChoice {
  if (typeof window === "undefined") return "system";
  // The cookie first: it is the only one of the two that the SIGN-IN page can have written,
  // so preferring it is what makes a choice made at the front door survive the walk inside.
  const shared = readCookie();
  if (shared) return shared;
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "light" || v === "dark" || v === "system" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.setAttribute("data-theme", resolved);
  // Tells the browser to draw ITS OWN furniture dark too — scrollbars, the inside of a
  // date picker, the spinner on a number field. Without it those stay bright white and
  // every form on a dark page has three glowing rectangles in it.
  root.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  // Starts on the server default and is corrected in the effect below on the first client
  // render. The DOM is already correct by then — the boot script saw to that — so this is
  // only React catching up with what the page is already showing.
  const [choice, setChoiceState] = useState<ThemeChoice>("system");
  const [resolved, setResolved] = useState<ResolvedTheme>("light");

  useEffect(() => {
    const c = readChoice();
    setChoiceState(c);
    setResolved(c === "system" ? (systemIsDark() ? "dark" : "light") : c);
  }, []);

  // Someone on "system" who switches their laptop to night mode at 18:00 should not have to
  // reload an ERP that has been open since lunch.
  useEffect(() => {
    if (choice !== "system" || typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (): void => {
      const next: ResolvedTheme = mq.matches ? "dark" : "light";
      setResolved(next);
      apply(next);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [choice]);

  const setChoice = useCallback((c: ThemeChoice) => {
    setChoiceState(c);
    const next: ResolvedTheme = c === "system" ? (systemIsDark() ? "dark" : "light") : c;
    setResolved(next);
    apply(next);
    writeCookie(c);
    try {
      window.localStorage.setItem(KEY, c);
    } catch {
      // A locked-down browser can refuse to remember. The theme still changes for this
      // session; refusing to switch at all because we could not write it down would be
      // punishing the user for their IT policy.
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ choice, resolved, setChoice }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
