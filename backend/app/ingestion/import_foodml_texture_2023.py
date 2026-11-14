"""Normalize the authors' open 2023 texture-prediction samples for research.

The 54 samples combine high-moisture extrusion and mechanical elongation.
The import preserves that distinction and the original study/group IDs so
downstream analysis can select the appropriate process regime explicitly.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
from collections import Counter
from pathlib import Path
from typing import Any


BACKEND_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = BACKEND_ROOT / "data" / "reference" / "foodml_texture_prediction_2023.csv"
DEFAULT_OUTPUT = BACKEND_ROOT / "data" / "processed" / "foodml_texture_prediction_2023_review.jsonl"
DEFAULT_SUMMARY = BACKEND_ROOT / "data" / "processed" / "foodml_texture_prediction_2023_review.summary.json"
DEFAULT_CROSSWALK = BACKEND_ROOT / "data" / "reference" / "foodml_ferawati_2021_crosswalk.csv"

SOURCE_ID = "foodml-texture-prediction-2023"
SOURCE_DOI = "10.3390/foods12020344"
SOURCE_LICENSE = "CC BY 4.0"
SOURCE_CITATION = (
    "Kircali Ata, S.; Shi, J. K.; Yao, X.; Hua, X. Y.; Haldar, S.; Chiang, J. H.; "
    "Wu, M. 2023. Predicting the Textural Properties of Plant-Based Meat Analogs "
    "with Machine Learning. Foods 12(2), 344. https://doi.org/10.3390/foods12020344"
)
FERAWATI_DOI = "10.3390/foods10040843"
FERAWATI_CITATION = (
    "Ferawati, F.; Zahari, I.; Barman, M.; Hefni, M.; Ahlström, C.; Witthöft, C.; "
    "Östbring, K. 2021. High-Moisture Meat Analogues Produced from Yellow Pea and "
    "Faba Bean Protein Isolates/Concentrate: Effect of Raw Material Composition and "
    "Extrusion Parameters on Texture Properties. Foods 10(4), 843. "
    "https://doi.org/10.3390/foods10040843"
)
FERAWATI_URL = "https://www.mdpi.com/2304-8158/10/4/843"
FERAWATI_TABLES = "A3; A4"
FOODML_N_PER_ARTICLE_G = 0.0098
EXPECTED_FERAWATI_GROUPS = {
    "YPI-com": {"group_id": 1, "temperature_profile_c": [40, 80, 130, 150]},
    "YPI-local": {"group_id": 2, "temperature_profile_c": [40, 80, 130, 150]},
    "FBC-com": {"group_id": 3, "temperature_profile_c": [40, 60, 130, 150]},
    "FBI-local": {"group_id": 4, "temperature_profile_c": [40, 60, 110, 130]},
}

EXPECTED_HEADER = [
    "no",
    "WG_frac",
    "protein",
    "target moisture",
    "moisture",
    "ash",
    "carbs",
    "fat",
    "fiber",
    "Hardness",
    "Chewiness",
    "Group_ID",
    "Study_ID",
    "",
    "",
]

STUDIES = {
    "1": {
        "source_study": "Ferawati et al. (2021), Foods 10:843, https://doi.org/10.3390/foods10040843",
        "process_regime": "high_moisture_extrusion",
        "study_label": "yellow pea/faba bean isolate or concentrate HME",
    },
    "2": {
        "source_study": "Chiang et al. (2019), Food Structure 19:100102, https://doi.org/10.1016/j.foostr.2018.11.002",
        "process_regime": "high_moisture_extrusion",
        "study_label": "soy protein concentrate/wheat gluten extrusion",
    },
    "3": {
        "source_study": "Chiang et al. (2021), Food Structure 28:100183, https://doi.org/10.1016/j.foostr.2021.100183",
        "process_regime": "mechanical_elongation",
        "study_label": "wheat gluten/soy protein isolate mechanical elongation",
    },
}

INPUT_UNITS = {
    "protein": "% wet basis",
    "target moisture": "%",
    "moisture": "% wet basis",
    "ash": "% wet basis",
    "carbs": "% wet basis",
    "fat": "% wet basis",
    "fiber": "% wet basis",
}
NUMERIC_TARGETS = {"Hardness": "N", "Chewiness": "N (as reported by source)"}


def _crosswalk_number(row: dict[str, str], field: str, csv_row_number: int) -> float:
    try:
        return float(row[field])
    except (KeyError, ValueError) as error:
        raise ValueError(
            f"Expected numeric value for {field} on crosswalk row {csv_row_number}, "
            f"got {row.get(field)!r}"
        ) from error


def _crosswalk_int(row: dict[str, str], field: str, csv_row_number: int) -> int:
    try:
        return int(row[field])
    except (KeyError, ValueError) as error:
        raise ValueError(
            f"Expected integer value for {field} on crosswalk row {csv_row_number}, "
            f"got {row.get(field)!r}"
        ) from error


def _enrich_ferawati_records(
    records: list[dict[str, Any]], crosswalk_path: Path
) -> dict[str, Any]:
    crosswalk_bytes = crosswalk_path.read_bytes()
    crosswalk_checksum = hashlib.sha256(crosswalk_bytes).hexdigest()
    by_sample_no = {
        record["identifiers"]["source_sample_no"]: record for record in records
    }
    ferawati_records = {
        sample_no: record
        for sample_no, record in by_sample_no.items()
        if record["identifiers"]["source_study_id"] == 1
    }
    if len(ferawati_records) != 30:
        raise ValueError(
            f"Expected 30 FoodML records from Ferawati et al., found {len(ferawati_records)}"
        )

    required_columns = {
        "foodml_source_sample_no",
        "foodml_source_group_id",
        "foodml_source_group_label",
        "article_table_a4_id",
        "article_material",
        "target_moisture_pct",
        "screw_speed_rpm",
        "temp_z1_c",
        "temp_z2_c",
        "temp_z3_c",
        "temp_z4_c",
        "total_mass_flow_kg_h",
        "sme_mean_kj_kg",
        "sme_sd_kj_kg",
        "hardness_mean_g_as_reported",
        "hardness_sd_g_as_reported",
        "springiness_mean",
        "springiness_sd",
        "chewiness_mean_g_as_reported",
        "chewiness_sd_g_as_reported",
        "crosswise_cutting_mean_g_as_reported",
        "crosswise_cutting_sd_g_as_reported",
        "lengthwise_cutting_mean_g_as_reported",
        "lengthwise_cutting_sd_g_as_reported",
        "article_doi",
        "article_tables",
        "notes",
    }
    matched_sample_numbers: set[int] = set()
    material_counts: Counter[str] = Counter()
    hardness_matches = 0
    chewiness_matches = 0
    row_count = 0

    with crosswalk_path.open("r", encoding="utf-8-sig", newline="") as source_file:
        reader = csv.DictReader(source_file)
        if set(reader.fieldnames or []) != required_columns:
            raise ValueError(
                "Unexpected Ferawati crosswalk columns: "
                f"{reader.fieldnames!r}"
            )
        for crosswalk_csv_row, row in enumerate(reader, start=2):
            row_count += 1
            sample_no = _crosswalk_int(row, "foodml_source_sample_no", crosswalk_csv_row)
            if sample_no in matched_sample_numbers:
                raise ValueError(f"Duplicate FoodML sample {sample_no} in crosswalk")
            matched_sample_numbers.add(sample_no)
            record = ferawati_records.get(sample_no)
            if record is None:
                raise ValueError(
                    f"Crosswalk sample {sample_no} is not a FoodML Ferawati record"
                )

            article_id = _crosswalk_int(row, "article_table_a4_id", crosswalk_csv_row)
            if article_id != sample_no - 24:
                raise ValueError(
                    f"FoodML sample {sample_no} does not map to expected Table A4 ID "
                    f"{sample_no - 24}; crosswalk says {article_id}"
                )
            identifiers = record["identifiers"]
            material = row["article_material"]
            group = EXPECTED_FERAWATI_GROUPS.get(material)
            if group is None:
                raise ValueError(f"Unknown Ferawati material {material!r}")
            source_group_label = row["foodml_source_group_label"]
            if (
                identifiers["source_study_id"] != 1
                or identifiers["source_group_id"]
                != _crosswalk_int(row, "foodml_source_group_id", crosswalk_csv_row)
                or identifiers["source_group_id"] != group["group_id"]
                or identifiers["source_group_label"] != source_group_label
                or source_group_label != material
            ):
                raise ValueError(
                    f"Study/group mismatch for FoodML sample {sample_no}: "
                    f"record={identifiers!r}, crosswalk={row!r}"
                )
            if row["article_doi"] != FERAWATI_DOI or row["article_tables"] != FERAWATI_TABLES:
                raise ValueError(
                    f"Unexpected article citation/table reference on crosswalk row "
                    f"{crosswalk_csv_row}"
                )

            target_moisture = _crosswalk_number(row, "target_moisture_pct", crosswalk_csv_row)
            foodml_target_moisture = record["values"]["target moisture"]["value"]
            if not math.isclose(target_moisture, foodml_target_moisture, abs_tol=1e-9):
                raise ValueError(
                    f"Target moisture mismatch for FoodML sample {sample_no}: "
                    f"FoodML={foodml_target_moisture}, article={target_moisture}"
                )

            temperature_profile = [
                _crosswalk_int(row, field, crosswalk_csv_row)
                for field in ("temp_z1_c", "temp_z2_c", "temp_z3_c", "temp_z4_c")
            ]
            if temperature_profile != group["temperature_profile_c"]:
                raise ValueError(
                    f"Temperature profile mismatch for {material} at crosswalk row "
                    f"{crosswalk_csv_row}: {temperature_profile}"
                )

            article_hardness = _crosswalk_number(
                row, "hardness_mean_g_as_reported", crosswalk_csv_row
            )
            article_chewiness = _crosswalk_number(
                row, "chewiness_mean_g_as_reported", crosswalk_csv_row
            )
            foodml_hardness = record["targets"]["hardness"]["value"]
            foodml_chewiness = record["targets"]["chewiness"]["value"]
            if not math.isclose(
                article_hardness * FOODML_N_PER_ARTICLE_G,
                foodml_hardness,
                rel_tol=0,
                abs_tol=1e-7,
            ):
                raise ValueError(
                    f"Table A4 hardness does not align with FoodML sample {sample_no}: "
                    f"{article_hardness} g × {FOODML_N_PER_ARTICLE_G} = "
                    f"{article_hardness * FOODML_N_PER_ARTICLE_G} N, "
                    f"FoodML={foodml_hardness} N"
                )
            if not math.isclose(
                article_chewiness * FOODML_N_PER_ARTICLE_G,
                foodml_chewiness,
                rel_tol=0,
                abs_tol=1e-7,
            ):
                raise ValueError(
                    f"Table A4 chewiness does not align with FoodML sample {sample_no}: "
                    f"{article_chewiness} g × {FOODML_N_PER_ARTICLE_G} = "
                    f"{article_chewiness * FOODML_N_PER_ARTICLE_G} N, "
                    f"FoodML={foodml_chewiness} N"
                )
            hardness_matches += 1
            chewiness_matches += 1

            def measure(mean_field: str, sd_field: str, unit: str) -> dict[str, Any]:
                return {
                    "mean": _crosswalk_number(row, mean_field, crosswalk_csv_row),
                    "sd": _crosswalk_number(row, sd_field, crosswalk_csv_row),
                    "unit": unit,
                }

            record["processing"]["crosswalked_process_settings"] = {
                "target_moisture_content": {"value": target_moisture, "unit": "%"},
                "screw_speed": {
                    "value": _crosswalk_int(row, "screw_speed_rpm", crosswalk_csv_row),
                    "unit": "rpm",
                },
                "barrel_temperature_profile": {
                    "zones": ["Z1", "Z2", "Z3", "Z4"],
                    "values": temperature_profile,
                    "unit": "°C",
                },
                "total_mass_flow_rate": {
                    "value": _crosswalk_number(row, "total_mass_flow_kg_h", crosswalk_csv_row),
                    "unit": "kg/h",
                },
            }
            record["processing"]["reported_specific_mechanical_energy"] = measure(
                "sme_mean_kj_kg", "sme_sd_kj_kg", "kJ/kg"
            )
            record["method"]["source_note"] = (
                "The FoodML row's composition and texture targets are retained. "
                "Its Ferawati et al. (2021) extrusion settings are crosswalked from "
                "Tables A3-A4; the Table A4 hardness and chewiness means align with "
                "the FoodML targets using the inferred source transcription factor "
                f"{FOODML_N_PER_ARTICLE_G} N per table-reported g."
            )
            record["supplemental_source_reference"] = {
                "citation": FERAWATI_CITATION,
                "doi": FERAWATI_DOI,
                "url": FERAWATI_URL,
                "tables": ["A3", "A4"],
                "article_table_a4_id": article_id,
                "crosswalk_file": crosswalk_path.name,
                "crosswalk_csv_row": crosswalk_csv_row,
                "crosswalk_sha256": crosswalk_checksum,
                "match_rule": (
                    "FoodML source sample number N maps to Table A4 ID N-24; "
                    "the source study, material group, target moisture, hardness, "
                    "and chewiness were checked against the article row."
                ),
                "article_table_a4_reported_means_and_sd": {
                    "hardness": measure(
                        "hardness_mean_g_as_reported", "hardness_sd_g_as_reported", "g as reported"
                    ),
                    "springiness": measure("springiness_mean", "springiness_sd", "unitless"),
                    "chewiness": measure(
                        "chewiness_mean_g_as_reported", "chewiness_sd_g_as_reported", "g as reported"
                    ),
                    "crosswise_cutting_strength": measure(
                        "crosswise_cutting_mean_g_as_reported",
                        "crosswise_cutting_sd_g_as_reported",
                        "g as reported",
                    ),
                    "lengthwise_cutting_strength": measure(
                        "lengthwise_cutting_mean_g_as_reported",
                        "lengthwise_cutting_sd_g_as_reported",
                        "g as reported",
                    ),
                },
                "crosswalk_note": row["notes"],
            }
            material_counts[material] += 1

    if row_count != 30 or matched_sample_numbers != set(ferawati_records):
        missing = sorted(set(ferawati_records) - matched_sample_numbers)
        extra = sorted(matched_sample_numbers - set(ferawati_records))
        raise ValueError(
            f"Expected exactly one crosswalk row for each of 30 FoodML Ferawati rows; "
            f"found {row_count}, missing={missing}, extra={extra}"
        )

    return {
        "article_doi": FERAWATI_DOI,
        "article_citation": FERAWATI_CITATION,
        "article_url": FERAWATI_URL,
        "crosswalk_file": crosswalk_path.name,
        "crosswalk_sha256": crosswalk_checksum,
        "article_tables_used": ["A3", "A4"],
        "records_enriched_in_place": len(matched_sample_numbers),
        "records_added": 0,
        "foodml_record_count_before": len(records),
        "foodml_record_count_after": len(records),
        "enriched_records_by_material": dict(sorted(material_counts.items())),
        "table_a4_target_alignment": {
            "hardness_rows_checked": hardness_matches,
            "chewiness_rows_checked": chewiness_matches,
            "table_reported_g_to_foodml_n_factor": FOODML_N_PER_ARTICLE_G,
            "factor_status": "inferred by exact row-wise agreement; source table labels the values g",
        },
        "unresolved_assumptions": [
            "The row identity mapping uses FoodML source sample numbers 25-54 to Table A4 IDs 1-30 (ID = sample number - 24); every mapping is corroborated by material, target moisture, hardness and chewiness, but the papers do not publish a shared sample identifier.",
            "FoodML target values agree exactly with Table A4 means when table-reported g values are multiplied by 0.0098; this factor is inferred from the row values, and the article labels the source measurement unit only as g.",
            "Table A4 reports mean ± SD with n=3; the article describes triplicate texture measurements but does not establish three independent extrusion batches. SD replicates are not added as dataset records.",
            "Ferawati Table A3 lists FBI-local target moistures through 68%, while Table A4 row 30 reports a 70% result. The crosswalk retains the row-level Table A4 value (matching FoodML sample 54) and flags the discrepancy without resolving it.",
            "Composition values in FoodML are repeated by material group; the crosswalk does not turn repeated rows or technical replicates into independent ingredient assays.",
        ],
    }


def _number(value: str, *, field: str, row_number: int) -> float:
    try:
        return float(value)
    except ValueError as error:
        raise ValueError(
            f"Expected numeric value for {field} on CSV row {row_number}, got {value!r}"
        ) from error


def import_dataset(
    input_path: Path,
    output_path: Path,
    summary_path: Path,
    crosswalk_path: Path = DEFAULT_CROSSWALK,
) -> dict[str, Any]:
    raw_bytes = input_path.read_bytes()
    checksum = hashlib.sha256(raw_bytes).hexdigest()
    records: list[dict[str, Any]] = []
    regime_counts: Counter[str] = Counter()
    study_counts: Counter[str] = Counter()
    group_counts: Counter[str] = Counter()

    with input_path.open("r", encoding="utf-8-sig", newline="") as source_file:
        reader = csv.reader(source_file)
        header = next(reader, None)
        if header != EXPECTED_HEADER:
            raise ValueError(f"Unexpected FoodML CSV header: {header!r}")

        for csv_row_number, row in enumerate(reader, start=2):
            if len(row) != len(EXPECTED_HEADER):
                raise ValueError(
                    f"Expected {len(EXPECTED_HEADER)} columns at row {csv_row_number}, got {len(row)}"
                )
            source_row = dict(zip(EXPECTED_HEADER[:13], row[:13], strict=True))
            sample_no = source_row["no"]
            study_id = source_row["Study_ID"]
            group_id = source_row["Group_ID"]
            study = STUDIES.get(study_id)
            if study is None:
                raise ValueError(f"Unknown Study_ID {study_id!r} at CSV row {csv_row_number}")

            values = {
                field: {"value": _number(source_row[field], field=field, row_number=csv_row_number), "unit": unit}
                for field, unit in INPUT_UNITS.items()
            }
            targets = {
                field.lower(): {
                    "value": _number(source_row[field], field=field, row_number=csv_row_number),
                    "unit": unit,
                    "method": "two-cycle texture profile analysis; values curated from cited study",
                }
                for field, unit in NUMERIC_TARGETS.items()
            }

            record = {
                "schema_version": 1,
                "source": {
                    "id": SOURCE_ID,
                    "doi": SOURCE_DOI,
                    "citation": SOURCE_CITATION,
                    "license": SOURCE_LICENSE,
                    "usage_scope": "attribution required; confirm underlying source-study terms before commercial redistribution",
                },
                "record_type": "literature_texture_sample",
                "identifiers": {
                    "sample_id": f"foodml2023-{sample_no}",
                    "source_sample_no": int(sample_no),
                    "source_study_id": int(study_id),
                    "source_group_id": int(group_id),
                    "source_group_label": row[13] or None,
                    "source_study_label": row[14] or None,
                },
                "processing": {
                    "regime": study["process_regime"],
                    "source_study": study["source_study"],
                    "study_label": study["study_label"],
                    "row_metadata": {
                        "WG_frac": source_row["WG_frac"],
                    },
                },
                "values": values,
                "targets": targets,
                "method": {
                    "measurement": "two complete compression/decompression cycles (texture profile analysis)",
                    "source_note": "The paper reports hardness and chewiness in N. Raw row-level replicate/run IDs and detailed extrusion settings are not supplied in this CSV.",
                },
                "source_reference": {
                    "file": input_path.name,
                    "csv_row": csv_row_number,
                    "sha256": checksum,
                    "curated_data_row": int(sample_no),
                },
                "source_row": row,
            }
            records.append(record)
            regime_counts[study["process_regime"]] += 1
            study_counts[study_id] += 1
            group_counts[group_id] += 1

    if len(records) != 54:
        raise ValueError(f"Expected 54 curated source rows, found {len(records)}")

    crosswalk_summary = _enrich_ferawati_records(records, crosswalk_path)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="\n") as destination:
        for record in records:
            destination.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")))
            destination.write("\n")

    summary = {
        "source_id": SOURCE_ID,
        "source_doi": SOURCE_DOI,
        "source_license": SOURCE_LICENSE,
        "input_file": input_path.name,
        "input_sha256": checksum,
        "record_count": len(records),
        "records_by_process_regime": dict(sorted(regime_counts.items())),
        "records_by_study_id": dict(sorted(study_counts.items())),
        "records_by_group_id": dict(sorted(group_counts.items())),
        "model_input_fields": list(INPUT_UNITS),
        "target_fields": list(NUMERIC_TARGETS),
        "supplemental_process_crosswalk": crosswalk_summary,
        "prediction_performance_reported_in_source": {
            "scope": "mixed HME and mechanical-elongation data; not HME-only or Kenyan validation",
            "ridge_hardness_rmse_N": 10.101,
            "ridge_hardness_mape_percent": 22.9,
            "ridge_chewiness_rmse_N_as_reported": 6.035,
            "ridge_chewiness_mape_percent": 14.5,
        },
        "limitations": [
            "42 HME samples and 12 mechanical-elongation samples are explicitly separated by processing.regime.",
            "The paper's reported errors use the mixed 54-sample dataset and must not be represented as HME-only or Kenya-specific performance.",
            "The FoodML CSV itself does not contain per-row screw speed or barrel-zone temperatures. A source-cited crosswalk restores these settings only for its 30 Ferawati rows; it does not supply run identifiers, independent extrusion-batch identifiers, or lot metadata.",
            "The source groups primarily use protein isolates/concentrates; Kenyan whole-food formulations are outside demonstrated coverage.",
        ],
    }
    summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--summary", type=Path, default=DEFAULT_SUMMARY)
    parser.add_argument("--crosswalk", type=Path, default=DEFAULT_CROSSWALK)
    args = parser.parse_args()

    summary = import_dataset(args.input, args.output, args.summary, args.crosswalk)
    print(f"Wrote {summary['record_count']} literature records to {args.output}")
    print(f"Process regimes: {summary['records_by_process_regime']}")
    print(
        "Ferawati rows enriched in place: "
        f"{summary['supplemental_process_crosswalk']['records_enriched_in_place']} "
        f"(records added: {summary['supplemental_process_crosswalk']['records_added']})"
    )
    print(f"Summary: {args.summary}")


if __name__ == "__main__":
    main()
