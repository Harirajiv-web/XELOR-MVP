import { expect, test } from "@playwright/test";

test("the desktop sign-in renders the live cinematic digital twin", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(page.getByRole("textbox", { name: "Username or email" })).toBeVisible();
  await expect(page.getByText("Presenter account prefilled · real Keycloak access", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enter XELOR" })).toBeVisible();
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
      url: "http://localhost:3001",
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
  await expect(page.getByRole("button", { name: "Enter XELOR" })).toBeVisible();
  await expect(page.getByText("XELOR", { exact: true }).first()).toBeVisible();

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
  await expect(page.getByText(/One factory\.\s*Seven governed agents\./)).toBeVisible();
  await expect(page.getByText("Human approvals", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("sign-in-reduced-motion.png"), fullPage: true });
});

test("the fresh demo login succeeds on the first attempt", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Username or email" })).toHaveValue("hari");
  await expect(page.getByRole("textbox", { name: "Password" })).toHaveValue("1234");
  await page.getByRole("button", { name: "Enter XELOR" }).click();

  await expect(page).toHaveURL("http://localhost:3001/");
  await expect(page.getByRole("button", { name: "Enter the factory intelligence" })).toBeVisible();
});

test("unknown credentials are rejected instead of becoming the presenter account", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Presenter account prefilled · real Keycloak access", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Username or email" }).fill("presenter@example.com");
  await page.getByRole("textbox", { name: "Password" }).fill("anything-at-all");
  await page.getByRole("button", { name: "Enter XELOR" }).click();

  await expect(page.getByRole("heading", { name: "Sign in to your account" })).toBeVisible();
  await expect(page.getByText(/invalid username or password/i)).toBeVisible();
});

test("one action enters the demo even when both fields are empty", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Username or email" }).fill("");
  await page.getByRole("textbox", { name: "Password" }).fill("");
  await page.getByRole("button", { name: "Enter XELOR" }).click();

  await expect(page).toHaveURL("http://localhost:3001/");
  await expect(page.getByRole("button", { name: "Enter the factory intelligence" })).toBeVisible();
});

test("one Enter XELOR click works repeatedly in the same browser tab", async ({ page }) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto("/");
    await page.getByRole("button", { name: "Enter XELOR" }).click();
    await expect(page).toHaveURL("http://localhost:3001/");
    await expect(page.getByRole("button", { name: "Enter the factory intelligence" })).toBeVisible();
  }
});

test("an inactive presenter stays on the current ERP screen beyond thirty seconds", async ({ page }) => {
  test.setTimeout(50_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Enter XELOR" }).click();
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
  await page.getByRole("button", { name: "Enter XELOR" }).click();

  await expect(page).toHaveURL("http://localhost:3001/");
  const brain = page.getByRole("button", { name: "Enter the factory intelligence" });
  await expect(brain).toBeVisible();
  await brain.click();
  await expect(page.getByRole("button", { name: /^ONYX Mission Control/ })).toBeVisible();

  // The app token and the Keycloak SSO cookie both still exist. Root entry must bypass
  // both shortcuts and present the credential form instead of reopening Mission Control.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in to your account" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Password" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enter XELOR" })).toBeVisible();
  expect(new URL(page.url()).port).toBe("8080");
});

test("dark mode uses a calm background after sign-in", async ({ context, page }, testInfo) => {
  await context.addCookies([
    {
      name: "xelor.theme",
      value: "dark",
      url: "http://localhost:3001",
    },
  ]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("textbox", { name: "Username or email" }).fill("hari");
  await page.getByRole("textbox", { name: "Password" }).fill("1234");
  await page.getByRole("button", { name: "Enter XELOR" }).click();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const brain = page.getByRole("button", { name: "Enter the factory intelligence" });
  await expect(brain).toBeVisible();
  await expect(page.locator("[data-gaussian-field]")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("dark-brain-calm-background.png"), fullPage: true });

  await brain.click();
  await expect(page.getByText(/7\/7 agents connected/i)).toBeVisible();
  await expect(page.locator("[data-gaussian-field]")).toHaveCount(0);
  await page.waitForTimeout(900);
  await page.screenshot({ path: testInfo.outputPath("dark-agents-calm-background.png"), fullPage: true });
});
