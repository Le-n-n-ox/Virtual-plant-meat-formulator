"""Normalize published mung-bean isolate/wheat-gluten HME condition summaries.

The tracked reference CSV transcribes the nine conditions in Table 1 and the
mechanical summary statistics in Tables 3 and 4 of Mektun & Kijroongrojana
(2026). Each JSONL record is one published extrusion condition, not one raw
specimen. Source means, SDs, sample counts, units, and raw CSV fields are kept.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = BACKEND_ROOT / "data" / "reference" / "mektun_2026_mungbean_wg_hme_tables1_3_4.csv"
DEFAULT_OUTPUT = BACKEND_ROOT / "data" / "processed" / "mektun_mungbean_wg_hme_2026_review.jsonl"
DEFAULT_SUMMARY = (
    BACKEND_ROOT / "data" / "processed" / "mektun_mungbean_wg_hme_2026_review.summary.json"
)

SOURCE_ID = "mektun-kijroongrojana-mungbean-wg-hme-2026"
SOURCE_DOI = "10.31883/pjfns/221669"
SOURCE_URL = (
    "https://journal.pan.olsztyn.pl/Impact-of-Extrusion-Parameters-on-Textural-and-Sensory-"
    "Characteristics-of-High-Moisture,221669,0,2.html"
)
SOURCE_LICENSE = "CC BY 4.0"
SOURCE_CITATION = (
    "Mektun, K.; Kijroongrojana, K. 2026. Impact of Extrusion Parameters on Textural and "
    "Sensory Characteristics of High-Moisture Meat Analogue from Mung Bean Protein and "
    "Wheat Gluten. Polish Journal of Food and Nutrition Sciences 76(2):189-201. "
    "https://doi.org/10.31883/pjfns/221669"
)

# The HTML table extraction exposes these strings, but the linked publisher PDF
# timed out during visual inspection. Keep them as unresolved transcription,
# never as parsed or executable regression metadata.
TABLE_5_EQUATION_TEXT_UNVERIFIED = {
    "source_table": "Table 5",
    "status": "unresolved_pdf_visual_verification",
    "executable": False,
    "scope": (
        "70:30 mung bean protein isolate:wheat gluten blend and the study's tested central-composite "  # noqa: E501
        "temperature/moisture design only"
    ),
    "entries": [
        {
            "response": "Hardness",
            "equation_text_verbatim_from_html_table": "Y = 28780.89 + 2180.79 X1 – 6358.48 X2",
            "r_squared_text_verbatim_from_html_table": "0.8448",
            "model_probability_text_verbatim_from_html_table": "Sig",
            "lack_of_fit_text_verbatim_from_html_table": "NS",
        },
        {
            "response": "Chewiness",
            "equation_text_verbatim_from_html_table": "Y = 18871.25 + 2054.73 X1 – 3475.42 X2",
            "r_squared_text_verbatim_from_html_table": "0.7424",
            "model_probability_text_verbatim_from_html_table": "Sig",
            "lack_of_fit_text_verbatim_from_html_table": "NS",
        },
    ],
    "caveat": (
        "Publisher PDF could not be visually verified (request timed out); HTML text extraction may "  # noqa: E501
        "concatenate or misplace decimal points. Preserve this text for source review only; do not "
        "parse, evaluate, or use it as an executable model until the PDF typography is checked."
    ),
}

INPUTS = {
    "barrel_temperature_zone_6_7_c": ("barrel_temperature_zone_6_7", "degC"),
    "feed_moisture_content_pct_w_w": ("feed_moisture_content", "% w/w"),
    "temperature_coded_level": ("temperature_coded_level", "coded level"),
    "moisture_coded_level": ("moisture_coded_level", "coded level"),
}

MECHANICAL_METRICS = {
    "penetration_firmness": {
        "mean": "penetration_firmness_mean_reported",
        "sd": "penetration_firmness_sd_reported",
        "unit": "penetration_firmness_unit_reported",
        "n": "penetration_replicate_n_reported",
        "table": "Table 3",
        "method": "penetration_test",
    },
    "crosswise_strength": {
        "mean": "crosswise_strength_mean_reported",
        "sd": "crosswise_strength_sd_reported",
        "unit": "crosswise_strength_unit_reported",
        "n": "crosswise_shear_replicate_n_reported",
        "table": "Table 3",
        "method": "razor_blade_shear_test",
    },
    "lengthwise_strength": {
        "mean": "lengthwise_strength_mean_reported",
        "sd": "lengthwise_strength_sd_reported",
        "unit": "lengthwise_strength_unit_reported",
        "n": "lengthwise_shear_replicate_n_reported",
        "table": "Table 3",
        "method": "razor_blade_shear_test",
    },
    "degree_of_texturization": {
        "mean": "degree_of_texturization_mean_reported",
        "sd": "degree_of_texturization_sd_reported",
        "unit": "degree_of_texturization_unit_reported",
        "n": "shear_replicate_n_reported",
        "table": "Table 3",
        "method": "ratio_of_lengthwise_to_crosswise_strength",
    },
    "tpa_hardness": {
        "mean": "tpa_hardness_mean_reported",
        "sd": "tpa_hardness_sd_reported",
        "unit": "tpa_hardness_unit_reported",
        "n": "tpa_hardness_replicate_n_reported",
        "table": "Table 4",
        "method": "texture_profile_analysis",
    },
    "tpa_springiness": {
        "mean": "tpa_springiness_mean_reported",
        "sd": "tpa_springiness_sd_reported",
        "unit": "tpa_springiness_unit_reported",
        "n": "tpa_springiness_replicate_n_reported",
        "table": "Table 4",
        "method": "texture_profile_analysis",
    },
    "tpa_cohesiveness": {
        "mean": "tpa_cohesiveness_mean_reported",
        "sd": "tpa_cohesiveness_sd_reported",
        "unit": "tpa_cohesiveness_unit_reported",
        "n": "tpa_cohesiveness_replicate_n_reported",
        "table": "Table 4",
        "method": "texture_profile_analysis",
    },
    "tpa_chewiness": {
        "mean": "tpa_chewiness_mean_reported",
        "sd": "tpa_chewiness_sd_reported",
        "unit": "tpa_chewiness_unit_reported",
        "n": "tpa_chewiness_replicate_n_reported",
        "table": "Table 4",
        "method": "texture_profile_analysis",
    },
    "tpa_resilience": {
        "mean": "tpa_resilience_mean_reported",
        "sd": "tpa_resilience_sd_reported",
        "unit": "tpa_resilience_unit_reported",
        "n": "tpa_resilience_replicate_n_reported",
        "table": "Table 4",
        "method": "texture_profile_analysis",
    },
}

EXPECTED_SAMPLE_CODES = {str(number) for number in range(1, 10)}


def _number(row: dict[str, str], field: str, csv_row_number: int) -> float:
    try:
        return float(row[field])
    except (KeyError, ValueError) as error:
        raise ValueError(
            f"Invalid numeric value for {field} at CSV row {csv_row_number}: {row.get(field)!r}"
        ) from error


def _count(row: dict[str, str], field: str, csv_row_number: int) -> int:
    number = _number(row, field, csv_row_number)
    if not number.is_integer():
        raise ValueError(f"Expected integer count for {field} at CSV row {csv_row_number}")
    return int(number)


def _reported_unit(value: str) -> str | None:
    value = value.strip()
    return value or None


def import_dataset(input_path: Path, output_path: Path, summary_path: Path) -> dict[str, Any]:
    checksum = hashlib.sha256(input_path.read_bytes()).hexdigest()
    records: list[dict[str, Any]] = []
    with input_path.open("r", encoding="utf-8-sig", newline="") as source_file:
        reader = csv.DictReader(source_file)
        required = {
            "source_id",
            "source_citation",
            "source_doi",
            "source_license",
            "source_url",
            "sample_code",
            "treatment_label",
            "table_1_row",
            "table_3_row",
            "table_4_row",
            "center_condition_triplicate_reported",
            "center_condition_run_count_reported",
            "mung_bean_protein_isolate_pct_w_w",
            "wheat_gluten_pct_w_w",
            "screw_speed_rpm",
            "dry_raw_feed_rate_kg_h",
            "cooling_die_temperature_c",
            "cooling_die_width_mm",
            "cooling_die_height_mm",
            "cooling_die_length_mm",
            "extruder_barrel_length_reported",
            "extruder_barrel_length_unit_reported",
            "extruder_screw_diameter_mm",
            "extrusion_run_duration_min",
            *list(INPUTS),
        }
        required |= {
            field
            for metric in MECHANICAL_METRICS.values()
            for field in (metric["mean"], metric["sd"], metric["unit"], metric["n"])
        }
        required |= {f"barrel_zone_{zone}_c" for zone in (1, 2, 3, 4, 5, 8, 9)}
        missing = sorted(required - set(reader.fieldnames or []))
        if missing:
            raise ValueError(f"Missing expected CSV columns: {', '.join(missing)}")

        for csv_row_number, row in enumerate(reader, start=2):
            if row["source_id"] != SOURCE_ID:
                raise ValueError(f"Unexpected source_id at CSV row {csv_row_number}")
            if row["source_doi"] != SOURCE_DOI or row["source_license"] != SOURCE_LICENSE:
                raise ValueError(f"Unexpected source citation/license at CSV row {csv_row_number}")

            sample_code = row["sample_code"].strip()
            inputs: dict[str, Any] = {}
            for source_field, (normalized_name, unit) in INPUTS.items():
                inputs[normalized_name] = {
                    "value": _number(row, source_field, csv_row_number),
                    "unit": unit,
                }

            zone_temperature = inputs["barrel_temperature_zone_6_7"]["value"]
            barrel_profile = (
                [_count(row, f"barrel_zone_{zone}_c", csv_row_number) for zone in (1, 2, 3, 4, 5)]
                + [zone_temperature, zone_temperature]
                + [_count(row, f"barrel_zone_{zone}_c", csv_row_number) for zone in (8, 9)]
            )

            measurements: dict[str, Any] = {}
            for metric_name, spec in MECHANICAL_METRICS.items():
                reported_unit = _reported_unit(row[spec["unit"]])
                measurement: dict[str, Any] = {
                    "mean": _number(row, spec["mean"], csv_row_number),
                    "standard_deviation": _number(row, spec["sd"], csv_row_number),
                    "reported_unit": reported_unit,
                    "replicate_count": _count(row, spec["n"], csv_row_number),
                    "summary_statistic": "mean and standard deviation",
                    "source_table": spec["table"],
                    "method": spec["method"],
                }
                if metric_name == "degree_of_texturization":
                    measurement["source_definition"] = "lengthwise strength / crosswise strength"
                measurements[metric_name] = measurement

            center_triplicate = row["center_condition_triplicate_reported"].strip()
            center_runs_raw = row["center_condition_run_count_reported"].strip()
            center_run_count = (
                _count(row, "center_condition_run_count_reported", csv_row_number)
                if center_runs_raw
                else None
            )

            record = {
                "schema_version": 1,
                "source": {
                    "id": SOURCE_ID,
                    "doi": SOURCE_DOI,
                    "citation": SOURCE_CITATION,
                    "url": SOURCE_URL,
                    "license": SOURCE_LICENSE,
                    "usage_scope": "CC BY 4.0; attribution to the original article is required",
                },
                "record_type": "hme_condition_published_summary",
                "data_level": "condition_level_mean_and_standard_deviation; raw replicates not published",  # noqa: E501
                "identifiers": {
                    "trial_id": f"mektun2026-{sample_code}",
                    "source_sample_code": sample_code,
                    "source_treatment_label": row["treatment_label"],
                    "source_table_rows": {
                        "Table 1": _count(row, "table_1_row", csv_row_number),
                        "Table 3": _count(row, "table_3_row", csv_row_number),
                        "Table 4": _count(row, "table_4_row", csv_row_number),
                    },
                },
                "processing": {
                    "regime": "high_moisture_extrusion",
                    "ingredient_system": "mung bean protein isolate and wheat gluten",
                    "formulation": {
                        "mung_bean_protein_isolate_fraction": {
                            "value": _number(
                                row, "mung_bean_protein_isolate_pct_w_w", csv_row_number
                            ),
                            "unit": "% w/w",
                        },
                        "wheat_gluten_fraction": {
                            "value": _number(row, "wheat_gluten_pct_w_w", csv_row_number),
                            "unit": "% w/w",
                        },
                        "basis": "as-blended weight ratio reported by source",
                    },
                    "inputs": inputs,
                    "fixed_conditions": {
                        "screw_speed": {
                            "value": _number(row, "screw_speed_rpm", csv_row_number),
                            "unit": "rpm",
                        },
                        "dry_raw_feed_rate": {
                            "value": _number(row, "dry_raw_feed_rate_kg_h", csv_row_number),
                            "unit": "kg/h",
                        },
                        "barrel_temperature_profile_zones_1_to_9": {
                            "values": barrel_profile,
                            "unit": "degC",
                            "zone_6_and_7_use_trial_temperature": True,
                        },
                        "cooling_die_temperature": {
                            "value": _number(row, "cooling_die_temperature_c", csv_row_number),
                            "unit": "degC",
                        },
                        "cooling_die_dimensions": {
                            "width": {
                                "value": _number(row, "cooling_die_width_mm", csv_row_number),
                                "unit": "mm",
                            },
                            "height": {
                                "value": _number(row, "cooling_die_height_mm", csv_row_number),
                                "unit": "mm",
                            },
                            "length": {
                                "value": _number(row, "cooling_die_length_mm", csv_row_number),
                                "unit": "mm",
                            },
                        },
                        "extruder_barrel_length": {
                            "reported_value": _number(
                                row, "extruder_barrel_length_reported", csv_row_number
                            ),
                            "reported_unit": row["extruder_barrel_length_unit_reported"],
                            "source_note": "Source reports barrel length as 72 mm; retained without correction.",  # noqa: E501
                        },
                        "extruder_screw_diameter": {
                            "value": _number(row, "extruder_screw_diameter_mm", csv_row_number),
                            "unit": "mm",
                        },
                        "extrusion_run_duration": {
                            "value": _number(row, "extrusion_run_duration_min", csv_row_number),
                            "unit": "min",
                        },
                    },
                    "center_condition_replicates": {
                        "triplicate_reported": center_triplicate == "Yes",
                        "run_count_reported": center_run_count,
                    },
                },
                "measurements": measurements,
                "method": {
                    "texture_profile_analysis": (
                        "Double-compression test on 2 x 2 cm samples, 1.5 cm thick; source reports "
                        "a minimum of ten measurements. Hardness is first-compression maximum force; "  # noqa: E501
                        "springiness, cohesiveness, chewiness, and resilience follow the source definitions."  # noqa: E501
                    ),
                    "penetration_test": (
                        "Multiple-puncture probe on 4 x 4 cm samples, 1.5 cm thick, at 75% of original "  # noqa: E501
                        "thickness and 2 mm/s; rupture force is reported as firmness; minimum ten measurements."  # noqa: E501
                    ),
                    "razor_blade_shear_test": (
                        "Meullenet-Owens razor shear blade; 2 x 2 x 1.5 cm samples cut to 75% thickness "  # noqa: E501
                        "at 2 mm/s in lengthwise and crosswise directions; minimum ten measurements."  # noqa: E501
                    ),
                    "specimen_handling": (
                        "Samples stored at -20 degC for no longer than one month, defrosted at 4 degC overnight, "  # noqa: E501
                        "then equilibrated at room temperature for at least two hours before analysis."  # noqa: E501
                    ),
                    "units_note": (
                        "Units absent from a source table cell remain null. Table 4 labels chewiness as N; "  # noqa: E501
                        "that reported unit is retained."
                    ),
                },
                "source_reference": {
                    "file": input_path.name,
                    "csv_row": csv_row_number,
                    "sha256": checksum,
                    "article_tables": ["Table 1", "Table 3", "Table 4"],
                },
                "source_row": row,
            }
            records.append(record)

    if {record["identifiers"]["source_sample_code"] for record in records} != EXPECTED_SAMPLE_CODES:
        raise ValueError("Expected the nine source conditions with sample codes 1 through 9")
    if len(records) != 9:
        raise ValueError(f"Expected 9 condition rows, found {len(records)}")
    if (
        sum(
            record["processing"]["center_condition_replicates"]["triplicate_reported"]
            for record in records
        )
        != 1
    ):
        raise ValueError("Expected exactly one center condition marked as triplicate")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="\n") as destination:
        for record in records:
            destination.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")

    summary = {
        "source_id": SOURCE_ID,
        "doi": SOURCE_DOI,
        "citation": SOURCE_CITATION,
        "source_url": SOURCE_URL,
        "license": SOURCE_LICENSE,
        "source_csv_sha256": checksum,
        "record_count": len(records),
        "distinct_process_conditions": len(
            {
                (
                    record["processing"]["inputs"]["barrel_temperature_zone_6_7"]["value"],
                    record["processing"]["inputs"]["feed_moisture_content"]["value"],
                )
                for record in records
            }
        ),
        "mechanical_metrics": list(MECHANICAL_METRICS),
        "table_5_equation_text_unverified": TABLE_5_EQUATION_TEXT_UNVERIFIED,
        "limitations": [
            "Records are condition-level published means and standard deviations; individual instrument readings are not supplied.",  # noqa: E501
            "The paper reports the 150BT-60MC center condition as triplicate and the texture-table measurement count as n=10; these describe different replication levels and are retained separately.",  # noqa: E501
            "The source reports extruder barrel length as 72 mm. The value is preserved verbatim and its physical interpretation remains unresolved.",  # noqa: E501
            "Table 4 reports chewiness in N; the importer retains the table unit without conversion.",  # noqa: E501
            "Table 5 hardness and chewiness equations and fit statistics are retained verbatim from HTML text extraction but excluded from executable metadata until PDF rendering is visually verified; even if confirmed, they apply only to this 70:30 MBPI:WG system and its tested design.",  # noqa: E501
            "This is one mung bean protein isolate/wheat gluten blend processed on one extruder. It does not validate texture predictions for Kenyan whole-food formulations or other equipment.",  # noqa: E501
            "CC BY 4.0 attribution is required; retain the article citation and license with redistributed data.",  # noqa: E501
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
    print(f"Wrote {summary['record_count']} HME condition summaries to {args.output}")
    print(f"Distinct process conditions: {summary['distinct_process_conditions']}")
    print(f"Source CSV SHA-256: {summary['source_csv_sha256']}")


if __name__ == "__main__":
    main()
