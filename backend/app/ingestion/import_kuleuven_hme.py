"""Normalize KU Leuven's CC BY 4.0 soy-protein HME data as review records.

The import keeps per-metric measurements separate because the workbook does
not establish that measurements on the same spreadsheet row came from the
same specimen. Four summarized treatment groups are not enough for a general
texture predictor; this dataset is a research benchmark only.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

from app.ingestion.import_kfct_workbook import WorkbookReader

SOURCE_ID = "kuleuven-soy-hme-2025"
SOURCE_DOI = "10.48804/TVBPM9"
SOURCE_LICENSE = "CC BY 4.0"
SOURCE_CITATION = (
    "Li, J.; Janssen, F.; Verfaillie, D.; Brijs, K.; Delcour, J. A.; van der Goot, A. J.; "
    "Van Royen, G.; Wouters, A. G. B. 2025. Replication Data for: Impact of soy protein "
    "concentrate preparation method on structure formation during high moisture extrusion. "
    "KU Leuven RDR. https://doi.org/10.48804/TVBPM9"
)
BACKEND_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT_DIR = BACKEND_ROOT / "data" / "raw" / "kuleuven_hme_soy_2025"
DEFAULT_OUTPUT = BACKEND_ROOT / "data" / "processed" / "kuleuven_hme_soy_2025_review.jsonl"
TEXTURE_FILE = "07-Texture profile analysis_Figure6.xlsx"
PROCESS_FILE = "05-Specific mechanical energy calculation_Figure4.xlsx"
COMPOSITION_FILE = "01-SPC composition_Table1.xlsx"
MATERIALS = ("pH4.5-SPC", "pH5.5-SPC", "E50-SPC", "E70-SPC")
TEXTURE_COLUMNS = {
    3: ("hardness", "N"),
    4: ("springiness", "dimensionless"),
    7: ("cutting_strength_longitudinal", "N"),
    10: ("cutting_strength_perpendicular", "N"),
}


def _number(raw: str) -> float | None:
    value = raw.strip()
    if not value:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _file_metadata(path: Path) -> dict[str, Any]:
    return {
        "file": path.name,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }


def import_dataset(input_dir: Path, output_path: Path) -> dict[str, Any]:
    files = {name: input_dir / name for name in (TEXTURE_FILE, PROCESS_FILE, COMPOSITION_FILE)}
    for path in files.values():
        if not path.is_file():
            raise FileNotFoundError(f"Missing KU Leuven source workbook: {path}")

    process_reader = WorkbookReader(files[PROCESS_FILE])
    texture_reader = WorkbookReader(files[TEXTURE_FILE])
    composition_reader = WorkbookReader(files[COMPOSITION_FILE])
    records: list[dict[str, Any]] = []
    try:
        process_rows = process_reader.sheet("Summary")
        process_headers = process_rows[4]
        process_by_material: dict[str, dict[str, Any]] = {}
        for row_number, row in process_rows.items():
            material = row.get(2, "").strip()
            if material not in MATERIALS:
                continue
            process_by_material[material] = {
                "barrel_temperature": {"value": _number(row.get(3, "")), "unit": "degC"},
                "target_moisture": {"value": _number(row.get(4, "")), "unit": "%"},
                "flour_feed_rate": {"value": _number(row.get(5, "")), "unit": "kg/h"},
                "water_feed_rate": {"value": _number(row.get(6, "")), "unit": "mL/h"},
                "screw_speed": {"value": _number(row.get(7, "")), "unit": "rpm"},
                "average_torque": {"value": _number(row.get(8, "")), "unit": "%"},
                "pressure_source_text": row.get(9, "").strip() or None,
                "total_feed_rate": {"value": _number(row.get(10, "")), "unit": "kg/h"},
                "specific_mechanical_energy": {"value": _number(row.get(11, "")), "unit": "Wh/kg"},
                "specific_mechanical_energy_alternate": {
                    "value": _number(row.get(12, "")), "unit": "kJ/kg"
                },
                "source_reference": {
                    "file": PROCESS_FILE,
                    "worksheet": "Summary",
                    "row": row_number,
                    "headers": {str(k): v for k, v in process_headers.items() if v},
                },
            }

        composition_rows = composition_reader.sheet("Raw data")
        composition_header = composition_rows[3]
        composition_fields = {
            4: ("protein", "% dry matter"),
            5: ("ash", "% dry matter"),
            6: ("lipid", "% dry matter"),
            7: ("estimated_carbohydrate", "% dry matter"),
        }
        composition_by_material: dict[str, list[dict[str, Any]]] = {
            material: [] for material in MATERIALS
        }
        for row_number, row in composition_rows.items():
            material = row.get(3, "").strip()
            if material not in composition_by_material:
                continue
            composition_by_material[material].append({
                "source_row": row_number,
                "measurements": {
                    key: {
                        "value": _number(row.get(column, "")),
                        "unit": unit,
                        "source_text": row.get(column, "").strip() or None,
                        "source_header": composition_header.get(column),
                    }
                    for column, (key, unit) in composition_fields.items()
                },
            })

        for material, conditions in process_by_material.items():
            records.append({
                "schema_version": 1,
                "record_type": "extrusion_run_summary",
                "processing": {"regime": "high_moisture_extrusion"},
                "material_code": material,
                "material_description": material,
                "process_conditions": conditions,
                "composition_measurements": composition_by_material.get(material, []),
                "source": {
                    "id": SOURCE_ID,
                    "doi": SOURCE_DOI,
                    "citation": SOURCE_CITATION,
                    "license": SOURCE_LICENSE,
                    "usage_scope": "attribution required; research benchmark, not locally validated",
                },
            })

        raw_texture = texture_reader.sheet("Raw data")
        for row_number, row in raw_texture.items():
            for material_column, metric_column in ((2, 3), (2, 4), (6, 7), (9, 10)):
                material = row.get(material_column, "").strip()
                source_text = row.get(metric_column, "").strip()
                if material not in MATERIALS or not source_text:
                    continue
                metric, unit = TEXTURE_COLUMNS[metric_column]
                records.append({
                    "schema_version": 1,
                    "record_type": "texture_measurement",
                    "processing": {"regime": "high_moisture_extrusion"},
                    "material_code": material,
                    "metric": metric,
                    "value": _number(source_text),
                    "unit": unit,
                    "source_text": source_text,
                    "linked_run_summary": material,
                    "specimen_linkage": "not_provided; do not join separate metric columns by row",
                    "source_reference": {
                        "file": TEXTURE_FILE,
                        "worksheet": "Raw data",
                        "row": row_number,
                        "metric_header": raw_texture[1].get(metric_column),
                    },
                    "source": {
                        "id": SOURCE_ID,
                        "doi": SOURCE_DOI,
                        "citation": SOURCE_CITATION,
                        "license": SOURCE_LICENSE,
                        "usage_scope": "attribution required; research benchmark, not locally validated",
                    },
                })

        summary_rows = texture_reader.sheet("Summary")
        for row_number, row in summary_rows.items():
            material = row.get(2, "").strip()
            if material not in MATERIALS:
                continue
            records.append({
                "schema_version": 1,
                "record_type": "texture_group_summary",
                "processing": {"regime": "high_moisture_extrusion"},
                "material_code": material,
                "reported_statistics": {
                    "hardness": {"source_text": row.get(3), "unit": "N"},
                    "springiness": {"source_text": row.get(4), "unit": "dimensionless"},
                    "cutting_strength_longitudinal": {"source_text": row.get(5), "unit": "N"},
                    "cutting_strength_perpendicular": {"source_text": row.get(6), "unit": "N"},
                },
                "source_reference": {"file": TEXTURE_FILE, "worksheet": "Summary", "row": row_number},
                "source": {
                    "id": SOURCE_ID,
                    "doi": SOURCE_DOI,
                    "citation": SOURCE_CITATION,
                    "license": SOURCE_LICENSE,
                    "usage_scope": "attribution required; reported statistic format retained verbatim",
                },
            })
    finally:
        process_reader.close()
        texture_reader.close()
        composition_reader.close()

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="\n") as destination:
        for record in records:
            destination.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")

    summary = {
        "source_id": SOURCE_ID,
        "doi": SOURCE_DOI,
        "license": SOURCE_LICENSE,
        "source_files": [_file_metadata(path) for path in files.values()],
        "output_file": output_path.name,
        "record_count": len(records),
        "records_by_type": {
            record_type: sum(record["record_type"] == record_type for record in records)
            for record_type in sorted({record["record_type"] for record in records})
        },
        "texture_measurements_by_metric": {
            metric: sum(
                record["record_type"] == "texture_measurement" and record["metric"] == metric
                for record in records
            )
            for metric, _ in TEXTURE_COLUMNS.values()
        },
        "treatment_groups": sorted(process_by_material),
        "quality_notes": [
            "The study includes four soy-protein-concentrate treatment groups and their linked process summaries.",
            "The raw texture columns have no specimen IDs; separate metric columns must not be joined row-wise.",
            "This small soy-only dataset cannot validate predictions for Kenyan whole-food ingredients or new formulations.",
            "Source measurements and summaries retain workbook/worksheet/row provenance; summary text is not reinterpreted.",
        ],
    }
    output_path.with_suffix(".summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, default=DEFAULT_INPUT_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    print(json.dumps(import_dataset(args.input_dir, args.output), indent=2))


if __name__ == "__main__":
    main()
