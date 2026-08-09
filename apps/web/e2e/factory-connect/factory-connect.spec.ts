import { expect, test, type Page } from "@playwright/test";

const baseUrl = process.env.XELOR_E2E_BASE_URL ?? "http://localhost:3001";

async function signIn(page: Page): Promise<void> {
  await page.goto("/");
  const username = page.getByRole("textbox", { name: "Username or email" });
  const brain = page.getByRole("button", { name: "Enter the factory intelligence" });
  await expect(username.or(brain)).toBeVisible({ timeout: 30_000 });
  if (await username.isVisible()) {
    await username.fill("hari");
    await page.getByRole("textbox", { name: "Password" }).fill("1234");
    await page.getByRole("button", { name: "Enter XELOR" }).click();
  }
  await expect(brain).toBeVisible({ timeout: 30_000 });
}

async function apiHeaders(page: Page): Promise<Record<string, string>> {
  const token = await page.evaluate(() => {
    const raw = sessionStorage.getItem("aikyantra.session");
    return raw
      ? ((JSON.parse(raw) as { accessToken?: string }).accessToken ?? null)
      : null;
  });
  return token
    ? { authorization: `Bearer ${token}` }
    : { "x-xelor-public-demo": "investor-presentation" };
}

async function ensureAutomationActive(page: Page): Promise<void> {
  const headers = await apiHeaders(page);
  const state = await page.request.get(`${baseUrl}/api/v1/agent-os/control`, {
    headers,
  });
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

function watchBrowserFailures(page: Page): string[] {
  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => failures.push(`page: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 500) {
      failures.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
  return failures;
}

test("Factory Connect adds scoped workspaces without changing existing module landings", async ({
  page,
}) => {
  await signIn(page);
  const failures = watchBrowserFailures(page);

  await page.goto("/integration");
  await expect(page).toHaveURL(/\/integration\/connections$/);
  await expect(page.getByRole("heading", { name: "Connections", level: 1 })).toBeVisible();

  await page.goto("/production");
  await expect(page).toHaveURL(/\/production\/orders$/);
  await expect(page.getByRole("heading", { name: "Work orders", level: 1 })).toBeVisible();

  await page.goto("/planning");
  await expect(page).toHaveURL(/\/planning\/mrp$/);
  await expect(page.getByRole("heading", { name: /MRP run/, level: 1 })).toBeVisible();

  expect(failures).toEqual([]);
});

test("factory evidence stays read-only and opens the correct recovery graph", async ({ page }) => {
  await signIn(page);
  const failures = watchBrowserFailures(page);

  await page.goto("/integration/factory-connect");
  await expect(page.getByRole("heading", { name: "Factory Connect", level: 1 })).toBeVisible();
  await expect(page.getByText("Execution boundary:")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Governed command ledger" })).toBeVisible();
  await expect(page.getByText("Evidence as of", { exact: true })).toBeVisible();

  await page.goto("/production/robot-cells");
  await expect(page.getByRole("heading", { name: "Machines & robot cells", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: /operational floor/i })).toBeVisible();
  await expect(page.getByText("Operational map, not a safety-presence system", { exact: true })).toBeVisible();

  await page.goto("/planning/factory-flow");
  await expect(page.getByRole("heading", { name: "Factory flow", level: 1 })).toBeVisible();
  await expect(page.getByText("Parallel evidence", { exact: true })).toBeVisible();
  await expect(page.getByText("Human gate", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /recovery (mission|graph)/i }).click();

  await expect(page).toHaveURL(/\/agentos\/command\/factory\.flow-recovery$/);
  await expect(page.locator("#agent-graph")).toHaveValue("factory.flow-recovery");
  await expect(page.getByRole("button", { name: "Run factory-flow recovery" })).toBeVisible();
  await expect(page.locator("#agent-goal")).toHaveValue(/current factory constraint/);

  expect(failures).toEqual([]);
});

test("factory workspaces remain usable at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  const failures = watchBrowserFailures(page);

  for (const route of [
    "/integration/factory-connect",
    "/production/robot-cells",
    "/planning/factory-flow",
  ]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${route} horizontal overflow`).toBeLessThanOrEqual(1);
  }

  expect(failures).toEqual([]);
});

