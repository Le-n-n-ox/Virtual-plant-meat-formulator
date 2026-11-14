"""Ingest eight published HME texture conditions from Bulgaru et al. (2025).

The tracked CSV transcribes formulation/process details in Methods §§2.2–2.3.2
and the eight texture rows in Table 2. Each output row is one published
condition summary, not a standalone training observation; the reported n=12
is the TPA measurement replicate count, not an extrusion batch count.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = BACKEND_ROOT / "data" / "reference" / "bulgaru_2025_soryz_hme_table2.csv"
DEFAULT_OUTPUT = BACKEND_ROOT / "data" / "processed" / "bulgaru_2025_soryz_hme_review.jsonl"
DEFAULT_SUMMARY = BACKEND_ROOT / "data" / "processed" / "bulgaru_2025_soryz_hme_review.summary.json"

SOURCE_ID = "bulgaru-et-al-hme-analogues-2025"
SOURCE_DOI = "10.3390/foods14172939"
SOURCE_URL = "https://www.mdpi.com/2304-8158/14/17/2939"
SOURCE_LICENSE = "CC BY 4.0"
SOURCE_LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/"
SOURCE_CITATION = (
    "Bulgaru, V.; Sensoy, I.; Netreba, N.; Gurev, A.; Altanlar, U.; Paiu, S.; "
    "Dragancea, V.; Sturza, R.; Ghendov-Mosanu, A. 2025. Qualitative and "
    "Antioxidant Evaluation of High-Moisture Plant-Based Meat Analogs Obtained "
    "by Extrusion. Foods 14(17), 2939. https://doi.org/10.3390/foods14172939"
)

SCOPE_AND_CAVEATS = [
    (
        "These are eight condition summaries reported in Table 2: pea protein "
        "isolate controls and 1:1 dry-basis blends of pea protein isolate with "
        "soryz flour (variety Alimentar 1), chickpea flour, or hazelnut meal, "
        "each at two barrel temperature profiles. They are source observations, "
        "not a standalone training dataset."
    ),
    (
        "The article reports 12 TPA measurement replicates per sample. It does "
        "not report the number of independent extrusion batches; batch "
        "replication is therefore unknown and is not inferred from n=12."
    ),
    (
        "The published results are means and standard deviations, not raw "
        "instrument readings. Within-batch structure and hardness-component "
        "values (cohesiveness and springiness) are not available in Table 2."
    ),
    (
        "Feed moisture is reported as 60%; the article does not state a moisture "
        "basis for this processing setting."
    ),
    (
        "All tested materials are from the study's stated suppliers and "
        "locations in Türkiye or Moldova. The results do not validate Kenyan "
        "ingredients or formulations."
    ),
    (
        "Only the two temperature profiles and four formulation types in this "
        "study are represented; no extrapolation to other formulas or process "
        "conditions is supported by these rows alone."
    ),
]

METRICS = {
    "hardness": {
        "mean_column": "hardness_mean_reported",
        "sd_column": "hardness_sd_reported",
        "unit_column": "hardness_unit_reported",
        "significance_column": "hardness_significance_group_reported",
        "source_table": "Table 2",
    },
    "resilience": {
        "mean_column": "resilience_mean_reported",
        "sd_column": "resilience_sd_reported",
        "unit_column": "resilience_unit_reported",
        "significance_column": "resilience_significance_group_reported",
        "source_table": "Table 2",
    },
    "chewiness": {
        "mean_column": "chewiness_mean_reported",
        "sd_column": "chewiness_sd_reported",
        "unit_column": "chewiness_unit_reported",
        "significance_column": "chewiness_significance_group_reported",
        "source_table": "Table 2",
    },
}

PROCESS_COLUMNS = (
    "material_name",
    "material_variety",
    "ingredient_sources_reported",
    "formulation_label",
    "formulation_ratio_dry_basis",
    "barrel_temperature_profile_c_reported",
    "cooling_die_temperature_profile_with_adapter_c_reported",
    "feed_moisture_pct_reported",
    "feed_moisture_basis_reported",
    "feed_flow_rate_kg_h_reported",
    "screw_speed_rpm_reported",
    "extruder_type_reported",
    "extruder_manufacturer_reported",
    "extruder_location_reported",
    "screw_diameter_mm_reported",
    "screw_ld_ratio_reported",
    "cooling_die_length_mm_reported",
    "cooling_die_height_mm_reported",
    "cooling_die_width_mm_reported",
    "cooling_die_independently_cooled_zones_reported",
    "post_extrusion_storage_reported",
)

TPA_COLUMNS = (
    "tpa_analyzer_reported",
    "tpa_probe_reported",
    "tpa_probe_diameter_mm_reported",
    "tpa_compression_cycles_reported",
    "tpa_load_cell_capacity_kg_reported",
    "tpa_pre_test_speed_mm_s_reported",
    "tpa_test_speed_mm_s_reported",
    "tpa_post_test_speed_mm_s_reported",
    "tpa_deformation_distance_mm_reported",
    "tpa_strain_pct_reported",
    "tpa_wait_between_cycles_s_reported",
    "tpa_trigger_force_g_reported",
    "tpa_sample_length_mm_reported",
    "tpa_sample_preparation_reported",
    "tpa_measurement_replicates_n_reported",
    "tpa_replicate_scope_reported",
    "extrusion_batch_replicates_reported",
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_value(row: dict[str, str], field: str) -> str:
    value = row.get(field, "").strip()
    if not value:
        raise ValueError(
            f"Missing required value in {field!r} for {row.get('formulation_label')!r}"
        )
    return value


def normalize_row(row: dict[str, str], source_sha256: str) -> dict[str, Any]:
    if require_value(row, "source_id") != SOURCE_ID:
        raise ValueError(f"Unexpected source_id: {row.get('source_id')!r}")
    if require_value(row, "source_doi") != SOURCE_DOI:
        raise ValueError(f"Unexpected DOI: {row.get('source_doi')!r}")
    if require_value(row, "source_license") != SOURCE_LICENSE:
        raise ValueError(f"Unexpected license: {row.get('source_license')!r}")

    measurements: dict[str, dict[str, Any]] = {}
    for name, columns in METRICS.items():
        mean_text = require_value(row, columns["mean_column"])
        sd_text = require_value(row, columns["sd_column"])
        measurements[name] = {
            "mean": float(mean_text),
            "sd": float(sd_text),
            "unit": require_value(row, columns["unit_column"]),
            "significance_group_reported": require_value(row, columns["significance_column"]),
            "source_table": columns["source_table"],
            "source_row_label": require_value(row, "source_table_2_row_label"),
            "mean_as_reported": mean_text,
            "sd_as_reported": sd_text,
        }

    tpa_n = int(require_value(row, "tpa_measurement_replicates_n_reported"))
    batch_replicates = require_value(row, "extrusion_batch_replicates_reported")
    if batch_replicates.lower() != "not reported":
        raise ValueError(
            "This transcription expects extrusion-batch replication to remain unreported"
        )

    return {
        "record_type": "published_hme_condition_summary",
        "source": {
            "source_id": SOURCE_ID,
            "title": require_value(row, "source_title"),
            "citation": require_value(row, "source_citation"),
            "doi": SOURCE_DOI,
            "url": SOURCE_URL,
            "license": SOURCE_LICENSE,
            "license_url": SOURCE_LICENSE_URL,
            "source_sha256": source_sha256,
            "table_references": {
                "formulation_and_process": f"Methods §§2.2–2.3.2; Table 1 row {require_value(row, 'source_table_1_row_label')}",  # noqa: E501
                "texture": f"Table 2 row {require_value(row, 'source_table_2_row_label')}",
            },
        },
        "sample_id": require_value(row, "formulation_label"),
        "process_conditions": {
            field.removesuffix("_reported"): row[field] for field in PROCESS_COLUMNS
        },
        "texture_method": {field.removesuffix("_reported"): row[field] for field in TPA_COLUMNS},
        "texture_measurements": measurements,
        "replication": {
            "tpa_measurement_replicates_per_sample": tpa_n,
            "extrusion_batch_replicates": None,
            "extrusion_batch_replicates_status": "not reported by source",
        },
        "scope_and_caveats": SCOPE_AND_CAVEATS,
        # Keep every transcription field verbatim as CSV text for traceability.
        "reported_values_verbatim": row,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--summary", type=Path, default=DEFAULT_SUMMARY)
    args = parser.parse_args()

    input_sha256 = sha256_file(args.input)
    with args.input.open("r", encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    if len(rows) != 8:
        raise ValueError(f"Expected exactly eight Table 2 treatment rows, found {len(rows)}")

    records = [normalize_row(row, input_sha256) for row in rows]
    sample_ids = [record["sample_id"] for record in records]
    expected_sample_ids = [
        "1PPI",
        "1S:PPI",
        "1C:PPI",
        "1HM:PPI",
        "2PPI",
        "2S:PPI",
        "2C:PPI",
        "2HM:PPI",
    ]
    if sample_ids != expected_sample_ids:
        raise ValueError(f"Unexpected sample order/labels: {sample_ids!r}")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="\n") as stream:
        for record in records:
            stream.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")

    summary = {
        "source_id": SOURCE_ID,
        "source_citation": SOURCE_CITATION,
        "source_url": SOURCE_URL,
        "doi": SOURCE_DOI,
        "license": SOURCE_LICENSE,
        "license_url": SOURCE_LICENSE_URL,
        "source_csv": str(args.input),
        "source_csv_sha256": input_sha256,
        "output_jsonl": str(args.output),
        "output_jsonl_sha256": sha256_file(args.output),
        "record_count": len(records),
        "sample_ids": sample_ids,
        "scope": (
            "Eight Table 2 condition summaries: PPI-only controls and 1:1 dry-basis "
            "PPI blends with soryz, chickpea, or hazelnut meal at two reported "
            "barrel temperature profiles. Source observations, not a standalone "
            "training dataset."
        ),
        "replication_note": (
            "TPA n=12 per sample is reported; independent extrusion-batch replicate count is not reported."  # noqa: E501
        ),
        "caveats": SCOPE_AND_CAVEATS,
    }
    args.summary.parent.mkdir(parents=True, exist_ok=True)
    args.summary.write_text(
        json.dumps(summary, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
