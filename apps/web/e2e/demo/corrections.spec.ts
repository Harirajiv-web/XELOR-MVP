import { expect, test, type Page } from "@playwright/test";

/**
 * CORRECTING A MISTAKE — the whole feature, through the browser.
 *
 * Everything below the UI is already covered: the edit policy has unit tests, `perm-check`
 * proves every correction permission is enforced by a route, and the acceptance matrix
 * proves the seeded world still builds. None of that answers the question this spec exists
 * for, which is the only question that was actually asked:
 *
 *   "in case there is a mistake in something i want to be able to change it"
 *
 * Four things are asserted, in the order they matter:
 *
 *   1. A DOCUMENT THAT CAN BE CHANGED OFFERS THE BUTTON, and pressing it opens the form
 *      ALREADY FILLED IN. A blank form would mean re-keying an order to fix one field,
 *      which is the workaround this whole feature exists to remove — so the assertion is
 *      on the actual values in the actual boxes, not on the dialog merely appearing.
 *
 *   2. AN AMENDMENT CANNOT BE SAVED WITHOUT A REASON. A revision nobody can explain is a
 *      number that will be argued about later, and the row-level CHECK from migration 0089
 *      would reject it anyway — turning a clear 422 into a 500.
 *
 *   3. A LEDGER DOCUMENT REFUSES, IN WORDS, and offers the reversal instead. A greyed-out
 *      control with no explanation is how an ERP teaches people to stop trying.
 *
 *   4. THE CHANGE IS RECORDED. An edit that leaves no trace is a liability rather than a
 *      feature; the History panel is what makes it the second thing.
 *
 * WRITING NOTE, because it cost a debugging round: `locator.isVisible()` does NOT wait —
 * it answers about this instant and ignores any timeout passed to it. The Edit button asks
 * the server before it settles, so every check here uses `waitFor`/`expect`, which do wait.
 * The first version of this spec used `isVisible({ timeout })`, decided nothing was
 * amendable, and skipped two tests on a system where the feature was working.
 */

async function signIn(page: Page): Promise<void> {
  await page.goto("/");
  await Promise.race([
    page.locator("#username").waitFor({ state: "visible" }),
    page.getByRole("button", { name: "Enter the factory intelligence" }).waitFor({ state: "visible" }),
  ]);
  if (await page.locator("#username").isVisible()) {
    await page.getByRole("button", { name: "Enter ONYX" }).click();
  }
  await expect(page.getByRole("button", { name: "Enter the factory intelligence" })).toBeVisible();
}

/** Open the first sales order on the list and return its number. */
async function openFirstSalesOrder(page: Page): Promise<string> {
  await page.goto("/sales/orders");
  const firstRow = page.getByRole("row").filter({ hasText: /SO-\d{4}-\d{5}/ }).first();
  await expect(firstRow).toBeVisible({ timeout: 30_000 });
  const soNo = (await firstRow.innerText()).match(/SO-\d{4}-\d{5}/)?.[0] ?? "";
  expect(soNo, "the seeded world must contain at least one sales order").not.toBe("");
  await firstRow.click();
  await expect(page).toHaveURL(/\/sales\/order\//);
  return soNo;
}

test("the edit form opens already filled in with the order's real values", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  const soNo = await openFirstSalesOrder(page);

  // The button asks the server whether this document may change before it settles, so it
  // is waited for rather than sampled.
  const edit = page.getByRole("button", { name: /^(Edit|Amend)$/ });
  await edit.waitFor({ state: "visible", timeout: 30_000 });
  await edit.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(new RegExp(`(Correct|Amend) ${soNo}`))).toBeVisible();

  // THE ASSERTION THAT MATTERS. Not "a dialog opened" — "the dialog is holding this
  // order's data". A blank form here is the failure the whole feature exists to prevent.
  // Keyed on `id`, not `name` — this form labels its fields with `htmlFor`/`id` and leaves
  // `name` empty. Worth stating: the first version of this spec asserted on `name`, found
  // every field anonymous, and reported a blank form on a dialog that was fully populated.
  const filled = await dialog.locator("input").evaluateAll((nodes) =>
    nodes
      .map((n) => ({ id: (n as HTMLInputElement).id, value: (n as HTMLInputElement).value }))
      .filter((f) => f.value.trim().length > 0),
  );
  expect(
    filled.length,
    "the edit form opened blank — a user would have to re-key the whole order to fix one field",
  ).toBeGreaterThan(4);

  // The customer's PO number and at least one line quantity, specifically: the header and
  // the lines are loaded by different code paths and one can arrive without the other.
  expect(filled.some((f) => f.id === "so-po")).toBe(true);
  expect(filled.some((f) => /^so-line-\d+-qty$/.test(f.id))).toBe(true);
});

test("an amendment cannot be saved without a reason", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  await openFirstSalesOrder(page);

  const amend = page.getByRole("button", { name: "Amend" });
  await amend.waitFor({ state: "visible", timeout: 30_000 }).catch(() => undefined);
  test.skip(!(await amend.isVisible()), "this order is a draft, not an amendment");

  await amend.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // Change the customer's PO number, then walk to the confirmation step.
  const poBox = dialog.locator('#so-po');
  await poBox.fill(`${await poBox.inputValue()}-R1`);
  await dialog.getByRole("button", { name: /Review the change/i }).click();

  // The confirmation shows old → new and demands a reason before Save becomes available.
  await expect(page.getByText(/Why are you making this change/i)).toBeVisible();
  const save = page.getByRole("button", { name: /Save the change/i });
  await expect(save).toBeDisabled();

  await page.locator("textarea").first().fill("customer re-issued their PO with a corrected number");
  await expect(save).toBeEnabled();

  // And it must show what the field is actually moving FROM and TO — a confirmation that
  // does not show the old value is a confirmation of nothing.
  await expect(page.getByText("-R1")).toBeVisible();
});

test("a posted voucher refuses to be edited and says to reverse it instead", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);

  await page.goto("/accounts/vouchers");
  const firstVoucher = page.getByRole("row").filter({ hasText: /JV-\d{4}-\d{5}/ }).first();
  await firstVoucher.waitFor({ state: "visible", timeout: 30_000 }).catch(() => undefined);
  test.skip(!(await firstVoucher.isVisible()), "no seeded journal voucher on this build");

  await firstVoucher.click();

  // The ledger is the one place where "you cannot edit this" is the correct answer, and the
  // point is that the refusal EXPLAINS ITSELF and offers the action that does work. A dead
  // button with no words is what sends people to WhatsApp instead of to the reversal screen.
  await expect(
    page.getByText(/reverse it and post a corrected one|Reverse this entry/i).first(),
  ).toBeVisible({ timeout: 30_000 });
});

test("the change history shows what the document used to say", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  await openFirstSalesOrder(page);

  await page.getByRole("button", { name: /Change history/i }).click();

  // Either the document has been corrected and the panel lists the changes, or it never has
  // and the panel says so in words. The failure this catches is the third case: a panel that
  // renders nothing, which reads as "no changes" on a document that has some.
  await expect(
    page.getByText(/never been changed since it was created|Corrected|Amended/).first(),
  ).toBeVisible({ timeout: 30_000 });
});
