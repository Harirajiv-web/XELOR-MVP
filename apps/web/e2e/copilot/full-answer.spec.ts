import { expect, test, type Page } from "@playwright/test";

const question = "How much of an item do we have in stock?";
const fullAnswer =
  "Inventory currently holds 42 units of PMP-CP50 across two warehouses. " +
  "WH-FG has 30 available units and WH-ACC has 12 available units. " +
  "Both balances were read from the live stock ledger under your existing inventory permission. " +
  "The highest available balance is in WH-FG, so that warehouse should be checked first for the next allocation. " +
  "No stock movement or business record was changed. Full answer end.";

const capabilities = {
  canAsk: [
    {
      key: "stock.on_hand",
      question,
      module: "inventory",
      examples: ["How much stock do we have?"],
    },
  ],
  cannotAsk: [],
};

const catalogue = [
  {
    key: "stock.on_hand",
    question,
    module: "inventory",
    needsPermission: "inventory.stock.read",
    examples: ["How much stock do we have?"],
    parameters: [],
    maxRows: 100,
  },
];

const answer = {
  answered: true,
  answer: fullAnswer,
  rows: [
    { itemCode: "PMP-CP50", warehouseCode: "WH-FG", onHand: 30 },
    { itemCode: "PMP-CP50", warehouseCode: "WH-ACC", onHand: 12 },
  ],
  citation: {
    intentKey: "stock.on_hand",
    intentQuestion: question,
    sources: ["stock_balance", "item", "warehouse"],
    rowCount: 2,
    truncated: false,
    params: {},
    asOf: "2026-08-14T10:00:00.000Z",
  },
  understanding: {
    outcome: "matched",
    intentKey: "stock.on_hand",
    question,
    params: {},
    confidence: 0.98,
    routedBy: "deterministic",
    explanation: "Matched the governed on-hand stock question and read Inventory records only.",
  },
  correlationId: "copilot-full-answer-browser-test",
};

async function arrangeCopilot(page: Page): Promise<void> {
  await page.route("**/api/v1/copilot/capabilities", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(capabilities) }),
  );
  await page.route("**/api/v1/copilot/catalogue", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(catalogue) }),
  );
  await page.route("**/api/v1/copilot/ask", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(answer) }),
  );
}

async function expectTabularAnswer(scope: ReturnType<Page["locator"]>): Promise<void> {
  await expect(scope.getByTestId("copilot-department-route")).toContainText(
    "SPAR · Purchasing & Stock",
  );
  await expect(scope.getByTestId("copilot-department-route")).toContainText("Inventory");
  await expect(scope.getByTestId("copilot-department-route")).toContainText("Agent in play");
  await expect(scope.getByTestId("copilot-answer")).not.toContainText(fullAnswer);
  await expect(scope.getByTestId("copilot-answer-table")).toContainText("Item Code");
  await expect(scope.getByTestId("copilot-answer-table")).toContainText("WH-FG");
  await expect(scope.getByTestId("copilot-answer-table")).toContainText("WH-ACC");
  await expect(scope.getByTestId("copilot-full-answer")).toHaveCount(0);
  await expect(scope.getByTestId("copilot-reasoning")).toHaveCount(0);
  await expect(scope.getByTestId("copilot-records")).toHaveCount(0);
  await expect(scope.getByTestId("copilot-answer").locator("p")).toHaveCount(0);
  await expect(scope.getByTestId("copilot-answer").locator("details")).toHaveCount(0);
}

test("suggested question shows the active agent and tabular answer on the Copilot screen", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await arrangeCopilot(page);

  await page.goto("/copilot/ask");
  await expect(page.getByRole("button", { name: question })).toBeVisible();
  await page.getByRole("button", { name: question }).click();
  await expectTabularAnswer(page.locator("main"));
  expect(browserErrors, JSON.stringify(browserErrors, null, 2)).toEqual([]);
});

test("suggested question shows the active agent and tabular answer in the right rail", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await arrangeCopilot(page);

  await page.goto("/inventory/stock");
  await page.getByRole("button", { name: "Show the copilot" }).click();
  const rail = page.locator("aside.x-copilot-rail");
  await rail.getByRole("button", { name: `01 ${question}` }).click();
  await expectTabularAnswer(rail);
  await expect(rail.locator('[data-latest-copilot-question="true"]')).toBeInViewport();
  await expect(rail.getByTestId("copilot-department-route")).toBeInViewport();
  expect(browserErrors, JSON.stringify(browserErrors, null, 2)).toEqual([]);
});
