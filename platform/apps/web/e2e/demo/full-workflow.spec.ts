import { expect, test, type Page, type TestInfo } from "@playwright/test";

interface RouteResult {
  href: string;
  title: string;
  textLength: number;
  errors: string[];
}

const LEGACY_BRAND = /\bIND[- ]?(?:CORE|AI|ERP|Copilot)\b/i;
const baseUrl = process.env.XELOR_E2E_BASE_URL ?? "http://localhost:3101";

async function signInThroughKeycloak(page: Page): Promise<void> {
  await page.goto("/");
  await Promise.race([
    page.locator("#username").waitFor({ state: "visible" }),
    page.getByText(/agents connected/i).waitFor({ state: "visible" }),
  ]);
  if (await page.locator("#username").isVisible()) {
    await page.getByRole("textbox", { name: "Username or email" }).fill("hari");
    await page.getByRole("textbox", { name: "Password" }).fill("1234");
    await page.getByRole("button", { name: "Enter XELOR" }).click();
  }
  expect(new URL(page.url()).origin).toBe(baseUrl);
  await expect(page.getByText("XELOR", { exact: true }).first()).toBeVisible();
}

async function attachJson(testInfo: TestInfo, name: string, value: unknown): Promise<void> {
  await testInfo.attach(name, {
    body: Buffer.from(JSON.stringify(value, null, 2)),
    contentType: "application/json",
  });
}

