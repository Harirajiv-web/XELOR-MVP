import { expect, test, type Page } from "@playwright/test";

const baseUrl = process.env.ONYX_E2E_BASE_URL ?? "http://localhost:3001";

async function signIn(page: Page): Promise<void> {
  await page.goto("/");
  await Promise.race([
    page.locator("#username").waitFor({ state: "visible" }),
    page.getByRole("button", { name: "Enter the factory intelligence" }).waitFor({ state: "visible" }),
  ]);
  if (await page.locator("#username").isVisible()) {
    await page.getByRole("textbox", { name: "Username or email" }).fill("hari");
    await page.getByRole("textbox", { name: "Password" }).fill("1234");
    await page.getByRole("button", { name: "Enter ONYX" }).click();
  }
  await expect(page.getByRole("button", { name: "Enter the factory intelligence" })).toBeVisible();
}

async function ensureAutomationActive(page: Page): Promise<void> {
  const token = await page.evaluate(() => {
    const raw = sessionStorage.getItem("aikyantra.session");
    return raw
      ? ((JSON.parse(raw) as { accessToken?: string }).accessToken ?? null)
      : null;
  });
  const headers: Record<string, string> = token
    ? { authorization: `Bearer ${token}` }
    : { "x-xelor-public-demo": "investor-presentation" };
  const state = await page.request.get(`${baseUrl}/api/v1/agent-os/control`, {
    headers,
  });
  expect(state.status()).toBe(200);
  const body = (await state.json()) as {
    data: { automation: { status: "active" | "stopped" } };
  };
  if (body.data.automation.status === "active") return;
  const release = await page.request.post(
    `${baseUrl}/api/v1/agent-os/control/kill-switch/release`,
    { headers, data: {} },
  );
  expect(release.status()).toBe(201);
}

test("decision commander explains current risk and separates exposure from verified value", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await signIn(page);
  await page.goto("/agentos/commander");
  await expect(page.getByRole("heading", { name: "Live operating decision room", level: 1 })).toBeVisible();
  await expect(page.getByText("Promises at risk", { exact: true })).toBeVisible();
  await expect(page.getByText("Value connected to risk", { exact: true })).toBeVisible();
  await expect(page.getByText("Verified value", { exact: true })).toBeVisible();
  await expect(page.getByText(/not a hidden prediction/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Start governed recovery" })).toBeVisible();
  await expect(page.getByText(/Northstar Process Systems/).first()).toBeVisible();
  await expect(page.getByText("Connected decision", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/2 business areas connected/i)).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("the public investor entry opens directly into Decision Commander", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Enter the factory intelligence" }).click();
  await expect(page.getByRole("button", { name: /ONYX Decision Commander/ })).toBeVisible();
  await page.getByRole("button", { name: /ONYX Decision Commander/ }).click();
  await expect(page).toHaveURL(/\/agentos\/commander$/);
  await expect(page.getByRole("heading", { name: "Live operating decision room", level: 1 })).toBeVisible();
});

test("decision intelligence, memory and MVP readiness remain usable from desktop to mobile", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page);
  await page.goto("/agentos/commander");

  await expect(page.getByText("Evidence confidence", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "One visible decision-intelligence loop" })).toBeVisible();
  await expect(page.getByText("Live records", { exact: true })).toBeVisible();
  await expect(page.getByText("Evidence graph", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Enterprise knowledge graph" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Organizational memory" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "MVP platform readiness" })).toBeVisible();
  await expect(page.getByText("API & integrations", { exact: true })).toBeVisible();
  await expect(page.getByText("Document intelligence", { exact: true })).toBeVisible();
  await expect(page.getByText("Operational health", { exact: true })).toBeVisible();
  await expect(page.getByText("Decision Confidence Engine", { exact: true })).toBeVisible();
  await expect(page.getByText("Enterprise Observability", { exact: true })).toBeVisible();

  const confidence = page.getByText(/How the \d+% confidence was calculated/).first();
  await confidence.click();
  await expect(page.getByText("Evidence coverage", { exact: true }).first()).toBeVisible();
  await page.locator('nav[aria-label="Risk filters"] button').filter({ hasText: "Planning" }).click();
  await expect(page.getByText(/Owner agent: AXLE/).first()).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Live operating decision room" })).toBeVisible();
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("navigation", { name: "Modules" })).toBeVisible();
  await page.getByRole("button", { name: "Close navigation" }).first().click();
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("a lost Agent OS launch response reuses one logical idempotency key", async ({
  page,
}) => {
  await signIn(page);
  await ensureAutomationActive(page);
  await page.goto("/agentos/commander");

  const keys: string[] = [];
  let firstAttempt = true;
  await page.route("**/api/v1/agent-os/commander/risks/*/start", async (route) => {
    keys.push(route.request().headers()["idempotency-key"] ?? "");
    if (firstAttempt) {
      firstAttempt = false;
      await route.abort("connectionfailed");
      return;
    }
    await route.continue();
  });

  await page.getByRole("button", { name: "Start governed recovery" }).click();
  await expect(page.getByText("Could not reach the server", { exact: true })).toBeVisible();

  const completedRetry = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/api/v1/agent-os/commander/risks/") &&
      response.status() === 201,
  );
  await page.getByRole("button", { name: "Start governed recovery" }).click();
  await completedRetry;

  expect(keys).toHaveLength(2);
  expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/i);
  expect(keys[1]).toBe(keys[0]);
  await expect(page.getByRole("link", { name: "Open human approval" })).toBeVisible();
});
