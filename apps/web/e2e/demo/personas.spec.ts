import { expect, test, type Page } from "@playwright/test";

const DEPARTMENTS = [
  "HEXA",
  "MICA",
  "SPAR",
  "AXLE",
  "KILN",
  "RASP",
  "RELAY",
] as const;

const PERSONAS = [
  {
    user: "hari",
    password: "1234",
    open: [...DEPARTMENTS],
    allowed: "/api/v1/sales/customers",
    denied: null,
  },
  {
    user: "mica.commercial",
    password: "demo",
    open: ["MICA"],
    allowed: "/api/v1/sales/customers",
    denied: "/api/v1/purchase/vendors",
  },
  {
    user: "hexa.admin",
    password: "demo",
    open: ["HEXA"],
    allowed: "/api/v1/general/companies",
    denied: "/api/v1/sales/customers",
  },
  {
    user: "kiln.operations",
    password: "demo",
    open: ["KILN"],
    allowed: "/api/v1/production/orders",
    denied: "/api/v1/sales/customers",
  },
  {
    user: "spar.supply",
    password: "demo",
    open: ["SPAR"],
    allowed: "/api/v1/purchase/vendors",
    denied: "/api/v1/sales/customers",
  },
] as const;

async function signIn(
  page: Page,
  username: string,
  password: string,
): Promise<void> {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Username or email" }).fill(username);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Enter XELOR" }).click();
  await expect(page).toHaveURL(/^http:\/\/localhost:3001\/(?!callback)/);
  const brain = page.getByRole("button", {
    name: "Enter the factory intelligence",
  });
  await expect(brain).toBeVisible();
  await brain.click();
  await expect(
    page.getByRole("button", { name: /^ONYX Decision Commander/ }),
  ).toBeVisible();
}

test("five real personas see only their departments and the API enforces the same wall", async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const results: Array<Record<string, unknown>> = [];

  for (const persona of PERSONAS) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await signIn(page, persona.user, persona.password);

    const visible: string[] = [];
    const restricted: string[] = [];
    for (const code of DEPARTMENTS) {
      const door = page.getByRole("button", { name: new RegExp(`^${code} —`) });
      await expect(door).toBeVisible();
      ((await door.isDisabled()) ? restricted : visible).push(code);
    }
    expect(visible.sort(), `${persona.user} open departments`).toEqual(
      [...persona.open].sort(),
    );

    const token = await page.evaluate(() => {
      const raw = sessionStorage.getItem("aikyantra.session");
      return raw
        ? ((JSON.parse(raw) as { accessToken?: string }).accessToken ?? null)
        : null;
    });
    expect(token, `${persona.user} token`).toBeTruthy();
    const headers: Record<string, string> = {
      authorization: `Bearer ${token as string}`,
    };
    const api = {
      allowed: (
        await page.request.get(`http://localhost:3001${persona.allowed}`, {
          headers,
        })
      ).status(),
      denied: persona.denied
        ? (
            await page.request.get(`http://localhost:3001${persona.denied}`, {
              headers,
            })
          ).status()
        : null,
    };
    expect(api.allowed, `${persona.user} own API`).toBe(200);
    if (persona.denied)
      expect(api.denied, `${persona.user} foreign API`).toBe(403);

    const forbidden = DEPARTMENTS.find(
      (code) => !(persona.open as readonly string[]).includes(code),
    );
    if (forbidden) {
      await page.goto(`/department/${forbidden}`);
      await expect(
        page.getByRole("heading", { name: "Access restricted" }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Back to ONYX" }),
      ).toBeVisible();
    }

    expect(errors, `${persona.user} browser errors`).toEqual([]);
    results.push({
      persona: persona.user,
      open: visible,
      restricted,
      api,
      deepLinkRefused: Boolean(forbidden),
    });
    await context.close();
  }

  await testInfo.attach("persona-audit.json", {
    body: Buffer.from(JSON.stringify(results, null, 2)),
    contentType: "application/json",
  });
});