test("a lost Factory Flow launch response reuses the sealed intent and idempotency key", async ({
  page,
}) => {
  await signIn(page);
  await ensureAutomationActive(page);
  await page.goto("/agentos/command/factory.flow-recovery");
  await expect(page.getByTestId("factory-command-composer")).toBeVisible({
    timeout: 30_000,
  });
  await page.locator("#agent-goal").fill(
    `Retry one sealed Factory intent ${Date.now()}.`,
  );

  const keys: string[] = [];
  const bodies: unknown[] = [];
  let firstAttempt = true;
  await page.route("**/api/v1/agent-os/runs", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    keys.push(route.request().headers()["idempotency-key"] ?? "");
    bodies.push(route.request().postDataJSON());
    if (firstAttempt) {
      firstAttempt = false;
      await route.abort("connectionfailed");
      return;
    }
    await route.continue();
  });

  const launch = page.getByRole("button", { name: "Run factory-flow recovery" });
  await launch.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Could not reach the server" }),
  ).toBeVisible();

  const completedRetry = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith("/api/v1/agent-os/runs") &&
      response.status() === 201,
  );
  await launch.click();
  const response = await completedRetry;

  expect(keys).toHaveLength(2);
  expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/i);
  expect(keys[1]).toBe(keys[0]);
  expect(bodies[1]).toEqual(bodies[0]);

  const responseBody = (await response.json()) as { data: { run: { id: string } } };
  const headers = await apiHeaders(page);
  const cancelled = await page.request.post(
    `${baseUrl}/api/v1/agent-os/runs/${responseBody.data.run.id}/cancel`,
    {
      headers: {
        ...headers,
        "idempotency-key": crypto.randomUUID(),
      },
      data: { reason: "Retry regression test completed." },
    },
  );
  expect(cancelled.status()).toBe(201);
});