test("an administrator can traverse the complete XELOR demo and use ONYX", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const consoleErrors: string[] = [];
  const failedResponses: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 500) {
      failedResponses.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });

  await signInThroughKeycloak(page);
  await page.screenshot({ path: testInfo.outputPath("01-authenticated-gateway.png"), fullPage: true });

  // The Brain is the authenticated arrival. Activate it to reveal the same ONYX network a
  // presenter uses, then move into the application shell.
  const brain = page.getByRole("button", { name: "Enter the factory intelligence" });
  await expect(brain).toBeVisible();
  await brain.click();
  await expect(page.getByText(/9\/9 agents connected/i)).toBeVisible();
  await page.getByRole("button", { name: /HEXA — Platform & Governance/i }).click();
  await expect(page).toHaveURL(/\/department\/HEXA$/);
  await page.waitForTimeout(650);
  await page.screenshot({ path: testInfo.outputPath("02-xelor-shell.png"), fullPage: true });

  const pageText = await page.locator("body").innerText();
  expect(pageText).not.toMatch(LEGACY_BRAND);
  await expect(page.getByRole("button", { name: "Show the copilot" })).toBeVisible();
  await expect(page.getByText("ONYX Assistant", { exact: true })).not.toBeVisible();

  // Secondary information stays available without crowding the first view.
  const moduleSummary = page
    .getByText("Module summaries and live figures", { exact: true })
    .locator("..");
  const moduleDetails = moduleSummary.locator("..");
  await expect(moduleDetails).not.toHaveAttribute("open", "");
  await moduleSummary.click();
  await expect(moduleDetails).toHaveAttribute("open", "");

  // The sidebar now selects modules; each module exposes all of its screens horizontally in
  // the workbench. Walk the same two-level interaction a person uses and treat those rendered
  // tabs as the route authority.
  const departmentHrefs = await page
    .locator('nav[aria-label="Modules"] a[href^="/department/"]')
    .evaluateAll((links) =>
      [...new Set(links.map((link) => link.getAttribute("href")).filter(Boolean) as string[])],
    );
  const moduleHrefs = await page
    .locator('nav[aria-label="Modules"] a[data-module-key][href]')
    .evaluateAll((links) =>
      [...new Set(links.map((link) => link.getAttribute("href")).filter(Boolean) as string[])],
    );
  const routeSet = new Set<string>(departmentHrefs);
  for (const moduleHref of moduleHrefs) {
    const moduleKey = moduleHref.split("/")[1];
    await page.locator(`a[data-module-key="${moduleKey}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${moduleHref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
    const tabs = page.locator('nav[aria-label$=" screens"] a[href]');
    await expect(tabs.first()).toBeVisible();
    for (const href of await tabs.evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")).filter(Boolean) as string[],
    )) {
      routeSet.add(href);
    }
  }
  const hrefs = [...routeSet].sort();
  expect(hrefs.length).toBeGreaterThan(40);

  const routes: RouteResult[] = [];
  for (const href of hrefs) {
    const errorsBefore = consoleErrors.length;
    const failedBefore = failedResponses.length;
    if (href.startsWith("/department/")) {
      await page.locator(`nav[aria-label="Modules"] a[href="${href}"]`).click();
    } else {
      const moduleKey = href.split("/")[1];
      if (!new URL(page.url()).pathname.startsWith(`/${moduleKey}/`)) {
        await page.locator(`a[data-module-key="${moduleKey}"]`).click();
      }
      const tab = page.locator(`nav[aria-label$=" screens"] a[href="${href}"]`);
      await expect(tab).toBeVisible();
      if (new URL(page.url()).pathname !== href) await tab.click();
    }
    await expect(page).toHaveURL(new RegExp(`${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
    await expect(page.locator("main")).toBeVisible();
    await page.waitForTimeout(150);
    const text = await page.locator("main").innerText();
    const body = await page.locator("body").innerText();
    const title =
      (await page.locator("main h1").first().textContent().catch(() => null)) ??
      (await page.locator("main h2").first().textContent().catch(() => null)) ??
      "";

    const errors = [
      ...consoleErrors.slice(errorsBefore),
      ...failedResponses.slice(failedBefore),
    ];
    if (/Application error|Unhandled Runtime Error|Internal Server Error/i.test(body)) {
      errors.push("Rendered an application/server error state");
    }
    const legacyBrands = body.match(new RegExp(LEGACY_BRAND.source, "gi"));
    if (legacyBrands) {
      errors.push(`Rendered legacy product branding: ${[...new Set(legacyBrands)].join(", ")}`);
    }
    if (text.trim().length < 20) errors.push("Main content is effectively empty");

    routes.push({ href, title: title.trim(), textLength: text.trim().length, errors });
  }

  // Context follows navigation and the real question still uses the governed backend.
  await page.goto("/inventory/stock");
  await page.getByRole("button", { name: "Show the copilot" }).click();
  await expect(page.getByText("inventory workspace", { exact: false })).toBeVisible();
  await page.getByRole("textbox", { name: "Ask the copilot" }).fill("How much stock do we have?");
  await page.locator("form").getByRole("button", { name: "Ask", exact: true }).click();
  await page.getByText("How this answer was found", { exact: true }).click();
  await expect(page.getByText("Evidence trail", { exact: true })).toBeVisible();

  // The dedicated analyst workspace is independently usable, not merely a larger wrapper
  // around the rail. Exercise its keyboard-friendly composer and evidence result.
  await page.goto("/copilot/ask");
  await expect(page.getByText("ONYX analyst", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Your question" }).fill("How much stock do we have?");
  await page.getByRole("button", { name: "Ask ONYX" }).click();
  await page.getByText("How this answer was found", { exact: true }).first().click();
  await expect(page.getByText("Evidence", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("03-onyx-analyst.png"), fullPage: true });

  // The wider experience is present and every simulated area states its provenance.
  await page.getByRole("button", { name: "Show the copilot" }).click();
  const rail = page.locator("aside.x-copilot-rail");
  const moreMenu = rail.locator("details");
  await moreMenu.locator("summary").click();
  await moreMenu.getByRole("button", { name: /^Alerts/ }).click();
  await expect(page.getByText("Current risks", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Decision Commander" })).toBeVisible();
  await moreMenu.locator("summary").click();
  await moreMenu.getByRole("button", { name: "Summary", exact: true }).click();
  await expect(page.getByText("Live decision brief", { exact: true })).toBeVisible();
  await moreMenu.locator("summary").click();
  await moreMenu.getByRole("button", { name: /^Actions/ }).click();
  await expect(page.getByText("Human decisions", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open approval inbox" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("04-onyx-actions.png"), fullPage: true });

  await attachJson(testInfo, "route-audit.json", routes);
  await attachJson(testInfo, "browser-errors.json", consoleErrors);
  await attachJson(testInfo, "failed-responses.json", failedResponses);

  const broken = routes.filter((route) => route.errors.length > 0);
  expect(broken, JSON.stringify(broken, null, 2)).toEqual([]);
});
