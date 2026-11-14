"""Extract a searchable, provenance-rich inventory from the KFCT recipe book.

Run with pypdf available, for example:
    uv run --no-project --with pypdf python -m app.ingestion.import_kfct_recipe_book

This creates review candidates containing each recipe's source text. It does
not infer recipe ingredients or nutrient values from ambiguous PDF layouts.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any

from pypdf import PdfReader  # type: ignore[import-not-found]  # pypdf is not a declared dependency

SOURCE_ID = "kfct-recipes-2018"
SOURCE_CITATION = (
    "FAO/Government of Kenya. 2018. Kenyan food recipes: A recipe book of "
    "common mixed dishes with nutrient value. Nairobi, FAO."
)
EXPECTED_RECIPES = 142
CODE_HEADING = re.compile(r"KFCT\s+Code\s+([0-9]{5})\s*(?:\((r)\))?", re.IGNORECASE)
APPENDIX_15083 = re.compile(
    r"\b15083\s+Kimanga\s+cha\s+Ndizi\s*\(Smoked Green Bananas and Kidney Beans\)",
    re.IGNORECASE,
)


def _clean_title(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\t", " ")).strip(" |\u00a0")


def _find_source_page(text: str, offset: int) -> int | None:
    pages = list(re.finditer(r"=== PDF PAGE (\d+) ===", text[:offset]))
    return int(pages[-1].group(1)) if pages else None


def _title_after_heading(text: str, heading_end: int, workbook_names: dict[str, str]) -> str:
    remainder = text[heading_end:]
    for line in remainder.splitlines():
        title = _clean_title(line)
        if not title:
            continue
        if title.startswith("=== PDF PAGE") or title.startswith("©"):
            continue
        if title.casefold().startswith(("a recipe book", "kfct code")):
            continue
        return title
    return ""


def _workbook_key(code: str, variant: str | None, name: str | None = None) -> str:
    """Map the book's 15066(r)/15066 headings to workbook r/s suffixes."""
    if code == "15066":
        if variant == "r" or (name and "rice" in name.casefold()):
            return "15066r"
        return "15066s"
    return code


def _has_mojibake(value: str) -> bool:
    return any(marker in value for marker in ("Ã", "Â", "â€", "â€™", "ï¿½", "�"))


def _nutrient_status(section: str) -> str:
    lowered = section.casefold()
    if "could not be estimated" in lowered or "no data was available" in lowered:
        return "not_estimated_in_source"
    if "nutrition data per 100g of recipe" in lowered:
        return "reported_in_source_review_required"
    return "not_detected_in_extracted_text"


def _workbook_names(path: Path) -> dict[str, str]:
    names: dict[str, str] = {}
    if not path.exists():
        return names
    with path.open(encoding="utf-8") as source:
        for line in source:
            record = json.loads(line)
            if record.get("record_type") == "recipe":
                names[record["code"]] = record["name"]
    return names


