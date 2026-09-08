import { expect, test, type Page } from "@playwright/test";

interface DemoStep {
  seq: number;
  stepKey: string;
  title: string;
  agentKey: string;
  chapter: string;
  plain: string;
  flow: { from: string; did: string; to: string };
  status: string;
  where: { href: string; module: string; screen: string };
}

interface DemoMission {
  id: string;
  missionNo: string;
  soNo: string;
  customerName: string;
  status: string;
  stage: string;
  waitingReason: string | null;
  steps: DemoStep[];
  actions: unknown[];
  pendingApproval: {
    id: string;
    approvalNo: string;
    brief: {
      recommendation: string;
      why: string;
      ifRejected: string;
      applicationTargets: Array<{ module: string; screen: string }>;
    };
  } | null;
}

const salesStep: DemoStep = {
  seq: 1,
  stepKey: "accept",
  title: "Accept the commitment",
  agentKey: "ONYX",
  chapter: "understand",
  plain: "The customer needs 120 units by the promised date.",
  flow: {
    from: "the confirmed sales order",
    did: "checked the customer, quantity and promised date",
    to: "a delivery objective",
  },
  status: "succeeded",
  where: { href: "/sales/orders", module: "Sales", screen: "Sales orders" },
};

const inventoryStep: DemoStep = {
  seq: 2,
  stepKey: "reserve",
  title: "Reserve available stock",
  agentKey: "SPAR",
  chapter: "investigate",
  plain: "ONYX can reserve 80 available units and protect them for this order.",
  flow: {
    from: "available and reserved stock",
    did: "netted usable stock against the customer requirement",
    to: "80 units reserved for this order",
  },
  status: "succeeded",
  where: { href: "/inventory/stock", module: "Inventory", screen: "Stock" },
};

const failedPurchaseStep: DemoStep = {
  seq: 10,
  stepKey: "procure",
  title: "Raise purchase orders",
  agentKey: "SPAR",
  chapter: "execute",
  plain: "I could not raise the purchase orders for this job, so nothing has been ordered.",
  flow: {
    from: "the approved plan",
    did: "attempted the purchase commitment",
    to: "no purchase order was created",
  },
  status: "failed",
  where: { href: "/purchase/orders", module: "Purchase", screen: "Purchase orders" },
};

const recoveredPurchaseStep: DemoStep = {
  ...failedPurchaseStep,
  plain: "The purchase orders were raised on the retry and re-read successfully.",
  flow: {
    from: "the same approved plan and idempotency keys",
    did: "retried and verified the purchase commitment",
    to: "draft purchase orders in Purchase",
  },
  status: "succeeded",
};

function initialMission(): DemoMission {
  return {
    id: "investor-mission",
    missionNo: "MIS-DEMO-001",
    soNo: "SO-DEMO-001",
    customerName: "Investor Demo Customer",
    status: "planning",
    stage: "understand",
    waitingReason: null,
    steps: [salesStep],
    actions: [],
    pendingApproval: null,
  };
}

async function installMissionApi(
  page: Page,
  startingMission: DemoMission = initialMission(),
): Promise<{ mission: () => DemoMission }> {
  let mission = startingMission;

  await page.route("**/api/v1/fulfilment/meta", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { totalSteps: 13, chapters: [] } }),
    }),
  );

  await page.route("**/api/v1/fulfilment/missions/investor-mission/advance", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    if (!mission.pendingApproval && mission.status !== "completed") {
      mission = {
        ...mission,
        status: "waiting_approval",
        stage: "investigate",
        steps: [salesStep, inventoryStep],
        pendingApproval: {
          id: "approval-demo-001",
          approvalNo: "APR-DEMO-001",
          brief: {
            recommendation: "Reserve 80 units for this customer order.",
            why: "Those units are usable now, already in stock, and this order has the earliest promise date.",
            ifRejected: "The units remain available for another order.",
            applicationTargets: [{ module: "Inventory", screen: "Stock" }],
          },
        },
      };
    }
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ data: mission }) });
  });

  await page.route("**/api/v1/fulfilment/approvals/approval-demo-001/decide", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    mission = {
      ...mission,
      status: "completed",
      waitingReason: null,
      pendingApproval: null,
    };
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ data: mission }) });
  });

  await page.route("**/api/v1/fulfilment/missions/investor-mission/retry", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    mission = {
      ...mission,
      status: "executing",
      waitingReason: null,
      steps: [...mission.steps.slice(0, -1), recoveredPurchaseStep],
    };
    return route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ data: { step: recoveredPurchaseStep, status: mission.status } }),
    });
  });

  await page.route("**/api/v1/fulfilment/missions/investor-mission", (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: mission }) });
  });

  return { mission: () => mission };
}

