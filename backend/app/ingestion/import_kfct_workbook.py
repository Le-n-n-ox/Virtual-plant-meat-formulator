"""Normalize KFCT2018's official XLSX into reviewable, provenance-rich JSONL.

This uses only the Python standard library so the source workbook can be read
without installing an Excel package. It preserves original cell text and
does not convert blank nutrient cells or trace values to zero.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import zipfile
from collections import Counter
from decimal import Decimal, InvalidOperation
from pathlib import Path, PurePosixPath
from typing import Any
from xml.etree import ElementTree as ET

MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"m": MAIN_NS, "r": REL_NS, "p": PKG_REL_NS}
SOURCE_ID = "kfct-2018"
SOURCE_CITATION = "FAO & Government of Kenya. 2018. Kenya Food Composition Tables. Nairobi, FAO."
LICENSE_NOTICE = "Non-commercial research use with acknowledgement; commercial reuse requires FAO permission."
EXPECTED_FOOD_COUNT = 522
EXPECTED_RECIPE_COUNT = 142


def _column_number(cell_reference: str) -> int:
    letters = re.match(r"[A-Z]+", cell_reference)
    if letters is None:
        raise ValueError(f"Invalid XLSX cell reference: {cell_reference}")
    result = 0
    for character in letters.group(0):
        result = result * 26 + ord(character) - ord("A") + 1
    return result


def _text(value: str | None) -> str:
    return (value or "").replace("\xa0", " ").strip()


def _normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.casefold())


def _parse_value(raw_value: str) -> dict[str, Any]:
    raw = _text(raw_value)
    flags: list[str] = []
    if not raw:
        return {"value_kind": "missing", "numeric_value": None, "flags": flags}
    if raw.casefold() == "tr":
        return {
            "value_kind": "trace",
            "numeric_value": None,
            "flags": ["estimated_trace"],
        }

    candidate = raw
    if candidate.endswith("*"):
        candidate = candidate[:-1].strip()
        flags.append("source_footnote_marker")
    if candidate.startswith("[") and candidate.endswith("]"):
        candidate = candidate[1:-1].strip()
        flags.append("alternative_method_or_lower_quality")

    range_match = re.fullmatch(
        r"\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*[-–—]\s*"
        r"([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*",
        candidate,
    )
    if range_match:
        return {
            "value_kind": "range",
            "numeric_value": None,
            "range_values": [float(range_match.group(1)), float(range_match.group(2))],
            "flags": flags,
        }
    try:
        number = Decimal(candidate)
    except InvalidOperation:
        return {
            "value_kind": "text",
            "numeric_value": None,
            "flags": [*flags, "requires_manual_value_review"],
        }
    return {
        "value_kind": "numeric",
        "numeric_value": int(number) if number == number.to_integral_value() else float(number),
        "flags": flags,
    }


class WorkbookReader:
    """Small read-only XLSX reader for the workbook's simple tabular sheets."""

    def __init__(self, path: Path) -> None:
        self.archive = zipfile.ZipFile(path)
        workbook = ET.fromstring(self.archive.read("xl/workbook.xml"))
        relationships = ET.fromstring(self.archive.read("xl/_rels/workbook.xml.rels"))
        targets = {
            relation.attrib["Id"]: relation.attrib["Target"]
            for relation in relationships.findall("p:Relationship", NS)
        }
        self.sheet_paths: dict[str, str] = {}
        for sheet in workbook.findall("m:sheets/m:sheet", NS):
            target = targets[sheet.attrib[f"{{{REL_NS}}}id"]]
            if target.startswith("/"):
                target = target.lstrip("/")
            else:
                target = str(PurePosixPath("xl") / target)
            self.sheet_paths[sheet.attrib["name"]] = target

        self.shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in self.archive.namelist():
            strings = ET.fromstring(self.archive.read("xl/sharedStrings.xml"))
            self.shared_strings = [
                "".join(text.text or "" for text in item.findall(".//m:t", NS))
                for item in strings.findall("m:si", NS)
            ]

    def sheet(self, name: str) -> dict[int, dict[int, str]]:
        root = ET.fromstring(self.archive.read(self.sheet_paths[name]))
        result: dict[int, dict[int, str]] = {}
        for row in root.findall("m:sheetData/m:row", NS):
            row_number = int(row.attrib["r"])
            values: dict[int, str] = {}
            for cell in row.findall("m:c", NS):
                cell_type = cell.attrib.get("t")
                if cell_type == "inlineStr":
                    value = "".join(text.text or "" for text in cell.findall(".//m:t", NS))
                else:
                    element = cell.find("m:v", NS)
                    value = element.text if element is not None else ""
                    if cell_type == "s" and value:
                        value = self.shared_strings[int(value)]
                values[_column_number(cell.attrib["r"])] = value
            result[row_number] = values
        return result

    def close(self) -> None:
        self.archive.close()


