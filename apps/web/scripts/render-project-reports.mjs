import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const proofDir = resolve(root, "apps/web/test-results/project-report-proofs");
const reports = [
  {
    id: "handoff",
    source: "docs/reports/xelor-mvp-technical-handoff-brief.html",
    output: "XELOR_MVP_TECHNICAL_HANDOFF_BRIEF.pdf",
  },
  {
    id: "stack",
    source: "docs/reports/xelor-technology-stack-roadmap.html",
    output: "XELOR_TECHNOLOGY_STACK_AND_PRODUCTION_ROADMAP.pdf",
  },
  {
    id: "agentic",
    source: "docs/reports/xelor-agentic-ai-implementation-strategy.html",
    output: "XELOR_AGENTIC_AI_IMPLEMENTATION_AND_STRATEGY.pdf",
  },
  {
    id: "architecture-playbook",
    source: "docs/reports/xelor-architecture-implementation-playbook.html",
    output: "XELOR_ARCHITECTURE_AND_IMPLEMENTATION_PLAYBOOK.pdf",
  },
];

const requestedReportId = process.argv[2];
const selectedReports = requestedReportId
  ? reports.filter((report) => report.id === requestedReportId)
  : reports;

if (requestedReportId && selectedReports.length === 0) {
  throw new Error(`Unknown report id: ${requestedReportId}`);
}

await mkdir(proofDir, { recursive: true });
const browser = await chromium.launch();
try {
  for (const report of selectedReports) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
    await page.goto(pathToFileURL(resolve(root, report.source)).href, {
      waitUntil: "load",
    });
    const sections = await page.locator("body > section").evaluateAll((nodes) =>
      nodes.map((node, index) => ({
        index,
        title: node.querySelector("h2")?.textContent?.trim() ?? "Cover",
        height: Math.round(node.getBoundingClientRect().height),
      })),
    );
    const longSections = sections.filter((section) => section.height > 995);
    if (longSections.length) {
      process.stdout.write(
        `${report.id}: sections intentionally spanning more than one print page: ${longSections
          .map((section) => `${section.title} (${section.height}px)`)
          .join(", ")}\n`,
      );
    }
    const proofPattern = /Module atlas|Module maturity|Transaction ownership|Railway demo|Public demo deployment|Agent-to-module|Exact capability|Coordination, deployment|Target production architecture|Pull-request CI pipeline|Release sequence|Database change pipeline|Identity, authorization|How to implement one XELOR module|Backend developer implementation guide|Full-stack and frontend implementation guide|Developer review|Cross-functional review|Exact developer command runbook/;
    for (const section of sections.filter((item) => proofPattern.test(item.title))) {
      const slug = section.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 56);
      await page.locator("body > section").nth(section.index).screenshot({
        path: resolve(proofDir, `${report.id}-${slug}.png`),
      });
    }
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
    process.stdout.write(`Rendered ${report.output}\n`);
  }
} finally {
  await browser.close();
}
