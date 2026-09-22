"""Render report.md to a polished PDF, then extract text and render QA images.

Run authoring only after the artifact-operation marker has succeeded.
Importing this module has no write or rendering side effects.
"""
from __future__ import annotations
import argparse
import html
import json
import re
from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate, Frame, PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parent
DEFAULT_INPUT = ROOT / "report.md"
DEFAULT_OUTPUT = ROOT / "output" / "pdf" / "India_Manufacturing_Decision_Report.pdf"
DEFAULT_QA = ROOT / "tmp" / "pdfs"
PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 43
CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN
DASH_TRANSLATION = str.maketrans({
    "\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2013": "-",
    "\u2014": "-", "\u2212": "-", "\u00a0": " ", "\u202f": " ",
    "\u200b": "", "\ufeff": "",
})

def normalise(text: str) -> str:
    return text.translate(DASH_TRANSLATION)

def register_fonts() -> None:
    if "ReportArial" in pdfmetrics.getRegisteredFontNames():
        return
    folder = Path("C:/Windows/Fonts")
    candidates = [
        ("ReportArial", "arial.ttf"), ("ReportArial-Bold", "arialbd.ttf"),
        ("ReportArial-Italic", "ariali.ttf"), ("ReportArial-BoldItalic", "arialbi.ttf"),
    ]
    missing = [f for _, f in candidates if not (folder / f).is_file()]
    if missing:
        raise FileNotFoundError("Required Unicode fonts missing: " + ", ".join(missing))
    for name, filename in candidates:
        pdfmetrics.registerFont(TTFont(name, str(folder / filename)))
    pdfmetrics.registerFontFamily("ReportArial", normal="ReportArial", bold="ReportArial-Bold",
                                  italic="ReportArial-Italic", boldItalic="ReportArial-BoldItalic")

def make_styles() -> dict[str, ParagraphStyle]:
    body = ParagraphStyle("Body", fontName="ReportArial", fontSize=10.2, leading=14,
        textColor=colors.HexColor("#161616"), alignment=TA_LEFT, allowWidows=0,
        allowOrphans=0, splitLongWords=1, spaceAfter=7.5)
    return {
        "body": body,
        "title": ParagraphStyle("Title", parent=body, fontName="ReportArial-Bold",
            fontSize=23, leading=28, spaceAfter=20, keepWithNext=True),
        "h2": ParagraphStyle("H2", parent=body, fontName="ReportArial-Bold",
            fontSize=15, leading=19, spaceBefore=15, spaceAfter=9, keepWithNext=True),
        "h3": ParagraphStyle("H3", parent=body, fontName="ReportArial-Bold",
            fontSize=11.5, leading=15, spaceBefore=10, spaceAfter=6, keepWithNext=True),
        "bullet": ParagraphStyle("Bullet", parent=body, leftIndent=13,
            firstLineIndent=0, bulletIndent=0, spaceAfter=5),
        "table": ParagraphStyle("TableCell", parent=body, fontSize=9, leading=12,
            spaceBefore=0, spaceAfter=0, allowWidows=1, allowOrphans=1),
        "table_header": ParagraphStyle("TableHeader", parent=body,
            fontName="ReportArial-Bold", fontSize=9, leading=12,
            spaceBefore=0, spaceAfter=0, allowWidows=1, allowOrphans=1),
        "reference": ParagraphStyle("Reference", parent=body, fontSize=8.8, leading=12,
            leftIndent=17, firstLineIndent=-17, spaceAfter=7, allowWidows=1, allowOrphans=1),
    }

FOOTNOTE_DEF = re.compile(r"^\[\^([^\]]+)\]:\s*(.*)$")
LINK_PATTERN = re.compile(r"\[([^\]\n]+)\]\((https?://[^\s]+?)\)")
TOKEN_PATTERN = re.compile(
    r"(\[\^([^\]]+)\]|\[([^\]\n]+)\]\((https?://[^\s]+?)\)"
    r"|\*\*(.+?)\*\*|\x60([^\x60]+)\x60|\*([^*\n]+)\*)"
)

def extract_footnotes(text: str) -> tuple[str, dict[str, str]]:
    body: list[str] = []
    footnotes: dict[str, str] = {}
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        match = FOOTNOTE_DEF.match(lines[i].strip())
        if match:
            key, definition = match.groups()
            continuation = [definition]
            i += 1
            while i < len(lines) and lines[i].startswith(("  ", "\t")):
                continuation.append(lines[i].strip())
                i += 1
            if key in footnotes:
                raise ValueError(f"Duplicate footnote definition: {key}")
            footnotes[key] = " ".join(continuation)
            continue
        body.append(lines[i])
        i += 1
    return "\n".join(body), footnotes

