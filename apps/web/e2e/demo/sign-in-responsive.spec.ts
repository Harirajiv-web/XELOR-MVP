import { expect, test } from "@playwright/test";

const baseUrl = process.env.ONYX_E2E_BASE_URL ?? "http://localhost:3001";

/**
 * THIS FILE TESTS THE KEYCLOAK SIGN-IN THEME, WHICH THE PUBLIC DEMO DELIBERATELY REMOVES.
 *
 * Every assertion below ("Username or email", "Enter ONYX", "real Keycloak access") is
 * about the themed login form served from Keycloak on :8080, which the app reaches by
 * redirecting away from `/`. With NEXT_PUBLIC_PUBLIC_DEMO=true there is no redirect: `/`
 * opens the arrival experience with a demo identity, on purpose, and none of those controls
 * exist.
 *
 * The two modes are mutually exclusive, so this is a PRECONDITION, not a failure. Left
 * unguarded it produced ten red "element(s) not found" results that read as a broken
 * sign-in page while the product was working exactly as configured — the most expensive
 * kind of false alarm, because it trains people to ignore the suite.
 *
 * To run these: set NEXT_PUBLIC_PUBLIC_DEMO=false, rebuild the web app (the flag is inlined
 * at build time) and have Keycloak up on :8080.
 */
test.skip(
  process.env.NEXT_PUBLIC_PUBLIC_DEMO === "true",
  "Keycloak sign-in theme is not reachable while the public demo is enabled.",
);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  const keycloakForm = page.getByRole("textbox", { name: "Username or email" });
  const publicDemoEntry = page.getByRole("button", {
    name: "Enter the factory intelligence",
  });
  await Promise.race([
    keycloakForm.waitFor({ state: "visible" }),
    publicDemoEntry.waitFor({ state: "visible" }),
  ]);
  test.skip(
    await publicDemoEntry.isVisible(),
    "Runtime is the sign-in-free public demo; Keycloak theme assertions do not apply.",
  );
});

test("the desktop sign-in renders the live cinematic digital twin", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(page.getByRole("textbox", { name: "Username or email" })).toBeVisible();
  await expect(page.getByText("Presenter account prefilled · real Keycloak access", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enter ONYX" })).toBeVisible();
  await expect(page.locator("#ind-backdrop canvas")).toBeVisible();
  await expect(page.getByText("Digital twin online", { exact: true })).toBeVisible();
  await expect(page.getByText("SCANNING OPERATIONAL GRAPH", { exact: true })).toBeVisible();
  await page.waitForTimeout(2800);

  const scene = await page.locator("#ind-backdrop").evaluate((host) => ({
    bloom: host.getAttribute("data-bloom"),
    blend: host.getAttribute("data-blend"),
    theme: host.getAttribute("data-theme"),
  }));
  expect(scene.blend).toBeTruthy();
  expect(scene.theme).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath("sign-in-cinematic.png"), fullPage: true });
});

test("the cinematic sign-in keeps its depth and contrast in dark mode", async ({
  context,
  page,
}, testInfo) => {
  await context.addCookies([
    {
      name: "xelor.theme",
      value: "dark",
      url: baseUrl,
    },
  ]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("textbox", { name: "Username or email" })).toBeVisible();
  await expect(page.locator("#ind-backdrop canvas")).toBeVisible();
  await page.waitForTimeout(2800);
  await page.screenshot({ path: testInfo.outputPath("sign-in-cinematic-dark.png"), fullPage: true });
});

test("the cinematic sign-in stays usable on a phone", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("textbox", { name: "Username or email" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enter ONYX" })).toBeVisible();
  await expect(page.getByText("ONYX", { exact: true }).first()).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  // Capture the resting state, not the intentional entry fade.
  await page.waitForTimeout(1200);
  await page.screenshot({ path: testInfo.outputPath("sign-in-mobile.png"), fullPage: true });
});

test("the sign-in honours reduced motion without losing the product story", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await expect(page.getByRole("textbox", { name: "Username or email" })).toBeVisible();
  await expect(page.getByText(/One factory\.\s*Nine governed agents\./)).toBeVisible();
  await expect(page.getByText("Human approvals", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("sign-in-reduced-motion.png"), fullPage: true });
});

