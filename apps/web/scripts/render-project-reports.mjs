import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const proofDir = resolve(root, "apps/web/test-results/project-report-proofs");
const reports = [
  {
    id: "master-plan",
    source: "docs/reports/xelor-product-development-master-plan.html",
    output: "docs/05-deliverables/project-reports/XELOR_PRODUCT_DEVELOPMENT_MASTER_PLAN.pdf",
  },
  {
    id: "dossier",
    source: "docs/reports/xelor-platform-architecture-and-verification-dossier.html",
    output: "docs/05-deliverables/project-reports/XELOR_PLATFORM_ARCHITECTURE_AND_VERIFICATION_DOSSIER.pdf",
  },
  {
    id: "handoff",
    source: "docs/reports/xelor-mvp-technical-handoff-brief.html",
    output: "docs/05-deliverables/project-reports/XELOR_MVP_TECHNICAL_HANDOFF_BRIEF.pdf",
  },
  {
    id: "simple-platform-guide",
    source: "docs/reports/xelor-complete-platform-simple-guide.html",
    output: "docs/05-deliverables/project-reports/XELOR_COMPLETE_PLATFORM_SIMPLE_GUIDE.pdf",
    proofAllSections: true,
    strictPageSections: true,
  },
  {
    id: "stack",
    source: "docs/reports/xelor-technology-stack-roadmap.html",
    output: "docs/05-deliverables/project-reports/XELOR_TECHNOLOGY_STACK_AND_PRODUCTION_ROADMAP.pdf",
  },
  {
    id: "phase-architecture",
    source: "docs/reports/xelor-phase-1-phase-2-technology-architecture.html",
    output: "docs/05-deliverables/project-reports/XELOR_PHASE_1_AND_PHASE_2_TECHNOLOGY_AND_ARCHITECTURE.pdf",
    fullBleed: true,
  },
  {
    id: "agentic",
    source: "docs/reports/xelor-agentic-ai-implementation-strategy.html",
    output: "docs/05-deliverables/project-reports/XELOR_AGENTIC_AI_IMPLEMENTATION_AND_STRATEGY.pdf",
  },
  {
    id: "architecture-playbook",
    source: "docs/reports/xelor-architecture-implementation-playbook.html",
    output: "docs/05-deliverables/project-reports/XELOR_ARCHITECTURE_AND_IMPLEMENTATION_PLAYBOOK.pdf",
  },
  {
    id: "tech-architecture",
    source: "docs/reports/aikyantra-onyx-and-xelor-technology-and-architecture.html",
    output: "docs/05-deliverables/project-reports/AIKYANTRA_ONYX_AND_XELOR_TECHNOLOGY_AND_ARCHITECTURE.pdf",
    fullBleed: true,
  },
  {
    id: "end-product-architecture",
    source: "docs/reports/aikyantra-onyx-and-xelor-end-product-architecture.html",
    output: "docs/05-deliverables/project-reports/AIKYANTRA_ONYX_AND_XELOR_END_PRODUCT_ARCHITECTURE.pdf",
    fullBleed: true,
  },
  {
    id: "business-revenue",
    source: "docs/reports/xelor-business-revenue-model.html",
    output: "docs/05-deliverables/project-reports/XELOR_BUSINESS_REVENUE_MODEL.pdf",
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
    await mkdir(dirname(resolve(root, report.output)), { recursive: true });
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
      if (report.strictPageSections) {
        throw new Error(
          `${report.id}: a beginner-guide section exceeds one print page: ${longSections
            .map((section) => `${section.title} (${section.height}px)`)
            .join(", ")}`,
        );
      }
      process.stdout.write(
        `${report.id}: sections intentionally spanning more than one print page: ${longSections
          .map((section) => `${section.title} (${section.height}px)`)
          .join(", ")}\n`,
      );
    }
    const proofPattern = /Module atlas|Module maturity|Transaction ownership|Railway demo|Public demo deployment|Agent-to-module|Exact capability|Coordination, deployment|Managed.service|RELAY|The two investor demos|Target production architecture|Pull-request CI pipeline|Release sequence|Database change pipeline|Identity, authorization|How to implement one XELOR module|Backend developer implementation guide|Full-stack and frontend implementation guide|Developer review|Cross-functional review|Exact developer command runbook|The commercial answer|Recommended rate card|One product, two commercial offers|Offer A|Offer B|Side-by-side packaging|Customer count, MRR and ARR|How customer count becomes revenue|TAM, SAM, TOM and SOM|Three-year blended commercial plan|Three-year commercial plan|Unit economics and break-even|Unit economics, break-even and investment|Investor capital and 15-person team plan|Validation, evidence and investor guardrails|What to charge for each XELOR agent|What is fact, what is assumption/;
    for (const section of sections.filter(
      (item) => report.proofAllSections || proofPattern.test(item.title),
    )) {
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
      displayHeaderFooter: !report.fullBleed,
      headerTemplate: "<span></span>",
      footerTemplate:
        '<div style="width:100%;font:8px Arial;color:#78849a;padding:0 15mm;display:flex;justify-content:space-between"><span>XELOR · AIKYANTRA</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
      margin: report.fullBleed
        ? { top: "0", right: "0", bottom: "0", left: "0" }
        : { top: "16mm", right: "15mm", bottom: "18mm", left: "15mm" },
    });
    await page.close();
    process.stdout.write(`Rendered ${report.output}\n`);
  }
} finally {
  await browser.close();
}

// A committed PDF is only current while both its editable HTML and the renderer that laid
// it out match these hashes. The report validator checks this manifest in CI, so changing a
// source without regenerating its human deliverable fails closed.
if (!requestedReportId) {
  const sha256 = async (path) =>
    createHash("sha256").update(await readFile(path)).digest("hex");
  const rendererPath = fileURLToPath(import.meta.url);
  const renderManifest = {
    version: 1,
    renderer: relative(root, rendererPath).replaceAll("\\", "/"),
    rendererSha256: await sha256(rendererPath),
    artifacts: await Promise.all(
      reports.map(async (report) => {
        const sourcePath = resolve(root, report.source);
        const pdfPath = resolve(root, report.output);
        return {
          id: report.id,
          source: report.source,
          sourceSha256: await sha256(sourcePath),
          pdf: report.output,
          pdfSha256: await sha256(pdfPath),
        };
      }),
    ),
  };
  await writeFile(
    resolve(root, "docs/reports/project-report-render-manifest.json"),
    `${JSON.stringify(renderManifest, null, 2)}\n`,
    "utf8",
  );
}
