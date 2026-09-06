from __future__ import annotations

import os
from pathlib import Path
from typing import Iterable, Sequence

from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    HRFlowable,
    KeepTogether,
    ListFlowable,
    ListItem,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "XELOR_COMBINED_MARKETPLACE_MOBILE_SOLUTION_BLUEPRINT.pdf"

PAGE_W, PAGE_H = A4
MARGIN_X = 16 * mm
MARGIN_TOP = 18 * mm
MARGIN_BOTTOM = 17 * mm

NAVY = HexColor("#07162F")
INK = HexColor("#17233A")
MUTED = HexColor("#5B687A")
BLUE = HexColor("#1D4ED8")
CYAN = HexColor("#0E7490")
GREEN = HexColor("#087A55")
AMBER = HexColor("#A85D00")
RED = HexColor("#B42318")
MAGENTA = HexColor("#A21CAF")
VIOLET = HexColor("#6D28D9")
LINE = HexColor("#D8E0EB")
WASH = HexColor("#F4F7FB")
BLUE_WASH = HexColor("#EDF4FF")
GREEN_WASH = HexColor("#EAF8F2")
AMBER_WASH = HexColor("#FFF5E5")
RED_WASH = HexColor("#FFF0EF")
VIOLET_WASH = HexColor("#F4F0FF")
WHITE = colors.white


def register_fonts() -> None:
    font_dir = Path(r"C:\Windows\Fonts")
    fonts = {
        "Xelor": font_dir / "segoeui.ttf",
        "XelorSemi": font_dir / "seguisb.ttf",
        "XelorBold": font_dir / "segoeuib.ttf",
        "XelorLight": font_dir / "segoeuil.ttf",
    }
    for name, path in fonts.items():
        if path.exists():
            pdfmetrics.registerFont(TTFont(name, str(path)))
    if "Xelor" not in pdfmetrics.getRegisteredFontNames():
        return
    pdfmetrics.registerFontFamily(
        "Xelor",
        normal="Xelor",
        bold="XelorBold",
        italic="Xelor",
        boldItalic="XelorBold",
    )


register_fonts()
FONT = "Xelor" if "Xelor" in pdfmetrics.getRegisteredFontNames() else "Helvetica"
FONT_SEMI = "XelorSemi" if "XelorSemi" in pdfmetrics.getRegisteredFontNames() else "Helvetica-Bold"
FONT_BOLD = "XelorBold" if "XelorBold" in pdfmetrics.getRegisteredFontNames() else "Helvetica-Bold"
FONT_LIGHT = "XelorLight" if "XelorLight" in pdfmetrics.getRegisteredFontNames() else FONT


class XelorDocTemplate(BaseDocTemplate):
    def __init__(self, filename: str):
        super().__init__(
            filename,
            pagesize=A4,
            leftMargin=MARGIN_X,
            rightMargin=MARGIN_X,
            topMargin=MARGIN_TOP,
            bottomMargin=MARGIN_BOTTOM,
            title="XELOR Combined Marketplace and Mobile Solution Blueprint",
            author="AIKYANTRA - XELOR",
            subject="IndiaMART-inspired sourcing, Vyapar-inspired simplicity, and mobile factory visibility",
        )
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
        # multiBuild replays the story while resolving the TOC; bookmark keys
        # must remain identical on every pass for the index to converge.
        self._bookmark_counter = 0

    def afterFlowable(self, flowable: Flowable) -> None:
        if not isinstance(flowable, Paragraph):
            return
        style_name = flowable.style.name
        if style_name not in {"Heading1", "Heading2"}:
            return
        level = 0 if style_name == "Heading1" else 1
        text = flowable.getPlainText()
        self._bookmark_counter += 1
        key = f"section-{self._bookmark_counter}"
        self.canv.bookmarkPage(key)
        self.canv.addOutlineEntry(text, key, level=level, closed=False)
        self.notify("TOCEntry", (level, text, self.page, key))


def draw_cover_page(canvas, doc) -> None:
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)

    canvas.setFillColor(HexColor("#0A244B"))
    canvas.rect(0, PAGE_H * 0.54, PAGE_W, PAGE_H * 0.46, stroke=0, fill=1)
    canvas.setFillColor(HexColor("#0A6F75"))
    canvas.rect(PAGE_W * 0.73, 0, PAGE_W * 0.27, PAGE_H, stroke=0, fill=1)
    canvas.setFillColor(HexColor("#D59A23"))
    canvas.rect(PAGE_W * 0.73, PAGE_H * 0.17, PAGE_W * 0.27, 5 * mm, stroke=0, fill=1)

    canvas.setStrokeColor(HexColor("#2E577F"))
    canvas.setLineWidth(0.35)
    for x in range(15, 145, 15):
        canvas.line(x * mm, 0, x * mm, PAGE_H)
    for y in range(18, 290, 18):
        canvas.line(0, y * mm, PAGE_W * 0.73, y * mm)

    canvas.setStrokeColor(HexColor("#7ED8D4"))
    canvas.setLineWidth(1.1)
    nodes = [
        (153, 236),
        (177, 218),
        (158, 193),
        (183, 174),
        (151, 144),
        (179, 120),
        (155, 91),
        (183, 66),
    ]
    for i in range(len(nodes) - 1):
        x1, y1 = nodes[i]
        x2, y2 = nodes[i + 1]
        canvas.line(x1 * mm, y1 * mm, x2 * mm, y2 * mm)
    for idx, (x, y) in enumerate(nodes):
        canvas.setFillColor([CYAN, GREEN, AMBER, MAGENTA][idx % 4])
        canvas.circle(x * mm, y * mm, 3.2 * mm, stroke=0, fill=1)

    canvas.setFillColor(WHITE)
    canvas.roundRect(16 * mm, PAGE_H - 30 * mm, 22 * mm, 14 * mm, 2.5 * mm, stroke=1, fill=0)
    canvas.setFont(FONT_BOLD, 11)
    canvas.drawCentredString(27 * mm, PAGE_H - 25.2 * mm, "XE")

    canvas.restoreState()


def draw_body_page(canvas, doc) -> None:
    canvas.saveState()
    page_num = canvas.getPageNumber()
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN_X, PAGE_H - 12 * mm, PAGE_W - MARGIN_X, PAGE_H - 12 * mm)
    canvas.setFont(FONT_SEMI, 7.2)
    canvas.setFillColor(NAVY)
    canvas.drawString(MARGIN_X, PAGE_H - 9.4 * mm, "XELOR  |  UNIFIED SOLUTION BLUEPRINT")
    canvas.setFont(FONT, 6.8)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(PAGE_W - MARGIN_X, PAGE_H - 9.4 * mm, "30 AUGUST 2026  |  VERSION 1.0")

    canvas.setStrokeColor(LINE)
    canvas.line(MARGIN_X, 12 * mm, PAGE_W - MARGIN_X, 12 * mm)
    canvas.setFont(FONT, 6.8)
    canvas.setFillColor(MUTED)
    canvas.drawString(MARGIN_X, 8.1 * mm, "AIKYANTRA - XELOR")
    canvas.drawRightString(PAGE_W - MARGIN_X, 8.1 * mm, f"PAGE {page_num}")
    canvas.restoreState()


BASE = getSampleStyleSheet()
STYLES = {
    "CoverKicker": ParagraphStyle(
        "CoverKicker",
        fontName=FONT_SEMI,
        fontSize=9.5,
        leading=12,
        textColor=HexColor("#8DE4DF"),
        spaceAfter=5 * mm,
        tracking=1.1,
    ),
    "CoverTitle": ParagraphStyle(
        "CoverTitle",
        fontName=FONT_BOLD,
        fontSize=31,
        leading=34,
        textColor=WHITE,
        spaceAfter=6 * mm,
    ),
    "CoverSub": ParagraphStyle(
        "CoverSub",
        fontName=FONT_LIGHT,
        fontSize=13.5,
        leading=19,
        textColor=HexColor("#DCEAF6"),
        spaceAfter=8 * mm,
    ),
    "CoverMeta": ParagraphStyle(
        "CoverMeta",
        fontName=FONT,
        fontSize=8.2,
        leading=11,
        textColor=HexColor("#C2D8E8"),
    ),
    "Heading1": ParagraphStyle(
        "Heading1",
        fontName=FONT_BOLD,
        fontSize=19,
        leading=22,
        textColor=NAVY,
        spaceBefore=1 * mm,
        spaceAfter=4 * mm,
        keepWithNext=True,
    ),
    "Heading2": ParagraphStyle(
        "Heading2",
        fontName=FONT_SEMI,
        fontSize=12.2,
        leading=15,
        textColor=BLUE,
        spaceBefore=3.5 * mm,
        spaceAfter=2.2 * mm,
        keepWithNext=True,
    ),
    "Heading3": ParagraphStyle(
        "Heading3",
        fontName=FONT_SEMI,
        fontSize=9.6,
        leading=12,
        textColor=NAVY,
        spaceBefore=2.5 * mm,
        spaceAfter=1.3 * mm,
        keepWithNext=True,
    ),
    "Body": ParagraphStyle(
        "Body",
        fontName=FONT,
        fontSize=8.55,
        leading=12.2,
        textColor=INK,
        spaceAfter=2.3 * mm,
    ),
    "Lead": ParagraphStyle(
        "Lead",
        fontName=FONT,
        fontSize=10.6,
        leading=15,
        textColor=HexColor("#35465E"),
        spaceAfter=4 * mm,
    ),
    "Small": ParagraphStyle(
        "Small",
        fontName=FONT,
        fontSize=7.1,
        leading=9.6,
        textColor=MUTED,
        spaceAfter=1.3 * mm,
    ),
    "Caption": ParagraphStyle(
        "Caption",
        fontName=FONT,
        fontSize=6.8,
        leading=8.7,
        textColor=MUTED,
        alignment=TA_LEFT,
        spaceAfter=2 * mm,
    ),
    "CardTitle": ParagraphStyle(
        "CardTitle",
        fontName=FONT_SEMI,
        fontSize=9.1,
        leading=11,
        textColor=NAVY,
        spaceAfter=1.1 * mm,
    ),
    "CardBody": ParagraphStyle(
        "CardBody",
        fontName=FONT,
        fontSize=7.6,
        leading=10.2,
        textColor=INK,
    ),
    "TableHead": ParagraphStyle(
        "TableHead",
        fontName=FONT_SEMI,
        fontSize=7.2,
        leading=9,
        textColor=WHITE,
    ),
    "TableCell": ParagraphStyle(
        "TableCell",
        fontName=FONT,
        fontSize=7.1,
        leading=9.5,
        textColor=INK,
    ),
    "TableCellSmall": ParagraphStyle(
        "TableCellSmall",
        fontName=FONT,
        fontSize=6.5,
        leading=8.4,
        textColor=INK,
    ),
    "TOC0": ParagraphStyle(
        "TOC0",
        fontName=FONT_SEMI,
        fontSize=9.1,
        leading=14,
        leftIndent=0,
        firstLineIndent=0,
        textColor=NAVY,
        spaceBefore=1.2 * mm,
    ),
    "TOC1": ParagraphStyle(
        "TOC1",
        fontName=FONT,
        fontSize=7.6,
        leading=11,
        leftIndent=6 * mm,
        firstLineIndent=0,
        textColor=MUTED,
    ),
    "Quote": ParagraphStyle(
        "Quote",
        fontName=FONT_SEMI,
        fontSize=11,
        leading=15,
        textColor=NAVY,
        alignment=TA_LEFT,
    ),
    "Mono": ParagraphStyle(
        "Mono",
        fontName="Courier",
        fontSize=6.4,
        leading=8.6,
        textColor=INK,
        spaceAfter=1.5 * mm,
    ),
}


def p(text: str, style: str = "Body") -> Paragraph:
    return Paragraph(text, STYLES[style])


def h1(number: str, title: str, lead: str | None = None) -> list[Flowable]:
    items: list[Flowable] = [p(f"{number}. {title}", "Heading1")]
    items.append(HRFlowable(width="100%", thickness=1.2, color=BLUE, spaceAfter=3.5 * mm))
    if lead:
        items.append(p(lead, "Lead"))
    return items


def h2(title: str) -> Paragraph:
    return p(title, "Heading2")


def h3(title: str) -> Paragraph:
    return p(title, "Heading3")


def bullets(items: Iterable[str], level: int = 0, small: bool = False) -> ListFlowable:
    style = STYLES["Small" if small else "Body"]
    return ListFlowable(
        [ListItem(Paragraph(item, style), leftIndent=4 * mm) for item in items],
        bulletType="bullet",
        start="circle",
        leftIndent=(5 + level * 4) * mm,
        bulletFontName=FONT_BOLD,
        bulletFontSize=5.5,
        bulletColor=BLUE,
        spaceAfter=2.5 * mm,
    )


