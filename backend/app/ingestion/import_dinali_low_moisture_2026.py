"""Import Dinali et al. (2026) low-moisture flour TVP table summaries."""

from __future__ import annotations

import csv
import json
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[2]
SOURCE_FILE = (
    BACKEND_DIR
    / "data"
    / "reference"
    / "dinali_2026_low_moisture_flour_tvp_table1_table3.csv"
)
OUTPUT_FILE = (
    BACKEND_DIR
    / "data"
    / "processed"
    / "dinali_2026_low_moisture_flour_tvp_review.jsonl"
)
SUMMARY_FILE = (
    BACKEND_DIR
    / "data"
    / "processed"
    / "dinali_2026_low_moisture_flour_tvp_review.summary.json"
)

DOI = "10.1016/j.foostr.2026.100528"
SOURCE_URL = "https://www.sciencedirect.com/science/article/pii/S2213329126000298"
LICENSE = "CC BY 4.0"


def optional_number(value: str) -> float | None:
    return float(value) if value.strip() else None


def metric(
    row: dict[str, str],
    value_field: str,
    sd_field: str,
    unit: str | None,
    table: str,
    n_field: str,
) -> dict[str, object]:
    return {
        "mean": optional_number(row[value_field]),
        "standard_deviation": optional_number(row[sd_field]),
        "unit": unit,
        "n": int(row[n_field]),
        "source_table": table,
    }


def main() -> int:
    with SOURCE_FILE.open(encoding="utf-8", newline="") as source:
        source_rows = list(csv.DictReader(source))

    records: list[dict[str, object]] = []
    for row_number, row in enumerate(source_rows, start=2):
        code = row["material_code"]
        records.append(
            {
                "record_id": f"{DOI}#{code}",
                "material_code": code,
                "ingredient_key": row["ingredient_key"],
                "source_material": row["source_material"],
                "raw_material_origin": row["raw_material_origin"],
                "processing_regime": row["process_family"],
                "source_form": "flour",
                "raw_seed_prep": row["raw_seed_prep"],
                "process_conditions": {
                    "barrel_zones_temperature_c": [
                        int(value)
                        for value in row["flour_extrusion_barrel_zones_c"].split("|")
                    ],
                    "solids_feed_g_min": float(row["flour_feed_rate_g_min"]),
                    "water_feed_ml_min": float(row["flour_water_rate_ml_min"]),
                    "screw_speed_rpm": int(row["flour_screw_speed_rpm"]),
                    "die_temperature_c": int(row["flour_die_temperature_c"]),
                    "feed_moisture_wb_pct": {
                        "minimum": float(row["flour_feed_moisture_min_pct"]),
                        "maximum": float(row["flour_feed_moisture_max_pct"]),
                    },
                    "post_extrusion_dry_moisture_below_pct": float(
                        row["post_extrusion_dry_moisture_max_pct"]
                    ),
                },
                "table_1_product_composition_and_physical_properties": {
                    "basis": "dried texturized product, not raw flour",
                    "replicate_count": int(row["table1_replication_n"]),
                    "expansion_ratio": metric(
                        row,
                        "expansion_ratio_pct_mean",
                        "expansion_ratio_pct_sd",
                        "%",
                        "Table 1",
                        "table1_replication_n",
                    ),
                    "apparent_density": metric(
                        row,
                        "apparent_density_g_cm3_mean",
                        "apparent_density_g_cm3_sd",
                        "g/cm3",
                        "Table 1",
                        "table1_replication_n",
                    ),
                    "moisture": metric(
                        row,
                        "final_product_moisture_pct_mean",
                        "final_product_moisture_pct_sd",
                        "%",
                        "Table 1",
                        "table1_replication_n",
                    ),
                    "fat": metric(
                        row,
                        "final_product_fat_pct_mean",
                        "final_product_fat_pct_sd",
                        "%",
                        "Table 1",
                        "table1_replication_n",
                    ),
                    "protein": metric(
                        row,
                        "final_product_protein_pct_mean",
                        "final_product_protein_pct_sd",
                        "%",
                        "Table 1",
                        "table1_replication_n",
                    ),
                    "ash": metric(
                        row,
                        "final_product_ash_pct_mean",
                        "final_product_ash_pct_sd",
                        "%",
                        "Table 1",
                        "table1_replication_n",
                    ),
                    "carbohydrate": metric(
                        row,
                        "final_product_carbohydrate_pct_mean",
                        "final_product_carbohydrate_pct_sd",
                        "%",
                        "Table 1",
                        "table1_replication_n",
                    ),
                },
                "table_3_rehydrated_texture": {
                    "rehydration_minutes": int(row["tpa_rehydration_minutes"]),
                    "drain_minutes": int(row["tpa_drain_minutes"]),
                    "replicate_count": int(row["tpa_replication_n"]),
                    "hardness": metric(
                        row,
                        "hardness_n_mean",
                        "hardness_n_sd",
                        "N",
                        "Table 3",
                        "tpa_replication_n",
                    ),
                    "cohesiveness": metric(
                        row,
                        "cohesiveness_mean",
                        "cohesiveness_sd",
                        None,
                        "Table 3",
                        "tpa_replication_n",
                    ),
                    "chewiness": metric(
                        row,
                        "chewiness_mean",
                        "chewiness_sd",
                        row["chewiness_unit"] or None,
                        "Table 3",
                        "tpa_replication_n",
                    ),
                    "resilience": metric(
                        row,
                        "resilience_mean",
                        "resilience_sd",
                        None,
                        "Table 3",
                        "tpa_replication_n",
                    ),
                    "unit_note": row["table3_unit_note"],
                },
                "source": {
                    "citation": "Dinali et al. (2026), Food Structure 48, 100528",
                    "doi": DOI,
                    "url": SOURCE_URL,
                    "license": LICENSE,
                    "transcription_file": SOURCE_FILE.name,
                    "transcription_row": row_number,
                    "source_tables": [row["source_table1"], row["source_table3"]],
                },
                "evidence_role": "low-moisture literature reference only",
                "eligible_for_hme_training": False,
                "eligible_as_kenyan_measurement": False,
                "limitations": [
                    "low-moisture extrusion, not HME",
                    "raw materials sourced in Sri Lanka, not Kenyan lots",
                    "published table summaries only; no raw replicate file",
                    "does not validate Kenyan formulation predictions",
                ],
            }
        )

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_FILE.open("w", encoding="utf-8", newline="\n") as output:
        for record in records:
            output.write(json.dumps(record, ensure_ascii=False) + "\n")

    summary = {
        "dataset": "Dinali et al. (2026) low-moisture legume-flour TVP summaries",
        "doi": DOI,
        "license": LICENSE,
        "records": len(records),
        "material_codes": [record["material_code"] for record in records],
        "process_regime": "low_moisture_extrusion",
        "eligible_for_hme_training": 0,
        "output_file": OUTPUT_FILE.name,
        "source_file": SOURCE_FILE.name,
    }
    SUMMARY_FILE.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"Imported {len(records)} source-linked low-moisture records; "
        "eligible HME records: 0."
    )
    print(f"Output: {OUTPUT_FILE}")
    print(f"Summary: {SUMMARY_FILE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