def _component_metadata(rows: dict[int, dict[int, str]]) -> tuple[dict[str, dict[str, str]], dict[str, dict[str, str]]]:
    by_tag: dict[str, dict[str, str]] = {}
    by_name: dict[str, dict[str, str]] = {}
    for row_number, row in rows.items():
        if row_number < 23:
            continue
        name = _text(row.get(2))
        tag = _text(row.get(3))
        if not name:
            continue
        metadata = {
            "component_name": name,
            "infoods_tagname": tag,
            "unit": _text(row.get(4)),
            "denominator": _text(row.get(5)),
            "method_of_analysis": _text(row.get(7)),
        }
        by_name[_normalize(name)] = metadata
        if tag:
            by_tag[tag.casefold()] = metadata
    return by_tag, by_name


def _food_index(rows: dict[int, dict[int, str]]) -> dict[str, dict[str, str]]:
    result: dict[str, dict[str, str]] = {}
    for row_number, row in rows.items():
        if row_number < 4:
            continue
        code = _text(row.get(3))
        if not code:
            continue
        result[code] = {
            "english_name": _text(row.get(4)),
            "scientific_name": _text(row.get(5)),
            "bibliography_ids": _text(row.get(6)),
            "source_sheet": "07 Index of foods",
            "source_row": row_number,
        }
    return result


def _food_groups(rows: dict[int, dict[int, str]]) -> dict[str, str]:
    return {
        _text(row.get(2)): _text(row.get(3))
        for row_number, row in rows.items()
        if row_number >= 3 and _text(row.get(2)) and _text(row.get(3))
    }


def _component_for_column(
    column: int,
    display_name: str,
    unit_header: str,
    by_tag: dict[str, dict[str, str]],
    by_name: dict[str, dict[str, str]],
) -> dict[str, Any]:
    tag_match = re.match(r"\s*([A-Z][A-Z0-9]+)\s*\(", unit_header)
    metadata = by_tag.get(tag_match.group(1).casefold()) if tag_match else None
    if metadata is None:
        metadata = by_name.get(_normalize(display_name))
    unit = re.search(r"\(([^()]*)\)\s*$", unit_header)
    output: dict[str, Any] = {
        "column": column,
        "column_letter": _excel_column(column),
        "component_label": display_name,
        "unit": unit.group(1).strip() if unit else _text(unit_header),
        "denominator": "/100 g edible portion, fresh weight basis",
    }
    if metadata:
        output["infoods_tagname"] = metadata["infoods_tagname"] or None
        output["component_definition"] = metadata["component_name"]
        output["method_of_analysis"] = metadata["method_of_analysis"] or None
    else:
        output["infoods_tagname"] = None
    return output


def _excel_column(number: int) -> str:
    result = ""
    while number:
        number, remainder = divmod(number - 1, 26)
        result = chr(ord("A") + remainder) + result
    return result


def _stats_label(value: str) -> str:
    return _normalize(value)


