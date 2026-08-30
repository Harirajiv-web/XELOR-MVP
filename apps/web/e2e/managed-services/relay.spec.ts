import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page): Promise<void> {
  await page.goto("/");
  const username = page.getByRole("textbox", { name: "Username or email" });
  const brain = page.getByRole("button", {
    name: "Enter the factory intelligence",
  });
  await expect(username.or(brain)).toBeVisible({ timeout: 30_000 });
  if (await username.isVisible()) {
    await username.fill("venkat");
    await page.getByRole("textbox", { name: "Password" }).fill("demo");
    await page.getByRole("button", { name: "Enter ONYX" }).click();
  }
  await expect(brain).toBeVisible({ timeout: 30_000 });
}

test("RELAY explains the service lifecycle without duplicating technical ownership", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await signIn(page);

  await page.goto("/managed-services/command-centre");
  await expect(
    page.getByRole("heading", { name: "Service command centre" }),
  ).toBeVisible();
  await expect(
    page.getByText("Illustrative managed-service model"),
  ).toBeVisible();
  await expect(page.getByText("RELAY · Managed Services")).toBeVisible();
  for (const stage of ["Design", "Transition", "Operate", "Improve"]) {
    await expect(page.getByRole("heading", { name: stage })).toBeVisible();
  }

  await page.getByRole("link", { name: "Incidents & escalation" }).click();
  await expect(
    page.getByRole("heading", { name: "Incidents & escalation" }),
  ).toBeVisible();
  await expect(
    page.getByText("RELAY coordinates", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Specialist resolves", { exact: true }).first(),
  ).toBeVisible();

  await page.getByRole("link", { name: "Changes & releases" }).click();
  await expect(
    page.getByRole("heading", { name: "Changes & releases" }),
  ).toBeVisible();
  await expect(
    page.getByText("Customer change calendar", { exact: true }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Service reviews" }).click();
  await expect(
    page.getByRole("heading", { name: "Service reviews" }),
  ).toBeVisible();
  await expect(page.getByText("Monthly service review pack")).toBeVisible();

  await page.getByRole("link", { name: "Responsibility map" }).click();
  await expect(
    page.getByRole("heading", { name: "Responsibility map" }),
  ).toBeVisible();
  await expect(
    page.getByText("Accountability and handoff matrix"),
  ).toBeVisible();
  await expect(
    page.getByText("Does not own", { exact: true }).first(),
  ).toBeVisible();
  await expect(errors).toEqual([]);
});

test("RELAY remains readable at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.goto("/managed-services/command-centre");
  await expect(
    page.getByRole("heading", { name: "Service command centre" }),
  ).toBeVisible();
  await expect(
    page.getByText("Illustrative managed-service model"),
  ).toBeVisible();
  await expect(page.getByText("Managed-service lifecycle")).toBeVisible();
  await page.screenshot({
    path: "test-results/relay-managed-services-mobile.png",
    fullPage: true,
  });
});
