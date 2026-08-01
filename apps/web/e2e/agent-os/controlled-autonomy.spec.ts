import { expect, test } from "@playwright/test";

test("ONYX runs the connected seven-agent controlled-autonomy flow", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Username or email" }).fill("venkat");
  await page.getByRole("textbox", { name: "Password" }).fill("demo");
  await page.getByRole("button", { name: "Enter XELOR" }).click();
  const brain = page.getByRole("button", { name: "Enter the factory intelligence" });
  await expect(brain).toBeVisible();
  await brain.click();
  await expect(
    page.getByRole("button", { name: "Enter the factory intelligence" }),
  ).toHaveCount(0);
  await expect(page.getByText(/7\/7 agents connected/i)).toBeVisible();
  const onyxDoor = page.getByRole("button", { name: /ONYX Mission Control/i });
  await expect(onyxDoor).toBeEnabled();
  await page.screenshot({
    path: "test-results/onyx-connected-gateway.png",
    fullPage: true,
  });

  await onyxDoor.click();
  await expect(page).toHaveURL(/\/agentos\/command$/);
  await expect(
    page.getByRole("heading", {
      name: "ONYX works across every department.",
    }),
  ).toBeVisible();
  await expect(page.getByText("ONYX Supervisor", { exact: true })).toBeVisible();
  await expect(page.getByText("Human authority", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("option", {
      name: "Seven-agent controlled action mission",
    }),
  ).toBeAttached();
  await page
    .getByRole("button", { name: "Start from local ERP risk signal" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: /Respond to operations signal 'delivery\.commitment\.at_risk'/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Authorize the Phase 3 controlled action plan",
    }),
  ).toBeVisible();
  await expect(page.getByText("Human approval required", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /human approval.*waiting/i }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/onyx-mission-control.png",
    fullPage: true,
  });

  await page.getByRole("link", { name: "Review and decide" }).click();
  await expect(page).toHaveURL(/\/agentos\/approvals$/);
  await expect(
    page.getByRole("heading", { name: "Human Approvals", level: 1 }),
  ).toBeVisible();

  const approval = page
    .locator("article")
    .filter({ hasText: "Authorize the Phase 3 controlled action plan" })
    .last();
  await expect(approval).toBeVisible();
  await approval
    .getByLabel("Your decision note")
    .fill("Verified the evidence and controlled action boundary.");
  await approval.getByRole("button", { name: "Approve" }).click();
  await expect(
    page.getByText(
      "Approved: Authorize the Phase 3 controlled action plan",
      { exact: true },
    ),
  ).toBeVisible();

  await page.getByRole("link", { name: "Open Mission Control" }).click();
  await expect(page).toHaveURL(/\/agentos\/command$/);
  await expect(page.locator(".agent-action-ledger li")).toHaveCount(6);
  await page.locator(".agent-command").screenshot({
    path: "test-results/onyx-mission-control-surface.png",
  });
  await page
    .getByRole("heading", { name: "Approval gate" })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("heading", { name: "Approval gate" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/onyx-mission-control-execution.png",
  });
});