def import_workbook(input_path: Path, output_path: Path) -> dict[str, Any]:
    reader = WorkbookReader(input_path)
    try:
        database = reader.sheet("04 USERDATABASE-KFCT2018")
        components_sheet = reader.sheet("03 Components ")
        index_sheet = reader.sheet("07 Index of foods")
        groups = _food_groups(reader.sheet("02 Foodgroups and Codes"))
        components_by_tag, components_by_name = _component_metadata(components_sheet)
        food_index = _food_index(index_sheet)

        headers = database.get(3, {})
        units = database.get(4, {})
        nutrient_columns = {
            column: _component_for_column(
                column,
                _text(headers.get(column)) or _text(database.get(2, {}).get(column)),
                _text(units.get(column)),
                components_by_tag,
                components_by_name,
            )
            for column in range(4, max(headers, default=3) + 1)
            if _text(headers.get(column)) or _text(units.get(column))
        }

        records: list[dict[str, Any]] = []
        counts: Counter[str] = Counter()
        current_group_code: str | None = None
        row_numbers = sorted(database)
        for position, row_number in enumerate(row_numbers):
            row = database[row_number]
            code_raw = _text(row.get(1))
            name = _text(row.get(2))
            if code_raw.isdigit() and 1 <= int(code_raw) <= 13 and name:
                current_group_code = code_raw
                continue
            # Recipe codes include letter suffixes (e.g. 15066r / 15066s)
            # for distinct variants. Preserve those codes instead of silently
            # dropping their nutrient rows as non-numeric identifiers.
            if not (re.fullmatch(r"\d{4,5}[rs]?", code_raw, re.IGNORECASE) and name):
                continue

            code = code_raw
            recipe = code.startswith("15")
            record_type = "recipe" if recipe else "food"
            stats_row: dict[int, str] = {}
            sample_count_row: dict[int, str] = {}
            stats_row_number: int | None = None
            sample_count_row_number: int | None = None
            if position + 1 < len(row_numbers):
                candidate_number = row_numbers[position + 1]
                candidate = database[candidate_number]
                if _stats_label(_text(candidate.get(1))) == "sdorminmax":
                    stats_row = candidate
                    stats_row_number = candidate_number
                    if position + 2 < len(row_numbers):
                        next_number = row_numbers[position + 2]
                        next_row = database[next_number]
                        if _stats_label(_text(next_row.get(1))) == "n":
                            sample_count_row = next_row
                            sample_count_row_number = next_number

            nutrients: list[dict[str, Any]] = []
            missing_columns: list[str] = []
            statistic_count = 0
            for column, metadata in nutrient_columns.items():
                raw = _text(row.get(column))
                if not raw:
                    missing_columns.append(metadata["column_letter"])
                    continue
                nutrient = dict(metadata)
                nutrient.update({"raw_value": raw, **_parse_value(raw)})
                if stats_row.get(column):
                    nutrient["statistic"] = {
                        "label": _text(stats_row.get(1)),
                        "raw_value": _text(stats_row[column]),
                        **_parse_value(stats_row[column]),
                        "source_sheet": "04 USERDATABASE-KFCT2018",
                        "source_row": stats_row_number,
                    }
                    statistic_count += 1
                if sample_count_row.get(column):
                    nutrient["sample_count"] = _text(sample_count_row[column])
                    nutrient["sample_count_source_row"] = sample_count_row_number
                nutrients.append(nutrient)

            index = food_index.get(code, {})
            record = {
                "record_type": record_type,
                "code": code,
                "name": name,
                "food_group_code": None if recipe else current_group_code,
                "food_group": "Recipes" if recipe else groups.get(current_group_code or ""),
                "edible_conversion_factor": _parse_value(_text(row.get(3)))
                if _text(row.get(3))
                else None,
                "basis": "per 100 g edible portion, fresh weight basis",
                "scientific_name": index.get("scientific_name") or None,
                "food_index_reference_ids": index.get("bibliography_ids") or None,
                "nutrients": nutrients,
                "missing_nutrient_columns": missing_columns,
                "source": {
                    "source_id": SOURCE_ID,
                    "citation": SOURCE_CITATION,
                    "license_notice": LICENSE_NOTICE,
                    "workbook_file": input_path.name,
                    "worksheet": "04 USERDATABASE-KFCT2018",
                    "row": row_number,
                    "food_index_worksheet": index.get("source_sheet"),
                    "food_index_row": index.get("source_row"),
                },
            }
            records.append(record)
            counts[record_type] += 1
            counts["nutrient_values"] += len(nutrients)
            counts["missing_nutrient_cells"] += len(missing_columns)
            counts["statistic_values"] += statistic_count
            if not index:
                counts[f"{record_type}s_without_food_index"] += 1
            if not recipe and current_group_code is None:
                counts["without_food_group"] += 1

        output_path.parent.mkdir(parents=True, exist_ok=True)
        with output_path.open("w", encoding="utf-8", newline="\n") as output:
            for record in records:
                output.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")))
                output.write("\n")

        file_hash = hashlib.sha256(input_path.read_bytes()).hexdigest()
        summary = {
            "source_id": SOURCE_ID,
            "source_file": input_path.name,
            "sha256": file_hash,
            "output_file": output_path.name,
            "record_count": len(records),
            "food_count": counts["food"],
            "recipe_count": counts["recipe"],
            "nutrient_value_count": counts["nutrient_values"],
            "missing_nutrient_cell_count": counts["missing_nutrient_cells"],
            "statistic_value_count": counts["statistic_values"],
            "foods_without_food_index": counts["foods_without_food_index"],
            "recipes_without_food_index": counts["recipes_without_food_index"],
            "records_without_food_group": counts["without_food_group"],
            "expected_published_food_count": EXPECTED_FOOD_COUNT,
            "expected_published_recipe_count": EXPECTED_RECIPE_COUNT,
            "published_food_count_claims": {
                "foreword_count": {
                    "count": 522,
                    "source": "KFCT 2018 PDF, printed page v",
                },
                "foods_included_section_count": {
                    "count": 509,
                    "source": "KFCT 2018 PDF, printed page 2, section 2",
                },
                "workbook_coded_food_rows": counts["food"],
                "status": "official_pdf_count_conflict_unresolved",
            },
            "count_reconciliation_required": counts["food"] != EXPECTED_FOOD_COUNT
            or counts["recipe"] != EXPECTED_RECIPE_COUNT,
            "quality_notes": [
                "The importer preserves source cells, row references, units, reported-value flags, sample counts, and missing-cell lists.",
                "Blank nutrient cells remain missing; trace values are not converted to zero.",
                "The official KFCT PDF gives conflicting food totals: 522 in the foreword (printed p. v) and 509 in section 2 (printed p. 2); this workbook contains the reported coded row count, without adding or dropping records to force either total.",
                "This output is an import candidate for review and is not activated as validated product data.",
            ],
        }
        summary_path = output_path.with_suffix(".summary.json")
        summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        return summary
    finally:
        reader.close()


def main() -> None:
    backend_dir = Path(__file__).resolve().parents[2]
    data_dir = backend_dir / "data"
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        type=Path,
        default=data_dir / "raw" / "Kenya Food Composition Tables Excel files 2018.xlsx",
        help="Path to the official KFCT2018 XLSX workbook.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=data_dir / "processed" / "kfct2018_review.jsonl",
        help="Path for the generated JSONL candidate import.",
    )
    args = parser.parse_args()
    summary = import_workbook(args.input, args.output)
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
