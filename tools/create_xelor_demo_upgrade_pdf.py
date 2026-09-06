from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from datetime import date
from pathlib import Path
from typing import Sequence

from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents

import create_xelor_unified_solution_pdf as ui


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "output" / "pdf" / "XELOR_DEMO_UPGRADE_TECHNICAL_IMPLEMENTATION_BLUEPRINT.pdf"
BLUEPRINT = ROOT / "workspace" / "docs" / "07-execution" / "02-xelor-demo-upgrade-implementation-blueprint.md"
MANIFEST = ROOT / "workspace" / "docs" / "07-execution" / "03-demo-upgrade-codebase-manifest.json"

PAGE_W, PAGE_H = A4
MARGIN_X = 16 * mm
MARGIN_TOP = 18 * mm
MARGIN_BOTTOM = 17 * mm

PAPER = HexColor("#F4F1EA")
NAVY = HexColor("#0B1A2E")
NAVY_2 = HexColor("#0F2E52")
BLUE = HexColor("#14508F")
GOLD = HexColor("#D9A93C")
TEAL = HexColor("#167C80")
GREEN = HexColor("#167552")
RED = HexColor("#B42318")
INK = HexColor("#17233A")
MUTED = HexColor("#5B687A")
LINE = HexColor("#D3D9E2")
WASH = HexColor("#F6F7F9")
WHITE = colors.white

# Reuse the proven report components with the current product palette.
ui.NAVY = NAVY
ui.INK = INK
ui.MUTED = MUTED
ui.BLUE = BLUE
ui.CYAN = TEAL
ui.GREEN = GREEN
ui.AMBER = GOLD
ui.RED = RED
ui.MAGENTA = HexColor("#9A3F72")
ui.VIOLET = HexColor("#5D4E91")
ui.LINE = LINE
ui.WASH = WASH
ui.BLUE_WASH = HexColor("#EDF3F8")
ui.GREEN_WASH = HexColor("#EAF6F0")
ui.AMBER_WASH = HexColor("#FFF7E5")
ui.RED_WASH = HexColor("#FFF0EF")
ui.VIOLET_WASH = HexColor("#F2EFF8")
ui.STYLES["Heading1"].textColor = NAVY
ui.STYLES["Heading2"].textColor = BLUE
ui.STYLES["Heading3"].textColor = NAVY_2
ui.STYLES["Body"].textColor = INK
ui.STYLES["Caption"].textColor = MUTED


def git_value(*args: str, fallback: str) -> str:
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        return result.stdout.strip() or fallback
    except (OSError, subprocess.CalledProcessError):
        return fallback


def checked_inputs() -> dict:
    required = [
        BLUEPRINT,
        MANIFEST,
        ROOT / "README.md",
        ROOT / "apps" / "api" / "src" / "agent-os" / "factory-intelligence.service.ts",
        ROOT / "apps" / "api" / "src" / "agent-os" / "onyx-factory-intelligence.http-adapter.ts",
        ROOT / "packages" / "platform" / "src" / "factory-intelligence" / "oee.ts",
        ROOT / "packages" / "platform" / "src" / "factory-intelligence" / "replan.ts",
        ROOT / "apps" / "web" / "src" / "modules" / "agentos" / "screens" / "factory-intelligence.tsx",
        ROOT / "apps" / "web" / "src" / "modules" / "fulfilment" / "new-order-form.tsx",
    ]
    missing = [str(path.relative_to(ROOT)) for path in required if not path.exists()]
    if missing:
        raise SystemExit("Required repository evidence is missing: " + ", ".join(missing))
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if data.get("schemaVersion") != "xelor-demo-upgrade.v1":
        raise SystemExit("Unsupported codebase manifest version")
    return data


def draw_cover_page(canvas, doc) -> None:
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    canvas.setFillColor(NAVY_2)
    canvas.rect(0, PAGE_H * 0.54, PAGE_W, PAGE_H * 0.46, stroke=0, fill=1)
    canvas.setFillColor(PAPER)
    canvas.rect(PAGE_W * 0.75, 0, PAGE_W * 0.25, PAGE_H, stroke=0, fill=1)
    canvas.setFillColor(GOLD)
    canvas.rect(PAGE_W * 0.75, PAGE_H * 0.16, PAGE_W * 0.25, 5 * mm, stroke=0, fill=1)

    canvas.setStrokeColor(HexColor("#315072"))
    canvas.setLineWidth(0.35)
    for x in range(15, 160, 15):
        canvas.line(x * mm, 0, x * mm, PAGE_H)
    for y in range(18, 290, 18):
        canvas.line(0, y * mm, PAGE_W * 0.75, y * mm)

    canvas.setStrokeColor(BLUE)
    canvas.setLineWidth(1.2)
    nodes = [(163, 235), (184, 209), (161, 177), (186, 146), (162, 112), (184, 80)]
    for index in range(len(nodes) - 1):
        x1, y1 = nodes[index]
        x2, y2 = nodes[index + 1]
        canvas.line(x1 * mm, y1 * mm, x2 * mm, y2 * mm)
    for index, (x, y) in enumerate(nodes):
        canvas.setFillColor([BLUE, GREEN, GOLD, TEAL][index % 4])
        canvas.circle(x * mm, y * mm, 3.2 * mm, stroke=0, fill=1)

    canvas.setStrokeColor(HexColor("#9DC1DF"))
    canvas.setLineWidth(1)
    canvas.roundRect(16 * mm, PAGE_H - 30 * mm, 22 * mm, 14 * mm, 2.5 * mm, stroke=1, fill=0)
    canvas.setFont(ui.FONT_BOLD, 11)
    canvas.setFillColor(WHITE)
    canvas.drawCentredString(27 * mm, PAGE_H - 25.2 * mm, "XE")
    canvas.restoreState()


def draw_body_page(canvas, doc) -> None:
    canvas.saveState()
    page_num = canvas.getPageNumber()
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN_X, PAGE_H - 12 * mm, PAGE_W - MARGIN_X, PAGE_H - 12 * mm)
    canvas.setFont(ui.FONT_SEMI, 7.2)
    canvas.setFillColor(NAVY)
    canvas.drawString(MARGIN_X, PAGE_H - 9.4 * mm, "XELOR  |  DEMO UPGRADE AND TECHNICAL BLUEPRINT")
    canvas.setFont(ui.FONT, 6.8)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(
        PAGE_W - MARGIN_X,
        PAGE_H - 9.4 * mm,
        f"{doc.snapshot_date.upper()}  |  VERSION {doc.version}",
    )
    canvas.setStrokeColor(LINE)
    canvas.line(MARGIN_X, 12 * mm, PAGE_W - MARGIN_X, 12 * mm)
    canvas.setFont(ui.FONT, 6.8)
    canvas.setFillColor(MUTED)
    canvas.drawString(MARGIN_X, 8.1 * mm, f"AIKYANTRA  |  {doc.branch}  |  {doc.snapshot_sha[:12]}")
    canvas.drawRightString(PAGE_W - MARGIN_X, 8.1 * mm, f"PAGE {page_num}")
    canvas.restoreState()