def numbered(items: Iterable[str]) -> ListFlowable:
    return ListFlowable(
        [ListItem(Paragraph(item, STYLES["Body"]), leftIndent=4 * mm) for item in items],
        bulletType="1",
        leftIndent=6 * mm,
        bulletFontName=FONT_SEMI,
        bulletFontSize=7.5,
        bulletColor=BLUE,
        spaceAfter=2.5 * mm,
    )


def callout(title: str, body: str, kind: str = "blue") -> Table:
    palettes = {
        "blue": (BLUE, BLUE_WASH),
        "green": (GREEN, GREEN_WASH),
        "amber": (AMBER, AMBER_WASH),
        "red": (RED, RED_WASH),
        "violet": (VIOLET, VIOLET_WASH),
    }
    accent, fill = palettes[kind]
    content = Paragraph(
        f"<font name='{FONT_BOLD}' color='{accent.hexval()}'>{title}</font><br/>{body}",
        ParagraphStyle(
            "Callout",
            parent=STYLES["Body"],
            fontSize=8.1,
            leading=11.2,
            spaceAfter=0,
        ),
    )
    table = Table([["", content]], colWidths=[2.2 * mm, None], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, 0), accent),
                ("BACKGROUND", (1, 0), (1, 0), fill),
                ("BOX", (0, 0), (-1, -1), 0.55, HexColor("#CFD9E7")),
                ("LEFTPADDING", (1, 0), (1, 0), 8),
                ("RIGHTPADDING", (1, 0), (1, 0), 8),
                ("TOPPADDING", (1, 0), (1, 0), 7),
                ("BOTTOMPADDING", (1, 0), (1, 0), 7),
                ("LEFTPADDING", (0, 0), (0, 0), 0),
                ("RIGHTPADDING", (0, 0), (0, 0), 0),
            ]
        )
    )
    return table


def card(title: str, body: str, accent=BLUE, width: float | None = None) -> Table:
    content = [
        [Paragraph(title, STYLES["CardTitle"])],
        [Paragraph(body, STYLES["CardBody"])],
    ]
    table = Table(content, colWidths=[width] if width else None, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), WHITE),
                ("BOX", (0, 0), (-1, -1), 0.65, LINE),
                ("LINEABOVE", (0, 0), (-1, 0), 3.2, accent),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return table


def card_grid(items: Sequence[tuple[str, str, colors.Color]], columns: int = 3) -> Table:
    usable = PAGE_W - 2 * MARGIN_X
    gap = 3 * mm
    col_width = (usable - gap * (columns - 1)) / columns
    rows = []
    for idx in range(0, len(items), columns):
        row = [card(t, b, a, col_width) for t, b, a in items[idx : idx + columns]]
        while len(row) < columns:
            row.append("")
        rows.append(row)
    table = Table(rows, colWidths=[col_width] * columns, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), gap),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), gap),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return table


def data_table(
    headers: Sequence[str],
    rows: Sequence[Sequence[str]],
    widths: Sequence[float] | None = None,
    small: bool = False,
    repeat_rows: int = 1,
) -> Table:
    head = [Paragraph(h, STYLES["TableHead"]) for h in headers]
    cell_style = STYLES["TableCellSmall" if small else "TableCell"]
    body = [[Paragraph(str(cell), cell_style) for cell in row] for row in rows]
    table = Table([head] + body, colWidths=widths, repeatRows=repeat_rows, hAlign="LEFT")
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("GRID", (0, 0), (-1, -1), 0.45, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5.5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5.5),
        ("TOPPADDING", (0, 0), (-1, -1), 5.2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5.2),
    ]
    for row_idx in range(2, len(body) + 1, 2):
        style.append(("BACKGROUND", (0, row_idx), (-1, row_idx), HexColor("#F8FAFD")))
    table.setStyle(TableStyle(style))
    return table


def source_note(text: str) -> Paragraph:
    return Paragraph(f"<font name='{FONT_SEMI}'>Evidence:</font> {text}", STYLES["Caption"])


class ProcessFlow(Flowable):
    def __init__(self, labels: Sequence[str], accents: Sequence[colors.Color] | None = None, height=29 * mm):
        super().__init__()
        self.labels = labels
        self.accents = accents or [BLUE] * len(labels)
        self.height = height
        self.width = 0

    def wrap(self, avail_width, avail_height):
        self.width = avail_width
        return avail_width, self.height

    def draw(self):
        c = self.canv
        n = len(self.labels)
        arrow_gap = 5 * mm
        box_w = (self.width - arrow_gap * (n - 1)) / n
        box_h = self.height - 4 * mm
        y = 2 * mm
        for i, label in enumerate(self.labels):
            x = i * (box_w + arrow_gap)
            c.setFillColor(WHITE)
            c.setStrokeColor(LINE)
            c.setLineWidth(0.7)
            c.roundRect(x, y, box_w, box_h, 3 * mm, stroke=1, fill=1)
            c.setFillColor(self.accents[i % len(self.accents)])
            c.roundRect(x, y + box_h - 3 * mm, box_w, 3 * mm, 2 * mm, stroke=0, fill=1)
            c.setFillColor(NAVY)
            c.setFont(FONT_BOLD, 6.9)
            words = label.split()
            lines: list[str] = []
            current = ""
            max_chars = max(9, int(box_w / (2.1 * mm)))
            for word in words:
                trial = f"{current} {word}".strip()
                if len(trial) <= max_chars:
                    current = trial
                else:
                    if current:
                        lines.append(current)
                    current = word
            if current:
                lines.append(current)
            lines = lines[:4]
            start_y = y + box_h / 2 + (len(lines) - 1) * 3.8
            for j, line in enumerate(lines):
                c.drawCentredString(x + box_w / 2, start_y - j * 8.2, line)
            if i < n - 1:
                ax1 = x + box_w + 1.2 * mm
                ax2 = x + box_w + arrow_gap - 1.2 * mm
                ay = y + box_h / 2
                c.setStrokeColor(BLUE)
                c.setFillColor(BLUE)
                c.setLineWidth(1)
                c.line(ax1, ay, ax2, ay)
                c.line(ax2, ay, ax2 - 1.8 * mm, ay + 1.3 * mm)
                c.line(ax2, ay, ax2 - 1.8 * mm, ay - 1.3 * mm)


class PhoneMockup(Flowable):
    def __init__(
        self,
        title: str,
        subtitle: str,
        metrics: Sequence[tuple[str, str]],
        alerts: Sequence[str],
        action: str,
        accent=BLUE,
        width=54 * mm,
        height=118 * mm,
        context: str = "Plant 01 | Online | Sync 2m | 0 drafts",
    ):
        super().__init__()
        self.title = title
        self.subtitle = subtitle
        self.metrics = metrics
        self.alerts = alerts
        self.action = action
        self.accent = accent
        self.context = context
        self.width = width
        self.height = height

    def wrap(self, avail_width, avail_height):
        return self.width, self.height

    def _text(self, c, text, x, y, max_chars, font, size, color, leading=7.2, max_lines=2):
        c.setFont(font, size)
        c.setFillColor(color)
        words = text.split()
        lines: list[str] = []
        current = ""
        for word in words:
            trial = f"{current} {word}".strip()
            if len(trial) <= max_chars:
                current = trial
            else:
                if current:
                    lines.append(current)
                current = word
        if current:
            lines.append(current)
        for idx, line in enumerate(lines[:max_lines]):
            c.drawString(x, y - idx * leading, line)
        return y - len(lines[:max_lines]) * leading

    def draw(self):
        c = self.canv
        w, h = self.width, self.height
        c.setFillColor(HexColor("#111827"))
        c.roundRect(0, 0, w, h, 5 * mm, stroke=0, fill=1)
        c.setFillColor(HexColor("#FAFCFF"))
        c.roundRect(1.5 * mm, 1.5 * mm, w - 3 * mm, h - 3 * mm, 4 * mm, stroke=0, fill=1)
        c.setFillColor(HexColor("#111827"))
        c.roundRect(w / 2 - 8 * mm, h - 4 * mm, 16 * mm, 2.5 * mm, 1.2 * mm, stroke=0, fill=1)

        inner_x = 4 * mm
        inner_w = w - 8 * mm
        c.setFont(FONT, 5.4)
        c.setFillColor(MUTED)
        c.drawCentredString(w / 2, h - 7.2 * mm, self.context)
        y = h - 12 * mm
        c.setFillColor(self.accent)
        c.roundRect(inner_x, y - 15 * mm, inner_w, 15 * mm, 2.4 * mm, stroke=0, fill=1)
        c.setFillColor(WHITE)
        c.setFont(FONT_BOLD, 8.3)
        c.drawString(inner_x + 2.5 * mm, y - 5 * mm, self.title)
        self._text(c, self.subtitle, inner_x + 2.5 * mm, y - 9.3 * mm, 32, FONT, 6.0, WHITE, 6.6, 2)
        y -= 19 * mm

        metric_w = (inner_w - 2 * mm) / 2
        for idx, (value, label) in enumerate(self.metrics[:4]):
            col = idx % 2
            row = idx // 2
            x = inner_x + col * (metric_w + 2 * mm)
            yy = y - row * 17 * mm
            c.setFillColor(WHITE)
            c.setStrokeColor(LINE)
            c.roundRect(x, yy - 14 * mm, metric_w, 14 * mm, 1.8 * mm, stroke=1, fill=1)
            c.setFont(FONT_BOLD, 10)
            c.setFillColor(NAVY)
            c.drawString(x + 2 * mm, yy - 5.2 * mm, value)
            self._text(c, label, x + 2 * mm, yy - 9 * mm, 17, FONT, 6.0, MUTED, 6.3, 2)
        y -= 37 * mm

        c.setFont(FONT_SEMI, 6.2)
        c.setFillColor(NAVY)
        c.drawString(inner_x, y, "NEEDS ATTENTION")
        y -= 4 * mm
        for alert in self.alerts[:2]:
            c.setFillColor(WHITE)
            c.setStrokeColor(LINE)
            c.roundRect(inner_x, y - 10.5 * mm, inner_w, 9.5 * mm, 1.7 * mm, stroke=1, fill=1)
            c.setFillColor(AMBER)
            c.circle(inner_x + 2.4 * mm, y - 5.6 * mm, 0.9 * mm, stroke=0, fill=1)
            self._text(c, alert, inner_x + 4.5 * mm, y - 4.1 * mm, 39, FONT, 5.9, INK, 6.2, 2)
            y -= 11.2 * mm

        c.setFillColor(self.accent)
        c.roundRect(inner_x, 11.5 * mm, inner_w, 9 * mm, 2 * mm, stroke=0, fill=1)
        c.setFont(FONT_BOLD, 6.6)
        c.setFillColor(WHITE)
        c.drawCentredString(w / 2, 14.7 * mm, self.action)
        c.setFont(FONT_SEMI, 4.9)
        c.setFillColor(MUTED)
        c.drawCentredString(w / 2, 5.2 * mm, "HOME   WORK   SCAN   ALERTS   MORE")


