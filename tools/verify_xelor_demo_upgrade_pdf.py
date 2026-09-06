from __future__ import annotations

import argparse
import json
from pathlib import Path

import fitz
from PIL import Image, ImageDraw, ImageOps
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PDF = ROOT / "output" / "pdf" / "XELOR_DEMO_UPGRADE_TECHNICAL_IMPLEMENTATION_BLUEPRINT.pdf"
DEFAULT_RENDER_DIR = ROOT / "tmp" / "pdfs" / "demo-upgrade-v2"

REQUIRED_TEXT = [
    "Executive implementation decision",
    "Current GitHub baseline",
    "IndiaMART, Vyapar and Datastride lessons",
    "Workflow A: customer order to governed mission",
    "Workflow B: factory evidence to controlled recovery",
    "Target architecture and trust boundary",
    "Codebase ownership map",
    "Mandatory disclosure",
    "Final recommendation",
    "Codebase manifest SHA-256",
]


def render_and_check(pdf_path: Path, render_dir: Path) -> dict:
    if not pdf_path.exists():
        raise SystemExit(f"PDF not found: {pdf_path}")

    render_dir.mkdir(parents=True, exist_ok=True)
    reader = PdfReader(str(pdf_path))
    document = fitz.open(str(pdf_path))
    all_text = "\n".join((page.extract_text() or "") for page in reader.pages)

    missing = [phrase for phrase in REQUIRED_TEXT if phrase not in all_text]
    blank_pages: list[int] = []
    out_of_bounds: list[dict] = []
    link_count = 0
    rendered: list[Path] = []

    for index, page in enumerate(document):
        if len(page.get_text("text").strip()) < 40:
            blank_pages.append(index + 1)
        rect = page.rect
        for block in page.get_text("blocks"):
            x0, y0, x1, y1 = block[:4]
            if x0 < -1 or y0 < -1 or x1 > rect.width + 1 or y1 > rect.height + 1:
                out_of_bounds.append(
                    {
                        "page": index + 1,
                        "box": [round(x0, 1), round(y0, 1), round(x1, 1), round(y1, 1)],
                    }
                )
        link_count += len(page.get_links())
        pixmap = page.get_pixmap(matrix=fitz.Matrix(1.6, 1.6), alpha=False)
        output = render_dir / f"page-{index + 1:02d}.png"
        pixmap.save(str(output))
        rendered.append(output)

    contact_sheets = create_contact_sheets(rendered, render_dir)
    summary = {
        "pages": len(reader.pages),
        "metadata": {str(key): str(value) for key, value in (reader.metadata or {}).items()},
        "outlines": len(reader.outline),
        "links": link_count,
        "missingRequiredText": missing,
        "blankPages": blank_pages,
        "outOfBoundsTextBlocks": out_of_bounds,
        "pdfBytes": pdf_path.stat().st_size,
        "renderedPages": len(rendered),
        "contactSheets": len(contact_sheets),
    }
    if missing or blank_pages or out_of_bounds:
        print(json.dumps(summary, indent=2))
        raise SystemExit("PDF verification failed")
    return summary


def create_contact_sheets(rendered: list[Path], render_dir: Path) -> list[Path]:
    outputs: list[Path] = []
    thumb_width = 520
    thumb_height = 736
    cell_width = thumb_width + 20
    cell_height = thumb_height + 45

    for start in range(0, len(rendered), 4):
        sheet = Image.new("RGB", (cell_width * 2 + 20, cell_height * 2 + 15), "#D9DEE6")
        draw = ImageDraw.Draw(sheet)
        for slot, path in enumerate(rendered[start : start + 4]):
            image = Image.open(path).convert("RGB")
            image.thumbnail((thumb_width, thumb_height))
            column = slot % 2
            row = slot // 2
            x = 20 + column * cell_width
            y = 30 + row * cell_height
            sheet.paste(ImageOps.expand(image, border=1, fill="#8B96A7"), (x, y))
            draw.text((x, y - 20), f"PAGE {start + slot + 1}", fill="#0B1A2E")
        output = render_dir / f"contact-{start // 4 + 1:02d}.jpg"
        sheet.save(output, quality=90)
        outputs.append(output)
    return outputs


def main() -> None:
    parser = argparse.ArgumentParser(description="Render and verify the XELOR demo upgrade PDF.")
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    parser.add_argument("--render-dir", type=Path, default=DEFAULT_RENDER_DIR)
    args = parser.parse_args()
    summary = render_and_check(args.pdf, args.render_dir)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