class UpgradeDocTemplate(BaseDocTemplate):
    def __init__(
        self,
        filename: str,
        *,
        branch: str,
        snapshot_sha: str,
        snapshot_date: str,
        version: str,
    ):
        super().__init__(
            filename,
            pagesize=A4,
            leftMargin=MARGIN_X,
            rightMargin=MARGIN_X,
            topMargin=MARGIN_TOP,
            bottomMargin=MARGIN_BOTTOM,
            title="XELOR Demo Upgrade and Technical Implementation Blueprint",
            author="AIKYANTRA - ONYX and XELOR",
            subject="Demo purpose, target architecture, workflow, codebase changes and verification plan",
        )
        self.branch = branch
        self.snapshot_sha = snapshot_sha
        self.snapshot_date = snapshot_date
        self.version = version
        cover_frame = Frame(
            MARGIN_X,
            MARGIN_BOTTOM,
            PAGE_W - 2 * MARGIN_X,
            PAGE_H - MARGIN_TOP - MARGIN_BOTTOM,
            id="cover",
            leftPadding=0,
            rightPadding=0,
            topPadding=0,
            bottomPadding=0,
        )
        body_frame = Frame(
            MARGIN_X,
            MARGIN_BOTTOM,
            PAGE_W - 2 * MARGIN_X,
            PAGE_H - MARGIN_TOP - MARGIN_BOTTOM,
            id="body",
            leftPadding=0,
            rightPadding=0,
            topPadding=0,
            bottomPadding=0,
        )
        self.addPageTemplates(
            [
                PageTemplate(id="Cover", frames=[cover_frame], onPage=draw_cover_page),
                PageTemplate(id="Body", frames=[body_frame], onPage=draw_body_page),
            ]
        )
        self._bookmark_counter = 0

    def beforeDocument(self) -> None:
        self._bookmark_counter = 0

    def afterFlowable(self, flowable: Flowable) -> None:
        if not isinstance(flowable, Paragraph):
            return
        if flowable.style.name not in {"Heading1", "Heading2"}:
            return
        level = 0 if flowable.style.name == "Heading1" else 1
        self._bookmark_counter += 1
        key = f"section-{self._bookmark_counter}"
        text = flowable.getPlainText()
        self.canv.bookmarkPage(key)
        self.canv.addOutlineEntry(text, key, level=level, closed=False)
        self.notify("TOCEntry", (level, text, self.page, key))


class TargetArchitecture(Flowable):
    def __init__(self, height: float = 104 * mm):
        super().__init__()
        self.height = height
        self.width = 0

    def wrap(self, avail_width, avail_height):
        self.width = avail_width
        return avail_width, self.height

    def _box(self, canvas, x, y, width, height, title, lines, fill, stroke=NAVY):
        canvas.setFillColor(fill)
        canvas.setStrokeColor(stroke)
        canvas.setLineWidth(0.8)
        canvas.roundRect(x, y, width, height, 2.5 * mm, stroke=1, fill=1)
        canvas.setFillColor(stroke)
        canvas.setFont(ui.FONT_BOLD, 7.2)
        canvas.drawString(x + 3 * mm, y + height - 5 * mm, title)
        canvas.setFont(ui.FONT, 6.2)
        cursor = y + height - 10 * mm
        for line in lines:
            canvas.drawString(x + 3 * mm, cursor, line)
            cursor -= 4.2 * mm

    def _arrow(self, canvas, x1, y1, x2, y2, label):
        canvas.setStrokeColor(BLUE)
        canvas.setFillColor(BLUE)
        canvas.setLineWidth(1.1)
        canvas.line(x1, y1, x2, y2)
        canvas.line(x2, y2, x2 - 2 * mm, y2 + 1.4 * mm)
        canvas.line(x2, y2, x2 - 2 * mm, y2 - 1.4 * mm)
        canvas.setFont(ui.FONT_SEMI, 5.7)
        canvas.drawCentredString((x1 + x2) / 2, y1 + 2.1 * mm, label)

    def draw(self):
        canvas = self.canv
        width = self.width
        col_gap = 7 * mm
        col_width = (width - col_gap) / 2
        box_height = 57 * mm
        y = 28 * mm

        self._box(
            canvas,
            0,
            y,
            col_width,
            box_height,
            "ONYX - OPERATIONAL AUTHORITY",
            [
                "Orders, RFQ, quote, award and PO",
                "Stock, production, quality and maintenance",
                "Schedules, accounting and final approvals",
                "Database: indcore | API: 3000 | Web: 3001",
            ],
            HexColor("#F8F5ED"),
            NAVY,
        )
        self._box(
            canvas,
            col_width + col_gap,
            y,
            col_width,
            box_height,
            "XELOR - DECISION INTELLIGENCE",
            [
                "Projection cache, evidence and findings",
                "OEE, comparisons, forecasts and missions",
                "Recommendations, approvals and outcomes",
                "Database: indcore_p2 | API: 3100 | Web: 3101",
            ],
            HexColor("#EDF3F8"),
            BLUE,
        )
        self._arrow(
            canvas,
            col_width - 2 * mm,
            y + 37 * mm,
            col_width + col_gap + 1 * mm,
            y + 37 * mm,
            "versioned read projections",
        )
        self._arrow(
            canvas,
            col_width + col_gap + 1 * mm,
            y + 17 * mm,
            col_width - 2 * mm,
            y + 17 * mm,
            "idempotent draft/review requests",
        )

        channel_width = (width - 14 * mm) / 3
        self._box(
            canvas,
            0,
            0,
            channel_width,
            20 * mm,
            "DESKTOP",
            ["Full role-based work surfaces"],
            WHITE,
            NAVY,
        )
        self._box(
            canvas,
            channel_width + 7 * mm,
            0,
            channel_width,
            20 * mm,
            "POCKET PWA",
            ["Read-first; offline drafts only"],
            WHITE,
            TEAL,
        )
        self._box(
            canvas,
            2 * (channel_width + 7 * mm),
            0,
            channel_width,
            20 * mm,
            "SUPPLIER CONNECT",
            ["Invited participant scope"],
            WHITE,
            GOLD,
        )
        canvas.setFont(ui.FONT, 5.8)
        canvas.setFillColor(MUTED)
        canvas.drawString(0, self.height - 5 * mm, "Shared identity, contracts, permissions, audit, correlation and observability span both deployments.")


def section(story: list[Flowable], number: str, title: str, lead: str) -> None:
    ui.section_break(story)
    story.extend(ui.h1(number, title, lead))


def add_cover(story: list[Flowable], version: str, snapshot_date: str) -> None:
    story.extend(
        [
            Spacer(1, 35 * mm),
            ui.p("DEMO, ARCHITECTURE AND CODEBASE IMPLEMENTATION PLAN", "CoverKicker"),
            ui.p("XELOR Demo Upgrade<br/>Technical Blueprint", "CoverTitle"),
            Table(
                [[
                    ui.p(
                        "A repository-grounded plan for ONYX operational authority, XELOR decision intelligence, "
                        "supplier sourcing, phone-first factory visibility and evidence-backed human control.",
                        "CoverSub",
                    )
                ]],
                colWidths=[126 * mm],
                style=TableStyle(
                    [
                        ("LEFTPADDING", (0, 0), (-1, -1), 0),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                        ("TOPPADDING", (0, 0), (-1, -1), 0),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                    ]
                ),
            ),
            Spacer(1, 7 * mm),
            Table(
                [
                    [
                        ui.p("TAKE", "CoverMeta"),
                        ui.p("SOURCE", "CoverMeta"),
                        ui.p("RUN", "CoverMeta"),
                        ui.p("SEE", "CoverMeta"),
                        ui.p("GOVERN", "CoverMeta"),
                    ],
                    [
                        ui.p("Customer order", "CoverMeta"),
                        ui.p("Qualified supply", "CoverMeta"),
                        ui.p("Factory work", "CoverMeta"),
                        ui.p("Phone visibility", "CoverMeta"),
                        ui.p("Evidence and approval", "CoverMeta"),
                    ],
                ],
                colWidths=[28.8 * mm] * 5,
                style=TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, -1), NAVY_2),
                        ("BOX", (0, 0), (-1, -1), 0.6, HexColor("#7390AD")),
                        ("INNERGRID", (0, 0), (-1, -1), 0.3, HexColor("#5A7590")),
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("LEFTPADDING", (0, 0), (-1, -1), 7),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                        ("TOPPADDING", (0, 0), (-1, -1), 7),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                    ]
                ),
            ),
            Spacer(1, 30 * mm),
            ui.p(f"IMPLEMENTATION CONTRACT  |  VERSION {version}  |  {snapshot_date.upper()}", "CoverMeta"),
            ui.p("Prepared for AIKYANTRA - ONYX and XELOR", "CoverMeta"),
            ui.NextPageTemplate("Body"),
            PageBreak(),
        ]
    )