test("the investor mission uses one centred Copilot box and names every application target", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.setViewportSize({ width: 1440, height: 900 });
  const api = await installMissionApi(page);
  await page.addInitScript(() => {
    window.sessionStorage.setItem("xelor.activeMission", "investor-mission");
    window.sessionStorage.setItem("xelor.lastMission", "investor-mission");
  });
  await page.goto("/sales/orders");

  const copilot = page.getByTestId("ai-copilot-box");
  await expect(copilot).toBeVisible();
  const layer = await copilot.evaluate((element) => ({
    host: element.closest(".x-agent-dialog-layer")?.parentElement?.tagName,
    zIndex: Number.parseInt(getComputedStyle(element.closest(".x-agent-dialog-layer")!).zIndex, 10),
  }));
  expect(layer.host).toBe("BODY");
  expect(layer.zIndex).toBeGreaterThanOrEqual(120);
  await expect(copilot.getByRole("heading", { name: "ONYX AI Copilot" })).toBeVisible();
  await expect(copilot.getByTestId("ai-application-target")).toContainText("Sales → Sales orders");
  await expect(copilot.getByTestId("ai-explanation")).toContainText("120 units");
  await expect(copilot.getByTestId("ai-reasoning")).toContainText("confirmed sales order");
  await expect(copilot.getByText("Trigger", { exact: true })).toHaveCount(0);
  await expect(copilot.getByText("Collect", { exact: true })).toHaveCount(0);

  const box = await copilot.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(Math.abs(box!.x + box!.width / 2 - viewport!.width / 2)).toBeLessThanOrEqual(2);
  expect(Math.abs(box!.y + box!.height / 2 - viewport!.height / 2)).toBeLessThanOrEqual(2);

  await copilot.getByTestId("ai-confirm-action").click();
  await expect(page).toHaveURL(/\/inventory\/stock$/);
  await expect(copilot.getByText("Confirmation needed", { exact: true })).toBeVisible();
  await expect(copilot.getByTestId("ai-application-target")).toContainText("If approved, this plan updates Inventory → Stock");
  await expect(copilot.getByTestId("ai-explanation")).toHaveText("Reserve 80 units for this customer order.");
  await expect(copilot.getByTestId("ai-reasoning")).toContainText("earliest promise date");
  await expect(page.getByRole("heading", { name: "Stock", level: 1 })).toBeVisible();
  expect(api.mission().pendingApproval?.id).toBe("approval-demo-001");

  await copilot.getByRole("button", { name: "Confirm this action" }).click();
  await expect(copilot.getByText("Verified outcome", { exact: true })).toBeVisible();
  await expect(copilot.getByLabel("Confirmed")).toBeVisible();
  await expect(copilot.getByText("Every action was re-read and confirmed.", { exact: true })).toBeVisible();
  expect(api.mission().status).toBe("completed");

  await page.screenshot({ path: testInfo.outputPath("centred-investor-copilot.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(copilot).toBeVisible();
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
  expect(browserErrors, JSON.stringify(browserErrors, null, 2)).toEqual([]);
});

test("a mission waiting for a real system event is truthful and cannot be advanced by a decorative click", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await installMissionApi(page, {
    ...initialMission(),
    status: "waiting",
    stage: "monitoring",
    waitingReason: "next production milestone",
    steps: [inventoryStep],
  });
  await page.addInitScript(() => {
    window.sessionStorage.setItem("xelor.activeMission", "investor-mission");
    window.sessionStorage.setItem("xelor.lastMission", "investor-mission");
  });
  await page.goto("/inventory/stock");

  const copilot = page.getByTestId("ai-copilot-box");
  await expect(copilot.getByText("Monitoring live work", { exact: true })).toBeVisible();
  await expect(copilot.getByTestId("ai-application-target")).toContainText("Monitoring in Inventory → Stock");
  await expect(copilot.getByTestId("ai-monitoring-state")).toContainText("connected system reports the next");
  await expect(copilot.getByTestId("ai-confirm-action")).toHaveCount(0);
  await expect(copilot.getByRole("button", { name: "Open Mission Control" })).toBeVisible();
  expect(browserErrors, JSON.stringify(browserErrors, null, 2)).toEqual([]);
});

test("a failed scenario stays in the centred Copilot and recovers through the real retry path", async ({ page }) => {
  const browserErrors: string[] = [];
  let purchaseListReads = 0;
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.route("**/api/v1/purchase/orders**", (route) => {
    purchaseListReads += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], nextCursor: null }),
    });
  });

  const api = await installMissionApi(page, {
    ...initialMission(),
    status: "failed",
    stage: "execution",
    waitingReason: "Purchase refused the write before any order was created.",
    steps: [salesStep, failedPurchaseStep],
  });
  await page.addInitScript(() => {
    window.sessionStorage.setItem("xelor.activeMission", "investor-mission");
    window.sessionStorage.setItem("xelor.lastMission", "investor-mission");
  });
  await page.goto("/purchase/orders");

  const copilot = page.getByTestId("ai-copilot-box");
  await expect(copilot.getByText("Action failed", { exact: true })).toBeVisible();
  await expect(copilot.getByText("Verified outcome", { exact: true })).toHaveCount(0);
  await expect(copilot.getByTestId("ai-application-target")).toContainText(
    "Action failed safely in Purchase → Purchase orders",
  );
  await expect(copilot.getByTestId("ai-explanation")).toContainText("nothing has been ordered");
  await expect(copilot.getByTestId("ai-reasoning")).toContainText("refused the write");

  await copilot.getByTestId("ai-retry-action").click();

  await expect(copilot.getByText("Guided action", { exact: true })).toBeVisible();
  await expect(copilot.getByTestId("ai-explanation")).toContainText("raised on the retry");
  await expect(copilot.getByTestId("ai-confirm-action")).toHaveText("Confirm and continue");
  // Retry remains on /purchase/orders. The screen must re-read its own API so the document
  // named by the Copilot also appears in the table underneath it without a manual reload.
  await expect.poll(() => purchaseListReads).toBeGreaterThan(1);
  expect(api.mission().status).toBe("executing");
  expect(api.mission().steps.at(-1)?.status).toBe("succeeded");
  expect(browserErrors, JSON.stringify(browserErrors, null, 2)).toEqual([]);
});