class TaskPhoneMockup(PhoneMockup):
    def __init__(
        self,
        title: str,
        subtitle: str,
        context: str,
        rows: Sequence[tuple[str, str]],
        evidence: str,
        action: str,
        accent=BLUE,
        width=54 * mm,
        height=118 * mm,
    ):
        super().__init__(title, subtitle, [], [], action, accent, width, height, context)
        self.rows = rows
        self.evidence = evidence

    def draw(self):
        c = self.canv
        w, h = self.width, self.height
        c.setFillColor(HexColor("#111827"))
        c.roundRect(0, 0, w, h, 5 * mm, stroke=0, fill=1)
        c.setFillColor(HexColor("#FAFCFF"))
        c.roundRect(1.5 * mm, 1.5 * mm, w - 3 * mm, h - 3 * mm, 4 * mm, stroke=0, fill=1)
        c.setFillColor(HexColor("#111827"))
        c.roundRect(w / 2 - 8 * mm, h - 4 * mm, 16 * mm, 2.5 * mm, 1.2 * mm, stroke=0, fill=1)

        inner_x = 4 * mm
        inner_w = w - 8 * mm
        c.setFont(FONT, 5.4)
        c.setFillColor(MUTED)
        c.drawCentredString(w / 2, h - 7.2 * mm, self.context)
        y = h - 12 * mm
        c.setFillColor(self.accent)
        c.roundRect(inner_x, y - 15 * mm, inner_w, 15 * mm, 2.4 * mm, stroke=0, fill=1)
        c.setFillColor(WHITE)
        c.setFont(FONT_BOLD, 8.3)
        c.drawString(inner_x + 2.5 * mm, y - 5 * mm, self.title)
        self._text(c, self.subtitle, inner_x + 2.5 * mm, y - 9.5 * mm, 34, FONT, 6.0, WHITE, 6.5, 2)

        y -= 19 * mm
        for label, value in self.rows[:4]:
            c.setFillColor(WHITE)
            c.setStrokeColor(LINE)
            c.roundRect(inner_x, y - 11 * mm, inner_w, 10 * mm, 1.6 * mm, stroke=1, fill=1)
            c.setFont(FONT_SEMI, 5.7)
            c.setFillColor(MUTED)
            c.drawString(inner_x + 2 * mm, y - 4.2 * mm, label.upper())
            self._text(c, value, inner_x + 2 * mm, y - 7.3 * mm, 39, FONT_SEMI, 6.6, NAVY, 6.8, 1)
            y -= 11.2 * mm

        c.setFillColor(BLUE_WASH)
        c.setStrokeColor(LINE)
        c.roundRect(inner_x, y - 12 * mm, inner_w, 11 * mm, 1.6 * mm, stroke=1, fill=1)
        self._text(c, self.evidence, inner_x + 2 * mm, y - 4.5 * mm, 39, FONT, 5.8, INK, 6.2, 2)

        c.setFillColor(self.accent)
        c.roundRect(inner_x, 11.5 * mm, inner_w, 9 * mm, 2 * mm, stroke=0, fill=1)
        c.setFont(FONT_BOLD, 6.6)
        c.setFillColor(WHITE)
        c.drawCentredString(w / 2, 14.7 * mm, self.action)
        c.setFont(FONT_SEMI, 4.9)
        c.setFillColor(MUTED)
        c.drawCentredString(w / 2, 5.2 * mm, "HOME   WORK   SCAN   ALERTS   MORE")


class ArchitectureDiagram(Flowable):
    def __init__(self, height=112 * mm):
        super().__init__()
        self.height = height
        self.width = 0

    def wrap(self, avail_width, avail_height):
        self.width = avail_width
        return avail_width, self.height

    def draw_band(self, c, y, h, title, items, fill, text_color=NAVY):
        c.setFillColor(fill)
        c.setStrokeColor(LINE)
        c.roundRect(0, y, self.width, h, 3 * mm, stroke=1, fill=1)
        c.setFont(FONT_BOLD, 7.2)
        c.setFillColor(text_color)
        c.drawString(4 * mm, y + h - 6 * mm, title)
        n = len(items)
        gap = 2 * mm
        inner_w = self.width - 8 * mm
        box_w = (inner_w - gap * (n - 1)) / n
        for idx, item in enumerate(items):
            x = 4 * mm + idx * (box_w + gap)
            c.setFillColor(WHITE)
            c.setStrokeColor(HexColor("#CBD5E1"))
            c.roundRect(x, y + 3 * mm, box_w, h - 12 * mm, 2 * mm, stroke=1, fill=1)
            c.setFillColor(text_color)
            c.setFont(FONT_SEMI, 6.4)
            words = item.split()
            lines, current = [], ""
            max_chars = max(12, int(box_w / (1.75 * mm)))
            for word in words:
                trial = f"{current} {word}".strip()
                if len(trial) <= max_chars:
                    current = trial
                else:
                    lines.append(current)
                    current = word
            if current:
                lines.append(current)
            yy = y + (h - 5 * mm) / 2 + 1.5 * mm
            for j, line in enumerate(lines[:2]):
                c.drawCentredString(x + box_w / 2, yy - j * 7.0, line)

    def draw(self):
        c = self.canv
        bands = [
            ("CHANNELS", ["Desktop ERP", "XELOR Pocket PWA", "Supplier Connect"], BLUE_WASH, 21 * mm),
            ("IDENTITY AND EXPERIENCE", ["Keycloak Organizations", "OIDC + PKCE / BFF", "Shared design system"], VIOLET_WASH, 19 * mm),
            ("DOMAIN SERVICES", ["Factory Core", "Marketplace + Sourcing", "Flow + Finance", "Mobile Read Model"], GREEN_WASH, 22 * mm),
            ("TRANSACTION AND EVENTS", ["PostgreSQL + FORCE RLS", "Audit + approvals", "Outbox + Valkey"], AMBER_WASH, 20 * mm),
            ("EXTERNAL ADAPTERS", ["S3 drawings/media", "Gotenberg PDFs", "GST / email / WhatsApp / push"], RED_WASH, 21 * mm),
        ]
        y = self.height
        for title, items, fill, h in bands:
            y -= h
            self.draw_band(c, y, h - 2 * mm, title, items, fill)
            if y > 2 * mm:
                c.setStrokeColor(BLUE)
                c.setLineWidth(0.7)
                c.line(self.width / 2, y, self.width / 2, y - 2 * mm)


def section_break(story: list[Flowable]) -> None:
    story.extend([PageBreak(), NextPageTemplate("Body")])


def add_cover(story: list[Flowable]) -> None:
    story.extend(
        [
            Spacer(1, 40 * mm),
            p("PRODUCT, MOBILE AND DELIVERY BLUEPRINT", "CoverKicker"),
            p("XELOR Unified Factory<br/>and Supply Network", "CoverTitle"),
            p(
                "A combined solution inspired by IndiaMART's supplier reach and Vyapar's everyday simplicity - extended with XELOR's factory-grade planning, production, quality, maintenance, finance and governance.",
                "CoverSub",
            ),
            Spacer(1, 7 * mm),
            Table(
                [
                    [
                        p("SOURCE", "CoverMeta"),
                        p("RUN", "CoverMeta"),
                        p("SEE", "CoverMeta"),
                        p("COLLECT", "CoverMeta"),
                        p("PROVE", "CoverMeta"),
                    ],
                    [
                        p("Find supply", "CoverMeta"),
                        p("Run the factory", "CoverMeta"),
                        p("See it by phone", "CoverMeta"),
                        p("Bill and collect", "CoverMeta"),
                        p("Keep evidence", "CoverMeta"),
                    ],
                ],
                colWidths=[28.8 * mm] * 5,
                style=TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, -1), HexColor("#12365A")),
                        ("BOX", (0, 0), (-1, -1), 0.6, HexColor("#6A8FB1")),
                        ("INNERGRID", (0, 0), (-1, -1), 0.3, HexColor("#577896")),
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("LEFTPADDING", (0, 0), (-1, -1), 7),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                        ("TOPPADDING", (0, 0), (-1, -1), 7),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                    ]
                ),
            ),
            Spacer(1, 31 * mm),
            p("DECISION DOCUMENT  |  VERSION 1.0  |  30 AUGUST 2026", "CoverMeta"),
            p("Prepared for AIKYANTRA - XELOR", "CoverMeta"),
            NextPageTemplate("Body"),
            PageBreak(),
        ]
    )


def add_executive_brief(story: list[Flowable]) -> None:
    story.extend(h1("1", "Executive decision", "The recommended upgrade is one connected industrial operating system with five focused surfaces. It should not become a clone of IndiaMART or a generic billing application."))
    story.append(
        callout(
            "Recommended product statement",
            "XELOR connects supplier discovery, structured sourcing, factory execution, commercial documents, cash visibility and role-safe mobile access in one governed loop.",
            "green",
        )
    )
    story.append(Spacer(1, 3 * mm))
    story.append(
        card_grid(
            [
                ("IndiaMART lesson", "Broad supplier discovery, location-aware search, RFQs, quick contact and marketplace liquidity.", CYAN),
                ("Vyapar lesson", "Fast billing, simple stock/accounting, mobile access, offline resilience, WhatsApp/PDF sharing and owner-friendly language.", GREEN),
                ("XELOR advantage", "MRP (what material is needed and when), governed purchasing, inventory integrity, production, quality, maintenance, finance and evidence-backed decisions.", BLUE),
            ],
            3,
        )
    )
    story.append(h2("The combined promise"))
    story.append(ProcessFlow(["Customer demand", "Plan and source", "Receive and inspect", "Make and dispatch", "Invoice and collect"], [MAGENTA, BLUE, AMBER, GREEN, CYAN]))
    story.append(
        callout(
            "Defensible difference",
            "IndiaMART answers who claims they can supply. Vyapar answers what the business billed, bought and owes. XELOR should answer which qualified supplier can meet the exact requirement, how it affects the factory plan, and what operational, quality and financial evidence proves the outcome.",
            "violet",
        )
    )
    story.append(h2("What this blueprint decides"))
    story.append(
        bullets(
            [
                "Build <b>XELOR Source</b> as a curated RFQ-led industrial supplier network, starting invite-only.",
                "Build <b>XELOR Flow</b> for quotations, branded documents, receivables, supplier invoices and matching.",
                "Build <b>XELOR Pocket</b> as an installable, task-first mobile PWA rather than shrinking the whole desktop ERP.",
                "Keep XELOR Core authoritative for planning, stock, quality, approvals and accounting.",
                "Start with field validation in one industrial cluster and two or three repeat-demand categories.",
            ]
        )
    )
    story.append(source_note("[IM-1], [IM-2], [VY-1], [VY-2], [XE-1], [XE-2]. Full references appear in Appendix B."))


def add_contents(story: list[Flowable]) -> None:
    section_break(story)
    story.extend(h1("2", "Contents and decision map", "This document moves from product strategy to workflows, mobile design, architecture, phased delivery, operating metrics and risk controls."))
    toc = TableOfContents()
    toc.levelStyles = [STYLES["TOC0"], STYLES["TOC1"]]
    toc.dotsMinLevel = 0
    story.append(toc)
    story.append(Spacer(1, 4 * mm))
    story.append(
        callout(
            "How to use this document",
            "Sections 3-9 define the product and operating flows. Sections 10-14 define the mobile solution. Sections 15-17 define architecture, data and repository changes. Sections 18-25 define groundwork, delivery, metrics and controls. Section 26 gives the recommendation.",
            "blue",
        )
    )
    story.append(h2("Decision status"))
    story.append(
        data_table(
            ["Decision", "Recommendation", "Status"],
            [
                ["Marketplace model", "Curated supplier network plus structured RFQ", "Proceed to discovery"],
                ["Mobile channel", "Installable PWA first; native only after evidence", "Recommended"],
                ["Data model", "Private tenant, published network and participant transaction zones", "Non-negotiable"],
                ["First geography", "One dense industrial cluster", "Select in Phase 0"],
                ["First categories", "Two or three repeat-demand industrial categories", "Validate in field"],
                ["Payments/logistics", "Partner or defer until transaction evidence exists", "Deferred"],
            ],
            widths=[40 * mm, 88 * mm, 43 * mm],
        )
    )


def add_competitor_lessons(story: list[Flowable]) -> None:
    section_break(story)
    story.extend(h1("3", "What to take from IndiaMART and Vyapar", "The goal is selective inspiration: retain the mechanisms that reduce friction, improve the weak controls, and avoid copying business models that do not fit a factory ERP."))
    story.append(
        data_table(
            ["Dimension", "IndiaMART", "Vyapar", "Improved XELOR"],
            [
                ["Primary job", "Find suppliers and create business enquiries", "Bill, track stock and manage basic accounts", "Source, run, see and control the industrial loop"],
                ["Buyer experience", "Search, filters, supplier profile, contact or RFQ", "Add party/items, create document, share and collect", "MRP need or enquiry becomes a governed transaction"],
                ["Trust", "GST, TrustSEAL, ratings and limited payment protection", "User-entered records, backups and audit/accounting reports", "Evidence-specific verification plus transaction-derived supplier performance"],
                ["Mobile", "Buyer/seller marketplace app", "Core business activity on phone and desktop", "Role-specific factory pulse, tasks, capture and approvals"],
                ["Manufacturing", "Marketplace listings and job work", "Basic BOM recipe and consumption", "Multi-level planning, production, quality, maintenance and traceability"],
                ["Main weakness", "Noisy listings, inconsistent data and off-platform fulfilment", "Crowded forms, hidden settings and light factory controls", "Must simplify without weakening governance"],
            ],
            widths=[27 * mm, 47 * mm, 47 * mm, 50 * mm],
            small=True,
        )
    )
    story.append(h2("Evidence that matters"))
    story.append(
        card_grid(
            [
                ("IndiaMART scale", "At 30 June 2026 IndiaMART reported 234M registered buyers, 8.8M supplier storefronts, 218K paying suppliers and 132M listings. Scale creates discovery, but not guaranteed fulfilment.", CYAN),
                ("Vyapar adoption", "Google Play reports 10M+ downloads and a 4.8 rating. Its value is low-friction daily administration for small businesses, not factory-grade control.", GREEN),
                ("Strategic relationship", "IndiaMART reported a 28.59% fully diluted stake in Simply Vyapar Apps at 31 March 2026. They remain separate products with complementary roles.", AMBER),
            ],
            3,
        )
    )
    story.append(h2("Copy, improve, avoid"))
    story.append(
        data_table(
            ["Copy", "Improve", "Avoid"],
            [
                ["Search, RFQ and supplier reach", "Use category-specific technical schemas and exact revisions", "A generic catalogue claiming every item fits"],
                ["Fast invoice/quote creation", "Make important factory documents quick without losing approval", "One enormous form with every possible option"],
                ["WhatsApp/PDF convenience", "Share authenticated links and audited documents", "Sending confidential drawings through open messages"],
                ["Phone visibility", "Task-first views, evidence and freshness timestamps", "Putting 24 desktop modules in a small menu"],
                ["Freemium-style onboarding lessons", "Guided setup and Excel import", "Entering a mass-market price war with retail billing tools"],
            ],
            widths=[56 * mm, 58 * mm, 57 * mm],
            small=True,
        )
    )
    story.append(source_note("[IM-1], [IM-2], [IM-3], [VY-1], [VY-2], [VY-3], [VY-4]."))
    story.append(p("The scale and adoption figures above are sourced facts. The weakness rows are product-analysis hypotheses and must be validated with buyers and suppliers during Phase 0.", "Caption"))