def add_executive(story: list[Flowable]) -> None:
    story.extend(
        ui.h1(
            "1",
            "Executive implementation decision",
            "Upgrade the demo around one governed order-to-supply-to-factory story, while keeping ONYX authoritative and XELOR evidence-led.",
        )
    )
    story.append(
        ui.callout(
            "Recommended product boundary",
            "<b>ONYX records what the factory does. XELOR explains what is happening, what may happen next, "
            "and which bounded review should begin. Pocket makes that truth usable on a phone.</b>",
            "green",
        )
    )
    story.append(Spacer(1, 3 * mm))
    story.append(
        ui.card_grid(
            [
                ("ONYX", "ERP, sourcing documents, stock, production, quality, maintenance, schedules, accounting and final posting.", NAVY),
                ("XELOR", "Evidence, OEE, findings, comparisons, recommendations, missions, approvals and outcome verification.", BLUE),
                ("Pocket", "Role-specific mobile visibility and draft capture through the same APIs and permissions.", TEAL),
            ],
            3,
        )
    )
    story.append(ui.h2("The proof loop"))
    story.append(
        ui.ProcessFlow(
            ["Take customer order", "Explain shortage", "Compare supply", "Respond to disruption", "Approve and prove"],
            [GOLD, BLUE, TEAL, RED, GREEN],
        )
    )
    story.append(ui.h2("Best implementation sequence"))
    story.append(
        ui.bullets(
            [
                "<b>D0:</b> fix demo truth, contracts, ports and real-stack Factory Intelligence proof.",
                "<b>D1:</b> build an invite-only RFQ, quote revision, comparison and award loop in ONYX.",
                "<b>D2:</b> ship Pocket as a read-first PWA; add offline drafts only after online paths are proven.",
                "<b>D3:</b> connect two or three pilot machines in shadow mode and measure data quality.",
                "<b>D4:</b> send approval-backed planning review requests; keep physical machine control out of scope.",
            ]
        )
    )
    story.append(ui.source_note("[XE-1], [XE-2], [DS-1]. Repository and external sources are in Appendix C."))


def add_contents(story: list[Flowable]) -> None:
    section(
        story,
        "2",
        "Contents and status language",
        "The document separates what exists, what is configured for the demo, what is proposed and what remains a gap.",
    )
    toc = TableOfContents()
    toc.levelStyles = [ui.STYLES["TOC0"], ui.STYLES["TOC1"]]
    toc.dotsMinLevel = 0
    story.append(toc)
    story.append(Spacer(1, 3 * mm))
    story.append(
        ui.data_table(
            ["Status", "Meaning", "Presenter rule"],
            [
                ["LIVE CURRENT", "Persistent UI, API and database path", "May be demonstrated as working"],
                ["DEMO CURRENT", "Implemented with fixture or simulator evidence", "Badge it and explain the source"],
                ["PROPOSED", "Designed and mapped to code ownership", "Show only as roadmap"],
                ["GAP", "Required before pilot or production", "Never imply it exists"],
            ],
            widths=[33 * mm, 69 * mm, 69 * mm],
        )
    )


def add_github_delta(story: list[Flowable], branch: str, sha: str) -> None:
    section(
        story,
        "3",
        "Current GitHub baseline",
        "The latest update adds real Factory Intelligence and order-to-mission behavior, plus a much larger shared architecture workspace.",
    )
    story.append(
        ui.data_table(
            ["Ref", "Product", "Important change"],
            [
                ["8b687f0", "XELOR", "Factory Intelligence, new-order mission start, rebrand, permission fix and delivery-date fix"],
                ["216238c", "Shared", "Product split, governance blueprints, architecture briefs and competitor research"],
                ["9946091", "Local only", "Windows compatibility deletion for illegal UI:UX.md path"],
                ["bd57cd2", "ONYX", "Factory Operations POC, OEE evidence, assignments, breakdown and alternate proposal"],
            ],
            widths=[27 * mm, 35 * mm, 109 * mm],
            small=True,
        )
    )
    story.append(ui.h2("What changed in product capability"))
    story.append(
        ui.bullets(
            [
                "XELOR now consumes a versioned ONYX factory projection over HTTP.",
                "OEE is recomputed from raw values with formulas, freshness, warnings and data-quality confidence.",
                "A breakdown preview validates ONYX's explicit alternate rather than inventing one.",
                "A customer PO can create a confirmed Sales order and start the existing 13-stage mission.",
                "Multi-permission routes now require all permissions instead of silently enforcing only one.",
            ]
        )
    )
    story.append(
        ui.callout(
            "Repository health warning",
            f"Current checkout: <b>{branch}</b> at <b>{sha[:12]}</b>. origin/main still contains an NTFS-illegal "
            "UI:UX.md path, the local compatibility commit is not pushed, and startup documentation mixes ONYX "
            "ports 3000/3001 with XELOR ports 3100/3101.",
            "red",
        )
    )


def add_truth(story: list[Flowable]) -> None:
    section(
        story,
        "4",
        "Current capability truth",
        "The new slice is strong governance code, but it is still a configured 3S proof rather than a generic live-factory product.",
    )
    story.append(
        ui.data_table(
            ["Capability", "State", "Truth"],
            [
                ["Create order and mission", "LIVE CURRENT", "Confirmed order, idempotency and 13 mission stages"],
                ["BOM and stock shortage", "LIVE CURRENT", "Reads governed ERP records; missing evidence blocks"],
                ["Supplier comparison", "DEMO CURRENT", "Seeded or uploaded terms; no supplier outreach"],
                ["Factory projection", "DEMO CURRENT", "factory-operations.v1 for fixed 3S simulator"],
                ["OEE", "DEMO CURRENT", "Deterministic arithmetic, not predictive AI"],
                ["Recovery", "DEMO CURRENT", "Validates an ONYX proposal and creates a review request"],
                ["Unified Blueprint", "DEMO CURRENT", "Public-demo-only walkthrough; live reads and invented values are labelled"],
                ["RFQ marketplace", "PROPOSED", "No RFQ, invitation, quote portal or award module today"],
                ["Pocket offline PWA", "PROPOSED", "Responsive web only; no service worker or offline queue"],
                ["Live edge telemetry", "GAP", "No pilot OPC-UA/MQTT adapter proven"],
            ],
            widths=[47 * mm, 35 * mm, 89 * mm],
            small=True,
        )
    )
    story.append(
        ui.callout(
            "Architecture debt",
            "Factory Intelligence proves the intended HTTP boundary. Fulfilment still imports local ERP schema and "
            "Agent OS still composes ERP modules, so the README's full ONYX/XELOR separation is a target state, not current platform-wide truth.",
            "amber",
        )
    )


