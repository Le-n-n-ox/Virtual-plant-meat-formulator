"""Import the CC BY 4.0 high-moisture full-fat-soy formulations from Jeon et al. (2023).

The source CSV transcribes the six HMMA formulations in Table 1 and their
texture/cutting summaries in Table 2. Outcomes are group means with SD; the
article reports six measurements, but does not report independent extrusion
batch replication. The importer preserves reported units and significance
letters and does not add plotted-only or unreported outcomes.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path
from typing import Any


BACKEND_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = BACKEND_ROOT / "data" / "reference" / "jeon_2023_full_fat_soy_hme_table1_table2.csv"
DEFAULT_OUTPUT = BACKEND_ROOT / "data" / "processed" / "jeon_full_fat_soy_hme_2023_review.jsonl"
DEFAULT_SUMMARY = BACKEND_ROOT / "data" / "processed" / "jeon_full_fat_soy_hme_2023_review.summary.json"

SOURCE_ID = "jeon-full-fat-soy-hme-2023"
SOURCE_DOI = "10.3390/foods12051011"
SOURCE_LICENSE = "CC BY 4.0"
SOURCE_CITATION = (
    "Jeon, Y.-H.; Gu, B.-J.; Ryu, G.-H. 2023. Investigating the Potential of "
    "Full-Fat Soy as an Alternative Ingredient in the Manufacture of Low- and "
    "High-Moisture Meat Analogs. Foods 12(5), 1011. "
    "https://doi.org/10.3390/foods12051011"
)

FORMULATION_FIELDS = {
    "full_fat_soy_pct": "full_fat_soy",
    "soy_protein_isolate_pct": "soy_protein_isolate",
    "wheat_gluten_pct": "wheat_gluten",
    "corn_starch_pct": "corn_starch",
}
MEASUREMENT_FIELDS = {
    "springiness": ("springiness_mean_pct", "springiness_sd_pct", "springiness_significance_group", "%"),
    "cohesiveness": ("cohesiveness_mean_pct", "cohesiveness_sd_pct", "cohesiveness_significance_group", "%"),
    "chewiness": ("chewiness_mean_g", "chewiness_sd_g", "chewiness_significance_group", "g"),
    "cutting_strength_vertical": (
        "cutting_vertical_mean_g_cm2",
        "cutting_vertical_sd_g_cm2",
        "cutting_vertical_significance_group",
        "g/cm^2",
    ),
    "cutting_strength_parallel": (
        "cutting_parallel_mean_g_cm2",
        "cutting_parallel_sd_g_cm2",
        "cutting_parallel_significance_group",
        "g/cm^2",
    ),
}


def _number(row: dict[str, str], field: str, row_number: int) -> float:
    try:
        return float(row[field])
    except (KeyError, ValueError) as error:
        raise ValueError(f"Invalid {field} at CSV row {row_number}: {row.get(field)!r}") from error


def import_dataset(input_path: Path, output_path: Path, summary_path: Path) -> dict[str, Any]:
    checksum = hashlib.sha256(input_path.read_bytes()).hexdigest()
    records: list[dict[str, Any]] = []
    with input_path.open("r", encoding="utf-8-sig", newline="") as source_file:
        reader = csv.DictReader(source_file)
        required = {
            "source_id",
            "source_doi",
            "source_citation",
            "source_license",
            "source_license_url",
            "source_article_url",
            "source_sample_code",
            "source_sample_id",
            "extrusion_regime",
            "formulation_percent_basis",
            "screw_speed_rpm",
            "feed_moisture_pct",
            "barrel_temperature_c",
            "cooling_water_temperature_c",
            "cooling_die_width_cm",
            "cooling_die_height_cm",
            "cooling_die_length_cm",
            "extruder_model",
            "screw_diameter_cm",
            "screw_length_cm",
            "screw_length_to_diameter_ratio",
            "sampled_extrudates_min",
            "independent_extrusion_batches_reported",
            "texture_replicate_count",
            "significance_test",
            "texture_analyzer",
            "texture_probe",
            "texture_max_peak_stress_kg",
            "cutting_probe",
            "cutting_max_peak_stress_kg",
        }
        required |= set(FORMULATION_FIELDS)
        required |= {name for fields in MEASUREMENT_FIELDS.values() for name in fields[:3]}
        missing = sorted(required - set(reader.fieldnames or []))
        if missing:
            raise ValueError(f"Missing expected source columns: {', '.join(missing)}")

        for row_number, row in enumerate(reader, start=2):
            if row["source_id"].strip() != SOURCE_ID:
                raise ValueError(f"Unexpected source ID at CSV row {row_number}")
            sample_code = row["source_sample_code"].strip()
            formulation = {
                ingredient: {
                    "value": _number(row, field, row_number),
                    "unit": "% as reported in Table 1",
                    "basis": row["formulation_percent_basis"],
                }
                for field, ingredient in FORMULATION_FIELDS.items()
            }
            if abs(sum(item["value"] for item in formulation.values()) - 100.0) > 1e-9:
                raise ValueError(f"Formulation percentages do not sum to 100 at CSV row {row_number}")

            measurements: dict[str, Any] = {}
            for metric, (mean_field, sd_field, group_field, unit) in MEASUREMENT_FIELDS.items():
                measurements[metric] = {
                    "reported_mean": _number(row, mean_field, row_number),
                    "reported_standard_deviation": _number(row, sd_field, row_number),
                    "reported_unit": unit,
                    "summary_statistic": "mean and standard deviation",
                    "replicate_count": int(_number(row, "texture_replicate_count", row_number)),
                    "significance_group": row[group_field],
                    "significance_test": row["significance_test"],
                }

            independent_batches = row["independent_extrusion_batches_reported"].strip()
            record = {
                "schema_version": 1,
                "source": {
                    "id": SOURCE_ID,
                    "doi": SOURCE_DOI,
                    "citation": SOURCE_CITATION,
                    "license": SOURCE_LICENSE,
                    "license_url": row["source_license_url"],
                    "usage_scope": "CC BY 4.0; attribute the authors and article, link the licence, and indicate changes",
                },
                "record_type": "hme_formulation_summary",
                "identifiers": {
                    "sample_id": row["source_sample_id"],
                    "source_sample_code": sample_code,
                    "source_sample_code_note": "constructed from the article's HMMA type and reported FFS percentage; no native sample ID is stated",
                },
                "processing": {
                    "regime": "high_moisture_extrusion",
                    "ingredient_system": "full-fat soy, soy protein isolate, wheat gluten, and corn starch",
                    "formulation": formulation,
                    "inputs": {
                        "feed_moisture": {
                            "value": _number(row, "feed_moisture_pct", row_number),
                            "unit": "%",
                        },
                        "screw_speed": {
                            "value": _number(row, "screw_speed_rpm", row_number),
                            "unit": "rpm",
                        },
                        "barrel_temperature": {
                            "value": _number(row, "barrel_temperature_c", row_number),
                            "unit": "degC",
                        },
                    },
                    "cooling_die": {
                        "dimensions": {
                            "width": {"value": _number(row, "cooling_die_width_cm", row_number), "unit": "cm"},
                            "height": {"value": _number(row, "cooling_die_height_cm", row_number), "unit": "cm"},
                            "length": {"value": _number(row, "cooling_die_length_cm", row_number), "unit": "cm"},
                        },
                        "cooling_water_temperature": {
                            "value": _number(row, "cooling_water_temperature_c", row_number),
                            "unit": "degC",
                        },
                    },
                    "extruder": {
                        "model": row["extruder_model"],
                        "screw_diameter": {"value": _number(row, "screw_diameter_cm", row_number), "unit": "cm"},
                        "screw_length": {"value": _number(row, "screw_length_cm", row_number), "unit": "cm"},
                        "length_to_diameter_ratio": _number(row, "screw_length_to_diameter_ratio", row_number),
                    },
                    "sample_collection": {
                        "extrudates_collected_minimum": int(_number(row, "sampled_extrudates_min", row_number)),
                        "collection_condition": "after extrusion conditions were stable",
                    },
                },
                "measurements": measurements,
                "method": {
                    "texture_analyzer": row["texture_analyzer"],
                    "texture_probe": row["texture_probe"],
                    "texture_maximum_peak_stress": {
                        "value": _number(row, "texture_max_peak_stress_kg", row_number),
                        "unit": "kg",
                    },
                    "cutting_probe": row["cutting_probe"],
                    "cutting_maximum_peak_stress": {
                        "value": _number(row, "cutting_max_peak_stress_kg", row_number),
                        "unit": "kg",
                    },
                    "sample_preparation": "HMMAs were frozen at -18 degC, thawed at 4 degC for 24 h, then equilibrated at room temperature before TPA and cutting-strength measurements.",
                    "replication_note": "Texture and cutting results are reported as averages of six measurements. At least 30 extrudates were collected per formulation after conditions stabilized. Independent extrusion batch replication is not reported.",
                },
                "training_eligibility": {
                    "eligible": False,
                    "reason": "All six formulation outcomes use one reported HME process setting; independent extrusion-batch replication and individual readings are unavailable. Suitable as source-cited comparative evidence at the stated conditions, not as a validated generalized predictor.",
                },
                "source_reference": {
                    "file": input_path.name,
                    "csv_row": row_number,
                    "sha256": checksum,
                    "article_tables": [row["source_formulation_table"], row["source_texture_table"]],
                    "process_reference": row["source_process_section"],
                    "article_url": row["source_article_url"],
                },
                "source_row": row,
            }
            if independent_batches.lower() not in {"", "not reported"}:
                record["method"]["independent_extrusion_batches_reported"] = int(independent_batches)
            else:
                record["method"]["independent_extrusion_batches_reported"] = None
            records.append(record)

    expected_percentages = {0, 10, 20, 30, 40, 50}
    actual_percentages = {
        int(record["processing"]["formulation"]["full_fat_soy"]["value"])
        for record in records
    }
    if len(records) != 6 or actual_percentages != expected_percentages:
        raise ValueError(f"Expected six HMMA formulations at FFS 0-50%, found {sorted(actual_percentages)}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="\n") as destination:
        for record in records:
            destination.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")

    summary = {
        "source_id": SOURCE_ID,
        "doi": SOURCE_DOI,
        "license": SOURCE_LICENSE,
        "source_csv_sha256": checksum,
        "record_count": len(records),
        "source_sample_ids": [record["identifiers"]["sample_id"] for record in records],
        "reported_measurement_replicates": 6,
        "distinct_process_setting_count": 1,
        "training_eligible": False,
        "limitations": [
            "Only the six HMMA formulations are included; the separate LMMA experiments are excluded.",
            "All HMMA formulations use one reported process setting, so this source cannot identify process-condition effects.",
            "Results are six-measurement summaries; individual readings and independent extrusion-batch count are not reported.",
            "The article's WHC, degree-of-texturization, integrity-index, DPPH, and total-phenolic results are presented in figures rather than tabulated numeric source values and are not digitized here.",
            "The formulation percentage basis is not specified in Table 1 and is preserved without assigning a dry-matter basis.",
            "This soy-based ingredient system includes wheat gluten and corn starch and does not validate Kenyan ingredient formulations.",
        ],
    }
    summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--summary", type=Path, default=DEFAULT_SUMMARY)
    args = parser.parse_args()
    summary = import_dataset(args.input, args.output, args.summary)
    print(f"Imported {summary['record_count']} HMMA formulation summaries from {args.input}")
    print(f"Wrote {args.output}")
    print(f"CSV SHA-256: {summary['source_csv_sha256']}")


if __name__ == "__main__":
    main()