def add_product_system(story: list[Flowable]) -> None:
    section_break(story)
    story.extend(h1("4", "The proposed product system", "Use five connected surfaces. They share identity, permissions, audit, workflow, data and events, but each presents only the work its user needs."))
    story.append(
        card_grid(
            [
                ("XELOR Core", "The existing factory system of record: engineering, MRP, purchase, inventory, production, quality, maintenance, sales and accounts.", BLUE),
                ("XELOR Source", "Supplier discovery, verification, structured RFQs, quote revisions, comparison, award and supplier performance.", CYAN),
                ("Supplier Connect", "A lightweight portal for suppliers who do not use XELOR ERP: profile, catalogue, RFQ, quote, PO acknowledgement and delivery promise.", AMBER),
                ("XELOR Flow", "Quotations, commercial documents, GST-ready PDFs, receivables, supplier invoices, matching and reminders.", GREEN),
                ("XELOR Pocket", "Curated mobile visibility, alerts, approvals, scan/capture and assigned work for factory and commercial roles.", MAGENTA),
            ],
            3,
        )
    )
    story.append(h2("One truth, several experiences"))
    story.append(ProcessFlow(["Source demand", "Govern the decision", "Run factory work", "Record evidence", "Explain outcome"], [CYAN, VIOLET, BLUE, GREEN, AMBER]))
    story.append(
        callout(
            "Boundary",
            "The five names are proposed product surfaces, not five databases and not five independent engineering teams. XELOR Core remains the authority; the other surfaces call the same domain rules.",
            "amber",
        )
    )
    story.append(h2("Positioning"))
    story.append(p("<b>XELOR Unified:</b> the industrial operating system that connects customer demand, qualified supply, factory execution, commercial documents and management visibility from desktop and phone."))
    story.append(p("A simple external promise can be: <b>Source. Run. See. Collect. Prove.</b> The deeper proof is the audit trail from requirement through material, work, quality and money."))
    story.append(h2("Commercial boundaries"))
    story.append(
        data_table(
            ["Surface", "Initial commercial model", "Integrity rule"],
            [
                ["Core + Flow + Pocket", "Factory subscription with site and role tiers", "No loss of audit, approval or ledger controls at a lower tier"],
                ["Source - buyer", "Subscription or usage tier validated in pilot; avoid pay-per-lead incentives", "Ranking and award remain evidence-led"],
                ["Supplier Connect", "Free invited RFQ response and basic profile; optional paid services later", "Payment never changes qualification, score or award recommendation"],
            ],
            widths=[42 * mm, 73 * mm, 56 * mm],
            small=True,
        )
    )


def add_personas(story: list[Flowable]) -> None:
    section_break(story)
    story.extend(h1("5", "People and jobs to be done", "The combined product must serve different roles without giving every person access to every record."))
    story.append(
        data_table(
            ["Persona", "Question they need answered", "Primary surface", "Phone role"],
            [
                ["Owner / Managing Director", "Are promises, production and cash under control?", "Pocket + Flow", "See exceptions, approve, escalate"],
                ["Plant manager", "What is late, stopped, blocked or rejected today?", "Pocket + Core", "Shift pulse and interventions"],
                ["Planner", "What must be made or bought, and by when?", "Core + Source", "Shortage and arrival risk"],
                ["Buyer", "Who can meet the exact need at acceptable total risk?", "Source", "RFQs, clarification, shortlist"],
                ["Purchase manager", "Is the award commercially and operationally defensible?", "Source + Pocket", "Evidence-led approval"],
                ["Production supervisor", "What should run next and what is blocking it?", "Core + Pocket", "Work queue and counts"],
                ["Operator", "What is my next job and what must I record?", "Pocket", "Scan, start, quantity, stop reason"],
                ["Stores user", "What arrived, where does it go, and is it valid?", "Core + Pocket", "Scan and prepare GRN"],
                ["Quality inspector", "What must be tested and what evidence determines disposition?", "Core + Pocket", "Readings, photos, result"],
                ["Maintenance technician", "What asset needs work and what restores it safely?", "Core + Pocket", "QR work order and checklist"],
                ["Sales / accounts", "What should be quoted, billed, collected or paid?", "Flow", "Share and follow up"],
                ["Supplier representative", "What is required and how do I respond?", "Supplier Connect", "Quote, acknowledge, update promise"],
            ],
            widths=[36 * mm, 67 * mm, 34 * mm, 34 * mm],
            small=True,
        )
    )
    story.append(
        callout(
            "Permission principle",
            "The owner may want broad visibility, but mobile still respects tenant, plant, role and field rules. Operators do not see margins; suppliers never see the buyer's internal ERP; sensitive values stay behind explicit permission.",
            "blue",
        )
    )


def add_north_star_flow(story: list[Flowable]) -> None:
    section_break(story)
    story.extend(h1("6", "North-star closed loop", "This is the single story the combined solution must complete without spreadsheets or retyping."))
    story.append(h3("Demand and planning"))
    story.append(ProcessFlow(["Customer enquiry", "Sales quotation", "Sales order", "MRP need", "Purchase requisition"], [MAGENTA, MAGENTA, BLUE, BLUE, CYAN]))
    story.append(Spacer(1, 2 * mm))
    story.append(h3("Source to receive"))
    story.append(ProcessFlow(["Supplier RFQ", "Quote comparison", "Approved PO", "GRN + inspection", "Supplier invoice"], [CYAN, VIOLET, AMBER, GREEN, GREEN]))
    story.append(Spacer(1, 2 * mm))
    story.append(h3("Make to cash and evidence"))
    story.append(ProcessFlow(["Production", "Final quality", "Dispatch", "GST invoice", "Cash + supplier score"], [BLUE, GREEN, AMBER, MAGENTA, CYAN]))
    story.append(h2("Why this is stronger than a marketplace alone"))
    story.append(
        bullets(
            [
                "The requirement comes from a real customer promise or material plan, not an unqualified enquiry.",
                "The RFQ preserves item, quantity, need date, drawing revision, plant and planning evidence.",
                "The award remains human-approved and creates the existing draft PO exactly once.",
                "The receipt and inspection prove whether the supplier actually delivered acceptable material.",
                "The supplier score comes from immutable transaction outcomes rather than anonymous stars.",
                "The commercial outcome connects to invoice, receivable, payable and cash evidence.",
            ]
        )
    )
    story.append(
        callout(
            "Golden rule",
            "MRP may recommend a purchase need. It must never publish confidential demand, select a supplier or commit money without the governed human boundary.",
            "red",
        )
    )


def add_marketplace_journeys(story: list[Flowable]) -> None:
    section_break(story)
    story.extend(h1("7", "XELOR Source: buyer and supplier journeys", "Start with invited suppliers and known industrial categories. Public discovery can expand only after catalogue quality, access control and transaction evidence are proven."))
    story.append(h2("Buyer journey"))
    story.append(
        numbered(
            [
                "Open an MRP shortage or create a manual sourcing requirement.",
                "Confirm item, quantity, UOM, delivery plant, need date and confidentiality.",
                "Attach a controlled drawing revision, tolerances, tests and certification needs.",
                "Search approved vendors first, then published network suppliers by capability and location.",
                "Invite a shortlist; contacts stay masked until the configured consent point.",
                "Receive immutable quote revisions containing price, tooling, tax, freight, MOQ, capacity, validity, lead time and deviations.",
                "Compare raw facts and an explainable policy score; record the recommendation reason.",
                "Approve the award under separation-of-duties policy and create the existing draft PO through an idempotent writer plus a database-unique award-to-PO key.",
            ]
        )
    )
    story.append(h2("Supplier journey"))
    story.append(
        numbered(
            [
                "Create a lightweight organisation and verify identity, GST and selected evidence.",
                "Publish only chosen capabilities, locations, certifications and catalogue records.",
                "Accept or decline an RFQ invitation; view only the shared package.",
                "Submit or revise a quotation without overwriting earlier revisions.",
                "Respond to structured clarifications inside the RFQ record.",
                "Acknowledge an awarded PO or propose a revised promise for buyer review.",
                "Submit dispatch details and later see the supplier's own receipt and quality outcomes.",
            ]
        )
    )
    story.append(h2("Marketplace state model"))
    story.append(
        data_table(
            ["Object", "Recommended states", "Control"],
            [
                ["RFQ", "Draft -> Published -> Evaluation -> Awarded / Closed / Cancelled", "Only buyer can change lifecycle"],
                ["Quote", "Draft -> Submitted -> Revised / Withdrawn / Expired", "Supplier owns submissions; revisions immutable"],
                ["Award", "Proposed -> Pending approval -> Approved / Rejected -> Converted", "Workflow approval plus idempotent PO conversion"],
                ["Supplier profile", "Draft -> Submitted -> Verified -> Published -> Expired / Suspended", "Evidence-specific verification and freshness"],
            ],
            widths=[28 * mm, 88 * mm, 55 * mm],
            small=True,
        )
    )


def add_quote_comparison(story: list[Flowable]) -> None:
    section_break(story)
    story.extend(h1("8", "RFQ quality, comparison and supplier trust", "A low price is not automatically a good industrial decision. XELOR must make technical deviations, arrival feasibility and quality history visible before any score."))
    story.append(h2("RFQ minimum package"))
    story.append(
        card_grid(
            [
                ("Technical", "Part code, category attributes, material grade, tolerances, drawing revision, substitutes and test method.", BLUE),
                ("Quantity and time", "Quantity, UOM, pack multiple, need date, quote deadline, delivery location and schedule split.", CYAN),
                ("Commercial", "Taxes, freight ownership, tooling/NRE, payment assumptions, warranty and validity.", GREEN),
                ("Quality", "Inspection plan, certificates, sampling, traceability, rejection policy and corrective action.", AMBER),
                ("Confidentiality", "Classification, invited participants, NDA state, file expiry, watermark and access audit.", RED),
                ("Evidence", "Originating demand, requisition, plant, planner, approvals and reason for source selection.", VIOLET),
            ],
            3,
        )
    )
    story.append(h2("Comparison view"))
    story.append(
        data_table(
            ["Factor", "What must be shown", "Illustrative weight"],
            [
                ["Landed cost", "Unit price + tooling + freight + non-creditable tax", "30%"],
                ["Delivery feasibility", "Confirmed dispatch, arrival date, MOQ and capacity", "25%"],
                ["Quality history", "Accepted quantity, rejection, returns and CAPA closure", "20%"],
                ["Delivery history", "On-time-in-full and promise adherence", "15%"],
                ["Compliance", "Required certificates, capability and documentation", "10%"],
            ],
            widths=[42 * mm, 91 * mm, 38 * mm],
        )
    )
    story.append(
        callout(
            "Technical gate before scoring",
            "The buyer first marks each response Pass, Conditional or Fail against the released specification. Failed quotes are excluded. Conditional deviations and equivalent parts require recorded engineering acceptance. Missing history is Unrated, not zero. Start with one-supplier awards; add split awards only after allocation controls are proven. Then show raw facts, explain every weighted score and require a separate authorised approver above policy thresholds; the supplier-profile verifier cannot approve that supplier's award.",
            "amber",
        )
    )
    story.append(h2("Verification must be specific"))
    story.append(p("Replace one vague badge with separate statements: legal identity verified; GST verified; bank account verified; factory visited; capability evidence reviewed; certificate valid until date; buyer reference checked; XELOR transaction history available; profile last updated on date."))
    story.append(p("Capture immutable delivery and inspection events first. Publish a supplier score only after a defined sample threshold; otherwise show <b>Insufficient evidence</b>. Version the formula, disclose its window and confidence, and provide a supplier correction/dispute route. Sponsored visibility must never affect conformity, scoring or award recommendation."))


