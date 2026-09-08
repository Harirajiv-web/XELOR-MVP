import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const origin = process.env.WEB_BASE ?? "http://localhost:4301";
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ serviceWorkers: "allow" });
  const page = await context.newPage();
  await page.goto(`${origin}/home`);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  assert.ok(await page.locator('link[rel="manifest"]').getAttribute("href"));
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    return (await Promise.all(names.filter((name) => name.startsWith("aikyantra-shell-")).map(async (name) => {
      const cache = await caches.open(name); return (await cache.keys()).map((request) => new URL(request.url).pathname);
    }))).flat();
  });
  assert.ok(cached.includes("/offline.html"));
  assert.ok(cached.every((path) => path === "/offline.html" || path === "/icons/app.svg"), "Service worker must not cache business records");
  // Chromium's context-level network emulation does not consistently cover service
  // worker targets. Inject a network rejection in that target too, then restore it.
  const worker = context.serviceWorkers()[0];
  assert.ok(worker, "Expected the active service worker");
  await worker.evaluate(() => {
    const originalFetch = self.fetch;
    self.restoreVerificationFetch = () => { self.fetch = originalFetch; };
    self.fetch = () => Promise.reject(new TypeError("Simulated network unavailable"));
  });
  await context.setOffline(true);
  assert.equal(await page.evaluate(() => navigator.onLine), false);
  await page.goto(`${origin}/home?pwa-verification=offline`);
  assert.match(await page.title(), /Reconnect/);
  assert.match(await page.locator("body").innerText(), /Reconnect to see current factory records/);
  await worker.evaluate(() => self.restoreVerificationFetch());
  await context.setOffline(false);
  await page.goto(`${origin}/home`);
  await page.getByRole("heading", { name: "Business overview", exact: true }).waitFor();
  console.log("PASS: app manifest/service worker, no business cache, offline reconnect, online recovery.");
} finally { await browser.close(); }