def source_url(definition: str) -> str | None:
    match = LINK_PATTERN.search(definition)
    if match:
        return match.group(2)
    match = re.search(r"https?://[^\s<>]+", definition)
    return match.group(0).rstrip(".,;") if match else None

def inline(text: str, footnotes: dict[str, str]) -> str:
    text = normalise(text).replace("\\|", "|")
    output: list[str] = []
    position = 0
    for match in TOKEN_PATTERN.finditer(text):
        output.append(html.escape(text[position:match.start()], quote=False))
        token, footnote, label, url, bold, code, italic = match.groups()
        if footnote is not None:
            if footnote not in footnotes:
                raise ValueError(f"Footnote has no definition: {footnote}")
            target = source_url(footnotes[footnote])
            number = '[' + html.escape(footnote, quote=False) + ']'
            if target:
                output.append('<super><link href="' + html.escape(target, quote=True)
                              + '" color="#202020">' + number + "</link></super>")
            else:
                output.append("<super>" + number + "</super>")
        elif label is not None:
            output.append('<link href="' + html.escape(url, quote=True)
                          + '" color="#222222"><u>' + inline(label, footnotes) + "</u></link>")
        elif bold is not None:
            output.append("<b>" + inline(bold, footnotes) + "</b>")
        elif code is not None:
            output.append(html.escape(code, quote=False))
        elif italic is not None:
            output.append("<i>" + inline(italic, footnotes) + "</i>")
        position = match.end()
    output.append(html.escape(text[position:], quote=False))
    return "".join(output)

def split_table_row(line: str) -> list[str]:
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|") and not line.endswith("\\|"):
        line = line[:-1]
    return [cell.strip() for cell in re.split(r"(?<!\\)\|", line)]

def is_separator(line: str) -> bool:
    cells = split_table_row(line)
    return bool(cells) and all(re.fullmatch(r":?-{3,}:?", cell.strip()) for cell in cells)

def paragraph(content: str, style: ParagraphStyle, notes: dict[str, str]) -> Paragraph:
    return Paragraph(inline(content, notes), style)

def markdown_blocks(text: str) -> tuple[list[tuple[str, Any]], dict[str, str]]:
    text, notes = extract_footnotes(normalise(text))
    lines = text.splitlines()
    blocks: list[tuple[str, Any]] = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        if re.fullmatch(r"<!--\s*PAGEBREAK\s*-->", line, flags=re.I):
            blocks.append(("pagebreak", None))
            i += 1
            continue
        if line.startswith("<!--"):
            while i < len(lines) and "-->" not in lines[i]:
                i += 1
            i += 1
            continue
        heading = re.match(r"^(#{1,6})\s+(.+?)\s*#*$", line)
        if heading:
            blocks.append((f"h{min(len(heading.group(1)), 3)}", heading.group(2)))
            i += 1
            continue
        if "|" in line and i + 1 < len(lines) and is_separator(lines[i + 1]):
            rows = [split_table_row(line)]
            i += 2
            while i < len(lines) and "|" in lines[i] and lines[i].strip():
                rows.append(split_table_row(lines[i]))
                i += 1
            columns = len(rows[0])
            for row_number, row in enumerate(rows, 1):
                if len(row) != columns:
                    raise ValueError(f"Table row {row_number}: {len(row)} cells, expected {columns}: {row}")
            blocks.append(("table", rows))
            continue
        bullet = re.match(r"^([-+*]|\d+[.)])\s+(.+)$", line)
        if bullet:
            marker, content = bullet.groups()
            i += 1
            while (i < len(lines) and lines[i].startswith(("  ", "\t"))
                   and lines[i].strip() and not re.match(r"^\s*[-+*]\s+", lines[i])):
                content += " " + lines[i].strip()
                i += 1
            blocks.append(("bullet", (marker, content)))
            continue
        if re.fullmatch(r"(?:-{3,}|\*{3,}|_{3,})", line):
            blocks.append(("space", None))
            i += 1
            continue
        pieces = [line]
        i += 1
        while i < len(lines) and lines[i].strip():
            nxt = lines[i].strip()
            if (nxt.startswith(("# ", "## ", "### ", "<!--"))
                or re.match(r"^([-+*]|\d+[.)])\s+", nxt)
                or ("|" in nxt and i + 1 < len(lines) and is_separator(lines[i + 1]))):
                break
            pieces.append(nxt)
            i += 1
        blocks.append(("paragraph", " ".join(pieces)))
    return blocks, notes