def add_commercial_flow(story: list[Flowable]) -> None:
    section_break(story)
    story.extend(h1("9", "XELOR Flow: Vyapar-inspired commercial simplicity", "XELOR already owns the order, dispatch, customer invoice and receipt spine. The upgrade should close the quotation, document, payables and everyday usability gaps without replacing working controls."))
    story.append(h3("Quote to cash"))
    story.append(ProcessFlow(["Enquiry", "Revisioned quote", "Accept + order", "Dispatch + invoice", "Share + collect"], [MAGENTA, MAGENTA, BLUE, AMBER, GREEN]))
    story.append(Spacer(1, 2 * mm))
    story.append(h3("Requisition to pay"))
    story.append(ProcessFlow(["Supplier invoice", "Duplicate + tax check", "Three-way match", "Approve + bank handoff", "Settle + reconcile"], [AMBER, RED, VIOLET, BLUE, GREEN]))
    story.append(h2("Target capabilities across phases"))
    story.append(
        bullets(
            [
                "Customer enquiry and revisioned quotation with validity, tax, freight, payment terms and delivery promise.",
                "Branded quote, PO, delivery challan, invoice, credit note, debit note and receipt PDFs.",
                "Audited email and approved WhatsApp delivery using authenticated links for sensitive content.",
                "One-click quote-to-order conversion with no item or term retyping.",
                "Receivables ageing, reminder schedules, collection worklist and party statement.",
                "Supplier invoice capture with duplicate constraints, configurable match tolerances, tax/ITC treatment, PO-GRN-invoice comparison, AP open items and ageing.",
                "Encrypted and masked bank masters; independently verified bank changes with cooling period; maker-checker payment approval; signed bank/API handoff; settlement import, allocation, reversal and reconciliation.",
                "Fast item/customer creation with duplicate checks and controlled Excel onboarding.",
            ]
        )
    )
    story.append(h2("Simplicity standard"))
    story.append(
        data_table(
            ["Vyapar pattern", "XELOR implementation"],
            [
                ["Visible Add Sale / Add Purchase", "Five role-aware daily actions, not module hunting"],
                ["Automatic stock/accounting updates", "Existing domain services continue to post atomically"],
                ["Share via WhatsApp/PDF", "Branded documents, audit and secure link policy"],
                ["Owner-friendly reports", "Plain-language cash, order, stock and risk views backed by ledger data"],
                ["Offline billing", "Bounded draft capture; authoritative stock/finance remains server-confirmed"],
            ],
            widths=[62 * mm, 109 * mm],
        )
    )
    story.append(source_note("[VY-1], [VY-2], [VY-3], [XE-2], [XE-4]."))


def add_mobile_decision(story: list[Flowable]) -> None:
    section_break(story)
    story.extend(h1("10", "XELOR Pocket: the factory in your phone", "The phone must answer what is happening now, what is at risk, what work is mine, what decision is waiting and what I can safely record where I am standing."))
    story.append(
        callout(
            "Product decision",
            "Build a dedicated installable mobile PWA. Do not compress the desktop ERP. Use the same identity and domain services, but a task-first information architecture and low-bandwidth read model.",
            "green",
        )
    )
    story.append(h2("Five destinations"))
    story.append(
        card_grid(
            [
                ("Home", "Role-specific factory pulse and today's priorities.", BLUE),
                ("My Work", "Assigned operations, inspections, receipts, maintenance, RFQs and approvals.", GREEN),
                ("Scan", "Identify machine, item, batch, bin, PO, work order or inspection.", CYAN),
                ("Alerts", "Critical, urgent and attention items with evidence and ownership.", AMBER),
                ("More", "Role-permitted secondary areas, settings, help and sign-out.", VIOLET),
            ],
            3,
        )
    )
    story.append(h2("Persistent context"))
    story.append(p("Every mobile screen shows company, plant, shift where relevant, online/offline state, last synchronisation time and number of queued drafts. Every metric shows its source and freshness state: Fresh, Stale or Unknown."))
    story.append(h2("Record detail order"))
    story.append(ProcessFlow(["Identity", "Current state", "Required action", "Evidence", "History"], [BLUE, CYAN, AMBER, GREEN, VIOLET]))
    story.append(
        callout(
            "No false live status",
            "A number without a fresh accepted source is Stale or Unknown. The phone must never show a machine, order or material condition as green merely because the last value was green.",
            "red",
        )
    )


