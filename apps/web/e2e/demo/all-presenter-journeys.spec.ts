import { expect, test, type Page } from "@playwright/test";
import { demoScenarios } from "../../src/spine/demo/demo-scenarios";
import { buildPresenterSnapshot } from "../../src/spine/demo/demo-presenter";

async function signIn(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Enter XELOR" }).click();
  await expect(page.getByRole("button", { name: "Enter the factory intelligence" })).toBeVisible();
  await page.goto("/sales/orders");
  await expect(page.getByTestId("demo-launcher")).toBeVisible();
}

test("every presenter journey has visible step data and a highlighted screen target", async ({
  page,
}, testInfo) => {
  test.setTimeout(420_000);
  const browserErrors: string[] = [];
  const unsafeRequests: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  // The investor build intentionally exposes one canonical, live-data story instead of a
  // catalogue of fictional journeys. Validate every evidence-linked act before walking it.
  expect(demoScenarios).toHaveLength(1);
  expect(demoScenarios[0]?.evidenceMode).toBe("live");
  expect(demoScenarios.reduce((total, scenario) => total + scenario.steps.length, 0)).toBe(9);
  for (const scenario of demoScenarios) {
    expect(scenario.demoRecord, `${scenario.id} needs a dedicated seeded record`).toBeTruthy();
    const record = scenario.demoRecord!;
    for (const [index, step] of scenario.steps.entries()) {
      const snapshot = buildPresenterSnapshot(scenario, step, index, record);
      expect(snapshot.headline, `${scenario.id} step ${index + 1} headline`).not.toHaveLength(0);
      expect(snapshot.explanation, `${scenario.id} step ${index + 1} explanation`).toContain(record.reference);
      expect(snapshot.facts, `${scenario.id} step ${index + 1} facts`).toHaveLength(4);
      expect(snapshot.facts.every((fact) => fact.label.length > 0 && fact.value.length > 0)).toBe(true);
    }
  }

  await signIn(page);
  page.on("request", (request) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      unsafeRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  const dock = page.getByTestId("active-demo-dock");
  for (const [scenarioIndex, scenario] of demoScenarios.entries()) {
    await page.getByTestId("demo-launcher").click();
    await page.getByTestId(`demo-scenario-${scenario.id}`).click();
    await page.getByTestId("start-selected-demo").click();

    for (const [stepIndex, step] of scenario.steps.entries()) {
      await expect(page).toHaveURL(new RegExp(`${step.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
      await expect(dock.getByText(`${stepIndex + 1} of ${scenario.steps.length}`, { exact: true })).toBeVisible();
      await expect(dock.getByTestId("demo-step-snapshot")).toBeVisible();
      await expect(page.getByTestId("demo-screen-spotlight")).toBeVisible();
      await expect(dock.getByTestId("demo-live-record")).toContainText(scenario.demoRecord!.reference);

      if (scenarioIndex === 0 && stepIndex === 0) {
        await dock.getByRole("button", { name: "Expand demo guide" }).click();
        await expect(dock.getByTestId("demo-presenter-data")).toContainText("What to show on this screen");
        await expect(dock.getByTestId("demo-presenter-data")).toContainText(scenario.demoRecord!.reference);
        await page.screenshot({ path: testInfo.outputPath("presenter-step-with-highlight.png"), fullPage: true });
      }

      if (stepIndex < scenario.steps.length - 1) {
        await page.getByTestId("next-demo-step").click();
      }
    }

    await page.getByTestId("finish-demo").click();
    await expect(dock).not.toBeVisible();
  }

  expect(unsafeRequests, JSON.stringify(unsafeRequests, null, 2)).toEqual([]);
  expect(browserErrors, JSON.stringify(browserErrors, null, 2)).toEqual([]);
});