test("an approved Factory Flow mission records one simulator evaluation and no physical execution", async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(120_000);
  await signIn(page);
  await ensureAutomationActive(page);
  const failures = watchBrowserFailures(page);
  const goal = `Verify bounded simulator policy ${Date.now()} without physical execution.`;
  let commandPosts = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.url().includes("/api/v1/integration/factory/commands")
    ) {
      commandPosts += 1;
    }
  });

  await page.goto("/agentos/command/factory.flow-recovery");
  const composer = page.getByTestId("factory-command-composer");
  await expect(composer).toBeVisible({ timeout: 30_000 });
  await composer.getByTestId("factory-command-asset").selectOption("ROBOT-CELL-03");
  await expect(composer.getByTestId("factory-command-capability")).toHaveValue(
    "quality.output.quarantine",
  );
  await expect(composer).toContainText("no physical controller is contacted");
  await page.locator("#agent-goal").fill(goal);

  const started = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/api/v1/agent-os/runs") &&
      response.status() === 201,
  );
  await page.getByRole("button", { name: "Run factory-flow recovery" }).click();
  const startResponse = await started;
  const startBody = startResponse.request().postDataJSON() as {
    input: {
      factoryCommand: {
        assetCode: string;
        capability: string;
        parameters: Record<string, string>;
        requiredState: string;
        expiresAt: string;
      };
    };
  };
  const approvedIntent = startBody.input.factoryCommand;
  expect(approvedIntent).toMatchObject({
    assetCode: "ROBOT-CELL-03",
    capability: "quality.output.quarantine",
    requiredState: "blocked",
    parameters: {
      lotRef: "BATCH-B-204",
      reasonCode: "QUALITY_REVIEW",
    },
  });
  expect(Object.keys(approvedIntent.parameters).sort()).toEqual([
    "lotRef",
    "reasonCode",
  ]);
  expect(Date.parse(approvedIntent.expiresAt) - Date.now()).toBeGreaterThan(0);
  expect(Date.parse(approvedIntent.expiresAt) - Date.now()).toBeLessThanOrEqual(
    15 * 60_000,
  );

  await expect(page.getByText("Human approval required", { exact: true })).toBeVisible();
  const activeIntent = page.getByTestId("active-factory-command");
  await expect(activeIntent.getByTestId("factory-command-intent")).toContainText(
    "quality.output.quarantine",
  );
  await expect(activeIntent).toContainText("No command submitted");
  await page.getByRole("link", { name: "Review and decide" }).click();

  const approval = page.locator("article").filter({ hasText: goal }).last();
  await expect(approval).toBeVisible({ timeout: 30_000 });
  const approvalIntent = approval.getByTestId("factory-command-intent");
  await expect(approvalIntent).toContainText("Exact simulator command this approval permits");
  await expect(approvalIntent).toContainText("ROBOT-CELL-03");
  await expect(approvalIntent).toContainText("quality.output.quarantine");
  await expect(approvalIntent).toContainText("BATCH-B-204");
  await approval
    .getByLabel("Your decision note")
    .fill("Verified the exact bounded simulator intent and no-hardware boundary.");
  await approval.getByRole("button", { name: "Approve" }).click();
  await expect(
    page.getByText("Approved: Approve the factory-flow recovery work item", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 30_000 });

  await page.goto("/agentos/command/factory.flow-recovery");
  await expect(page.getByRole("heading", { name: goal })).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByLabel("Mission status").getByText(/^completed$/i),
  ).toBeVisible();
  const completedIntent = page.getByTestId("active-factory-command");
  await expect(completedIntent).toContainText("Human approval recorded");

  const submitted = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/api/v1/integration/factory/commands"),
  );
  await completedIntent
    .getByRole("button", { name: "Submit simulated command" })
    .click();
  const commandResponse = await submitted;
  expect(commandResponse.status()).toBe(201);
  const commandBody = commandResponse.request().postDataJSON() as Record<string, unknown>;
  expect(commandBody).toMatchObject(approvedIntent);
  expect(commandBody.idempotencyKey).toBe(
    `factory-command:${String(commandBody.approvalRef)}`,
  );

  const result = page.getByTestId("factory-command-result");
  await expect(result).toContainText(
    "Simulator evidence recorded — no physical execution",
  );
  await expect(result).toContainText("no physical action was attempted");
  await expect(
    completedIntent.getByRole("button", { name: "Submit simulated command" }),
  ).toHaveCount(0);
  expect(commandPosts).toBe(1);
  const commandKey = (await result.locator("dd").first().textContent())?.trim();
  expect(commandKey).toMatch(/^MC-/);

  // A reload must recover the redacted command evidence through the dedicated
  // by-approval endpoint. It must never offer a second submission merely because local
  // component state was lost.
  await page.reload();
  const reloadedResult = page.getByTestId("factory-command-result");
  await expect(reloadedResult).toContainText(
    "Simulator evidence recorded — no physical execution",
    { timeout: 30_000 },
  );
  await expect(reloadedResult).toContainText(commandKey ?? "missing-command-key");
  await expect(
    page.getByRole("button", { name: "Submit simulated command" }),
  ).toHaveCount(0);
  expect(commandPosts).toBe(1);

  await reloadedResult.getByRole("link", { name: "View Factory Connect ledger" }).click();
  await expect(page).toHaveURL(/\/integration\/factory-connect$/);
  await expect(page.getByRole("heading", { name: "Governed command ledger" })).toBeVisible();
  await expect(
    page.getByText(
      "Read-only evidence recorded by XELOR's simulator policy evaluation. It does not represent an edge dispatch, controller acknowledgement or physical execution.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText(commandKey ?? "missing-command-key", { exact: true })).toBeVisible();
  await expect(page.getByText("Simulator policy", { exact: true }).first()).toBeVisible();
  expect(failures).toEqual([]);
});