def add_mobile_mockups(story: list[Flowable]) -> None:
    section_break(story)
    story.extend(h1("11", "Mobile role dashboards", "The following conceptual screens show how different users can see the same factory truth without receiving the same access."))
    usable = PAGE_W - 2 * MARGIN_X
    phone_w = 54 * mm
    gap = (usable - 3 * phone_w) / 2
    phones = [
        PhoneMockup(
            "OWNER PULSE",
            "Plant 01 | Fresh 2m ago",
            [("4", "orders at risk"), ("INR 18L", "overdue AR"), ("2", "machines down"), ("6", "approvals")],
            ["Northstar order due tomorrow", "Bearing shortage affects Line 2", "Furnace downtime 47 minutes"],
            "OPEN DECISION INBOX",
            MAGENTA,
            phone_w,
            context="Plant 01 | Online | Sync 2m | 0 drafts",
        ),
        PhoneMockup(
            "PLANT TODAY",
            "Shift A | 68% complete",
            [("420", "planned units"), ("286", "good units"), ("12", "rejected"), ("3", "blocked jobs")],
            ["WO-104 waiting for material", "Inspection gate pending", "Press P-02 is idle"],
            "VIEW SHIFT WORK",
            BLUE,
            phone_w,
            context="Plant 01 | Online | Shift A | 1 draft",
        ),
        PhoneMockup(
            "PURCHASE",
            "Critical supply work",
            [("7", "open shortages"), ("3", "RFQs closing"), ("5", "quotes to review"), ("2", "late POs")],
            ["BRG-6205 needed in 6 days", "Quote expires at 17:00", "Supplier revised promise"],
            "COMPARE SHORTLIST",
            CYAN,
            phone_w,
            context="All plants | Online | Sync 1m | 0 drafts",
        ),
    ]
    story.append(
        Table(
            [phones],
            colWidths=[phone_w + gap, phone_w + gap, phone_w],
            style=TableStyle(
                [
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (1, 0), gap),
                    ("RIGHTPADDING", (2, 0), (2, 0), 0),
                    ("TOPPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]
            ),
        )
    )
    story.append(Spacer(1, 3 * mm))
    story.append(p("Conceptual mobile screens. Values are illustrative; production screens must read current authorised records and show the source timestamp.", "Caption"))
    story.append(h2("Owner mobile outcome"))
    story.append(p("An owner should understand customer promise risk, production progress, shortages, quality, downtime, dispatch, cash and pending approvals without calling each department. The app should prioritise exceptions and trends, not reproduce every transaction."))
    story.append(PageBreak())
    story.append(h2("Mobile action screens: capture and approval"))
    story.append(p("These concepts demonstrate that Pocket is more than a dashboard. It supports point-of-work evidence and governed decisions while keeping authoritative posting on the server."))
    action_phones = [
        TaskPhoneMockup(
            "RECEIVE MATERIAL",
            "Scan-assisted GRN draft",
            "Plant 01 | Offline | Sync 18m | 2 drafts",
            [("PO", "PO-24051"), ("Supplier", "Mangal Fasteners"), ("Item", "BRG-6205 | 24 EA"), ("Batch", "B240830 | 1 photo")],
            "Offline capture only. Quantity and PO balance will be revalidated online.",
            "SAVE GRN DRAFT",
            CYAN,
            phone_w,
        ),
        TaskPhoneMockup(
            "QUALITY CHECK",
            "Inspection evidence",
            "Plant 01 | Online | Sync now | 0 drafts",
            [("Inspection", "IQC-00821"), ("Feature", "Bore diameter"), ("Reading", "19.98 mm | limit 19.98-20.02"), ("Decision", "HOLD - review required")],
            "Caliper photo and supplier certificate attached; release remains online-only.",
            "SUBMIT DRAFT",
            GREEN,
            phone_w,
        ),
        TaskPhoneMockup(
            "AWARD REVIEW",
            "Evidence before approval",
            "All plants | Online | Sync now | 0 drafts",
            [("RFQ", "RFQ-0098 | 3 quotes"), ("Conforming", "INR 1.84L landed"), ("Delivery", "12 Sep | capacity confirmed"), ("Deviation", "None | score 86/100")],
            "Server rereads the quote revision, authority and separation-of-duties rule.",
            "REVIEW + STEP-UP",
            VIOLET,
            phone_w,
        ),
    ]
    story.append(
        Table(
            [action_phones],
            colWidths=[phone_w + gap, phone_w + gap, phone_w],
            style=TableStyle(
                [
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (1, 0), gap),
                    ("RIGHTPADDING", (2, 0), (2, 0), 0),
                    ("TOPPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]
            ),
        )
    )
    story.append(Spacer(1, 3 * mm))
    story.append(
        callout(
            "Visible state contract",
            "Each screen shows organisation or plant, connectivity, sync age and queued drafts. Bottom navigation remains stable. Offline work is visibly Draft; an approval always reloads authoritative evidence before committing.",
            "blue",
        )
    )


def add_mobile_floor(story: list[Flowable]) -> None:
    section_break(story)
    story.extend(h1("12", "Mobile work on the factory floor", "The phone becomes a controlled point-of-work tool for capture and evidence. It does not become a safety controller or an unrestricted transaction terminal."))
    story.append(
        data_table(
            ["Role", "See", "Safe mobile actions", "Online-only commitments"],
            [
                ["Production supervisor", "Queue, material readiness, progress, rejects, downtime", "Assign operator; start/complete operation; record counts; hold with reason", "Final production posting after validation"],
                ["Operator", "Next job, item, quantity, machine, instruction revision", "Scan, start, good/reject quantity, stop reason, fault photo", "No plan override or cost access"],
                ["Stores", "Expected deliveries, PO balance, bin/batch state", "Scan PO; enter lot/serial; damage photo; GRN draft", "Final GRN and stock posting"],
                ["Quality", "Inspection queue, limits, sampling, prior readings", "Capture readings/photos; complete inspection draft", "Release, scrap, return or stock movement"],
                ["Maintenance", "Assigned work, asset history, downtime, checklist, spares", "Accept job; readings; labour; photos; hold/complete draft", "Safety handback and controlled close"],
            ],
            widths=[30 * mm, 49 * mm, 57 * mm, 35 * mm],
            small=True,
        )
    )
    story.append(h2("Safe scan sequence"))
    story.append(ProcessFlow(["Scan", "Validate tenant + plant", "Show identity + status", "Offer permitted action", "Confirm and post/draft"], [CYAN, BLUE, BLUE, AMBER, GREEN]))
    story.append(
        callout(
            "Machine safety boundary",
            "XELOR Pocket may show accepted equipment evidence and help record maintenance work. It must not control a PLC, robot, interlock or safety function from a general mobile dashboard.",
            "red",
        )
    )
    story.append(h2("Capture media safely"))
    story.append(p("Use photos for damaged material, packaging, faults, repairs, inspections and certificates. Store files in controlled object storage with tenant/transaction metadata, hash, MIME and size validation, malware scan, uploader, capture time, retention and expiring authorised links. OCR and AI create reviewable drafts only."))


def add_mobile_alerts_offline(story: list[Flowable]) -> None:
    section_break(story)
    story.extend(h1("13", "Alerts, approvals and offline boundaries", "Mobile trust depends on clear severity, evidence before action, consistent acknowledgement and honest offline states."))
    story.append(h2("Alert vocabulary"))
    story.append(
        data_table(
            ["Level", "Meaning", "Mobile behaviour", "Example"],
            [
                ["Critical", "Already failed, stopped or breached", "Immediate push, persistent inbox and escalation", "Production-impacting machine down"],
                ["Urgent", "Likely to stop or become late today", "Working-hours push and role escalation", "Late material threatens today's job"],
                ["Attention", "Review before it becomes urgent", "Inbox and digest, normally no interruption", "Quote or certificate nearing expiry"],
            ],
            widths=[24 * mm, 48 * mm, 54 * mm, 45 * mm],
            small=True,
        )
    )
    story.append(p("Notification lifecycle: <b>Seen -> Acknowledged -> Resolved</b>. Store it server-side so phone and desktop agree. Push payloads contain minimal lock-screen information and an authenticated deep link; prices, PII and security details appear only after login."))
    story.append(h2("Offline capability classes"))
    story.append(
        data_table(
            ["Class", "Allowed offline", "Never claim"],
            [
                ["Read snapshot", "Last authorised dashboard, instructions and recent history with visible as-of time", "That cached data is live"],
                ["Capture draft", "Fault note, photos, readings, production counts and GRN draft", "That the business transaction posted"],
                ["Authoritative commit", "Not offline; wait for server validation", "Approval, stock movement, payment, quality release or award"],
            ],
            widths=[34 * mm, 91 * mm, 46 * mm],
        )
    )
    story.append(
        bullets(
            [
                "Every queued operation gets a stable operation ID and idempotency key.",
                "The device records capture time; the server records authoritative commit time.",
                "On sync the server rechecks permission, tenant, plant, document version, quantities and workflow state.",
                "Conflicts return to a person; never use silent last-write-wins.",
                "Cache fields are allow-listed and keyed by tenant plus user; responses are <font name='Courier'>no-store</font> by default. Never cache bank data, drawings, margins, full BOMs or personal data.",
                "Snapshots and drafts have a short policy TTL, no longer than the relevant shift by default. Shared-device handoff clears that user's caches and drafts.",
                "Use a device-bound WebCrypto key where available, attachment size limits and resumable upload. Encryption reduces casual exposure but cannot defeat active XSS on an unlocked session.",
                "Revocation blocks future server access and triggers best-effort purge when the app reconnects; it cannot instantly erase a disconnected lost device.",
                "A successful offline save says <b>Saved as draft</b>, never <b>Posted</b>.",
            ]
        )
    )


def add_mobile_security(story: list[Flowable]) -> None:
    section_break(story)
    story.extend(h1("14", "Mobile security and experience standards", "Factory phones may be personal, shared, low-end, intermittently connected and used near machinery. The design must account for that reality."))
    story.append(h2("Security before production"))
    story.append(
        bullets(
            [
                "Move OIDC access and refresh tokens out of browser-readable session storage into a same-origin BFF session with Secure, HttpOnly and SameSite cookies.",
                "Protect cookie-authenticated mutations with strict same-origin rules, Origin and Sec-Fetch-Site validation, and a per-session CSRF token; rotate sessions and invalidate them on logout.",
                "Use authorization code with PKCE; require MFA/passkeys and recent step-up for privileged awards, payments and administration.",
                "Use separate employee and supplier audiences/scopes. Maintain a device/session registry, remote revoke and best-effort cache purge behavior.",
                "Support personal-device and shared-shift-device modes with different idle locks and retained state.",
                "Keep lock-screen notifications generic and exclude employee PII, customer detail, prices and security evidence.",
                "Record scan, capture, upload, sync, decision and correction events in the audit trail.",
                "Use narrowly scoped, user-initiated camera permission; do not turn geolocation into employee surveillance.",
            ]
        )
    )
    story.append(h2("Mobile UX rules"))
    story.append(
        data_table(
            ["Rule", "Design implication"],
            [
                ["Task-first", "Say Receive material, not open the full Purchase module"],
                ["One-thumb", "Primary controls sit within easy reach and remain stable"],
                ["Large targets", "At least 44-48 px, larger for gloved shop-floor work"],
                ["No wide tables", "Use ranked lists, summaries and drill-down detail"],
                ["Explicit state", "Queued, Draft, Posted, Rejected and Offline use text plus icon"],
                ["Low-end performance", "Restrained motion, small payloads and progressive media upload"],
                ["Local language readiness", "English first, then pilot language; keep item codes and units exact"],
                ["Evidence before decision", "Every approval opens facts and source records first"],
                ["Freshness", "Every cached or delayed number shows last update"],
            ],
            widths=[43 * mm, 128 * mm],
        )
    )


def add_architecture(story: list[Flowable]) -> None:
    section_break(story)
    story.extend(h1("15", "Target technical architecture", "Extend the current Next.js, NestJS and PostgreSQL modular monolith. Do not split into microservices or external search infrastructure before measured scale requires it."))
    story.append(ArchitectureDiagram())
    story.append(Spacer(1, 2 * mm))
    story.append(h2("Key implementation decisions"))
    story.append(
        bullets(
            [
                "Dedicated mobile route group and aggregated <font name='Courier'>/mobile/*</font> APIs so Home does not require 15-20 calls.",
                "Installable PWA manifest, service worker, web push and encrypted short-lived draft storage.",
                "Event-built mobile read model with versioned events, idempotent consumers, projection watermark, lag threshold, dead-letter handling, replay/rebuild and periodic reconciliation. Approvals reread the source document.",
                "PostgreSQL full-text search and pg_trgm for the first supplier catalogue; add a search service only after latency and scale evidence.",
                "Transactional outbox and Valkey/BullMQ for notifications, projections and supplier performance.",
                "Encrypted object storage for drawings, photos and certificates; Gotenberg for controlled commercial PDFs.",
                "Keycloak Organizations before external supplier production use.",
                "Marketplace owns publication and verification; Sourcing owns RFQ, quote and award; Planning exposes requisitions; Purchase owns PO/GRN and the one-time award conversion port; Quality emits inspection facts.",
                "The mobile and supplier layers call existing domain services; they do not recreate stock, tax, quality or approval rules.",
            ]
        )
    )
    story.append(source_note("[XE-3], [XE-4], [XE-5]."))


def add_data_governance(story: list[Flowable]) -> None:
    section_break(story)
    story.extend(h1("16", "Data ownership, marketplace isolation and trust", "Do not combine every factory's private database. Publish a sanitized projection and share transaction data only with explicit participants."))
    story.append(
        data_table(
            ["Zone", "Examples", "Visibility"],
            [
                ["Private tenant", "BOMs, stock, costs, customers, MRP and internal vendor notes", "One buyer company only"],
                ["Supplier private", "Contacts, bank details, unpublished capacity and documents", "Supplier plus authorised verification staff"],
                ["Published network", "Allow-listed supplier_public_snapshot with profile, capability, listing and evidence status", "Cross-tenant read; supplier-owner write"],
                ["Participant transaction", "Immutable rfq_shared_revision, attachment grant, clarification and award", "Buyer plus the named invited supplier"],
                ["Supplier-specific", "One supplier's quote and revisions", "Buyer and that supplier; never competitors"],
                ["Trust evidence", "GRN punctuality, accepted/rejected quantity and dispute outcome", "Raw evidence restricted; aggregate only after sample threshold"],
            ],
            widths=[31 * mm, 82 * mm, 58 * mm],
            small=True,
        )
    )
    story.append(h2("Core new entities"))
    story.append(
        data_table(
            ["Domain", "Entities"],
            [
                ["Supplier network", "supplier_org, supplier_public_snapshot, location, capability, listing, certification, verification, profile_revision"],
                ["Sourcing", "rfq_private, rfq_shared_revision, attachment_grant, invitation, quote_revision, quote_line, comparison_snapshot, award"],
                ["Tenant relationship", "vendor_marketplace_link, approved_supplier_item, supplier_score_period, supplier_risk_event"],
                ["Commercial", "sales_quote_revision, supplier_invoice, three_way_match, payment_proposal, settlement_allocation"],
                ["Mobile", "device_session, notification_recipient, acknowledgement, scan_alias, sync_operation, media_object"],
            ],
            widths=[43 * mm, 128 * mm],
            small=True,
        )
    )
    story.append(
        callout(
            "Enforceable database boundary",
            "Keep restrictive equality-based tenant RLS on private ERP and rfq_private tables. RLS controls rows, not columns, so supplier-visible fields live in a separate immutable rfq_shared_revision. Each invitation/package is keyed by buyer_org_id, participant_org_id, rfq_id and revision; attachment ACLs are separate. A supplier session sets actor_org_id, reads only its matching package and writes quote rows constrained by a composite invitation key. supplier_public_snapshot is the only cross-tenant discovery surface. Test buyer, invited supplier, uninvited supplier, competitor and support roles. Never use BYPASSRLS or database-owner authority.",
            "red",
        )
    )
    story.append(
        callout(
            "Lifecycle and privacy",
            "Store purpose, source, consent, published_by, verified_at, expires_at and withdrawal state. Remove a withdrawn listing from discovery immediately while retaining governed transaction/audit records under the retention and legal-hold policy. Encrypt and mask bank/contact fields, log reasoned access, support correction and takedown, and define supplier suspension and appeal.",
            "amber",
        )
    )


def add_module_changes(story: list[Flowable]) -> None:
    section_break(story)
    story.extend(h1("17", "Repository-grounded module changes", "The implementation should extend current ownership boundaries and preserve the working transaction invariants."))
    rows = [
        ["Engineering", "Item and BOM master", "Category attributes, approved equivalents, listing map and drawing confidentiality"],
        ["Planning", "MRP, pegging and purchase requisitions", "Expose requisition port/event; consume sourcing and arrival status"],
        ["Marketplace (new)", "Data import and vendor evidence patterns", "Published supplier snapshot, capability, catalogue, consent and verification"],
        ["Sourcing (new)", "Purchase requisitions and workflow platform", "RFQ, quote revisions, comparison, clarification, award and acknowledgement"],
        ["Purchase", "Vendor, PO, approval and GRN", "Vendor-marketplace link and unique award-to-PO conversion port"],
        ["Quality", "Inspections, findings and CAPA", "Emit immutable incoming-quality facts; certificate validity and dispute evidence"],
        ["Inventory", "Warehouses, balances and append-only ledger", "Barcode receive/count, package identity and offline draft capture"],
        ["Sales + Accounts", "Order, dispatch, GL, AR invoice and receipt", "Quotation plus AP invoice, match, payment, settlement and reconciliation"],
        ["Production + Maintenance", "Orders, operations, assets, downtime and work orders", "Pocket queues, QR flows, capture, evidence and escalation"],
        ["Integration + Import", "Statutory flows, webhooks, outbox and controlled files", "GST production adapters, messaging/push, supplier callbacks and catalogue import"],
        ["Administration", "Roles, permissions, audit and privacy", "Supplier consent, publication policy, device registry and participant access"],
    ]
    story.append(data_table(["Module", "Existing foundation", "Required extension"], rows, widths=[31 * mm, 62 * mm, 78 * mm], small=True))
    story.append(h2("Important current gaps to close honestly"))
    story.append(
        bullets(
            [
                "Sales quotation and revision lifecycle is absent and documented as a major commercial gap.",
                "Supplier invoice, three-way match and direct-material AP are not complete.",
                "AP delivery also needs duplicate/tax controls, protected bank masters, maker-checker payment, settlement and reconciliation.",
                "Branded PDFs and sharing need production Gotenberg/object-storage integrations.",
                "Statutory e-invoice/e-way results are currently simulated and must not be presented as production filing.",
                "The responsive shell has no installable PWA, service worker or durable offline queue.",
                "Factory Connect is simulator evidence today; phone screens must not claim live telemetry without a real connector.",
            ]
        )
    )
    story.append(source_note("Repository anchors: [XE-1] through [XE-8]."))


def add_phase_zero(story: list[Flowable]) -> None:
    section_break(story)
    story.extend(h1("18", "Phase 0: factory groundwork and production foundations", "Duration: 4-6 weeks. Field operations are part of product development, not a sales activity postponed until after software is built."))
    story.append(h2("Field programme"))
    story.append(
        data_table(
            ["Workstream", "Target", "Output"],
            [
                ["Buyer discovery", "10-15 factories in one cluster", "Recurring shortages, current sourcing flow, approval rules and mobile questions"],
                ["Supplier onboarding", "30-50 suppliers in 2-3 categories", "Capability, machinery, capacity, certificates, service radius and consent"],
                ["Real RFQs", "At least 5 buyer requirements", "Three comparable responses for each qualified requirement"],
                ["Mobile observation", "Owner, buyer, stores, supervisor, operator, quality and maintenance", "Five highest-frequency phone jobs, device and network matrix"],
                ["Data policy", "Buyer, supplier and legal review", "Publication consent, confidentiality, retention and verification policy"],
            ],
            widths=[37 * mm, 48 * mm, 86 * mm],
            small=True,
        )
    )
    story.append(h2("Platform foundations"))
    story.append(
        bullets(
            [
                "Define the Keycloak Organizations mapping, employee/supplier audiences and supplier principal types; prove them in an isolated pilot realm.",
                "Spike encrypted object storage, Gotenberg, observability and malware scanning; production hardening remains a Phase 1 external-pilot gate.",
                "Complete the participant threat model, permission registry and negative cross-participant test design.",
                "Prototype mobile role dashboards at 360-430 px and validate them in real factory lighting and connectivity.",
                "Define supplier category taxonomy, required attributes and verification evidence.",
                "Capture baseline cycle times, quote liquidity, paper delay, approval delay and data quality.",
            ]
        )
    )
    story.append(
        callout(
            "Exit gate",
            "Five real buyer needs in the discovery sample each receive comparable responses from at least three qualified suppliers; the mobile role map, security model, pilot buyers and supplier cohort are committed. This five-of-five learning gate is deliberately stricter than the later operating KPI.",
            "green",
        )
    )


def add_phases(story: list[Flowable]) -> None:
    section_break(story)
    story.extend(h1("19", "Delivery phases", "The sequence productionises one combined proof slice first, then deepens sourcing evidence, finance and safe mobile work before network scale."))
    story.append(
        data_table(
            ["Phase", "Indicative duration", "Primary scope", "Exit gate"],
            [
                ["1. Combined pilot slice", "12-14 weeks", "Sales quotation/PDF; Pocket pulse; supplier basics; requisition-to-RFQ; quote revisions; comparison; award-to-PO; production security foundations", "Enquiry reaches order; real shortage reaches approved draft PO; owner sees it on phone"],
                ["2. Source operational depth", "10-12 weeks", "Catalogue search; secure files; clarification; acknowledgement; GRN/quality events; performance facts and insufficient-evidence scorecard", "Real shortage reaches PO, GRN and quality evidence with no retyping"],
                ["3. Finance completion + Mobile Work", "10-14 weeks", "Supplier invoice; duplicate/tax/match controls; AP; maker-checker payment/settlement; scans; inspections; production/maintenance queues; offline drafts", "PO-to-settled-payment record and selected floor tasks complete in pilot"],
                ["4. Trust and network scale", "12-16 weeks after evidence", "Richer search; certificate expiry; capacity; score publication after sample threshold; disputes; regional language; APIs; multi-site sourcing", "First cluster meets liquidity, quality and repeat-use thresholds"],
                ["5. Ecosystem", "Evidence-led", "Image/spec extraction; explainable matching; partner logistics/payment protection; native app decision", "Only after data, economics and user evidence justify it"],
            ],
            widths=[34 * mm, 26 * mm, 70 * mm, 41 * mm],
            small=True,
        )
    )
    story.append(h2("Priority matrix"))
    story.append(p("P0 means mandatory before general availability of XELOR Unified, not all delivered in the first phase. Phase exit gates still govern sequence.", "Caption"))
    story.append(
        data_table(
            ["P0 - must build", "P1 - should build", "P2 - later"],
            [
                ["Sales quotation and quote-to-order", "Mobile receiving and inspection", "Open public bidding"],
                ["Supplier verification and structured RFQ", "Barcode/QR and offline drafts", "Image-assisted part search"],
                ["Revisioned quotes and landed comparison", "Catalogue bulk import and repeat RFQ", "Managed logistics or escrow"],
                ["Governed award-to-PO", "WhatsApp/email document delivery", "Lending or invoice finance"],
                ["Pocket pulse, alerts and approvals", "Capacity calendar and regional language", "Native apps and national rollout"],
                ["Supplier invoice and three-way match", "Buyer-configured score weights", "Public anonymous reviews"],
            ],
            widths=[57 * mm, 57 * mm, 57 * mm],
            small=True,
        )
    )


def add_mobile_phase_detail(story: list[Flowable]) -> None:
    section_break(story)
    story.extend(h1("20", "Mobile solution phase in detail", "Mobile delivery should grow from visibility to controlled action, then to supplier participation and hardened intermittent-connectivity support."))
    story.append(
        data_table(
            ["Mobile phase", "Scope", "Who benefits", "Acceptance"],
            [
                ["M0. Groundwork", "Observe shifts, devices, network, shared use, labels and five key jobs", "All pilot roles", "Journey, threat and device matrix approved"],
                ["M1. Visibility", "Installable PWA, Home, My Work, alert inbox, evidence deep links and freshness", "Owner, plant head, purchase", "80% of five core scenarios answered without desktop/calls; freshness understood"],
                ["M2. Approvals + capture", "Step-up, scan, production counts, maintenance, inspection, GRN draft, media", "Supervisor, operator, stores, quality, maintenance", "At least 90% success on selected tasks; zero duplicate commits; audit complete"],
                ["M3. Marketplace mobile", "RFQ review, supplier portal, quote revisions, clarifications, shortlist, PO acknowledgement", "Buyer and supplier", "Supported RFQ response and award-review tasks complete without desktop; permission tests pass"],
                ["M4. Hardened offline", "Encrypted queue, resumable media, conflicts, shared device, revoke and multilingual pilot", "Low-connectivity factories", "99% eligible queued sync; injected conflicts resolved; revoke/logout tests pass"],
            ],
            widths=[34 * mm, 69 * mm, 36 * mm, 32 * mm],
            small=True,
        )
    )
    story.append(h2("Actions that remain desktop-led"))
    story.append(
        bullets(
            [
                "BOM engineering, drawing release and complex product configuration.",
                "Finite planning, large quote comparison and multi-line exception analysis.",
                "Role design, segregation-of-duties configuration and bulk administration.",
                "Accounting period close, large reconciliations and statutory configuration.",
                "AI provider configuration, security investigation and complex data imports.",
            ]
        )
    )
    story.append(
        callout(
            "Phone promise",
            "Not everything is editable on a phone. Everything relevant to a user's responsibility should be visible, fresh, understandable and linked to a safe next action.",
            "violet",
        )
    )


def add_team_dependencies(story: list[Flowable]) -> None:
    section_break(story)
    story.extend(h1("21", "Delivery team, sequencing and operating model", "A stable 10-12 person product/engineering team plus field onboarding can deliver the first combined pilot if ownership remains clear and phase gates prevent scope expansion."))
    story.append(h2("Indicative MVP team"))
    story.append(
        data_table(
            ["Role", "Count", "Primary accountability"],
            [
                ["Product lead / manufacturing procurement owner", "1", "Outcome, scope, pilot and workflow truth"],
                ["Technical lead / architect", "1", "Domain boundaries, invariants and integration"],
                ["Backend engineers", "3", "Sourcing, commercial, mobile APIs and participant security"],
                ["Frontend/PWA engineers", "2", "Desktop extensions, Pocket and Supplier Connect"],
                ["Product designer / field researcher", "1", "Role journeys, factory observation and usability"],
                ["QA automation", "1", "E2E, permission, sync and regression coverage"],
                ["Platform/SRE/security", "1", "Identity, storage, observability, delivery and threat controls"],
                ["Data/search engineer", "0.5-1", "Taxonomy, search, normalisation and score processing"],
                ["GST/compliance adviser", "Fractional", "Document and statutory review"],
                ["Field onboarding", "2-4", "Buyer/supplier data, verification and pilot success"],
            ],
            widths=[61 * mm, 23 * mm, 87 * mm],
            small=True,
        )
    )
    story.append(h2("Critical sequencing"))
    story.append(
        numbered(
            [
                "Identity, participant authorization and data classification before supplier portal access.",
                "Object storage security before drawings, certificates or phone photos.",
                "Published supplier projection before cross-tenant search.",
                "RFQ/quote state machine and immutable revisions before comparison UI.",
                "Approval and idempotent award conversion before live procurement use.",
                "Transaction history before supplier scoring or AI recommendations.",
                "Mobile read APIs before dashboards; server validation before offline writes.",
                "Observability and leak probes before external pilot.",
                "PWA telemetry before funding native applications.",
            ]
        )
    )


def add_kpis(story: list[Flowable]) -> None:
    section_break(story)
    story.extend(h1("22", "Pilot scorecard", "Targets are hypotheses for the first cluster. Phase 0 establishes baselines and adjusts targets before commitments."))
    story.append(
        data_table(
            ["Area", "Measures", "Initial target hypothesis"],
            [
                ["Marketplace liquidity", "Qualified RFQs with 3 quotes; first response; award rate; repeat usage", "70% with 3 compliant quotes in 48h; first compliant quote under 8 business hours"],
                ["Procurement", "Shortage-to-RFQ; RFQ-to-PO; approval; OTIF; incoming acceptance", "30% cycle reduction; every marketplace PO captures OTIF and inspection"],
                ["Commercial", "Quote preparation; quote-to-order; dispatch-to-invoice; ageing", "Configured quote under 5 minutes; 100% quote-to-order trace"],
                ["Mobile adoption", "Weekly active users; task completion; approval; alert response", "70% weekly active targeted managers; 60% mobile approval completion"],
                ["Mobile performance", "Interactive time, crash-free sessions, sync and overflow", "p95 under 2.5s on representative 4G; 99% sync; zero horizontal overflow"],
                ["Mobile task quality", "Success, error and time by operator, stores, quality, maintenance, buyer and supplier; conflict recovery; shared-device logout", "At least 90% success in selected pilot tasks; zero duplicate commits; all revoke/logout tests pass"],
                ["Factory capture", "Point-of-work digital events and paper delay", "80% of selected events digital; paper delay reduced 70%"],
                ["Data trust", "Catalogue freshness, stale tiles, alert false positives, first-pass match and disputes", "Baselines in Phase 0; every stale tile visible; every dispute attributable"],
                ["Governance", "Award trace, file audit, idempotency, leakage, negative access tests and verification expiry", "100% trace/audit/idempotency/access-test coverage; zero confirmed leakage"],
                ["Reliability", "API, outbox, read-model lag, restore, RPO/RTO and notification delivery", "99.9% core API in agreed window; outbox p95 under 60s; restore drill meets agreed RPO/RTO"],
            ],
            widths=[35 * mm, 73 * mm, 63 * mm],
            small=True,
        )
    )
    story.append(
        callout(
            "Measurement contract",
            "Before pilot commitment, define qualified RFQ, compliant quote, business-hour calendar, OTIF, sync-success denominator, availability window, representative device/network, alert false positive and first-pass match. Record event start/end, cohort, exclusions, measurement window and metric owner. The Phase 0 five-of-five response gate is a small discovery test; 70% is the later rolling operating hypothesis.",
            "blue",
        )
    )
    story.append(
        callout(
            "North-star metric",
            "Percentage of purchase shortages that become an approved, on-time and quality-accepted supply outcome with no manual re-entry between requirement, quote, PO, receipt and inspection.",
            "green",
        )
    )


def add_risks(story: list[Flowable]) -> None:
    section_break(story)
    story.extend(h1("23", "Principal risks and controls", "The combined solution adds cross-company data, public onboarding, phone access and intermittent connectivity. Those are product risks, not later infrastructure details."))
    story.append(
        data_table(
            ["Risk", "Failure mode", "Control"],
            [
                ["Cold start", "No buyer/supplier liquidity", "Anchor buyers, one cluster, repeat-demand categories and supplier invitations"],
                ["Catalogue quality", "Wrong specification, stale price or duplicate item", "Category schema, UOM normalisation, moderation, deduplication and freshness expiry"],
                ["Fake verification", "Badge implies evidence that was never checked", "Evidence-specific statuses, expiry and factory-visit record"],
                ["Drawing leakage", "Supplier or outsider gets confidential IP", "Separate shared revision, attachment ACL, short link, watermark, audit, expiry and NDA state"],
                ["Quote leakage", "Supplier sees competitor pricing", "Supplier-specific RLS and negative contract tests"],
                ["Bad award", "Cheapest quote wins or conflict is hidden", "Technical pass gate, raw facts, separate approver, conflict declaration and one-time PO constraint"],
                ["Mobile loss", "Exposed data on a lost/shared device", "Short TTL, allow-listed cache, idle lock, best-effort revoke/purge and generic notifications"],
                ["Offline duplication", "Retry posts stock, award or payment twice", "Draft-only offline, operation ID, idempotency and unique constraints"],
                ["Stale status", "Old telemetry appears live", "Mandatory timestamp and fail-to-Unknown"],
                ["Publication/privacy", "Profile or contact used without valid purpose/consent", "Purpose/consent register, masked contacts, withdrawal, rights handling, retention and legal hold"],
                ["Network abuse", "Bulk harvesting, fake RFQs or contact spam", "Rate limits, bot checks, enquiry quotas, enumeration controls, consent and abuse reporting"],
                ["Verification liability", "Incorrect badge harms buyer or supplier", "Evidence wording, expiry, correction/takedown SLA, reviewer audit and limitation policy"],
                ["Dispute/suspension", "Unfair score, takedown or account suspension", "Raw evidence, insufficient-evidence state, correction, appeal and accountable decision"],
                ["Payment fraud", "Duplicate invoice or malicious bank change", "Duplicate/tax/match controls, bank-change cooling, maker-checker, signed handoff and reconciliation"],
                ["Messaging consent", "WhatsApp delivery becomes unsolicited", "Approved templates, recorded opt-in, purpose limit, opt-out and channel preference"],
                ["Scope explosion", "Marketplace, ERP, mobile and finance stall together", "Phase gates, explicit deferred list and one transactional owner"],
                ["Supplier adoption", "Supplier refuses full ERP setup", "Lightweight portal, mobile deep links, Excel import and no ERP requirement"],
                ["AI overreach", "Model publishes, awards or posts", "Draft/explain only; deterministic rules and human gates"],
            ],
            widths=[31 * mm, 59 * mm, 81 * mm],
            small=True,
        )
    )


def add_nongoals(story: list[Flowable]) -> None:
    section_break(story)
    story.extend(h1("24", "Non-goals and decision guardrails", "Explicit boundaries protect the pilot from becoming an unfinishable national marketplace, a retail product and a factory-control system at the same time."))
    story.append(
        card_grid(
            [
                ("No data scraping", "Do not scrape, copy or republish IndiaMART's supplier database. Onboard with consent, imports and permitted integrations.", RED),
                ("No private data publication", "Existing vendors, BOMs, costs, stock, customers and production remain private unless explicitly published through a projection.", RED),
                ("No nationwide launch", "Prove liquidity and transaction outcomes in one cluster and narrow categories first.", AMBER),
                ("No autonomous commerce", "AI cannot publish RFQs, award suppliers, create commitments, release quality or move money without rules and approval.", VIOLET),
                ("No complete offline ERP", "Offline stores snapshots and drafts. Stock, financial and controlled approvals require the server.", BLUE),
                ("No mobile machine control", "The phone is not a PLC, interlock, robot controller or safety device.", RED),
                ("No escrow/lending in MVP", "Use partners later only after legal, operational and economic evidence.", AMBER),
                ("No native-app assumption", "Ship PWA, measure limitations, then decide whether native investment is justified.", CYAN),
                ("No generic retail pivot", "POS and thermal breadth belong in a separate SKU only if XELOR intentionally targets traders.", GREEN),
            ],
            3,
        )
    )
    story.append(h2("Decision tests for every proposed feature"))
    story.append(
        numbered(
            [
                "Does it reduce time or risk in a real factory or sourcing workflow?",
                "Can it reuse the authoritative XELOR domain service rather than duplicate rules?",
                "Is the owner, participant and visibility of its data explicit?",
                "Can the action be audited, reversed or corrected through an owned process?",
                "Does the phone need to act, or only see and route the task?",
                "Is it required for the next phase exit gate, or should it be deferred?",
            ]
        )
    )


def add_90_days(story: list[Flowable]) -> None:
    section_break(story)
    story.extend(h1("25", "First 90 days", "The first quarter spans Phase 0 discovery plus a non-production engineering proof slice. It creates field evidence and closes critical design decisions; it is not a production release."))
    story.append(
        data_table(
            ["Window", "Business and field", "Product and design", "Engineering and controls"],
            [
                ["Days 1-30", "Select cluster/categories; recruit 5 buyers and initial suppliers; observe shifts; collect baseline", "Journey maps; category templates; owner/plant/buyer mobile prototype", "Threat model; identity plan; object storage and permission spike"],
                ["Days 31-60", "Run manual RFQs; verify supplier evidence; test consent and confidentiality", "Clickable Source, Supplier Connect and Pocket prototypes; quotation document design", "Sales quote schema/API; supplier projection; participant RLS tests; mobile read endpoint"],
                ["Days 61-90", "Complete first pilot RFQ and revise policies from failures", "Usability test at factory and supplier sites; approve Phase 1 backlog", "Non-production slice: requisition -> RFQ -> quote -> approved draft PO; installable read-only Pocket shell"],
            ],
            widths=[25 * mm, 51 * mm, 48 * mm, 47 * mm],
            small=True,
        )
    )
    story.append(h2("Day-90 demonstration"))
    story.append(ProcessFlow(["Real shortage", "Invite 3 suppliers", "Receive 3 quotes", "Approve one", "Open draft PO + phone pulse"], [BLUE, CYAN, CYAN, VIOLET, GREEN]))
    story.append(
        callout(
            "Do not fake the demonstration",
            "The requirement, supplier responses, permission boundaries, approval and PO link must be real pilot records. Clearly label the slice non-production and identify every identity, storage, payment, logistics, telemetry or statutory control that still requires Phase 1 hardening.",
            "amber",
        )
    )


def add_recommendation(story: list[Flowable]) -> None:
    section_break(story)
    story.extend(h1("26", "Final recommendation", "Build the shortest credible proof slice that connects supply, factory evidence and mobile visibility, then extend it through receipt, quality, production, billing and cash under explicit phase gates."))
    story.append(
        callout(
            "Proceed",
            "Fund Phase 0 and Phase 1 around one buyer cluster, one controlled supplier cohort and the combined shortage-to-approved-PO plus mobile factory-pulse proof slice. Do not call it a complete loop until receipt, quality, production, billing and cash are demonstrated.",
            "green",
        )
    )
    story.append(h2("The product in one sentence"))
    story.append(p("XELOR is the industrial operating system that helps a manufacturer find qualified supply, run the factory, bill and control cash, and understand what needs attention from a phone - while keeping private data isolated and every material decision governed.", "Quote"))
    story.append(Spacer(1, 4 * mm))
    story.append(h2("The operating loop"))
    story.append(ProcessFlow(["SOURCE", "RUN", "SEE", "COLLECT", "PROVE"], [CYAN, BLUE, MAGENTA, AMBER, GREEN], 34 * mm))
    story.append(h2("Why this wins"))
    story.append(
        bullets(
            [
                "Supplier breadth becomes useful because it begins with a real factory requirement.",
                "Simple mobile access becomes trustworthy because it reads the same governed records as desktop.",
                "Commercial convenience becomes defensible because documents connect to planning, stock, quality and ledger evidence.",
                "Supplier trust improves over time because ratings come from actual delivery and inspection outcomes.",
                "XELOR remains differentiated from marketplaces, billing tools and generic ERPs by closing the industrial loop.",
            ]
        )
    )


def add_appendix_screens(story: list[Flowable]) -> None:
    section_break(story)
    story.extend(h1("Appendix A", "Proposed screen inventory", "This is a product inventory for estimation, not a commitment to ship every screen in the first release."))
    rows = [
        ["Source - buyer", "Supplier search; supplier profile; requisition-to-RFQ; RFQ detail; invitations; clarification; comparison; award review; sourcing history"],
        ["Supplier Connect", "Onboarding; verification; company profile; capability; catalogue; RFQ inbox; quote editor; quote history; PO acknowledgement; shipment update; performance"],
        ["Flow - sales", "Enquiry; quotation list; quote editor; revision compare; acceptance; PDF/share; order conversion; invoice register; reminder worklist"],
        ["Flow - purchase/AP", "Supplier invoice inbox; duplicate/tax checks; match workbench; AP ageing; bank-change review; maker-checker payment; settlement allocation; reconciliation; debit note; vendor statement"],
        ["Pocket - common", "Home; My Work; Scan; Alerts; More; evidence detail; approval detail; sync queue; device/security; notification settings"],
        ["Pocket - production", "Today queue; operation detail; start/complete; counts; blocker; handover"],
        ["Pocket - stores", "Expected deliveries; PO scan; receipt draft; batch/serial capture; issue material; stock lookup/count"],
        ["Pocket - quality", "Inspection queue; characteristic capture; evidence upload; completion; hold/disposition status"],
        ["Pocket - maintenance", "Assigned jobs; asset scan; fault report; downtime; task checklist; spares; labour; evidence; handback"],
        ["Pocket - owner/manager", "Factory pulse; order risk; production; downtime; quality; supply; cash; approvals; daily digest"],
    ]
    story.append(data_table(["Surface", "Proposed screens"], rows, widths=[42 * mm, 129 * mm], small=True))
    story.append(h2("Shared design components"))
    story.append(p("Evidence panel; freshness badge; participant badge; approval footer; secure attachment; status history; exception explanation; empty/error/offline states; scan result; draft/sync banner; role-aware action tray; searchable item/supplier picker; audit disclosure."))


def add_appendix_sources(story: list[Flowable]) -> None:
    section_break(story)
    story.extend(h1("Appendix B", "Evidence and source register", "External product facts were checked against current official pages and filings on 30 August 2026. Repository statements refer to local XELOR-MVP commit d329f09be626 on the same date."))
    sources = [
        ("IM-1", "IndiaMART Q1 FY27 Investor Presentation", "https://investor.indiamart.com/files/IndiaMART_Q1FY27_Earnings_Presentation_Final.pdf"),
        ("IM-2", "IndiaMART FY2025-26 Integrated Annual Report", "https://nsearchives.nseindia.com/corporate/INDIAMART_02062026160515_Submission_of_AGM_Notice_and_AR.pdf"),
        ("IM-3", "IndiaMART Payment Protection", "https://buyer.indiamart.com/payment-protection"),
        ("IM-4", "IndiaMART marketplace homepage", "https://www.indiamart.com/"),
        ("VY-1", "Vyapar India product homepage", "https://vyaparapp.in/"),
        ("VY-2", "Vyapar plans and pricing", "https://vyaparapp.in/pricing/"),
        ("VY-3", "Vyapar manufacturing product page", "https://vyaparapp.in/manufacturing"),
        ("VY-4", "Vyapar Android listing", "https://play.google.com/store/apps/details?id=in.android.vyapar"),
        ("VY-5", "Vyapar offline billing guide", "https://vyaparapp.in/videos/how-to-do-offline-billing-in-vyapar-app"),
        ("VY-6", "Vyapar quotation guide", "https://vyaparapp.in/videos/how-to-create-quotation-in-vyapar"),
    ]
    external_rows = []
    for code, title, url in sources:
        external_rows.append([code, f"<link href='{url}' color='#1D4ED8'>{title}</link>", "Official source"])
    story.append(h2("External sources"))
    story.append(data_table(["Code", "Source", "Type"], external_rows, widths=[22 * mm, 114 * mm, 35 * mm], small=True))
    story.append(h2("XELOR repository evidence"))
    repo_rows = [
        ["XE-1", "docs/00-project/02-complete-project-context-and-business-model-input.md", "Product context and target customer"],
        ["XE-2", "docs/02-investor-demo/02-capability-gaps.md", "Quotation, AP and production-readiness gaps"],
        ["XE-3", "docs/00-project/01-technology-stack.md", "Architecture, RLS, outbox and planned production services"],
        ["XE-4", "README.md:226,1306", "FORCE RLS posture, permission truth and documented boundaries"],
        ["XE-5", "packages/db/src/client.ts:25-38; schema/engineering.ts:14; planning.ts:229,452; purchase.ts:22,40,87", "Tenant fence plus item/BOM, MRP, requisition, vendor, PO and GRN anchors"],
        ["XE-6", "schema/sales.ts:39,116; accounts.ts:99,130; platform.ts:30,46", "Sales order, dispatch, AR, receipts, outbox and audit anchors"],
        ["XE-7", "apps/web/src/spine/auth/session.tsx:20-25; shell/app-shell.tsx:63; app/globals.css:500; modules/registry.ts", "Current token storage, responsive shell and module registry"],
        ["XE-8", "docs/01-agent-os/06-factory-connect.md:9-16", "Simulator boundary and telemetry truth"],
    ]
    story.append(data_table(["Code", "Repository reference", "Purpose"], repo_rows, widths=[22 * mm, 93 * mm, 56 * mm], small=True))
    story.append(Spacer(1, 3 * mm))
    story.append(
        callout(
            "Interpretation note",
            "IndiaMART and Vyapar capabilities are used as design inspiration. This blueprint does not imply permission to copy their data, branding, proprietary implementation or customer relationships.",
            "amber",
        )
    )


def build_story() -> list[Flowable]:
    story: list[Flowable] = []
    add_cover(story)
    add_executive_brief(story)
    add_contents(story)
    add_competitor_lessons(story)
    add_product_system(story)
    add_personas(story)
    add_north_star_flow(story)
    add_marketplace_journeys(story)
    add_quote_comparison(story)
    add_commercial_flow(story)
    add_mobile_decision(story)
    add_mobile_mockups(story)
    add_mobile_floor(story)
    add_mobile_alerts_offline(story)
    add_mobile_security(story)
    add_architecture(story)
    add_data_governance(story)
    add_module_changes(story)
    add_phase_zero(story)
    add_phases(story)
    add_mobile_phase_detail(story)
    add_team_dependencies(story)
    add_kpis(story)
    add_risks(story)
    add_nongoals(story)
    add_90_days(story)
    add_recommendation(story)
    add_appendix_screens(story)
    add_appendix_sources(story)
    return story


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = XelorDocTemplate(str(OUTPUT))
    doc.multiBuild(build_story())
    print(OUTPUT)


if __name__ == "__main__":
    main()