test("the Copilot stands down while one of the application's own modals is open", async ({ page }) => {
  // Measured before this existed: on /sales/orders during a live mission, opening "New
  // sales order" left the z-120 decision card sitting over 40% of the z-50 dialog, and
  // `elementFromPoint` at the dialog's centre returned the card — the middle of the form
  // was unclickable. A presenter filling in an order in front of an investor would have hit
  // it. The dialog is `aria-modal="true"`, which already says everything outside it is
  // inert; the card is what has to respect that.
  const browserErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await installMissionApi(page);
  await page.addInitScript(() => {
    window.sessionStorage.setItem("xelor.activeMission", "investor-mission");
    window.sessionStorage.setItem("xelor.lastMission", "investor-mission");
  });
  await page.goto("/sales/orders");

  const copilot = page.getByTestId("ai-copilot-box");
  await expect(copilot).toBeVisible();

  // A synthetic dialog rather than a module's own, so the test states the RULE — any
  // aria-modal dialog, from any screen — instead of one screen's create form.
  await page.evaluate(() => {
    const dialog = document.createElement("div");
    dialog.id = "probe-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    document.body.append(dialog);
  });
  await expect(copilot).toHaveCount(0);

  await page.evaluate(() => document.getElementById("probe-dialog")?.remove());
  await expect(copilot).toBeVisible();

  // The mission was never abandoned, only undrawn.
  await expect(copilot.getByTestId("ai-application-target")).toContainText("Sales → Sales orders");
  expect(browserErrors, JSON.stringify(browserErrors, null, 2)).toEqual([]);
});

