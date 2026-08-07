/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * THE LOADER — half a kilobyte whose entire job is to not be the backdrop.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Keycloak renders `properties.scripts` as a plain, non-deferred `<script src>` in `<head>`:
 *
 *     <script src="${url.resourcesPath}/js/backdrop-loader.js" type="text/javascript"></script>
 *
 * There is no `defer` and no `async`, and the attribute is not ours to add — it is baked into
 * the parent theme's `template.ftl`. A classic script in the head BLOCKS HTML PARSING until
 * it has downloaded and run. Pointing that tag straight at the scene would mean half a
 * megabyte of three.js standing between a person and the username field, on the one screen
 * where there is nothing else to look at and nothing else to do.
 *
 * So the blocking tag loads this instead, and this loads the scene ASYNCHRONOUSLY. The form
 * paints on time; the factory arrives a moment later, behind it, which is exactly the order
 * of importance.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * AND IT DECLINES THE DOWNLOAD OUTRIGHT WHEN IT WOULD BE WASTED
 * ───────────────────────────────────────────────────────────────────────────────
 * A machine with no WebGL cannot draw the scene under any circumstances. Fetching, parsing
 * and compiling half a megabyte to discover that is a cost paid by precisely the machines
 * least able to afford it — the old shop-floor PC, the locked-down terminal, the browser
 * with hardware acceleration switched off by group policy. One probe here, and those
 * machines simply never ask for the file.
 */

/** Can this machine draw anything at all? Cheap, and it settles the question before the
 *  expensive part is requested rather than after. */
function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ??
      canvas.getContext("webgl") ??
      canvas.getContext("experimental-webgl");
    if (!gl) return false;
    // Hand the context straight back. Browsers cap how many may exist at once, and a probe
    // that keeps one alive for the lifetime of the page is a probe that can cost the real
    // scene the context it was probing for.
    const lose = (gl as WebGLRenderingContext).getExtension(
      "WEBGL_lose_context",
    );
    lose?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * Where the theme's assets live, taken from this script's own URL.
 *
 * Keycloak's resource path carries a cache-busting build hash — `/resources/bz2mh/login/...`
 * — that changes on every server version. Deriving the sibling's URL from our own means the
 * hash is whatever the server just said it was, and no constant here can go stale.
 */
function siblingUrl(name: string): string | null {
  const self = document.currentScript as HTMLScriptElement | null;
  const src = self?.src;
  if (!src) return null;
  return src.replace(/[^/]+$/, name);
}

/* ═══════════════════════════════════════════════════════════════════════════════
   THE THEME, AND WHY IT LIVES IN THE BLOCKING SCRIPT
   ═══════════════════════════════════════════════════════════════════════════════

   Two reasons, and neither is convenience.

   IT MUST RUN BEFORE THE FIRST PAINT. Deciding the theme after the page has painted is how
   somebody on dark gets a full-screen white flash on the one screen they open every morning
   — which is the exact thing dark mode exists to prevent, delivered at the worst possible
   moment. This is the only script the parent template runs synchronously in `<head>`, so
   this is the only place the decision can be made in time.

   AND THE CONTROL MUST EXIST WITHOUT WEBGL. The scene bundle is deliberately never fetched
   on a machine that cannot draw it — the old shop-floor PC, the locked-down terminal, the
   browser with acceleration off by policy. Those are also the machines most likely to be in
   a bright plant office needing light mode. Putting the toggle in the scene bundle would
   hand it to exactly the people who least need it and withhold it from the people who most
   do.

   The cost is about a kilobyte on top of the loader's six hundred bytes. The documented rule
   this file lives under is "nothing may stand between a person and the username field"; the
   thing that rule was written about is half a megabyte of three.js, and it still does not
   come through here.

   ───────────────────────────────────────────────────────────────────────────────
   THE COOKIE, NOT LOCALSTORAGE
   ───────────────────────────────────────────────────────────────────────────────
   This page is served from Keycloak's origin and the product from the application's, so
   `localStorage` cannot carry a choice between them — it is scoped to an origin. A cookie is
   scoped to a HOST and ignores the port, so one set here arrives at the app and vice versa.
   The name and format are `theme.tsx`'s; the two must not drift, and there is no type system
   spanning them, so it is written down in both places. In production on sibling subdomains
   this needs `domain=.<registrable-domain>` at both ends.
   ═══════════════════════════════════════════════════════════════════════════════ */

type Choice = "light" | "dark" | "system";
const COOKIE = "xelor.theme";

function readChoice(): Choice {
  const m = /(?:^|; )xelor\.theme=(light|dark|system)/.exec(document.cookie);
  return (m?.[1] as Choice) ?? "system";
}

