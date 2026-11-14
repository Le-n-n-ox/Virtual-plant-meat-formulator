"""Normalize the CSIRO low-moisture extrusion research CSVs for local analysis.

The source data are CC BY-NC-SA 4.0. Generated records retain that licence and
their source row, and must not be used commercially or redistributed under a
different licence.
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT_DIR = BACKEND_ROOT / "data" / "raw" / "csiro_low_moisture_2026"
DEFAULT_OUTPUT = BACKEND_ROOT / "data" / "processed" / "csiro_extrusion_research.jsonl"

SOURCE_ID = "csiro-low-moisture-extrusion-2026"
SOURCE_DOI = "10.25919/AG1F-AY33"
SOURCE_LICENSE = "CC BY-NC-SA 4.0"

PROCESS_FILES: dict[str, dict[str, Any]] = {
    "6Proteins_ProcessConditions.csv": {
        "record_type": "extrusion_run",
        "numeric_fields": {
            "feed_rate_kg_h": "kg/h",
            "water_flowrate_kg_h": "kg/h",
            "screw_speed_rpm": "rpm",
            "motor_torque_pct": "%",
            "in_barrel_moisture_pct": "%",
            "SME_kWh_per_t": "kWh/t",
        },
    },
    "6Proteins_Texture_recomputed.csv": {
        "record_type": "texture_measurement",
        "numeric_fields": {
            "hardness_N": "N",
            "springiness_pct": "%",
            "cohesion": "dimensionless",
            "resilience_pct": "%",
            "gumminess_N": "N",
            "chewiness_N": "N",
        },
    },
}

IDENTIFIER_FIELDS = ("trial", "protein_1", "protein_2", "sample")


def _read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open("r", encoding="utf-8-sig", newline="") as source_file:
        reader = csv.DictReader(source_file)
        if reader.fieldnames is None:
            raise ValueError(f"CSV has no header: {path}")
        rows: list[dict[str, str]] = list(reader)
        return list(reader.fieldnames), rows


def _as_number(value: str | None, *, field: str, row_number: int) -> float | None:
    if value is None or not value.strip():
        return None
    try:
        return float(value)
    except ValueError as error:
        raise ValueError(
            f"Expected a number in {field} at CSV row {row_number}, got {value!r}"
        ) from error


def _record(
    *,
    source_file: str,
    row_number: int,
    raw_row: dict[str, str],
    record_type: str,
    numeric_fields: dict[str, str],
) -> dict[str, Any]:
    identifiers = {key: raw_row.get(key, "").strip() or None for key in IDENTIFIER_FIELDS}
    values: dict[str, Any] = {}
    for key, value in raw_row.items():
        if key in IDENTIFIER_FIELDS:
            continue
        if key in numeric_fields:
            values[key] = {
                "value": _as_number(value, field=key, row_number=row_number),
                "unit": numeric_fields[key],
            }
        else:
            values[key] = value.strip() or None

    return {
        "schema_version": 1,
        "source": {
            "id": SOURCE_ID,
            "doi": SOURCE_DOI,
            "citation": (
                "Pennells, J.; Glenn, D.; Unthank, D.; Ying, D.; Patel, H. "
                "Low Moisture Extrusion Dataset for Six Plant Protein Isolates "
                "and Binary Blends in Textured Vegetable Protein (TVP) Production. "
                "CSIRO Data Access Portal, 2026."
            ),
            "license": SOURCE_LICENSE,
            "usage_scope": "non-commercial research only",
        },
        "record_type": record_type,
        "processing": {"regime": "low_moisture_extrusion"},
        "identifiers": identifiers,
        "source_reference": {"file": source_file, "row": row_number},
        "values": values,
        # Retain the original strings so later review can trace conversions.
        "source_row": raw_row,
    }


def import_dataset(input_dir: Path, output_path: Path) -> dict[str, int]:
    records: list[dict[str, Any]] = []
    counts: dict[str, int] = {}

    for file_name, specification in PROCESS_FILES.items():
        source_path = input_dir / file_name
        if not source_path.is_file():
            raise FileNotFoundError(f"Missing expected CSIRO source file: {source_path}")

        field_names, rows = _read_csv(source_path)
        required = set(IDENTIFIER_FIELDS) | set(specification["numeric_fields"])
        missing = sorted(required - set(field_names))
        if missing:
            raise ValueError(f"{file_name} is missing expected columns: {', '.join(missing)}")

        counts[file_name] = len(rows)
        for row_number, row in enumerate(rows, start=2):
            records.append(
                _record(
                    source_file=file_name,
                    row_number=row_number,
                    raw_row=row,
                    record_type=specification["record_type"],
                    numeric_fields=specification["numeric_fields"],
                )
            )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="\n") as output_file:
        for record in records:
            output_file.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")))
            output_file.write("\n")

    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, default=DEFAULT_INPUT_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    counts = import_dataset(args.input_dir, args.output)
    total = sum(counts.values())
    print(f"Wrote {total} CSIRO research records to {args.output}")
    for name, count in counts.items():
        print(f"  {name}: {count} records")
    print(f"Licence retained in each record: {SOURCE_LICENSE} (non-commercial use only)")


if __name__ == "__main__":
    main()