def add_competitors(story: list[Flowable]) -> None:
    section(
        story,
        "5",
        "IndiaMART, Vyapar and Datastride lessons",
        "Use each product for the mechanism it proves, then apply factory-grade evidence, permissions and transaction ownership.",
    )
    story.append(
        ui.data_table(
            ["Source", "Take", "Improve for XELOR", "Do not copy"],
            [
                ["IndiaMART", "Search, supplier reach, location and RFQ simplicity", "Technical schemas, revisions, qualification, confidentiality and outcome evidence", "Scraped supplier data or pay-to-rank trust"],
                ["Vyapar", "Fast daily work, mobile access, readable documents and sharing", "Plant roles, approvals, quality, audit and safe offline drafts", "A desktop ERP squeezed into a phone"],
                ["Datastride", "Conversational analysis, live KPIs, anomaly/forecast workflows", "Tie every finding to ONYX records, freshness, confidence and guarded action", "Analytics presented as ERP/MES or machine control"],
            ],
            widths=[28 * mm, 45 * mm, 61 * mm, 37 * mm],
            small=True,
        )
    )
    story.append(ui.h2("Combined differentiation"))
    story.append(
        ui.callout(
            "One industrial loop",
            "IndiaMART helps find possible supply. Vyapar simplifies business administration. Datastride helps interpret data. "
            "ONYX and XELOR should connect customer demand, qualified supply, factory execution, evidence and controlled action without losing the system of record.",
            "violet",
        )
    )
    story.append(
        ui.bullets(
            [
                "Supplier breadth begins from a real MRP or customer-order requirement.",
                "Phone simplicity reads the same governed records as desktop.",
                "Factory intelligence exposes source rows, age, formula or model version and confidence.",
                "Supplier trust improves from actual delivery and inspection outcomes rather than marketing claims.",
            ]
        )
    )
    story.append(ui.source_note("[IM-1], [VY-1], [DS-1], [DS-2]."))


def add_demo_contract(story: list[Flowable]) -> None:
    section(
        story,
        "6",
        "Demo purpose and non-claims",
        "The presentation proves one governed decision loop. It does not pretend to be a live multi-factory deployment.",
    )
    story.append(
        ui.callout(
            "Demo statement",
            "<b>A customer commitment can become a governed supply and factory decision, visible from a phone, "
            "with source evidence and human control.</b>",
            "green",
        )
    )
    story.append(ui.h2("What the audience should understand"))
    story.append(
        ui.card_grid(
            [
                ("Operational truth", "ONYX remains authoritative for orders, stock, production, quality, schedules and money.", NAVY),
                ("Decision truth", "XELOR exposes evidence, risk, options, approval and eventual outcome.", BLUE),
                ("Human truth", "A material commitment or recovery request is attributable and approval-controlled.", GREEN),
            ],
            3,
        )
    )
    story.append(ui.h2("Mandatory disclosure"))
    story.append(
        ui.bullets(
            [
                "Factory data is configured simulator evidence, not a live PLC or MES feed.",
                "OEE is deterministic arithmetic; confidence measures data quality, not failure probability.",
                "Supplier terms are seeded or uploaded; no real RFQ message is sent today.",
                "Phone support is responsive web, not an offline PWA or native app.",
                "Recovery approval creates a planning review only; no schedule is published.",
                "No predictive-maintenance accuracy, autonomous purchasing or machine control is claimed.",
            ]
        )
    )


def add_order_flow(story: list[Flowable]) -> None:
    section(
        story,
        "7",
        "Workflow A: customer order to governed mission",
        "Start with a new customer PO so the audience sees a persistent business commitment, not a pre-recorded row.",
    )
    story.append(
        ui.ProcessFlow(
            ["Enter customer PO", "Confirm Sales order", "Read BOM and stock", "Compare plan options", "Approve and create drafts"],
            [GOLD, NAVY, BLUE, TEAL, GREEN],
        )
    )
    story.append(
        ui.data_table(
            ["Stage", "Current implementation", "Proof and boundary"],
            [
                ["Intake", "GET /fulfilment/orderable; POST /fulfilment/orders", "sales.order.create AND agentos.run.operate; idempotent replay"],
                ["Engineering", "Released BOM lookup", "Missing build sheet stops planning"],
                ["Materials", "Stock and reservations", "BOM explosion links shortage to order line"],
                ["Sourcing", "Seeded/uploaded supplier terms", "Label as available terms, not supplier outreach"],
                ["Strategy", "Deterministic candidate comparison", "Price, date and autonomy policy remain visible"],
                ["Authorize", "Human approval digest", "Reject creates nothing; approve continues once"],
                ["Execute", "Narrow Purchase and Production writers", "Draft documents are re-read as postconditions"],
            ],
            widths=[29 * mm, 66 * mm, 76 * mm],
            small=True,
        )
    )
    story.append(
        ui.callout(
            "Required migration",
            "Replace direct fulfilment database reads with ONYX fulfilment-context and command clients. Keep the current "
            "in-process ports only as a demo compatibility adapter until contract-tested HTTP paths are ready.",
            "amber",
        )
    )


def add_factory_flow(story: list[Flowable]) -> None:
    section(
        story,
        "8",
        "Workflow B: factory evidence to controlled recovery",
        "The strongest current upgrade is a fail-closed, evidence-preserving breakdown analysis with no autonomous schedule or machine action.",
    )
    story.append(
        ui.ProcessFlow(
            ["ONYX projection", "Validate schema and age", "Recompute A/P/Q/OEE", "Validate explicit alternate", "Human planning review"],
            [NAVY, BLUE, TEAL, GOLD, GREEN],
        )
    )
    story.append(
        ui.data_table(
            ["Responsibility", "ONYX", "XELOR"],
            [
                ["Evidence", "Machine, job, operator, counters and qualification", "Validate links, freshness, provenance and contract"],
                ["OEE", "Supplies raw values and source labels", "Recomputes formula and keeps warnings"],
                ["Recovery option", "Names the configured qualified alternate", "Validates it; never invents a target"],
                ["Schedule", "Owns baseline and any authoritative publication", "Calculates a non-authoritative candidate comparison"],
                ["Action", "Accepts a bounded planning review request", "Creates one request only after approval"],
            ],
            widths=[35 * mm, 68 * mm, 68 * mm],
            small=True,
        )
    )
    story.append(
        ui.callout(
            "Fail-closed rules",
            "No proposal, stale target evidence, unqualified alternate, ambiguous operation identity or invalid governance "
            "blocks the recovery. Approval never changes a schedule and never contacts a physical controller.",
            "red",
        )
    )


def add_storyboard(story: list[Flowable]) -> None:
    section(
        story,
        "9",
        "Twelve-minute demonstration storyboard",
        "One resettable 3S story shows customer demand, supply evidence, factory risk, phone visibility and controlled action.",
    )
    story.append(
        ui.data_table(
            ["Minute", "Presenter move", "Expected proof", "Status"],
            [
                ["0:00", "Run preflight and show simulator badge", "Known reset state and healthy services", "LIVE"],
                ["0:45", "Enter customer PO, item, quantity and due date", "Confirmed order and one mission", "LIVE"],
                ["2:00", "Open BOM, stock and shortage evidence", "Source-linked demand; missing data blocks", "LIVE"],
                ["3:15", "Show available supplier terms", "Comparable inputs; no supplier message", "DEMO"],
                ["4:15", "Approve the fulfilment plan", "Attributable decision and draft documents", "LIVE"],
                ["5:30", "Switch to 390 x 844 Factory Intelligence", "Phone-readable jobs, OEE, risk and freshness", "DEMO"],
                ["6:45", "Inspect the faulted lathe and at-risk job", "Raw evidence and deterministic OEE", "DEMO"],
                ["8:00", "Compare baseline and qualified alternate", "Reproducible delta and warnings", "DEMO"],
                ["9:15", "Approve or reject recovery review", "One review request or zero", "DEMO"],
                ["10:30", "Open approval and audit evidence", "Actor, note, source refs and action reconcile", "LIVE"],
                ["11:30", "Open /blueprint/loop, Source, Flow and Pocket", "Current versus proposed remains explicit", "PROPOSED"],
            ],
            widths=[17 * mm, 57 * mm, 72 * mm, 25 * mm],
            small=True,
        )
    )
    story.append(ui.source_note("[XE-3], [XE-4], [XE-5]."))


