import { expect, test, type Page } from "@playwright/test";
import { DEMO_RECORD_CREATED_EVENT, type DemoRecordKind } from "../../src/spine/demo/demo-events";

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

async function completeManualStep(page: Page, kind: DemoRecordKind, reference: string): Promise<void> {
  await page.evaluate(
    ({ eventName, detail }) => window.dispatchEvent(new CustomEvent(eventName, { detail })),
    {
      eventName: DEMO_RECORD_CREATED_EVENT,
      detail: { kind, id: `test-${reference}`, reference },
    },
  );
}

test("guided demo waits for real order-entry steps and stays presenter-controlled", async ({
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

  // This test signals successful saves without mutating the shared demo database. The real
  // sales and purchase forms emit this same event only after their POST has succeeded.
  page.on("request", (request) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      unsafeRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  await page.getByTestId("demo-launcher").click();
  await expect(page.getByText("Choose a demo", { exact: true })).toBeVisible();
  await expect(page.locator('[data-testid^="demo-scenario-"]')).toHaveCount(2);
  await expect(page.getByText("Two separate presenter modes", { exact: true })).toBeVisible();
  await expect(page.getByText("Demo 2 · Meet the agents", { exact: true })).toBeVisible();
  await page.getByTestId("demo-scenario-delivery-recovery").click();
  await expect(page.getByText("The real-life situation", { exact: true })).toBeVisible();
  await expect(page.getByText("What you will show", { exact: true })).toBeVisible();
  await page.getByTestId("start-selected-demo").click();

  await expect(page).toHaveURL(/\/sales\/orders$/);
  const dock = page.getByTestId("active-demo-dock");
  await expect(dock).toBeVisible();
  await expect(dock.getByText("Real ERP screens · guide never saves for you", { exact: true })).toBeVisible();
  await expect(dock.getByText("1 of 11", { exact: true })).toBeVisible();
  await expect(dock.getByTestId("demo-simple-explanation")).toContainText("customer has asked for pumps");
  await expect(dock.getByTestId("demo-live-record")).toContainText("NPS/PO/10482");
  await expect(page.getByTestId("next-demo-step")).toBeDisabled();
  await expect(page.getByTestId("demo-manual-action")).toContainText("this step will wait");
  await expect(page.getByTestId("reset-demo-top")).toHaveAttribute("aria-label", "Stop the active demo guide");
  const compactBox = await dock.boundingBox();
  expect(compactBox).not.toBeNull();
  expect(compactBox!.width).toBeLessThanOrEqual(540);
  expect(compactBox!.height).toBeLessThanOrEqual(280);
  expect(compactBox!.x).toBeGreaterThan((page.viewportSize()?.width ?? 1280) / 2);
  await page.screenshot({ path: testInfo.outputPath("compact-demo-guide.png"), fullPage: true });

  await completeManualStep(page, "sales-order", "SO-DEMO-SAVED");
  await expect(page.getByTestId("demo-manual-action")).toContainText("SO-DEMO-SAVED saved");
  await expect(page).toHaveURL(/\/sales\/orders$/);
  await page.getByTestId("next-demo-step").click();
  await expect(page).toHaveURL(/\/planning\/mrp$/);
  await expect(dock.getByText("2 of 11", { exact: true })).toBeVisible();
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
  for (let index = 0; index < 10; index += 1) {
    if (index === 0) await completeManualStep(page, "sales-order", "SO-DEMO-SECOND");
    if (index === 2) await completeManualStep(page, "purchase-order", "PO-DEMO-SECOND");
    await page.getByTestId("next-demo-step").click();
  }
  await expect(page).toHaveURL(/\/managed-services\/responsibilities$/);
  await expect(page.getByTestId("finish-demo")).toBeVisible();
  await page.getByTestId("finish-demo").click();
  await expect(dock).not.toBeVisible();

  // A browser refresh is another deliberate safety exit: Demo Mode is not persisted into a
  // later normal session, while the real page underneath remains usable.
  await page.getByTestId("demo-launcher").click();
  await page.getByTestId("demo-scenario-delivery-recovery").click();
  await page.getByTestId("start-selected-demo").click();
  await expect(dock).toBeVisible();
  await expect(page).toHaveURL(/\/sales\/orders$/);
  await page.reload();
  await expect(dock).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Sales orders", level: 1 })).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath("guided-demo-safe-exit.png"), fullPage: true });
  expect(unsafeRequests, JSON.stringify(unsafeRequests, null, 2)).toEqual([]);
  expect(browserErrors, JSON.stringify(browserErrors, null, 2)).toEqual([]);
});

test("successful sales and purchase forms unlock their matching demo steps", async ({ page }) => {
  test.setTimeout(120_000);
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  const salesOrder = {
    id: "browser-demo-sales-order",
    soNo: "SO-DEMO-FORM-001",
    customerId: "browser-demo-customer",
    customerCode: "CUST-DEMO",
    customerName: "Investor Demo Customer",
    custPoNo: "INVESTOR-DEMO-SO-001",
    orderDate: "2026-08-06",
    requestedDeliveryDate: null,
    supplierGstin: "27AABCT1234F1Z5",
    billToGstin: "27AABCT1234F1Z5",
    shipToGstin: "27AABCT1234F1Z5",
    shipToStateCode: "27",
    placeOfSupply: "27",
    isInterState: false,
    subtotal: "1000.00",
    cgstTotal: "90.00",
    sgstTotal: "90.00",
    igstTotal: "0.00",
    roundOff: "0.00",
    grandTotal: "1180.00",
    creditStatus: "pending",
    creditLimitSnapshot: null,
    creditExposureSnapshot: null,
    status: "draft",
    lines: [],
  };
  const purchaseOrder = {
    id: "browser-demo-purchase-order",
    poNo: "PO-DEMO-FORM-001",
    vendorId: "browser-demo-vendor",
    vendorName: "Investor Demo Vendor",
    status: "draft",
    poDate: "2026-08-06",
    expectedDate: null,
    currency: "INR",
    totalAmount: "750.00",
    workflowInstanceId: null,
    lines: [],
  };

  // Keep the shared seeded database pristine while exercising the real forms, POST path,
  // success callbacks and route changes. Only the two create responses are substituted.
  await page.route("**/api/v1/sales/orders", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(salesOrder) });
  });
  await page.route("**/api/v1/purchase/orders", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(purchaseOrder) });
  });
  await page.route("**/api/v1/sales/orders/browser-demo-sales-order", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(salesOrder) }),
  );
  await page.route("**/api/v1/purchase/orders/browser-demo-purchase-order", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(purchaseOrder) }),
  );

  await signIn(page);
  await page.getByTestId("demo-launcher").click();
  await page.getByTestId("demo-scenario-delivery-recovery").click();
  await page.getByTestId("start-selected-demo").click();

  await page.getByRole("button", { name: "New order" }).click();
  await page.locator("#so-customer").selectOption({ index: 1 });
  await page.locator("#so-po").fill("INVESTOR-DEMO-SO-001");
  const sellingGstin = page.locator("#so-supplier");
  if ((await sellingGstin.evaluate((element) => element.tagName)) === "SELECT") {
    if ((await sellingGstin.inputValue()) === "") await sellingGstin.selectOption({ index: 1 });
  } else if ((await sellingGstin.inputValue()) === "") {
    await sellingGstin.fill("27AAAAA0000A1Z5");
  }
  await page.locator('[id$="-item"]').first().selectOption({ index: 1 });
  await page.locator('[id$="-qty"]').first().fill("1");
  await page.locator('[id$="-rate"]').first().fill("1000");
  await page.locator('[id$="-hsn"]').first().fill("8413");
  await page.locator('[id$="-gst"]').first().fill("18");
  await page.getByRole("button", { name: "Save order" }).click();

  await expect(page).toHaveURL(/\/sales\/order\/browser-demo-sales-order$/);
  await expect(page.getByTestId("demo-manual-action")).toContainText("SO-DEMO-FORM-001 saved");
  await expect(page.getByTestId("next-demo-step")).toBeEnabled();
  await page.getByTestId("next-demo-step").click();
  await expect(page).toHaveURL(/\/planning\/mrp$/);
  await page.getByTestId("next-demo-step").click();
  await expect(page).toHaveURL(/\/purchase\/orders$/);

  await page.getByRole("button", { name: "New purchase order" }).click();
  await page.locator("#po-vendor").selectOption({ index: 1 });
  await page.locator('[id$="-item"]').first().selectOption({ index: 1 });
  await page.locator('[id$="-qty"]').first().fill("1");
  await page.locator('[id$="-rate"]').first().fill("750");
  await page.getByRole("button", { name: "Raise draft order" }).click();

  await expect(page).toHaveURL(/\/purchase\/order\/browser-demo-purchase-order$/);
  await expect(page.getByTestId("demo-manual-action")).toContainText("PO-DEMO-FORM-001 saved");
  await expect(page.getByTestId("next-demo-step")).toBeEnabled();
  await page.getByTestId("stop-demo").click();
  expect(browserErrors, JSON.stringify(browserErrors, null, 2)).toEqual([]);
});
