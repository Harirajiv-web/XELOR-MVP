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
  await page.goto("/sales/orders");
  await expect(page.getByTestId("demo-launcher")).toBeVisible();
}

test("guided demo presents the live Northstar journey without writing business state", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const unsafeRequests: string[] = [];
  const browserErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await signIn(page);

  // Only begin monitoring after authentication. A guided demo is allowed to navigate and
  // read, but it must not create, approve, update or delete business state.
  page.on("request", (request) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      unsafeRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  await page.getByTestId("demo-launcher").click();
  await expect(page.getByText("Choose a story to demonstrate", { exact: true })).toBeVisible();
  await expect(page.locator('[data-testid^="demo-scenario-"]')).toHaveCount(1);
  await expect(page.getByText(/One canonical journey · 9 evidence-linked acts/)).toBeVisible();
  await expect(page.getByText("Seeded live records", { exact: true })).toBeVisible();
  await page.getByTestId("demo-scenario-delivery-recovery").click();
  await expect(page.getByText("The situation", { exact: true })).toBeVisible();
  await expect(page.getByText("The decision", { exact: true })).toBeVisible();
  await page.getByTestId("start-selected-demo").click();

  await expect(page).toHaveURL(/\/agentos\/commander$/);
  const dock = page.getByTestId("active-demo-dock");
  await expect(dock).toBeVisible();
  await expect(dock.getByText("Live ERP evidence · guide makes no writes", { exact: true })).toBeVisible();
  await expect(dock.getByText("1 of 9", { exact: true })).toBeVisible();
  await expect(dock.getByTestId("demo-simple-explanation")).toContainText("live commander");
  await expect(dock.getByTestId("demo-live-record")).toContainText("NPS/PO/10482");
  await expect(page.getByTestId("reset-demo-top")).toHaveAttribute("aria-label", "Stop the active demo guide");
  const compactBox = await dock.boundingBox();
  expect(compactBox).not.toBeNull();
  expect(compactBox!.width).toBeLessThanOrEqual(540);
  expect(compactBox!.height).toBeLessThanOrEqual(200);
  expect(compactBox!.x).toBeGreaterThan((page.viewportSize()?.width ?? 1280) / 2);
  await page.screenshot({ path: testInfo.outputPath("compact-demo-guide.png"), fullPage: true });

  await page.getByTestId("next-demo-step").click();
  await expect(page).toHaveURL(/\/sales\/orders$/);
  await expect(dock.getByText("2 of 9", { exact: true })).toBeVisible();
  await dock.getByRole("button", { name: "Expand demo guide" }).click();
  await expect(dock.getByText("Live seeded ERP evidence", { exact: true })).toBeVisible();
  await expect(dock.getByTestId("demo-presenter-data")).toContainText("04-Sep-2026");

  await page.getByTestId("stop-demo").click();
  await expect(dock).not.toBeVisible();
  await expect(page.getByTestId("demo-launcher")).toContainText("Start Demo");

  // Stopping leaves the current real screen fully usable. Finishing the complete story clears
  // the guide and leaves the audit screen untouched.
  await page.getByTestId("demo-launcher").click();
  await page.getByTestId("demo-scenario-delivery-recovery").click();
  await page.getByTestId("start-selected-demo").click();
  await expect(dock).toBeVisible();
  for (let index = 0; index < 8; index += 1) {
    await page.getByTestId("next-demo-step").click();
  }
  await expect(page).toHaveURL(/\/administration\/audit$/);
  await expect(page.getByTestId("finish-demo")).toBeVisible();
  await page.getByTestId("finish-demo").click();
  await expect(dock).not.toBeVisible();

  // A browser refresh is another deliberate safety exit: Demo Mode is not persisted into a
  // later normal session, while the real page underneath remains usable.
  await page.getByTestId("demo-launcher").click();
  await page.getByTestId("demo-scenario-delivery-recovery").click();
  await page.getByTestId("start-selected-demo").click();
  await expect(dock).toBeVisible();
  await expect(page).toHaveURL(/\/agentos\/commander$/);
  await page.reload();
  await expect(dock).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Live operating decision room", level: 1 })).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath("guided-demo-safe-exit.png"), fullPage: true });
  expect(unsafeRequests, JSON.stringify(unsafeRequests, null, 2)).toEqual([]);
  expect(browserErrors, JSON.stringify(browserErrors, null, 2)).toEqual([]);
});