test("the Copilot can be dragged, stays on-screen and keeps its position through the mission", async ({ page }) => {
  test.setTimeout(60_000);
  const browserErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.setViewportSize({ width: 1440, height: 900 });
  const api = await installMissionApi(page);
  await page.addInitScript(() => {
    window.sessionStorage.setItem("xelor.activeMission", "investor-mission");
    window.sessionStorage.setItem("xelor.lastMission", "investor-mission");
  });
  await page.goto("/sales/orders");

  const copilot = page.getByTestId("ai-copilot-box");
  const handle = copilot.getByTestId("ai-copilot-drag-handle");
  await expect(copilot).toBeVisible();
  const before = await copilot.boundingBox();
  const handleBox = await handle.boundingBox();
  expect(before).not.toBeNull();
  expect(handleBox).not.toBeNull();

  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2 + 220, handleBox!.y + handleBox!.height / 2 + 120, { steps: 8 });
  await page.mouse.up();

  const moved = await copilot.boundingBox();
  expect(moved).not.toBeNull();
  expect(moved!.x - before!.x).toBeGreaterThan(180);
  expect(moved!.y - before!.y).toBeGreaterThan(90);
  expect(moved!.x).toBeGreaterThanOrEqual(10);
  expect(moved!.y).toBeGreaterThanOrEqual(10);
  expect(moved!.x + moved!.width).toBeLessThanOrEqual(1430);
  expect(moved!.y + moved!.height).toBeLessThanOrEqual(890);

  const movedCentreOffset = {
    x: moved!.x + moved!.width / 2 - 720,
    y: moved!.y + moved!.height / 2 - 450,
  };
  await copilot.getByTestId("ai-confirm-action").click();
  await expect(page).toHaveURL(/\/inventory\/stock$/);
  await expect(copilot.getByText("Confirmation needed", { exact: true })).toBeVisible();
  const afterAdvance = await copilot.boundingBox();
  expect(afterAdvance).not.toBeNull();
  expect(Math.abs(afterAdvance!.x + afterAdvance!.width / 2 - 720 - movedCentreOffset.x)).toBeLessThanOrEqual(3);
  expect(Math.abs(afterAdvance!.y + afterAdvance!.height / 2 - 450 - movedCentreOffset.y)).toBeLessThanOrEqual(3);
  expect(api.mission().pendingApproval?.id).toBe("approval-demo-001");
  expect(browserErrors, JSON.stringify(browserErrors, null, 2)).toEqual([]);
});

test("Hide reveals the working screen and stays hidden until Show Copilot is pressed", async ({ page }) => {
  test.setTimeout(60_000);
  const browserErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  const api = await installMissionApi(page);
  await page.addInitScript(() => {
    window.sessionStorage.setItem("xelor.activeMission", "investor-mission");
    window.sessionStorage.setItem("xelor.lastMission", "investor-mission");
  });
  await page.goto("/sales/orders");

  const copilot = page.getByTestId("ai-copilot-box");
  const workingArea = page.getByTestId("mission-working-area");
  await expect(copilot).toBeVisible();
  await expect(workingArea).toBeVisible();
  const missionBeforeReveal = JSON.stringify(api.mission());

  await copilot.getByTestId("ai-hide-and-highlight").click();

  await expect(copilot).toBeHidden();
  await expect(page.locator("body")).toHaveAttribute("data-xelor-agent-screen-reveal", "true");
  await expect.poll(() => workingArea.evaluate((element) => getComputedStyle(element).animationName))
    .toContain("x-agent-work-highlight");

  // The point of the change: waiting does NOT bring it back. A presenter talking over the
  // live screen for longer than the old ten-second timer used to be interrupted mid-sentence.
  await page.waitForTimeout(12_000);
  await expect(copilot).toBeHidden();
  await expect(page.locator("body")).toHaveAttribute("data-xelor-agent-screen-reveal", "true");

  // The show control is reachable while the card's own layer is aria-hidden.
  const showButton = page.getByTestId("ai-show-copilot");
  await expect(showButton).toBeVisible();
  await showButton.click();

  await expect(page.locator("body")).not.toHaveAttribute("data-xelor-agent-screen-reveal", "true");
  await expect(copilot).toBeVisible();
  await expect(showButton).toBeHidden();
  await expect(copilot.getByTestId("ai-application-target")).toContainText("Sales → Sales orders");
  expect(JSON.stringify(api.mission())).toBe(missionBeforeReveal);
  expect(browserErrors, JSON.stringify(browserErrors, null, 2)).toEqual([]);
});