def add_architecture(story: list[Flowable]) -> None:
    section(
        story,
        "10",
        "Target architecture and trust boundary",
        "Use two separately deployed products and databases with one generated contract source, not shared table access.",
    )
    story.append(TargetArchitecture())
    story.append(Spacer(1, 2 * mm))
    story.append(
        ui.callout(
            "Authority rule",
            "XELOR may submit an idempotent draft or review request with expected version and evidence digest. "
            "ONYX re-authorizes it under ONYX permissions and workflow before any authoritative change.",
            "blue",
        )
    )


def add_contracts(story: list[Flowable]) -> None:
    section(
        story,
        "11",
        "Contracts, APIs and write-back",
        "Generate producer validation and consumer clients from one contract package so branch drift becomes a CI failure.",
    )
    story.append(
        ui.data_table(
            ["Contract", "Purpose", "Required fields"],
            [
                ["factory-operations.v2", "Generic site, window, assignments, OEE inputs and proposals", "schema, source, observedAt, watermark, evidenceRefs, ETag"],
                ["fulfilment-context.v1", "Order, lines, BOM, stock, reservations and promise", "version, tenant, order refs, evidence and freshness"],
                ["sourcing.v1", "Requirement, invited suppliers, quote revisions and award", "participant scope, revisions, validity and evidence"],
                ["commands.v1", "Draft/review requests from XELOR to ONYX", "idempotency, expectedVersion, actor, reason and digest"],
                ["domain events", "Projection and outcome updates", "eventId, occurredAt, correlation, causation and schema"],
            ],
            widths=[40 * mm, 63 * mm, 68 * mm],
            small=True,
        )
    )
    story.append(ui.h2("Initial read and command surface"))
    story.append(
        ui.bullets(
            [
                "GET /api/v1/projections/factory/sites/:siteCode/operations",
                "GET /api/v1/projections/fulfilment/orders/:orderId",
                "GET /api/v1/sourcing/requirements/:id and /rfqs/:id/quotes",
                "POST /api/v1/sourcing/rfqs and /awards/:id/recommend",
                "POST /api/v1/planning/replan-reviews",
                "POST /api/v1/purchase/grns/drafts; final /post remains online-only and ONYX-owned",
            ]
        )
    )


def add_sourcing(story: list[Flowable]) -> None:
    section(
        story,
        "12",
        "Invite-only supplier and RFQ loop",
        "Build the smallest credible IndiaMART-inspired slice: a real requirement, consented suppliers, comparable quote revisions and one governed award.",
    )
    story.append(
        ui.ProcessFlow(
            ["MRP requirement", "Invite qualified suppliers", "Receive quote revisions", "Compare evidence", "Approve award to draft PO"],
            [BLUE, TEAL, GOLD, NAVY, GREEN],
        )
    )
    story.append(
        ui.data_table(
            ["Domain object", "Owner", "Integrity rule"],
            [
                ["sourcing_requirement", "ONYX Planning/Sourcing", "Pegged to item, quantity, need date and source demand"],
                ["rfq and invitation", "ONYX Sourcing", "Only active qualified suppliers; confidential revision snapshot"],
                ["supplier_quote revision", "Supplier participant", "Immutable history; competitor isolation"],
                ["comparison snapshot", "XELOR analysis", "Normalization, evidence, score version and freshness"],
                ["sourcing_award", "ONYX Sourcing", "Recommender cannot approve; one award creates one draft PO"],
                ["supplier performance", "ONYX evidence", "Delivery and inspection outcomes, not paid ranking"],
            ],
            widths=[46 * mm, 43 * mm, 82 * mm],
            small=True,
        )
    )
    story.append(
        ui.callout(
            "Data acquisition rule",
            "Start with invited known suppliers and consented field onboarding. Do not scrape, copy or republish IndiaMART's database.",
            "red",
        )
    )


def add_pocket(story: list[Flowable]) -> None:
    section(
        story,
        "13",
        "Pocket: factory visibility from the phone",
        "Build a task-first PWA, not a smaller desktop ERP. Phase 1 is read-first and online; Phase 2 adds controlled offline drafts.",
    )
    phones = [
        ui.PhoneMockup(
            "OWNER PULSE",
            "Plant 01 | Fresh 2m",
            [("4", "orders at risk"), ("2", "machines down"), ("6", "approvals"), ("INR 18L", "overdue AR")],
            ["Customer promise due tomorrow", "Lathe recovery needs review"],
            "OPEN DECISION INBOX",
            HexColor("#9A3F72"),
            width=52 * mm,
            height=108 * mm,
            context="Online | Sync 2m | Simulator",
        ),
        ui.PhoneMockup(
            "PLANT TODAY",
            "Shift A | 68% complete",
            [("420", "planned units"), ("286", "good units"), ("12", "rejected"), ("3", "blocked jobs")],
            ["WC-LTH01 breakdown", "Inspection gate pending"],
            "VIEW SHIFT WORK",
            BLUE,
            width=52 * mm,
            height=108 * mm,
            context="Online | Fresh 2m | Plant 01",
        ),
        ui.PhoneMockup(
            "BUYER WORK",
            "Critical supply",
            [("7", "shortages"), ("3", "RFQs closing"), ("5", "quotes"), ("2", "late POs")],
            ["Bearing needed in 6 days", "Quote expires at 17:00"],
            "COMPARE SHORTLIST",
            TEAL,
            width=52 * mm,
            height=108 * mm,
            context="Online | Sync 1m | 0 drafts",
        ),
    ]
    story.append(
        Table(
            [phones],
            colWidths=[55 * mm, 55 * mm, 55 * mm],
            style=TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                    ("TOPPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ]
            ),
        )
    )
    story.append(ui.p("Concept screens. Production values must come from authorized records and display source, freshness and fixture mode.", "Caption"))
    story.append(
        ui.callout(
            "Offline boundary",
            "Queue drafts with a stable idempotency key and source version. Never queue approvals, stock posting, quality release, payment, schedule publication or machine commands.",
            "amber",
        )
    )


def add_data_events(story: list[Flowable]) -> None:
    section(
        story,
        "14",
        "Data model and event flow",
        "Keep transactional tables in ONYX and intelligence memory in XELOR. Store identifiers and evidence snapshots, not duplicate masters.",
    )
    story.append(
        ui.data_table(
            ["Zone", "New records", "Owner"],
            [
                ["Sourcing", "requirement, RFQ, invitation, quote revision, award, capability, performance", "ONYX"],
                ["Factory operations", "shift, assignment, qualification, counter aggregate, projection checkpoint", "ONYX"],
                ["Accounts payable", "supplier invoice revision, match result and exception", "ONYX, after demo loop"],
                ["Intelligence", "projection cache, finding, recommendation, model version and evaluation", "XELOR"],
                ["Mobile", "device session, draft outbox, sync result and push receipt", "Client plus owning API"],
            ],
            widths=[40 * mm, 89 * mm, 42 * mm],
            small=True,
        )
    )
    story.append(ui.h2("Events that close the loop"))
    story.append(
        ui.bullets(
            [
                "planning.requisition.raised.v1 -> sourcing.rfq.published.v1 -> sourcing.quote.submitted.v1",
                "sourcing.award.approved.v1 -> purchase.po.approved.v1 -> purchase.grn.posted.v1",
                "production.operation.blocked.v1 -> factory.asset-state.changed.v1",
                "factory.shift-kpi.closed.v1 -> quality.inspection.completed.v1",
                "maintenance.downtime.started.v1 -> maintenance.downtime.ended.v1",
                "planning.schedule.published.v1 closes the recovery outcome only after ONYX acts",
            ]
        )
    )
    story.append(
        ui.callout(
            "Eventing rule",
            "Consumers deduplicate by event ID and preserve correlation/causation. Stock and ledger correctness stays synchronous inside ONYX transactions.",
            "blue",
        )
    )


