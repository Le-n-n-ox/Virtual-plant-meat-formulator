"""Normalize the six whole-faba HME formulation summaries reported in 2024.

The source table omits units for mechanical values. The WAC method describes a
mass ratio, but the tabulated 165--220 values do not reconcile to that scale.
This importer therefore preserves reported values without assigning model
units or marking these records as training-ready.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path
from typing import Any


BACKEND_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = BACKEND_ROOT / "data" / "reference" / "knaapila_2024_whole_faba_hme_table1_table5.csv"
DEFAULT_OUTPUT = BACKEND_ROOT / "data" / "processed" / "knaapila_whole_faba_hme_2024_review.jsonl"
DEFAULT_SUMMARY = BACKEND_ROOT / "data" / "processed" / "knaapila_whole_faba_hme_2024_review.summary.json"

SOURCE_ID = "knaapila-whole-faba-hme-2024"
SOURCE_DOI = "10.3390/foods13101444"
SOURCE_LICENSE = "CC BY 4.0"
SOURCE_CITATION = (
    "Knaapila, A.; Kantanen, K.; Ramos-Diaz, J. M.; Piironen, V.; Sandell, M.; "
    "Jouppila, K. 2024. Sensory and Physical Properties of Fibrous Meat Analogs "
    "Made from Faba Bean, Pea, and Oat Using High-Moisture Extrusion. "
    "Foods 13(10), 1444. https://doi.org/10.3390/foods13101444"
)

TEXTURE_METRICS = {
    "hardness": ("hardness_mean_reported", "hardness_sd_reported", "hardness_group"),
    "gumminess": ("gumminess_mean_reported", "gumminess_sd_reported", "gumminess_group"),
    "springiness": ("springiness_mean_reported", "springiness_sd_reported", "springiness_group"),
    "chewiness": ("chewiness_mean_reported", "chewiness_sd_reported", "chewiness_group"),
    "cutting_strength_longitudinal": (
        "cutting_longitudinal_mean_reported",
        "cutting_longitudinal_sd_reported",
        "cutting_longitudinal_group",
    ),
    "cutting_strength_perpendicular": (
        "cutting_perpendicular_mean_reported",
        "cutting_perpendicular_sd_reported",
        "cutting_perpendicular_group",
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
            "sample_code",
            "faba_form",
            "faba_pct_dm",
            "pea_protein_isolate_pct_dm",
            "oat_fiber_concentrate_pct_dm",
            "protein_g_per_100g_dm",
            "screw_speed_rpm",
            "total_feed_rate_g_min",
            "feed_water_pct",
            "barrel_zone_temperatures_c",
            "cooling_die_temp_c",
            "wac_mean_reported",
            "wac_sd_reported",
            "wac_group",
            "texture_cutting_replicates",
            "wac_replicates",
        }
        required |= {field for metric in TEXTURE_METRICS.values() for field in metric}
        missing = sorted(required - set(reader.fieldnames or []))
        if missing:
            raise ValueError(f"Missing expected table columns: {', '.join(missing)}")

        for csv_row_number, row in enumerate(reader, start=2):
            sample_code = row["sample_code"].strip()
            temperatures = [int(value) for value in row["barrel_zone_temperatures_c"].split(";")]
            if len(temperatures) != 7:
                raise ValueError(f"Expected seven barrel zones at CSV row {csv_row_number}")

            formulation = {
                "faba_form": row["faba_form"],
                "faba_fraction_of_dry_matter": {
                    "value": _number(row, "faba_pct_dm", csv_row_number),
                    "unit": "% dry matter",
                },
                "pea_protein_isolate_fraction_of_dry_matter": {
                    "value": _number(row, "pea_protein_isolate_pct_dm", csv_row_number),
                    "unit": "% dry matter",
                },
                "oat_fiber_concentrate_fraction_of_dry_matter": {
                    "value": _number(row, "oat_fiber_concentrate_pct_dm", csv_row_number),
                    "unit": "% dry matter",
                },
                "protein": {
                    "value": _number(row, "protein_g_per_100g_dm", csv_row_number),
                    "unit": "g/100 g dry matter",
                    "basis": "calculated from analyzed ingredient protein contents",
                },
            }

            measurements: dict[str, Any] = {}
            for metric, (mean_field, sd_field, group_field) in TEXTURE_METRICS.items():
                measurements[metric] = {
                    "reported_mean": _number(row, mean_field, csv_row_number),
                    "reported_standard_deviation": _number(row, sd_field, csv_row_number),
                    "reported_unit": None,
                    "unit_status": "not_stated_in_source_table_or_text_reviewed",
                    "significance_group": row[group_field],
                    "replicate_count": int(_number(row, "texture_cutting_replicates", csv_row_number)),
                    "summary_statistic": "mean and standard deviation",
                }

            measurements["water_absorption_capacity"] = {
                "reported_mean": _number(row, "wac_mean_reported", csv_row_number),
                "reported_standard_deviation": _number(row, "wac_sd_reported", csv_row_number),
                "reported_unit": None,
                "method_unit_description": "grams of water retained per gram of freeze-dried extrudate",
                "unit_status": "table_scale_not_reconciled_with_method_unit",
                "significance_group": row["wac_group"],
                "replicate_count": int(_number(row, "wac_replicates", csv_row_number)),
                "summary_statistic": "mean and standard deviation",
            }

            record = {
                "schema_version": 1,
                "source": {
                    "id": SOURCE_ID,
                    "doi": SOURCE_DOI,
                    "citation": SOURCE_CITATION,
                    "license": SOURCE_LICENSE,
                    "usage_scope": "attribution required; retain source citation and licence",
                },
                "record_type": "hme_formulation_summary",
                "identifiers": {
                    "sample_id": f"knaapila2024-{sample_code}",
                    "source_sample_code": sample_code,
                    "extrusion_batch_replicates_reported": None,
                },
                "processing": {
                    "regime": "high_moisture_extrusion",
                    "ingredient_system": "whole faba material, pea protein isolate, with optional oat fiber concentrate",
                    "formulation": formulation,
                    "inputs": {
                        "total_feed_rate": {
                            "value": _number(row, "total_feed_rate_g_min", csv_row_number),
                            "unit": "g/min",
                        },
                        "feed_water_content": {
                            "value": _number(row, "feed_water_pct", csv_row_number),
                            "unit": "%",
                        },
                        "screw_speed": {
                            "value": _number(row, "screw_speed_rpm", csv_row_number),
                            "unit": "rpm",
                        },
                    },
                    "fixed_conditions": {
                        "barrel_temperature_profile": {"values": temperatures, "unit": "degC"},
                        "cooling_die_temperature": {
                            "value": _number(row, "cooling_die_temp_c", csv_row_number),
                            "unit": "degC",
                        },
                        "extruder": "Rheomex PTW24/28p twin-screw extruder with long cooling die",
                    },
                },
                "measurements": measurements,
                "method": {
                    "texture_and_cutting_replicates": 5,
                    "water_absorption_capacity_replicates": 3,
                    "texture_protocol": "Texture analyzer method cites Ramos Diaz et al. (2018) with modifications; preserve article-reported means and SDs.",
                    "water_absorption_capacity_protocol": "Freeze-dried pieces rehydrated in water at 50 degC for 16 h; article text defines WAC as g water retained per g freeze-dried extrudate.",
                    "replication_note": "The article describes six formulations prepared under fixed conditions but does not report repeated extrusion preparations for each formulation.",
                },
                "training_eligibility": {
                    "eligible": False,
                    "reason": "Mechanical target units are not reported in the source table; WAC table values do not reconcile with the method's stated g/g scale.",
                },
                "source_reference": {
                    "file": input_path.name,
                    "csv_row": csv_row_number,
                    "sha256": checksum,
                    "article_tables": ["Table 1", "Table 5"],
                    "article_url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC11119597/",
                },
                "source_row": row,
            }
            records.append(record)

    expected_sample_codes = {"F30", "GF30", "F50", "GF50", "F35+O", "GF35+O"}
    actual_sample_codes = {record["identifiers"]["source_sample_code"] for record in records}
    if actual_sample_codes != expected_sample_codes or len(records) != 6:
        raise ValueError(f"Expected the six reported formulations, found {sorted(actual_sample_codes)}")

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
        "sample_codes": sorted(actual_sample_codes),
        "measurement_replicates": {"texture_and_cutting": 5, "water_absorption_capacity": 3},
        "training_eligible": False,
        "limitations": [
            "Six reported formulations; process settings were held constant.",
            "The article does not report repeated extrusion preparations per formulation.",
            "The mechanical-property table omits measurement units; these raw values must not be pooled with unit-labeled datasets.",
            "The WAC method states g/g, while the table values (165--220) do not reconcile to that scale; values are retained without inferred rescaling.",
            "This source broadens ingredient-form evidence to whole faba material but does not cover Kenyan varieties or formulations.",
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
    print(f"Wrote {summary['record_count']} whole-faba HME formulation summaries to {args.output}")
    print(f"Training eligible: {summary['training_eligible']}")


if __name__ == "__main__":
    main()