test("the fresh demo login succeeds on the first attempt", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Username or email" })).toHaveValue("hari");
  await expect(page.getByRole("textbox", { name: "Password" })).toHaveValue("1234");
  await page.getByRole("button", { name: "Enter ONYX" }).click();

  await expect(page).toHaveURL(`${baseUrl}/`);
  await expect(page.getByRole("button", { name: "Enter the factory intelligence" })).toBeVisible();
});

test("unknown credentials are rejected instead of becoming the presenter account", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Presenter account prefilled · real Keycloak access", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Username or email" }).fill("presenter@example.com");
  await page.getByRole("textbox", { name: "Password" }).fill("anything-at-all");
  await page.getByRole("button", { name: "Enter ONYX" }).click();

  await expect(page.getByRole("heading", { name: "Sign in to your account" })).toBeVisible();
  await expect(page.getByText(/invalid username or password/i)).toBeVisible();
});

test("one action enters the demo even when both fields are empty", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Username or email" }).fill("");
  await page.getByRole("textbox", { name: "Password" }).fill("");
  await page.getByRole("button", { name: "Enter ONYX" }).click();

  await expect(page).toHaveURL(`${baseUrl}/`);
  await expect(page.getByRole("button", { name: "Enter the factory intelligence" })).toBeVisible();
});

test("one Enter ONYX click works repeatedly in the same browser tab", async ({ page }) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto("/");
    await page.getByRole("button", { name: "Enter ONYX" }).click();
    await expect(page).toHaveURL(`${baseUrl}/`);
    await expect(page.getByRole("button", { name: "Enter the factory intelligence" })).toBeVisible();
  }
});

test("an inactive presenter stays on the current ERP screen beyond thirty seconds", async ({ page }) => {
  test.setTimeout(50_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Enter ONYX" }).click();
  await expect(page.getByRole("button", { name: "Enter the factory intelligence" })).toBeVisible();
  await page.goto("/sales/orders");
  await expect(page.getByRole("heading", { name: /Sales orders/i, level: 1 })).toBeVisible();

  await page.waitForTimeout(32_000);

  await expect(page).toHaveURL(/\/sales\/orders$/);
  await expect(page.getByRole("heading", { name: /Sales orders/i, level: 1 })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Username or email" })).toHaveCount(0);
});

test("returning to the root always requires credentials again", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Username or email" }).fill("hari");
  await page.getByRole("textbox", { name: "Password" }).fill("1234");
  await page.getByRole("button", { name: "Enter ONYX" }).click();

  await expect(page).toHaveURL(`${baseUrl}/`);
  const brain = page.getByRole("button", { name: "Enter the factory intelligence" });
  await expect(brain).toBeVisible();
  await brain.click();
  await expect(page.getByRole("button", { name: /^ONYX Decision Commander/ })).toBeVisible();

  // The app token and the Keycloak SSO cookie both still exist. Root entry must bypass
  // both shortcuts and present the credential form instead of reopening Mission Control.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in to your account" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Password" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enter ONYX" })).toBeVisible();
  expect(new URL(page.url()).port).toBe("8080");
});

test("dark mode uses a calm background after sign-in", async ({ context, page }, testInfo) => {
  await context.addCookies([
    {
      name: "xelor.theme",
      value: "dark",
      url: baseUrl,
    },
  ]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("textbox", { name: "Username or email" }).fill("hari");
  await page.getByRole("textbox", { name: "Password" }).fill("1234");
  await page.getByRole("button", { name: "Enter ONYX" }).click();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const brain = page.getByRole("button", { name: "Enter the factory intelligence" });
  await expect(brain).toBeVisible();
  await expect(page.locator("[data-gaussian-field]")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("dark-brain-calm-background.png"), fullPage: true });

  await brain.click();
  await expect(page.getByText(/9\/9 agents connected/i)).toBeVisible();
  await expect(page.locator("[data-gaussian-field]")).toHaveCount(0);
  await page.waitForTimeout(900);
  await page.screenshot({ path: testInfo.outputPath("dark-agents-calm-background.png"), fullPage: true });
});