def import_recipe_book(
    pdf_path: Path,
    output_path: Path,
    workbook_import_path: Path,
) -> dict[str, Any]:
    reader = PdfReader(str(pdf_path))
    page_texts: list[str] = []
    for page_number, page in enumerate(reader.pages, 1):
        extracted = page.extract_text(extraction_mode="layout") or ""
        page_texts.append(f"\n\n=== PDF PAGE {page_number} ===\n{extracted}")
    full_text = "".join(page_texts)
    pdf_text_path = output_path.with_name("kenya_recipe_book_2018.txt")
    pdf_text_path.write_text(full_text, encoding="utf-8")

    workbook_names = _workbook_names(workbook_import_path)
    headings = list(CODE_HEADING.finditer(full_text))
    records: list[dict[str, Any]] = []
    code_counts: Counter[str] = Counter()
    for index, heading in enumerate(headings):
        code = heading.group(1)
        variant = (heading.group(2) or "").lower()
        record_id = f"{code}:{variant}" if variant else code
        stop = headings[index + 1].start() if index + 1 < len(headings) else len(full_text)
        section = full_text[heading.start() : stop].strip()
        title = _title_after_heading(full_text, heading.end(), workbook_names)
        workbook_key = _workbook_key(code, variant, title)
        workbook_name = workbook_names.get(workbook_key) or workbook_names.get(code)
        display_name = workbook_name if workbook_name and _has_mojibake(title) else title
        records.append(
            {
                "record_type": "recipe",
                "record_id": record_id,
                "code": code,
                "code_suffix": variant or None,
                "name": display_name or workbook_name,
                "nutrient_estimate_status": _nutrient_status(section),
                "extracted_text": section,
                "source": {
                    "source_id": SOURCE_ID,
                    "citation": SOURCE_CITATION,
                    "workbook_file": pdf_path.name,
                    "pdf_page": _find_source_page(full_text, heading.start()),
                    "heading_text": heading.group(0),
                    "extraction_method": "pypdf text extraction; layout-dependent values require review",  # noqa: E501
                },
            }
        )
        code_counts[code] += 1

    # The recipe book's compact nutrient appendix contains this record even
    # though its narrative heading was not extractable from the PDF text layer.
    appendix_match = APPENDIX_15083.search(full_text)
    if appendix_match and not any(record["code"] == "15083" for record in records):
        appendix_stop = full_text.find("\n", appendix_match.start())
        appendix_stop = len(full_text) if appendix_stop < 0 else appendix_stop + 1
        records.append(
            {
                "record_type": "recipe",
                "record_id": "15083:appendix",
                "code": "15083",
                "code_suffix": None,
                "name": workbook_names.get("15083") or "Kimanga cha Ndizi",
                "nutrient_estimate_status": "appendix_values_present_layout_review_required",
                "extracted_text": full_text[appendix_match.start() : appendix_stop],
                "source": {
                    "source_id": SOURCE_ID,
                    "citation": SOURCE_CITATION,
                    "workbook_file": pdf_path.name,
                    "pdf_page": _find_source_page(full_text, appendix_match.start()),
                    "heading_text": "Recipe found in the nutrient appendix; narrative heading not extracted",  # noqa: E501
                    "extraction_method": "pypdf text extraction; appendix values require review",
                },
            }
        )
        code_counts["15083"] += 1

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="\n") as output:
        for record in records:
            output.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")))
            output.write("\n")

    book_keys = {
        _workbook_key(record["code"], record.get("code_suffix"), record.get("name"))
        for record in records
    }
    missing_workbook_codes = sorted(code for code in book_keys if code not in workbook_names)
    workbook_only_codes = sorted(code for code in workbook_names if code not in book_keys)
    summary = {
        "source_id": SOURCE_ID,
        "source_file": pdf_path.name,
        "sha256": hashlib.sha256(pdf_path.read_bytes()).hexdigest(),
        "pdf_page_count": len(reader.pages),
        "output_file": output_path.name,
        "recipe_record_count": len(records),
        "narrative_heading_count": len(headings),
        "unique_code_count": len(code_counts),
        "duplicate_codes": {code: count for code, count in code_counts.items() if count > 1},
        "expected_published_recipe_count": EXPECTED_RECIPES,
        "count_matches_published_total": len(records) == EXPECTED_RECIPES,
        "codes_in_recipe_book_not_workbook": missing_workbook_codes,
        "codes_in_workbook_not_recipe_book_text": workbook_only_codes,
        "records_with_font_replacement_character": sum(
            "\ufffd" in record["extracted_text"] for record in records
        ),
        "records_with_suspected_mojibake": sum(
            _has_mojibake(record["extracted_text"]) for record in records
        ),
        "quality_notes": [
            "Recipe content is retained as extracted text with physical PDF page references.",
            "Ingredient quantities, steps, and nutrients are not promoted to structured fields by this importer.",  # noqa: E501
            "Review the duplicate 15066 rice/stew code and the appendix-only record before joining recipes to the food catalogue.",  # noqa: E501
            "pypdf reports rotated text in the source PDF; review table alignment and rotated pages visually.",  # noqa: E501
        ],
    }
    output_path.with_suffix(".summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return summary


def main() -> None:
    backend_dir = Path(__file__).resolve().parents[2]
    data_dir = backend_dir / "data"
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--pdf",
        type=Path,
        default=data_dir / "raw" / "kenya_recipe_book_2018.pdf",
    )
    parser.add_argument(
        "--workbook-import",
        type=Path,
        default=data_dir / "processed" / "kfct2018_review.jsonl",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=data_dir / "processed" / "kfct_recipes_2018_review.jsonl",
    )
    args = parser.parse_args()
    print(json.dumps(import_recipe_book(args.pdf, args.output, args.workbook_import), indent=2))


if __name__ == "__main__":
    main()