class ReportDocument(BaseDocTemplate):
    def __init__(self, filename: str, **kwargs: Any) -> None:
        super().__init__(filename, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN,
            topMargin=MARGIN, bottomMargin=MARGIN,
            title="India Manufacturing Decision Report", author="",
            subject="Manufacturing investment options for Bengaluru, India",
            allowSplitting=1, pageCompression=1, **kwargs)
        frame = Frame(MARGIN, MARGIN, CONTENT_WIDTH, PAGE_HEIGHT - 2 * MARGIN,
            id="main", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        self.addPageTemplates(PageTemplate(id="report", frames=frame, onPage=self.page_number))
        self._bookmark_counter = 0

    @staticmethod
    def page_number(canvas, doc) -> None:
        canvas.saveState()
        canvas.setFont("ReportArial", 8)
        canvas.setFillColor(colors.HexColor("#555555"))
        canvas.drawCentredString(PAGE_WIDTH / 2, 23, str(doc.page))
        canvas.restoreState()

    def afterFlowable(self, flowable) -> None:
        if isinstance(flowable, Paragraph) and flowable.style.name in ("Title", "H2", "H3"):
            self._bookmark_counter += 1
            key = f"section-{self._bookmark_counter}"
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(flowable.getPlainText(), key, level=0, closed=False)

def build_story(text: str) -> tuple[list, dict[str, Any]]:
    register_fonts()
    styles = make_styles()
    blocks, notes = markdown_blocks(text)
    story: list = []
    sources_heading_seen = False
    citations = set(re.findall(r"\[\^([^\]]+)\]", extract_footnotes(text)[0]))
    missing = citations.difference(notes)
    if missing:
        raise ValueError("Missing footnote definitions: " + ", ".join(sorted(missing)))
    for kind, data in blocks:
        if kind == "pagebreak":
            if story and not isinstance(story[-1], PageBreak):
                story.append(PageBreak())
        elif kind == "space":
            story.append(Spacer(1, 5))
        elif kind in ("h1", "h2", "h3"):
            style = {"h1": "title", "h2": "h2", "h3": "h3"}[kind]
            if kind in ("h1", "h2") and re.match(
                r"^(?:\d+[.)]?\s+)?(?:sources|references|sources and references)\b", data, flags=re.I):
                sources_heading_seen = True
            story.append(paragraph(data, styles[style], notes))
        elif kind == "paragraph":
            story.append(paragraph(data, styles["body"], notes))
        elif kind == "bullet":
            marker, content = data
            story.append(Paragraph(inline(content, notes), styles["bullet"],
                                   bulletText="-" if marker in ("-", "+", "*") else marker))
        elif kind == "table":
            columns = len(data[0])
            if columns == 1:
                widths = [CONTENT_WIDTH]
            elif columns == 2:
                widths = [CONTENT_WIDTH * 0.40, CONTENT_WIDTH * 0.60]
            elif columns == 3:
                header = ' '.join(data[0]).lower()
                ratios = [0.31, 0.20, 0.49]
                if 'use of funds' in header:
                    ratios = [0.34, 0.12, 0.54]
                elif 'cash-cycle' in header:
                    ratios = [0.36, 0.46, 0.18]
                elif 'period' in header:
                    ratios = [0.16, 0.55, 0.29]
                widths = [CONTENT_WIDTH * value for value in ratios]
            elif columns == 5:
                widths = [CONTENT_WIDTH * value for value in [0.32,0.16,0.14,0.20,0.18]]
            else:
                first = CONTENT_WIDTH * (0.30 if columns <= 4 else 0.24)
                widths = [first] + [(CONTENT_WIDTH - first) / (columns - 1)] * (columns - 1)
            cells = [[paragraph(cell, styles["table_header" if idx == 0 else "table"], notes)
                      for cell in row] for idx, row in enumerate(data)]
            table = Table(cells, colWidths=widths, repeatRows=1, hAlign="LEFT",
                          splitByRow=1, splitInRow=0, spaceBefore=3, spaceAfter=10)
            table.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E9E9E9")),
                ("LINEBELOW", (0, 0), (-1, 0), 0.7, colors.HexColor("#444444")),
                ("LINEBELOW", (0, 1), (-1, -1), 0.35, colors.HexColor("#CCCCCC")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8F8F8")]),
            ]))
            story.append(table)
    if notes:
        if not sources_heading_seen:
            story.extend([Spacer(1, 6), paragraph("Sources", styles["h2"], notes)])
        for number, definition in notes.items():
            story.append(Paragraph("<b>" + html.escape(number, quote=False) + ".</b> "
                                   + inline(definition, notes), styles["reference"]))
    return story, {
        "blocks": len(blocks), "tables": sum(kind == "table" for kind, _ in blocks),
        "footnote_definitions": len(notes), "distinct_citations": len(citations),
        "uncited_definitions": [key for key in notes if key not in citations],
    }