function resolve(c: Choice): "light" | "dark" {
  if (c !== "system") return c;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function apply(c: Choice): void {
  const r = resolve(c);
  const root = document.documentElement;
  root.setAttribute("data-theme", r);
  // The browser's own furniture — the autofill dropdown, the password-reveal eye, the
  // scrollbar. Without this the form on a dark page has three bright rectangles in it.
  root.style.colorScheme = r;
}

// Before anything paints. Wrapped, because a locked-down browser can throw on `document.cookie`
// and an unstyled page is a far worse failure than an unthemed one.
try {
  apply(readChoice());
} catch {
  document.documentElement.setAttribute("data-theme", "light");
}

/** Two paths, and a viewBox, per icon. Hand-drawn rather than imported: a component library
 *  in the blocking script would cost more than everything else on this page put together. */
const ICONS: Readonly<Record<Choice, string>> = {
  light:
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  dark: '<path d="M12 3a6.4 6.4 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  system:
    '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
};
const LABELS: Readonly<Record<Choice, string>> = {
  light: "Light",
  dark: "Dark",
  system: "Match my device",
};

function mountToggle(): void {
  if (document.getElementById("ind-theme")) return;
  const box = document.createElement("div");
  box.id = "ind-theme";
  box.setAttribute("role", "radiogroup");
  box.setAttribute("aria-label", "Appearance");

  const paint = (): void => {
    const chosen = readChoice();
    box.dataset.theme = resolve(chosen);
    box.dataset.choice = chosen;
    for (const b of Array.from(box.children) as HTMLButtonElement[]) {
      const active = b.dataset.value === chosen;
      b.setAttribute("aria-checked", String(active));
    }
  };

  (Object.keys(ICONS) as Choice[]).forEach((value) => {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.value = value;
    b.setAttribute("role", "radio");
    b.title = LABELS[value];
    // "Match my device" alone does not tell a screen-reader user which of the two they are
    // currently looking at, and that is the whole question they would be asking.
    b.setAttribute(
      "aria-label",
      value === "system"
        ? `Match my device — currently ${resolve("system")}`
        : LABELS[value],
    );
    b.innerHTML =
      `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ` +
      `stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[value]}</svg>`;
    b.addEventListener("click", () => {
      try {
        document.cookie = `${COOKIE}=${value}; path=/; max-age=31536000; SameSite=Lax`;
      } catch {
        /* A refused cookie still themes this page; it just will not be remembered. */
      }
      apply(value);
      paint();
    });
    box.appendChild(b);
  });

  paint();
  document.body.appendChild(box);

  // Somebody on "match my device" whose laptop switches at sunset should not have to reload
  // the sign-in page to stop being blinded by it.
  window
    .matchMedia?.("(prefers-color-scheme: dark)")
    ?.addEventListener?.("change", () => {
      if (readChoice() === "system") {
        apply("system");
        paint();
      }
    });
}

/**
 * Brand and scene context that sit OUTSIDE Keycloak's security form.
 *
 * This is intentionally injected rather than implemented by forking `login.ftl`. The
 * username/password markup, action URL, validation messages and future Keycloak security
 * fixes remain entirely upstream-owned; this layer is decorative, removable, and inert.
 */
function mountExperienceChrome(): void {
  if (document.getElementById("ind-stage-copy")) return;

  const stage = document.createElement("section");
  stage.id = "ind-stage-copy";
  stage.setAttribute("aria-label", "XELOR manufacturing intelligence");
  stage.innerHTML = `
    <div class="ind-stage-eyebrow"><span></span> Manufacturing intelligence, alive</div>
    <h1>One factory.<br><em>Nine governed agents.</em></h1>
    <p>See the plant, its decisions and its AI operating system as one connected digital twin.</p>
    <div class="ind-stage-pills" aria-label="Platform capabilities">
      <span>Live operations</span>
      <span>Human approvals</span>
      <span>Audit by design</span>
    </div>
    <div class="ind-stage-status">
      <span class="ind-stage-status-dot" aria-hidden="true"></span>
      <span><b>ONYX network</b><small>Adaptive 3D experience · safe fallback enabled</small></span>
    </div>
  `;
  document.body.appendChild(stage);

  const hud = document.createElement("div");
  hud.id = "ind-scene-hud";
  hud.setAttribute("aria-hidden", "true");
  hud.innerHTML = `
    <div class="ind-hud-live">
      <span class="ind-hud-crosshair"></span>
      <span><b>Digital twin online</b><small>PUNE / PLANT 01 / LIVE MODEL</small></span>
    </div>
    <div class="ind-hud-metrics">
      <span><small>AGENTS</small><b>8 / 8</b></span>
      <span><small>CONTROL</small><b>HUMAN</b></span>
      <span><small>TRACE</small><b>VERIFIED</b></span>
    </div>
    <div class="ind-hud-scan"><span></span>SCANNING OPERATIONAL GRAPH</div>
  `;
  document.body.appendChild(hud);
  document.documentElement.classList.add("ind-experience-ready");

  // A tiny pointer response makes the layered CSS field feel spatial before the WebGL
  // bundle arrives. It changes custom properties only, never the form's transform or hit box.
  let queued = false;
  let x = 50;
  let y = 50;
  window.addEventListener(
    "pointermove",
    (event) => {
      x = (event.clientX / Math.max(window.innerWidth, 1)) * 100;
      y = (event.clientY / Math.max(window.innerHeight, 1)) * 100;
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        document.documentElement.style.setProperty(
          "--x-pointer-x",
          `${x.toFixed(2)}%`,
        );
        document.documentElement.style.setProperty(
          "--x-pointer-y",
          `${y.toFixed(2)}%`,
        );
        queued = false;
      });
    },
    { passive: true },
  );
}

