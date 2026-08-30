import { expect, test, type Page } from "@playwright/test";

const baseUrl = process.env.ONYX_E2E_BASE_URL ?? "http://localhost:3001";

async function ensureAutomationActive(page: Page): Promise<void> {
  const token = await page.evaluate(() => {
    const raw = sessionStorage.getItem("aikyantra.session");
    return raw
      ? ((JSON.parse(raw) as { accessToken?: string }).accessToken ?? null)
      : null;
  });
  // Authenticate the same way the app itself does (`src/spine/api/client.ts`): a bearer
  // token when Keycloak minted one, and otherwise the public-demo selector header. The
  // public demo never manufactures a token — that is the point of it — so demanding one
  // here failed the whole nine-agent flow on a stack that was working correctly.
  const headers: Record<string, string> =
    token !== null
      ? { authorization: `Bearer ${token}` }
      : { "x-xelor-public-demo": "investor-presentation" };

  const state = await page.request.get(
    `${baseUrl}/api/v1/agent-os/control`,
    { headers },
  );
  expect(state.status()).toBe(200);
  const body = (await state.json()) as {
    data: { automation: { status: "active" | "stopped" } };
  };
  if (body.data.automation.status === "active") return;

  const release = await page.request.post(
    `${baseUrl}/api/v1/agent-os/control/kill-switch/release`,
    { headers, data: {} },
  );
  expect(release.status()).toBe(201);
}

test("ONYX runs the connected nine-agent controlled-autonomy flow", async ({
  page,
}) => {
  await page.goto("/");
  const brain = page.getByRole("button", {
    name: "Enter the factory intelligence",
  });
  // Two valid front doors, one test. With Keycloak in front, `/` is the themed sign-in
  // form; with the public demo enabled it is the arrival experience and no form exists.
  // Race them and only type credentials into a form that is actually there — the same
  // dual-mode approach `e2e/demo/full-workflow.spec.ts` already uses. Filling
  // unconditionally made this fail on a perfectly working demo stack.
  await Promise.race([
    page.locator("#username").waitFor({ state: "visible" }),
    brain.waitFor({ state: "visible" }),
  ]);
  if (await page.locator("#username").isVisible()) {
    await page.getByRole("textbox", { name: "Username or email" }).fill("hari");
    await page.getByRole("textbox", { name: "Password" }).fill("1234");
    await page.getByRole("button", { name: "Enter ONYX" }).click();
  }
  await expect(brain).toBeVisible();
  await ensureAutomationActive(page);
  await brain.click();
  await expect(
    page.getByRole("button", { name: "Enter the factory intelligence" }),
  ).toHaveCount(0);
  await expect(page.getByText(/9\/9 agents connected/i)).toBeVisible();
  const onyxDoor = page.getByRole("button", {
    name: /ONYX Decision Commander/i,
  });
  await expect(onyxDoor).toBeEnabled();
  await page.screenshot({
    path: "test-results/onyx-connected-gateway.png",
    fullPage: true,
  });

  await onyxDoor.click();
  await expect(page).toHaveURL(/\/agentos\/commander$/);
  await expect(
    page.getByRole("heading", { name: "Live operating decision room" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Mission control", exact: true })
    .click();
  await expect(page).toHaveURL(/\/agentos\/command$/);
  await expect(
    page.getByRole("heading", {
      name: "ONYX works across every department.",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("ONYX Supervisor", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Human authority", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", {
      name: "Nine-agent controlled action mission",
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
  await expect(
    page.getByText("Human approval required", { exact: true }),
  ).toBeVisible();
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
    page.getByText("Approved: Authorize the Phase 3 controlled action plan", {
      exact: true,
    }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Open Mission Control" }).click();
  await expect(page).toHaveURL(/\/agentos\/command$/);
  await expect(page.locator(".agent-action-ledger li")).toHaveCount(7);
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