def add_security(story: list[Flowable]) -> None:
    section(
        story,
        "15",
        "Permissions, security and participant isolation",
        "Mobile and supplier channels reuse the same authority model; they never create a second permission system.",
    )
    story.append(
        ui.data_table(
            ["Control", "Requirement", "Acceptance proof"],
            [
                ["Multi-permission routes", "Use variadic RequirePermission with AND semantics", "Metadata and guard tests"],
                ["Award SoD", "Requester/recommender cannot approve own award", "Role and workflow integration test"],
                ["Supplier scope", "Tenant plus supplier account, like CSP account scope", "Invited/uninvited/competitor leak probe"],
                ["Mobile privacy", "Plant/role field masks; no cost for operator", "390 x 844 role screenshot and API test"],
                ["Authentication", "Service identity for ONYX/XELOR; BFF/HttpOnly cookie before production Pocket", "Token audience and revoked-session tests"],
                ["Evidence", "No secrets or unnecessary PII; reasoned access is logged", "Evidence-pack and log scan"],
                ["Production flags", "Refuse simulator, fixture and public-demo modes", "Startup configuration tests"],
            ],
            widths=[40 * mm, 76 * mm, 55 * mm],
            small=True,
        )
    )
    story.append(ui.h2("New permission families"))
    story.append(
        ui.p(
            "sourcing.requirement.* | sourcing.rfq.* | sourcing.quote.* | sourcing.award.* | "
            "purchase.invoice.* | factory.operations.read | factory.assignment.write | "
            "intelligence.factory.read | intelligence.sourcing.run | intelligence.finding.acknowledge"
        )
    )


def add_code_map(story: list[Flowable]) -> None:
    section(
        story,
        "16",
        "Codebase ownership map",
        "The implementation contract names exact owners and paths so architecture is testable rather than aspirational.",
    )
    story.append(
        ui.data_table(
            ["Change set", "ONYX paths", "XELOR/shared paths"],
            [
                ["Contracts", "Producer adapters and OpenAPI implementation", "packages/contracts, generated clients and consumer fixtures"],
                ["Sourcing", "db/schema/sourcing; api/modules/sourcing; web/modules/sourcing", "api/intelligence/sourcing and comparison UI"],
                ["Factory v2", "integration factory projection; explicit assignment schema", "integrations/onyx client; intelligence/factory"],
                ["Fulfilment boundary", "fulfilment-context read and document command APIs", "replace mission.service direct DB reads"],
                ["Pocket", "aggregated role APIs and authoritative draft endpoints", "web/modules/pocket; service worker; offline policy"],
                ["Events", "transactional outbox and signed delivery", "event receiver, dedupe and projection cache"],
            ],
            widths=[35 * mm, 69 * mm, 67 * mm],
            small=True,
        )
    )
    story.append(ui.h2("Current anchors retained"))
    story.append(
        ui.p(
            "factory-intelligence.service.ts; onyx-factory-intelligence.http-adapter.ts; "
            "factory-intelligence/oee.ts; factory-intelligence/replan.ts; "
            "factory-intelligence.tsx; new-order-form.tsx; mission.service.ts."
            " Public-demo walkthrough: modules/blueprint and modules/registry.ts."
        )
    )
    story.append(
        ui.callout(
            "Architecture enforcement",
            "Add CI that forbids new XELOR imports of ONYX database schema or ERP services. Contract changes merge first, then ONYX producer, then XELOR consumer behind flags.",
            "red",
        )
    )


def add_change_manifest(story: list[Flowable], manifest: dict) -> None:
    section(
        story,
        "17",
        "Implementation workstreams",
        "The machine-readable manifest is checked in CI and connects phase, ownership, status, paths, APIs, events, permissions, tests and acceptance.",
    )
    rows = []
    for item in manifest["workstreams"]:
        rows.append(
            [
                item["id"],
                item["title"],
                item["owner"],
                item["status"].upper().replace("-", " "),
                str(len(item["proposedPaths"])),
                item["acceptance"][0],
            ]
        )
    story.append(
        ui.data_table(
            ["ID", "Workstream", "Owner", "State", "Paths", "First acceptance gate"],
            rows,
            widths=[27 * mm, 42 * mm, 20 * mm, 31 * mm, 15 * mm, 36 * mm],
            small=True,
        )
    )
    story.append(
        ui.callout(
            "Repository contract",
            "Run <b>pnpm demo-upgrade-check</b>. It verifies current anchors, unique workstream ownership, API/event/permission naming and mandatory demo disclosures.",
            "green",
        )
    )


def add_flags(story: list[Flowable]) -> None:
    section(
        story,
        "18",
        "Demo fixtures, flags and reset",
        "A reliable demo uses explicit fixture adapters and refuses to let demo configuration enter production unnoticed.",
    )
    story.append(
        ui.data_table(
            ["Flag", "Demo value", "Production requirement"],
            [
                ["SUPPLIER_DIRECTORY_MODE", "fixture", "live; consented provider only"],
                ["FACTORY_EVIDENCE_MODE", "simulator", "edge or governed mixed"],
                ["FACTORY_OPERATIONS_CONTRACT", "v1 compatibility, then v2", "v2 supported and observed"],
                ["XELOR_POCKET_ENABLED", "read-only", "role-tested PWA"],
                ["XELOR_POCKET_OFFLINE_DRAFTS", "false", "true only after conflict tests"],
                ["SOURCING_RFQ_ENABLED", "fixture cohort", "invite-only live"],
                ["AI_PROVIDER", "stub", "approved local or hosted provider"],
                ["NEXT_PUBLIC_PUBLIC_DEMO", "true", "false; walkthrough omitted from registry"],
            ],
            widths=[62 * mm, 47 * mm, 62 * mm],
            small=True,
        )
    )
    story.append(ui.h2("Preflight"))
    story.append(
        ui.bullets(
            [
                "Run pnpm demo:rebuild from a database containing only approved demo tenants.",
                "Run pnpm demo:verify and record the result before opening the presentation.",
                "Confirm web, API, Keycloak and ONYX projection health.",
                "Confirm the pending approval has not been consumed by rehearsal.",
                "Show fixture/simulator labels on every relevant screen.",
            ]
        )
    )
    story.append(
        ui.callout(
            "Production startup",
            "Refuse fixture, simulator and public-demo modes. Do not silently fall back to them when service identity, contracts or edge connections fail.",
            "red",
        )
    )


