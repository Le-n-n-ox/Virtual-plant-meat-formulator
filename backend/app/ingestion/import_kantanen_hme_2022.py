"""Normalize the CC BY faba-bean HME response-surface tables from 2022.

The tracked CSV is a faithful transcription of Tables A2 and A3. Each source
row represents an extrusion condition and its reported mean/SD summaries; the
individual replicate values are not available in the article.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = BACKEND_ROOT / "data" / "reference" / "kantanen_2022_hme_table_A2_A3.csv"
DEFAULT_OUTPUT = BACKEND_ROOT / "data" / "processed" / "kantanen_faba_hme_2022_review.jsonl"
DEFAULT_SUMMARY = BACKEND_ROOT / "data" / "processed" / "kantanen_faba_hme_2022_review.summary.json"

SOURCE_ID = "kantanen-faba-hme-2022"
SOURCE_DOI = "10.3390/foods11091280"
SOURCE_LICENSE = "CC BY 4.0"
SOURCE_CITATION = (
    "Kantanen, K.; Oksanen, A.; Edelmann, M.; Suhonen, H.; Sontag-Strohm, T.; "
    "Piironen, V.; Ramos Diaz, J. M.; Jouppila, K. 2022. Physical Properties of "
    "Extrudates with Fibrous Structures Made of Faba Bean Protein Ingredients "
    "Using High Moisture Extrusion. Foods 11(9), 1280. "
    "https://doi.org/10.3390/foods11091280"
)

INPUT_FIELDS = {
    "fpi_pct_solids": "% of dry solids",
    "feed_water_pct": "%",
    "long_die_temp_c": "degC",
}
MEASUREMENT_FIELDS = {
    "torque": ("torque_mean_nm", "torque_sd_nm", "N m", "process_response", None),
    "pressure": ("pressure_mean_bar", "pressure_sd_bar", "bar", "process_response", None),
    "hardness": ("hardness_mean_n", "hardness_sd_n", "N", "texture", "replicate_count_tpa"),
    "springiness": (
        "springiness_mean",
        "springiness_sd",
        "dimensionless",
        "texture",
        "replicate_count_tpa",
    ),
    "gumminess": ("gumminess_mean_n", "gumminess_sd_n", "N", "texture", "replicate_count_tpa"),
    "chewiness": ("chewiness_mean_j", "chewiness_sd_j", "J", "texture", "replicate_count_tpa"),
    "cutting_strength_longitudinal": (
        "cutting_long_mean_n",
        "cutting_long_sd_n",
        "N",
        "cutting_strength",
        "replicate_count_cutting",
    ),
    "cutting_strength_perpendicular": (
        "cutting_perp_mean_n",
        "cutting_perp_sd_n",
        "N",
        "cutting_strength",
        "replicate_count_cutting",
    ),
    "anisotropy_index": (
        "anisotropy_index",
        None,
        "dimensionless_ratio",
        "derived_texture_index",
        None,
    ),
    "water_absorption_capacity": (
        "wac_mean_pct",
        "wac_sd_pct",
        "%",
        "functional_property",
        "replicate_count_absorption",
    ),
    "oil_absorption_capacity": (
        "oac_mean_pct",
        "oac_sd_pct",
        "%",
        "functional_property",
        "replicate_count_absorption",
    ),
    "water_hydration_capacity": (
        "whc_mean_ml_g",
        "whc_sd_ml_g",
        "mL/g",
        "functional_property",
        "replicate_count_absorption",
    ),
    "color_l_star": ("lstar_mean", "lstar_sd", "CIELAB_L_star", "color", "replicate_count_color"),
    "color_a_star": ("astar_mean", "astar_sd", "CIELAB_a_star", "color", "replicate_count_color"),
    "color_b_star": ("bstar_mean", "bstar_sd", "CIELAB_b_star", "color", "replicate_count_color"),
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
        required = {"sample_id", *INPUT_FIELDS}
        required |= {name for spec in MEASUREMENT_FIELDS.values() for name in spec[:2] if name}
        required |= {spec[4] for spec in MEASUREMENT_FIELDS.values() if spec[4]}
        missing = sorted(required - set(reader.fieldnames or []))
        if missing:
            raise ValueError(f"Missing expected table columns: {', '.join(missing)}")

        for csv_row_number, row in enumerate(reader, start=2):
            sample_id = row["sample_id"].strip()
            inputs = {
                name: {"value": _number(row, name, csv_row_number), "unit": unit}
                for name, unit in INPUT_FIELDS.items()
            }
            measurements: dict[str, Any] = {}
            for metric, (
                mean_field,
                sd_field,
                unit,
                category,
                count_field,
            ) in MEASUREMENT_FIELDS.items():
                measurement = {
                    "mean": _number(row, mean_field, csv_row_number),
                    "unit": unit,
                    "category": category,
                    "summary_statistic": "mean",
                }
                if sd_field:
                    measurement["standard_deviation"] = _number(row, sd_field, csv_row_number)
                if count_field:
                    measurement["replicate_count"] = int(_number(row, count_field, csv_row_number))
                measurements[metric] = measurement

            records.append(
                {
                    "schema_version": 1,
                    "source": {
                        "id": SOURCE_ID,
                        "doi": SOURCE_DOI,
                        "citation": SOURCE_CITATION,
                        "license": SOURCE_LICENSE,
                        "usage_scope": "attribution required; preserve source citation and licence",
                    },
                    "record_type": "hme_trial_summary",
                    "identifiers": {
                        "trial_id": f"kantanen2022-{sample_id}",
                        "source_sample_id": int(sample_id),
                    },
                    "processing": {
                        "regime": "high_moisture_extrusion",
                        "ingredient_system": "faba bean protein isolate (FPI) and protein concentrate (FPC) blend",  # noqa: E501
                        "formulation": {"fpi_fraction_of_solids": inputs.pop("fpi_pct_solids")},
                        "inputs": inputs,
                        "fixed_conditions": {
                            "screw_speed": {"value": 400, "unit": "rpm"},
                            "total_feed_rate": {"value": 50, "unit": "g/min"},
                            "barrel_temperature_profile": {
                                "values": [25, 40, 80, 100, 120, 150, 150],
                                "unit": "degC",
                            },
                            "extruder": "Rheomex PTW24/28p twin-screw; 24 mm screw; L/D 28:1",
                        },
                    },
                    "measurements": measurements,
                    "method": {
                        "texture_profile_analysis": "Two-cycle compression; five replicate pieces per trial; Stable Micro Systems texture analyzer.",  # noqa: E501
                        "cutting_strength": "Five replicate pieces per trial; longitudinal and perpendicular to flow.",  # noqa: E501
                        "absorption": "Water/oil absorption n=3; water hydration capacity n=3.",
                        "color": "CIELAB, n=10.",
                        "summary_note": "Published means and standard deviations are retained; raw replicate readings are not supplied.",  # noqa: E501
                    },
                    "source_reference": {
                        "file": input_path.name,
                        "csv_row": csv_row_number,
                        "sha256": checksum,
                        "article_tables": ["Table 2", "Table A2", "Table A3"],
                    },
                    "source_row": row,
                }
            )

    if len(records) != 17:
        raise ValueError(f"Expected 17 experimental runs, found {len(records)}")

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
        "distinct_setting_count": len(
            {
                (
                    r["processing"]["formulation"]["fpi_fraction_of_solids"]["value"],
                    r["processing"]["inputs"]["feed_water_pct"]["value"],
                    r["processing"]["inputs"]["long_die_temp_c"]["value"],
                )
                for r in records
            }
        ),
        "targets_and_responses": list(MEASUREMENT_FIELDS),
        "limitations": [
            "Measurements are means and standard deviations; individual replicate readings are not supplied.",  # noqa: E501
            "Runs 13, 15, and 17 repeat the center formulation/process setting.",
            "The dataset covers faba protein isolate/concentrate blends in one laboratory extruder, not Kenyan whole-food formulations.",  # noqa: E501
        ],
    }
    summary_path.write_text(
        json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--summary", type=Path, default=DEFAULT_SUMMARY)
    args = parser.parse_args()
    summary = import_dataset(args.input, args.output, args.summary)
    print(f"Wrote {summary['record_count']} HME trial summaries to {args.output}")
    print(f"Distinct process/formulation settings: {summary['distinct_setting_count']}")


if __name__ == "__main__":
    main()
