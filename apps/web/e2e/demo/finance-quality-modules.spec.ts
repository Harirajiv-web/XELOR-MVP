import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Username or email" }).fill("hari");
  await page.getByRole("textbox", { name: "Password" }).fill("1234");
  await page.getByRole("button", { name: "Enter XELOR" }).click();
  await expect(page).toHaveURL(/^http:\/\/localhost:3001\//);
  await expect(page.getByRole("button", { name: "Enter the factory intelligence" })).toBeVisible();
}

test("Working Capital and QMS & Audit are clear, complete and horizontally navigable", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await signIn(page);

  await page.goto("/working-capital/overview");
  await expect(page.getByRole("heading", { name: "Working Capital Overview", level: 1 })).toBeVisible();
  await expect(page.getByText("RASP · Finance Agent", { exact: true })).toBeVisible();
  await expect(page.getByText("RASP cannot move money", { exact: false })).toBeVisible();

  const financeTabs = page.locator('nav[aria-label="Working Capital screens"] a');
  await expect(financeTabs).toHaveCount(8);
  await financeTabs.filter({ hasText: "Cash forecast" }).click();
  await expect(page).toHaveURL(/\/working-capital\/cash-forecast$/);
  await expect(page.getByRole("heading", { name: "13-Week Cash Forecast", level: 1 })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("working-capital-overview.png"),
    fullPage: true,
  });

  await page.goto("/quality/overview");
  await expect(page.getByRole("heading", { name: "QMS & Audit Overview", level: 1 })).toBeVisible();
  await expect(page.getByText("KILN · Quality Agent", { exact: true })).toBeVisible();
  await expect(page.getByText("KILN cannot declare compliance.", { exact: false })).toBeVisible();

  const qualityTabs = page.locator('nav[aria-label="QMS & Audit screens"] a');
  await expect(qualityTabs).toHaveCount(8);
  await qualityTabs.filter({ hasText: "Evidence packs" }).click();
  await expect(page).toHaveURL(/\/quality\/evidence-packs$/);
  await expect(page.getByRole("heading", { name: "Audit Evidence Packs", level: 1 })).toBeVisible();
  await page.getByText("View source details", { exact: true }).click();
  await expect(page.getByText("Measured results and disposition records", { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("qms-audit-evidence.png"),
    fullPage: true,
  });

  await page.goto("/agentos/command");
  await expect(page.getByRole("option", { name: "Working Capital Review" })).toBeAttached();
  await expect(page.getByRole("option", { name: "QMS & Audit Readiness" })).toBeAttached();

  expect(browserErrors).toEqual([]);
});
