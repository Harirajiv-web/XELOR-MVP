import { expect, test } from "@playwright/test";

/**
 * THE DEMO'S FIRST STEP: A CUSTOMER'S ORDER, TYPED IN LIVE.
 *
 * Mission Control used to open on a list of seeded orders. That proves the engine runs and
 * proves nothing about whether it is a recording — the single most expensive doubt an
 * investor demo can leave in the room. These tests pin the answer: a presenter types a
 * customer's PO number, a real sales order appears in Phase 1, and the SAME thirteen-step
 * mission opens on it.
 *
 * Run against the live stack rather than a mocked API, deliberately. The claim being tested
 * is "this writes a real order that the rest of the product can see", and a mocked write
 * would assert only that the form posts JSON.
 */

const CONTROL = "/fulfilment/control";

/** Unique per run: the endpoint is idempotent on (customer, their PO number) by design. */
function poNumber(): string {
  return `E2E/PO/${Math.floor(Math.random() * 1_000_000)}`;
}

test("the first step is taking an order, and it opens the same mission on it", async ({ page }) => {
  test.setTimeout(120_000);
  const browserErrors: string[] = [];
  page.on("pageerror", (e) => browserErrors.push(e.message));

  await page.goto(CONTROL);

  // The form leads the screen — this is the primary act, not a secondary one.
  const form = page.getByTestId("new-order-submit");
  await expect(form).toBeVisible();

  await expect(page.locator("#no-customer")).not.toHaveValue("");
  await expect(page.locator("#no-item")).not.toHaveValue("");

  // The derived commercials are SHOWN. A price that lands on a commitment without anybody
  // seeing it is how a live demo becomes a misrepresentation.
  const card = page.locator("section").filter({ hasText: "A customer just sent an order" }).first();
  await expect(card).toContainText("what this part last sold for");

  const po = poNumber();
  await page.locator("#no-po").fill(po);
  await page.locator("#no-qty").fill("15");
  await page.locator("#no-due").fill("2026-11-20");

  await form.click();

  // The mission view replaces the picker, and it is about the order just typed.
  await expect(page.getByRole("button", { name: /Looks right/i })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("main")).toContainText("15 units");
  await expect(page.locator("main")).toContainText(/SO-\d{4}-\d{5}/);

  // THE PROMISE IS HONOURED. `loadOrder` used to hardcode this to null, so every mission
  // planned backwards from order-date-plus-thirty and the date on the order was decorative.
  // If this regresses, the plan is scheduled against a date nobody agreed to.
  await expect(page.locator("main")).toContainText("2026-11-20");

  expect(browserErrors, JSON.stringify(browserErrors, null, 2)).toEqual([]);
});

test("the same order twice raises one commitment, not two", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(CONTROL);

  const po = poNumber();
  await page.locator("#no-po").fill(po);
  await page.locator("#no-qty").fill("12");
  await page.getByTestId("new-order-submit").click();
  await expect(page.getByRole("button", { name: /Looks right/i })).toBeVisible({ timeout: 60_000 });

  const first = await page.locator("main").innerText();
  const soNo = first.match(/SO-\d{4}-\d{5}/)?.[0];
  expect(soNo, "the mission header names the order it is about").toBeTruthy();

  // Back out and submit the identical order again. The idempotency key is derived from the
  // customer and their PO number, so this must REPLAY rather than commit the customer twice.
  //
  // Via the screen's own Back control, NOT a fresh `goto`: Mission Control deliberately
  // resumes an in-flight mission rather than dropping a presenter back on the picker
  // mid-demo, so reloading the URL returns to the mission and never shows the form.
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByTestId("new-order-submit")).toBeVisible();
  await page.locator("#no-po").fill(po);
  await page.locator("#no-qty").fill("12");
  await page.getByTestId("new-order-submit").click();
  await expect(page.getByRole("button", { name: /Looks right/i })).toBeVisible({ timeout: 60_000 });

  await expect(page.locator("main")).toContainText(soNo!);
});

test("the old way in still works — the seeded orders and the scenarios are both still there", async ({ page }) => {
  await page.goto(CONTROL);

  // Adding a way in must not remove one. The nine named scenarios each stage a specific
  // condition that the free-form form cannot reproduce, so losing them would cost the demo
  // its refusal, its escalation and its retry stories.
  await expect(page.locator("section").filter({ hasText: "Your confirmed orders" }).first()).toBeVisible();
  await expect(page.getByText(/Or show me a situation/i)).toBeVisible();

  // One authority control, above both, because two copies could disagree about how much
  // the machine is allowed to do.
  const tierControls = page.getByRole("button", { name: /Act within limits/i });
  await expect(tierControls).toHaveCount(1);
});