def add_tests(story: list[Flowable]) -> None:
    section(
        story,
        "19",
        "Verification and acceptance matrix",
        "A polished demo is not enough. Each claim needs a deterministic test at the boundary where it could become false.",
    )
    story.append(
        ui.data_table(
            ["Area", "Required gate"],
            [
                ["Contracts", "Provider and consumer tests; unsupported version fails closed; idempotent replay"],
                ["RFQ", "Qualified invite; participant isolation; immutable revisions; one award to one draft PO"],
                ["Mobile", "390 x 844, 768 x 1024 and 1440 x 900; field masks; offline conflict and purge"],
                ["OEE", "Zero, missing, invalid and contradictory inputs never become plausible KPIs"],
                ["Replan", "No/stale/unqualified proposal blocks; deterministic delta; approval mandatory"],
                ["Audit", "Reject dispatches zero; approve dispatches one; actor, note, digest and hashes reconcile"],
                ["Cross-service", "Real ONYX projection -> XELOR -> approval -> ONYX review -> outcome evidence"],
                ["Architecture", "CI forbids new XELOR imports of ONYX DB schema and ERP services"],
            ],
            widths=[39 * mm, 132 * mm],
            small=True,
        )
    )
    story.append(ui.h2("Current focused test evidence"))
    story.append(
        ui.card_grid(
            [
                ("31 platform tests", "OEE validation, freshness, confidence, proposal validation and deterministic replanning.", BLUE),
                ("21 API tests", "HTTP contract, credentials, schema, evidence, freshness and permission behavior.", TEAL),
                ("5 web tests", "Grouped permissions and light/dark/chrome palette contrast.", GREEN),
            ],
            3,
        )
    )
    story.append(
        ui.callout(
            "Remaining proof",
            "The current Factory Intelligence browser spec mocks the API. Add one real-stack ONYX-to-XELOR recovery test before calling the slice pilot-ready.",
            "amber",
        )
    )


def add_phases(story: list[Flowable]) -> None:
    section(
        story,
        "20",
        "Delivery phases and exit gates",
        "Productionize one complete proof slice before expanding marketplace breadth, offline mutation or predictive models.",
    )
    story.append(
        ui.data_table(
            ["Phase", "Duration", "Deliverable", "Exit gate"],
            [
                ["D0 Demo integrity", "1 sprint", "Contracts, truth labels, generic factory v2 and real-stack E2E", "Repeatable clean demo; no architecture contradiction"],
                ["D1 Sourcing loop", "2-3 sprints", "8-12 suppliers, RFQ, quotes, comparison, approval and draft PO", "Isolation and one-effect award tests pass"],
                ["D2 Pocket", "1-2 sprints", "Read-first owner, supervisor, buyer and receiving PWA", "Mobile role/freshness tests pass"],
                ["D3 Pilot telemetry", "2-4 sprints/site", "One adapter, 2-3 machines, shadow OEE and reconciliation", "Measured data-quality SLA"],
                ["D4 Controlled recovery", "After pilot evidence", "Approval-backed ONYX planning review and outcome verification", "Rollback and authority proven"],
            ],
            widths=[35 * mm, 27 * mm, 70 * mm, 39 * mm],
            small=True,
        )
    )
    story.append(
        ui.callout(
            "Sequence rule",
            "Do not start anomaly or forecast ML until the system has labelled events, stable telemetry, baselines and measured false-positive handling.",
            "blue",
        )
    )


def add_risks(story: list[Flowable]) -> None:
    section(
        story,
        "21",
        "Principal risks and controls",
        "Most risk comes from overstating demo evidence, crossing authority boundaries or allowing product branches to drift.",
    )
    story.append(
        ui.data_table(
            ["Risk", "Failure mode", "Control"],
            [
                ["Demo becomes product claim", "Simulator appears live", "Persistent mode badge, presenter disclosure and production flag refusal"],
                ["Product branch drift", "Contracts and docs disagree", "Generated contract package, paired PRs and combined compatibility CI"],
                ["Supplier leak", "Quote visible to competitor", "Participant-scoped immutable packages and RLS leak probes"],
                ["Mobile duplicate", "Reconnect posts twice", "Stable idempotency key, expected version and one-effect test"],
                ["Stale factory evidence", "Unsafe alternate appears valid", "Freshness thresholds, exact evidence refs and fail-closed validation"],
                ["Black-box intelligence", "Manager cannot defend action", "Formula/model version, evidence, confidence and human approval"],
                ["Scope explosion", "Marketplace, ERP, PWA and ML stall together", "D0-D4 gates and one proof slice"],
                ["Machine safety", "General UI becomes control path", "No PLC/safety command surface; explicit non-goal"],
            ],
            widths=[39 * mm, 57 * mm, 75 * mm],
            small=True,
        )
    )


def add_90_days(story: list[Flowable]) -> None:
    section(
        story,
        "22",
        "First 90 days",
        "Use the first quarter to make the demo truthful, complete one sourcing loop and put governed factory visibility on a phone.",
    )
    story.append(
        ui.data_table(
            ["Window", "Product and field work", "Engineering output", "Decision gate"],
            [
                ["Days 1-15", "Lock demo story; select pilot cluster and supplier categories", "Repo truth fixes, contract package and generic factory v2", "Demo integrity"],
                ["Days 16-30", "Onboard 8-12 consented suppliers; validate RFQ fields", "Requirement/RFQ/quote schemas and participant security", "Comparable quote proof"],
                ["Days 31-60", "Run invited RFQs; test owner/supervisor/buyer phone jobs", "Award workflow, draft PO conversion and read-first Pocket", "Sourcing loop complete"],
                ["Days 61-90", "Select one pilot site and 2-3 machines", "Edge adapter spike, shadow OEE, reconciliation and cross-service E2E", "Pilot go/no-go"],
            ],
            widths=[29 * mm, 53 * mm, 62 * mm, 27 * mm],
            small=True,
        )
    )
    story.append(ui.h2("Team focus"))
    story.append(
        ui.p(
            "One product/field owner; one platform/contracts engineer; two ONYX domain engineers; "
            "two XELOR intelligence engineers; two web/mobile engineers; one QA/automation owner; "
            "shared security and data support."
        )
    )


def add_recommendation(story: list[Flowable]) -> None:
    section(
        story,
        "23",
        "Final recommendation",
        "Fund the shortest complete industrial proof: customer order, governed sourcing, factory evidence, phone visibility and one approval-backed recovery review.",
    )
    story.append(
        ui.callout(
            "Proceed",
            "Complete D0 first. Then build D1 sourcing and D2 read-first Pocket in parallel behind contracts and flags. "
            "Delay live telemetry scale, offline mutation and predictive models until pilot evidence exists.",
            "green",
        )
    )
    story.append(ui.h2("The product in one sentence"))
    story.append(
        ui.p(
            "<b>ONYX runs the factory and records the truth. XELOR turns that truth into evidence-backed decisions, "
            "visible on a phone and governed by the people responsible.</b>"
        )
    )
    story.append(ui.h2("Why this is the best change path"))
    story.append(
        ui.bullets(
            [
                "It uses the strongest code that already exists instead of restarting the platform.",
                "It corrects the ONYX/XELOR boundary before more direct database coupling spreads.",
                "It combines marketplace reach, mobile simplicity and decision intelligence around real factory records.",
                "It gives the demo one believable story while preserving honest limitations.",
                "It converts the PDF into a checked repository contract with owners, paths, APIs, events and tests.",
            ]
        )
    )
    story.append(
        ui.ProcessFlow(
            ["ORDER", "SOURCE", "RUN", "SEE", "GOVERN", "PROVE"],
            [GOLD, TEAL, NAVY, BLUE, RED, GREEN],
        )
    )