/**
 * This is a local demonstration realm, so the published presenter account is prefilled. The
 * browser still completes the normal Authorization Code + PKCE flow and Keycloak still
 * verifies the selected account. Known specialist names may be entered without memorising a
 * password; unknown credentials are deliberately left untouched so the realm rejects them.
 */
function mountDemoAccess(): void {
  if (document.getElementById("ind-demo-access")) return;
  const form = document.getElementById(
    "kc-form-login",
  ) as HTMLFormElement | null;
  const username = document.getElementById(
    "username",
  ) as HTMLInputElement | null;
  const attemptedUsername = document.getElementById(
    "kc-attempted-username",
  ) as HTMLInputElement | null;
  const password = document.getElementById(
    "password",
  ) as HTMLInputElement | null;
  if (!form || !password) return;
  const submit = document.getElementById("kc-login") as
    HTMLButtonElement | HTMLInputElement | null;

  const hint = document.createElement("div");
  hint.id = "ind-demo-access";
  hint.innerHTML = `
    <span><b>Local investor demo</b><small>Presenter account prefilled · real Keycloak access</small></span>
  `;
  // Keycloak describes a forced fresh login as "Please re-authenticate to continue". In
  // the demo theme that informational sentence inherits the red error treatment and looks
  // like a failed login before the presenter has done anything. The fresh ceremony still
  // happens; only that misleading visual notice is removed.
  document.querySelectorAll<HTMLElement>(".pf-v5-c-alert").forEach((notice) => {
    if (
      notice.textContent?.toLowerCase().includes("re-authenticate to continue")
    )
      notice.remove();
  });
  const writeCredentials = (user: string, secret: string): void => {
    if (username) username.value = user;
    password.value = secret;
    username?.dispatchEvent(new Event("input", { bubbles: true }));
    password.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const demoPersonas: Readonly<Record<string, string>> = {
    hari: "1234",
    "mica.commercial": "demo",
    "hexa.admin": "demo",
    "kiln.operations": "demo",
    "spar.supply": "demo",
  };
  const prepareDemoCredentials = (): void => {
    const requested = (username?.value ?? attemptedUsername?.value ?? "")
      .trim()
      .toLowerCase();
    const selectedPassword = demoPersonas[requested];
    // A blank form is the explicit one-click presenter shortcut. A known persona keeps its
    // own server-side permissions. Unknown input is never elevated into the admin account.
    if (!requested) writeCredentials("hari", "1234");
    else if (selectedPassword) writeCredentials(requested, selectedPassword);
  };
  const setSubmitLabel = (label: string): void => {
    if (!submit) return;
    if (submit instanceof HTMLInputElement) submit.value = label;
    else submit.textContent = label;
  };
  if (submit) {
    setSubmitLabel("ENTER XELOR");
    submit.setAttribute("aria-label", "Enter XELOR");
    // Fill before the browser performs required-field validation. This makes the main
    // button a genuine one-action entry even if a password manager cleared either field.
    submit.addEventListener("click", prepareDemoCredentials, { capture: true });
  }
  // This is a dedicated local demonstration realm. Start with its published identity
  // already present so a password manager or a hurried first attempt cannot introduce a
  // stale credential. Other seeded personas remain usable because both fields are editable.
  writeCredentials("hari", "1234");

  form.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key !== "Enter" ||
        event.isComposing ||
        form.dataset.xelorSubmitting === "true"
      )
        return;
      event.preventDefault();
      prepareDemoCredentials();
      form.requestSubmit(submit ?? undefined);
    },
    { capture: true },
  );

  // A double-click must still be one authorization request. The presenter shortcut is
  // prepared before native validation; arbitrary credentials continue to Keycloak as typed.
  form.addEventListener("submit", (event) => {
    if (form.dataset.xelorSubmitting === "true") {
      event.preventDefault();
      return;
    }
    prepareDemoCredentials();
    form.dataset.xelorSubmitting = "true";
    if (submit) {
      submit.disabled = true;
      submit.setAttribute("aria-busy", "true");
      setSubmitLabel("ENTERING XELOR…");
    }
  });
  form.prepend(hint);
}

/**
 * `document.currentScript` is only readable while this script is executing, so the sibling
 * URL is resolved NOW and the fetch is deferred. Reading it inside the listener below would
 * return null and the scene would silently never load.
 */
const url = hasWebGL() ? siblingUrl("backdrop.js") : null;

if (url) {
  const tag = document.createElement("script");
  tag.src = url;
  tag.async = true;
  // Failure is silence. The stylesheet has already made the page usable on its own; a console
  // error about scenery would only send somebody looking for a fault in the one screen that
  // must never look faulty.
  tag.onerror = (): void => {
    tag.remove();
  };
  document.head.appendChild(tag);
}

function mountChrome(): void {
  mountToggle();
  mountExperienceChrome();
  mountDemoAccess();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountChrome, { once: true });
} else {
  mountChrome();
}
