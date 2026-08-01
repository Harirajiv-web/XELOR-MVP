import { chromium } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const reports = [
  {
    source: "docs/reports/xelor-mvp-technical-handoff-brief.html",
    output: "XELOR_MVP_TECHNICAL_HANDOFF_BRIEF.pdf",
  },
  {
    source: "docs/reports/xelor-technology-stack-roadmap.html",
    output: "XELOR_TECHNOLOGY_STACK_AND_PRODUCTION_ROADMAP.pdf",
  },
  {
    source: "docs/reports/xelor-agentic-ai-implementation-strategy.html",
    output: "XELOR_AGENTIC_AI_IMPLEMENTATION_AND_STRATEGY.pdf",
  },
];

const browser = await chromium.launch();
try {
  for (const report of reports) {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(resolve(root, report.source)).href, {
      waitUntil: "load",
    });
    await page.emulateMedia({ media: "print" });
    await page.pdf({
      path: resolve(root, report.output),
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate:
        '<div style="width:100%;font:8px Arial;color:#78849a;padding:0 15mm;display:flex;justify-content:space-between"><span>XELOR · AIKYANTRA</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
      margin: { top: "16mm", right: "15mm", bottom: "18mm", left: "15mm" },
    });
    await page.close();
  }
} finally {
  await browser.close();
}
