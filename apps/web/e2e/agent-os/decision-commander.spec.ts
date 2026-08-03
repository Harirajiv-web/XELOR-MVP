import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page): Promise<void> {
  await page.goto("/");
  await Promise.race([
    page.locator("#username").waitFor({ state: "visible" }),
    page.getByRole("button", { name: "Enter the factory intelligence" }).waitFor({ state: "visible" }),
  ]);
  if (await page.locator("#username").isVisible()) {
    await page.getByRole("textbox", { name: "Username or email" }).fill("hari");
    await page.getByRole("textbox", { name: "Password" }).fill("1234");
    await page.getByRole("button", { name: "Enter XELOR" }).click();
  }
  await expect(page.getByRole("button", { name: "Enter the factory intelligence" })).toBeVisible();
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
  const start = page.getByRole("button", { name: "Start governed recovery" });
  if (await start.isVisible()) {
    await start.click();
    await expect(page.getByRole("link", { name: "Open human approval" })).toBeVisible();
    await page.getByRole("link", { name: "Open human approval" }).click();
    await expect(page.getByRole("heading", { name: "Human Approvals", level: 1 })).toBeVisible();
  }
  expect(browserErrors).toEqual([]);
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