def qa_pdf(pdf_path: Path, qa_dir: Path, dpi: int = 100) -> dict[str, Any]:
    import fitz
    from PIL import Image, ImageDraw, ImageFont
    qa_dir.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(str(pdf_path))
    extracted: list[str] = []
    links = 0
    overflow: list[dict] = []
    page_images: list[Path] = []
    page_meta: list[dict] = []
    zoom = dpi / 72.0
    for idx, page in enumerate(doc):
        number = idx + 1
        page_text = page.get_text("text")
        extracted.append(f"--- PAGE {number} ---\n{page_text}")
        page_links = len(page.get_links())
        links += page_links
        image_path = qa_dir / f"page-{number}.png"
        page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False).save(str(image_path))
        page_images.append(image_path)
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    x0, y0, x1, y1 = span["bbox"]
                    if x0 < 0 or y0 < 0 or x1 > page.rect.width + .5 or y1 > page.rect.height + .5:
                        overflow.append({"page": number, "bbox": span["bbox"], "text": span["text"]})
        page_meta.append({"page": number, "characters": len(page_text), "links": page_links,
                          "image": str(image_path)})
    text_path = qa_dir / "extracted-text.txt"
    text_path.write_text("\n\n".join(extracted), encoding="utf-8")
    label_font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 18)
    sheets: list[str] = []
    for start in range(0, len(page_images), 4):
        batch = page_images[start:start + 4]
        thumb_width = 610
        thumb_height = round(thumb_width * PAGE_HEIGHT / PAGE_WIDTH)
        gap, label_height = 22, 28
        sheet = Image.new("RGB",
            (2 * thumb_width + 3 * gap, 2 * (thumb_height + label_height) + 3 * gap), "white")
        draw = ImageDraw.Draw(sheet)
        for local, image_path in enumerate(batch):
            with Image.open(image_path) as image:
                image = image.convert("RGB")
                image.thumbnail((thumb_width, thumb_height), Image.Resampling.LANCZOS)
                x = gap + (local % 2) * (thumb_width + gap)
                y = gap + (local // 2) * (thumb_height + label_height + gap)
                draw.text((x, y), f"Page {start + local + 1}", font=label_font, fill="#222222")
                sheet.paste(image, (x, y + label_height))
                draw.rectangle((x, y + label_height, x + image.width - 1,
                                y + label_height + image.height - 1), outline="#CCCCCC", width=1)
        sheet_path = qa_dir / f"contact-sheet-{start // 4 + 1}.png"
        sheet.save(sheet_path)
        sheets.append(str(sheet_path))
    result = {
        "pdf": str(pdf_path), "pages": len(doc), "clickable_links": links,
        "page_details": page_meta, "page_bounds_overflow": overflow,
        "replacement_character_count": sum(s.count("\ufffd") for s in extracted),
        "black_square_count": sum(s.count("\u25a0") for s in extracted),
        "text_file": str(text_path), "contact_sheets": sheets,
    }
    doc.close()
    (qa_dir / "qa-report.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--qa-dir", type=Path, default=DEFAULT_QA)
    parser.add_argument("--check-only", action="store_true", help="Parse only; do not author a PDF.")
    parser.add_argument("--skip-qa", action="store_true")
    args = parser.parse_args()
    story, metadata = build_story(args.input.read_text(encoding="utf-8-sig"))
    if args.check_only:
        print(json.dumps({"parse_ok": True, **metadata}, ensure_ascii=False, indent=2))
        return
    args.output.parent.mkdir(parents=True, exist_ok=True)
    ReportDocument(str(args.output)).build(story)
    result = {"created": str(args.output), **metadata}
    if not args.skip_qa:
        result.update(qa_pdf(args.output, args.qa_dir))
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
