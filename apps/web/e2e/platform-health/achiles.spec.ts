import { expect, test, type Page } from "@playwright/test";

const baseUrl = process.env.XELOR_E2E_BASE_URL ?? "http://localhost:3001";
const apiBaseUrl = process.env.XELOR_E2E_API_URL ?? "http://localhost:3000";

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

test("ACHILES privately checks the complete demo stack and preserves history", async ({
  page,
}, testInfo) => {
  const failures = watchBrowserFailures(page);
  await page.goto(`${baseUrl}/platform-health/status`);

  await expect(page.getByTestId("achiles-status-screen")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Is XELOR working?" })).toBeVisible();
  await expect(page.getByText("Private", { exact: true })).toBeVisible();
  await expect(page.getByText("Hourly", { exact: true })).toBeVisible();
  await expect(page.getByText("Read-only", { exact: true })).toBeVisible();

  const completedRun = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/platform-health/run") &&
      response.request().method() === "POST" &&
      response.status() === 201,
  );
  await page.getByTestId("achiles-run-now").click();
  await completedRun;

  await expect(page.getByTestId("achiles-headline")).toContainText(
    "XELOR is working",
  );
  for (const key of ["api", "database", "event_bus", "web", "ai_runtime"]) {
    const card = page.getByTestId(`achiles-check-${key}`);
    await expect(card).toBeVisible();
    await expect(card).toContainText("Passed");
  }
  await expect(page.getByRole("cell", { name: "Internal operator" }).first()).toBeVisible();
  await expect(page.getByText(/RELAY owns the incident clock/i)).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("achiles-private-status.png"),
    fullPage: true,
  });
  expect(failures).toEqual([]);
});

test("ACHILES remains understandable on a phone-sized screen", async ({ page }, testInfo) => {
  const failures = watchBrowserFailures(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/platform-health/status`);

  await expect(page.getByTestId("achiles-status-screen")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Is XELOR working?" })).toBeVisible();
  await expect(page.getByTestId("achiles-run-now")).toBeVisible();
  await expect(page.getByText("Private check history", { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("achiles-phone.png"),
    fullPage: true,
  });
  expect(failures).toEqual([]);
});

test("ACHILES is the final registered agent and has no action capability", async ({
  request,
}) => {
  const response = await request.get(`${apiBaseUrl}/api/v1/agent-os/catalogue`, {
    headers: { "x-xelor-public-demo": "investor-presentation" },
  });
  expect(response.status()).toBe(200);
  const envelope = (await response.json()) as {
    data: {
      agents: Array<{ key: string }>;
      capabilities: Array<{ key: string; sideEffecting: boolean; allowedAgents: string[] }>;
    };
  };
  expect(envelope.data.agents.map((agent) => agent.key)).toEqual([
    "ONYX",
    "HEXA",
    "MICA",
    "SPAR",
    "AXLE",
    "KILN",
    "RASP",
    "RELAY",
    "ACHILES",
  ]);
  const achilesCapabilities = envelope.data.capabilities.filter((capability) =>
    capability.allowedAgents.includes("ACHILES"),
  );
  expect(achilesCapabilities).toEqual([
    expect.objectContaining({
      key: "platform-health.status.read",
      sideEffecting: false,
    }),
  ]);
});