def add_appendix_api(story: list[Flowable]) -> None:
    section(
        story,
        "Appendix A",
        "API, event and permission inventory",
        "This inventory is a planning contract. Proposed names become binding only when their owning implementation and migration merge.",
    )
    story.append(ui.h2("Read projections and command requests"))
    story.append(
        ui.data_table(
            ["Type", "Contract"],
            [
                ["Read", "GET /projections/factory/sites/:siteCode/operations"],
                ["Read", "GET /projections/fulfilment/orders/:orderId"],
                ["Read", "GET /sourcing/requirements/:id and /rfqs/:id/quotes"],
                ["Command", "POST /sourcing/requirements and /rfqs"],
                ["Command", "POST /sourcing/awards/:id/recommend and /decide"],
                ["Command", "POST /planning/replan-reviews"],
                ["Command", "POST /purchase/grns/drafts and online-only /:id/post"],
            ],
            widths=[32 * mm, 139 * mm],
            small=True,
        )
    )
    story.append(ui.h2("Core events"))
    story.append(
        ui.p(
            "planning.requisition.raised.v1; sourcing.rfq.published.v1; sourcing.quote.submitted.v1; "
            "sourcing.award.approved.v1; purchase.po.approved.v1; purchase.grn.posted.v1; "
            "production.operation.blocked.v1; factory.asset-state.changed.v1; "
            "factory.shift-kpi.closed.v1; quality.inspection.completed.v1; "
            "maintenance.downtime.started.v1; maintenance.downtime.ended.v1; planning.schedule.published.v1."
        )
    )
    story.append(ui.h2("Permission families"))
    story.append(
        ui.p(
            "sourcing.requirement.*; sourcing.rfq.*; sourcing.quote.*; sourcing.award.*; "
            "purchase.invoice.*; factory.operations.read; factory.assignment.write; "
            "intelligence.factory.read; intelligence.sourcing.run; intelligence.finding.acknowledge."
        )
    )


def add_appendix_trace(story: list[Flowable]) -> None:
    section(
        story,
        "Appendix B",
        "Current file and test traceability",
        "These symbols are the evidence behind current capability claims and the starting points for the change set.",
    )
    rows = [
        ["Factory HTTP endpoint", "apps/api/src/agent-os/factory-intelligence.controller.ts", "controller and permission tests"],
        ["Factory orchestration", "apps/api/src/agent-os/factory-intelligence.service.ts", "factory-intelligence.service.test.ts"],
        ["ONYX adapter", "apps/api/src/agent-os/onyx-factory-intelligence.http-adapter.ts", "adapter contract/auth tests"],
        ["Shared transport shape", "apps/api/src/ports/onyx-factory-intelligence.port.ts", "factory-operations.v1 validation"],
        ["OEE", "packages/platform/src/factory-intelligence/oee.ts", "oee.test.ts"],
        ["Recovery preview", "packages/platform/src/factory-intelligence/replan.ts", "replan.test.ts"],
        ["Factory screen", "apps/web/src/modules/agentos/screens/factory-intelligence.tsx", "factory-intelligence.spec.ts"],
        ["New order", "apps/web/src/modules/fulfilment/new-order-form.tsx", "new-order-first-step.spec.ts"],
        ["Mission engine", "apps/api/src/fulfilment/mission.service.ts", "mission correctness and scenario tests"],
        ["Permission AND", "apps/api/src/common/permission.guard.ts", "permission-guard-metadata.test.ts"],
        ["Palette", "apps/web/src/app/globals.css", "palette-contrast.test.ts"],
        ["Upgrade contract", "workspace/docs/07-execution/03-demo-upgrade-codebase-manifest.json", "check-demo-upgrade-manifest.mjs"],
    ]
    story.append(ui.data_table(["Capability", "Implementation anchor", "Verification"], rows, widths=[40 * mm, 86 * mm, 45 * mm], small=True))
    story.append(
        ui.callout(
            "Line-number policy",
            "The PDF cites stable file and symbol ownership rather than fragile line numbers. The header records the exact branch and commit snapshot.",
            "blue",
        )
    )


def add_appendix_sources(story: list[Flowable], branch: str, sha: str, digest: str) -> None:
    section(
        story,
        "Appendix C",
        "Evidence and source register",
        "External product sources support design inspiration. Repository claims are tied to the snapshot below.",
    )
    sources = [
        ("IM-1", "IndiaMART marketplace", "https://www.indiamart.com/"),
        ("IM-2", "IndiaMART investor information", "https://investor.indiamart.com/"),
        ("VY-1", "Vyapar product homepage", "https://vyaparapp.in/"),
        ("VY-2", "Vyapar manufacturing page", "https://vyaparapp.in/manufacturing"),
        ("DS-1", "Datastride Sia product page", "https://www.datastride.ai/sia/"),
        ("DS-2", "Datastride company and manufacturing overview", "https://www.datastride.ai/"),
    ]
    rows = []
    for code, title, url in sources:
        rows.append([code, f"<link href='{url}' color='#14508F'>{title}</link>", "Official vendor source"])
    story.append(ui.data_table(["Code", "Source", "Type"], rows, widths=[23 * mm, 109 * mm, 39 * mm], small=True))
    story.append(ui.h2("Repository snapshot"))
    story.append(
        ui.data_table(
            ["Field", "Value"],
            [
                ["Branch", branch],
                ["Commit", sha],
                ["Remote XELOR baseline", "origin/main 216238c"],
                ["ONYX baseline", "onyx-phase-1 bd57cd2"],
                ["Canonical blueprint", str(BLUEPRINT.relative_to(ROOT))],
                ["Codebase manifest SHA-256", digest],
            ],
            widths=[49 * mm, 122 * mm],
            small=True,
        )
    )
    story.append(
        ui.callout(
            "Interpretation",
            "IndiaMART, Vyapar and Datastride are used as design references. This document does not imply permission "
            "to copy their data, branding, implementation or customer relationships. Vendor claims are not independent proof.",
            "amber",
        )
    )


def build_story(
    *,
    manifest: dict,
    branch: str,
    sha: str,
    version: str,
    snapshot_date: str,
    manifest_digest: str,
) -> list[Flowable]:
    story: list[Flowable] = []
    add_cover(story, version, snapshot_date)
    add_executive(story)
    add_contents(story)
    add_github_delta(story, branch, sha)
    add_truth(story)
    add_competitors(story)
    add_demo_contract(story)
    add_order_flow(story)
    add_factory_flow(story)
    add_storyboard(story)
    add_architecture(story)
    add_contracts(story)
    add_sourcing(story)
    add_pocket(story)
    add_data_events(story)
    add_security(story)
    add_code_map(story)
    add_change_manifest(story, manifest)
    add_flags(story)
    add_tests(story)
    add_phases(story)
    add_risks(story)
    add_90_days(story)
    add_recommendation(story)
    add_appendix_api(story)
    add_appendix_trace(story)
    add_appendix_sources(story, branch, sha, manifest_digest)
    return story


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate the XELOR demo upgrade implementation PDF.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--version", default="2.0")
    parser.add_argument("--snapshot-sha")
    parser.add_argument("--snapshot-date", default=date.today().strftime("%d %B %Y").upper())
    args = parser.parse_args()

    manifest = checked_inputs()
    branch = git_value("branch", "--show-current", fallback="unknown")
    sha = args.snapshot_sha or git_value("rev-parse", "HEAD", fallback="unknown")
    digest = hashlib.sha256(MANIFEST.read_bytes()).hexdigest()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    doc = UpgradeDocTemplate(
        str(args.output),
        branch=branch,
        snapshot_sha=sha,
        snapshot_date=args.snapshot_date,
        version=args.version,
    )
    doc.multiBuild(
        build_story(
            manifest=manifest,
            branch=branch,
            sha=sha,
            version=args.version,
            snapshot_date=args.snapshot_date,
            manifest_digest=digest,
        )
    )
    print(args.output)


if __name__ == "__main__":
    main()
