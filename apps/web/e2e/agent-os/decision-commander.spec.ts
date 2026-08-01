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
