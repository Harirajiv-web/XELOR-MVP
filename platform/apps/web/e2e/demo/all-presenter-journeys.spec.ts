import { expect, test, type Page } from "@playwright/test";
import { demoScenarios } from "../../src/spine/demo/demo-scenarios";
import { buildPresenterSnapshot } from "../../src/spine/demo/demo-presenter";
import { DEMO_RECORD_CREATED_EVENT } from "../../src/spine/demo/demo-events";

async function signIn(page: Page): Promise<void> {
  await page.goto("/");
  await Promise.race([
    page.locator("#username").waitFor({ state: "visible" }),
    page.getByRole("button", { name: "Enter the factory intelligence" }).waitFor({ state: "visible" }),
  ]);
  if (await page.locator("#username").isVisible()) {
    await page.getByRole("button", { name: "Enter XELOR" }).click();
  }
  await expect(page.getByRole("button", { name: "Enter the factory intelligence" })).toBeVisible();
  await page.goto("/sales/orders");
  await expect(page.getByTestId("demo-launcher")).toBeVisible();
}

test("every presenter journey has visible step data without a screen highlight", async ({
  page,
}, testInfo) => {
  test.setTimeout(420_000);
  const browserErrors: string[] = [];
  const unsafeRequests: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  // The investor build intentionally exposes one business story and one agent overview,
  // rather than a catalogue of competing fictional journeys.
  expect(demoScenarios).toHaveLength(2);
  expect(demoScenarios[0]?.evidenceMode).toBe("live");
  expect(demoScenarios[1]?.evidenceMode).toBe("structural");
  expect(demoScenarios.reduce((total, scenario) => total + scenario.steps.length, 0)).toBe(20);
  for (const scenario of demoScenarios) {
    if (scenario.kind === "agent-tour") {
      expect(scenario.demoRecord).toBeUndefined();
      expect(scenario.steps).toHaveLength(9);
      expect(scenario.steps.every((step) => step.path.startsWith("/department/"))).toBe(true);
      expect(scenario.steps.every((step) => Boolean(step.connectionLine))).toBe(true);
    } else {
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
      await expect(page.getByTestId("demo-screen-spotlight")).toHaveCount(0);
      if (scenario.kind === "agent-tour") {
        await expect(dock.getByTestId("demo-screen-context")).toHaveCount(0);
        await expect(dock.getByTestId("demo-live-record")).toContainText("Connection:");
        await expect(dock.getByTestId("demo-simple-explanation")).toContainText(step.body);
      } else {
        await expect(dock.getByTestId("demo-screen-context")).toBeVisible();
        await expect(dock.getByTestId("demo-screen-context")).toContainText("On this screen:");
        await expect(dock.getByTestId("demo-live-record")).toContainText(scenario.demoRecord!.reference);
      }

      if (scenarioIndex === 0 && stepIndex === 1) {
        await dock.getByRole("button", { name: "Expand demo guide" }).click();
        await expect(dock.getByTestId("demo-presenter-data")).toContainText("What to show on this screen");
        await expect(dock.getByTestId("demo-presenter-data")).toContainText(scenario.demoRecord!.reference);
        await page.screenshot({ path: testInfo.outputPath("presenter-step-normal.png"), fullPage: true });
      }

      if (stepIndex < scenario.steps.length - 1) {
        if (step.interaction) {
          await expect(page.getByTestId("next-demo-step")).toBeDisabled();
          await page.evaluate(
            ({ eventName, kind, index }) => {
              window.dispatchEvent(
                new CustomEvent(eventName, {
                  detail: {
                    kind,
                    id: `browser-test-${index}`,
                    reference: `SAVED-${index + 1}`,
                  },
                }),
              );
            },
            {
              eventName: DEMO_RECORD_CREATED_EVENT,
              kind: step.interaction.recordKind,
              index: stepIndex,
            },
          );
          await expect(page.getByTestId("demo-manual-action")).toContainText("saved");
          await expect(page.getByTestId("next-demo-step")).toBeEnabled();
        }
        await page.getByTestId("next-demo-step").click();
      }
    }

    await page.getByTestId("finish-demo").click();
    await expect(dock).not.toBeVisible();
  }

  expect(unsafeRequests, JSON.stringify(unsafeRequests, null, 2)).toEqual([]);
  expect(browserErrors, JSON.stringify(browserErrors, null, 2)).toEqual([]);
});
