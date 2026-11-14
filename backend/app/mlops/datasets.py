"""Load the high-moisture-extrusion (HME) training table from the curated literature data.

Only ``high_moisture_extrusion`` rows are used; low-moisture extrusion and mechanical
elongation are separate regimes and are never mixed in. Rows flagged synthetic are
rejected outright.
"""

import csv
import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pandas as pd

from app.domain.texture.features import COMPOSITION_FEATURES

JSONL_NAME = "processed/foodml_texture_prediction_2023_review.jsonl"
CSV_NAME = "reference/foodml_texture_prediction_2023.csv"
REGIME = "high_moisture_extrusion"
TARGETS = ("hardness", "chewiness")

_SYNTHETIC_MARKERS = ("synthetic", "simulated", "fake", "generated", "dev_fake")
_FLAG_KEYS = {"synthetic", "is_synthetic", "is_fake"}
_TYPE_KEYS = {"source_type", "data_origin", "quality_flag", "record_type"}

_FOODML_SOURCE = {
    "id": "foodml-texture-prediction-2023",
    "doi": "10.3390/foods12020344",
    "citation": (
        "Kircali Ata, S.; Shi, J. K.; Yao, X.; Hua, X. Y.; Haldar, S.; Chiang, J. H.; Wu, M. "
        "2023. Predicting the Textural Properties of Plant-Based Meat Analogs with Machine "
        "Learning. Foods 12(2), 344. https://doi.org/10.3390/foods12020344"
    ),
    "license": "CC BY 4.0",
}


class SyntheticDataError(ValueError):
    """Raised when a synthetic or fake row is offered as training data."""


class DatasetUnavailableError(FileNotFoundError):
    """Neither the curated jsonl nor the reference CSV could be found."""


@dataclass
class TextureDataset:
    X: pd.DataFrame
    y: dict[str, list[float]]
    groups: list[str]
    sample_ids: list[str]
    units: dict[str, str]
    sources: list[dict[str, Any]]
    dataset_version: str
    regime: str = REGIME
    input_file: str = ""
    notes: dict[str, Any] = field(default_factory=dict)

    @property
    def n_groups(self) -> int:
        return len(set(self.groups))


def _is_synthetic(node: Any) -> bool:
    if isinstance(node, dict):
        for key, value in node.items():
            if key in _FLAG_KEYS and value:
                return True
            if (
                key in _TYPE_KEYS
                and isinstance(value, str)
                and any(m in value.lower() for m in _SYNTHETIC_MARKERS)
            ):
                return True
            if isinstance(value, dict | list) and _is_synthetic(value):
                return True
    elif isinstance(node, list):
        return any(_is_synthetic(item) for item in node)
    return False


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _group_label(group_id: Any, label: str | None) -> str:
    return f"{group_id}:{label}" if label else str(group_id)


def _from_jsonl(path: Path) -> tuple[list[dict[str, Any]], dict[str, str], int]:
    rows: list[dict[str, Any]] = []
    units: dict[str, str] = {}
    enriched = 0
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        record = json.loads(line)
        if _is_synthetic(record):
            raise SyntheticDataError(
                f"Synthetic row rejected: {record.get('identifiers', {}).get('sample_id')}"
            )
        if record.get("processing", {}).get("regime") != REGIME:
            continue
        values = record["values"]
        ident = record["identifiers"]
        row: dict[str, Any] = {
            "sample_id": ident["sample_id"],
            "group": _group_label(ident["source_group_id"], ident.get("source_group_label")),
            "source": record.get("source", {}),
        }
        for feature in COMPOSITION_FEATURES:
            key = "target moisture" if feature == "target_moisture" else feature
            row[feature] = float(values[key]["value"])
        for target in TARGETS:
            t = record["targets"].get(target)
            row[target] = float(t["value"]) if t and t.get("value") is not None else None
            if t and t.get("unit"):
                units.setdefault(target, t["unit"])
        if record["processing"].get("crosswalked_process_settings"):
            enriched += 1
        rows.append(row)
    return rows, units, enriched


def _from_csv(path: Path) -> tuple[list[dict[str, Any]], dict[str, str], int]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle)
        header = next(reader)
        for cells in reader:
            if not cells or not cells[0].strip():
                continue
            rec = dict(zip(header, cells, strict=False))
            if _is_synthetic(rec):
                raise SyntheticDataError(f"Synthetic row rejected: {rec.get('no')}")
            if rec["Study_ID"].strip() == "3":  # mechanical elongation study
                continue
            row: dict[str, Any] = {
                "sample_id": f"foodml2023-{rec['no']}",
                "group": _group_label(rec["Group_ID"], cells[13] if len(cells) > 13 else None),
                "source": _FOODML_SOURCE,
                "protein": float(rec["protein"]),
                "moisture": float(rec["moisture"]),
                "ash": float(rec["ash"]),
                "carbs": float(rec["carbs"]),
                "fat": float(rec["fat"]),
                "fiber": float(rec["fiber"]),
                "target_moisture": float(rec["target moisture"]),
                "hardness": float(rec["Hardness"]),
                "chewiness": float(rec["Chewiness"]),
            }
            rows.append(row)
    units = {"hardness": "N", "chewiness": "N (as reported by source)"}
    return rows, units, 0


def load_hme_dataset(data_dir: str) -> TextureDataset:
    base = Path(data_dir)
    jsonl, csv_path = base / JSONL_NAME, base / CSV_NAME
    if jsonl.exists():
        path = jsonl
        rows, units, enriched = _from_jsonl(path)
    elif csv_path.exists():
        path = csv_path
        rows, units, enriched = _from_csv(path)
    else:
        raise DatasetUnavailableError(f"No FoodML texture data under {base}")
    if not rows:
        raise DatasetUnavailableError("No high_moisture_extrusion rows found.")
    X = pd.DataFrame(
        [[r[f] for f in COMPOSITION_FEATURES] for r in rows], columns=COMPOSITION_FEATURES
    )
    y = {t: [r[t] if r[t] is not None else float("nan") for r in rows] for t in TARGETS}
    source = rows[0]["source"] or _FOODML_SOURCE
    sources = [
        {
            "id": source.get("id", _FOODML_SOURCE["id"]),
            "doi": source.get("doi", _FOODML_SOURCE["doi"]),
            "citation": source.get("citation", _FOODML_SOURCE["citation"]),
            "license": source.get("license", _FOODML_SOURCE["license"]),
            "regime": REGIME,
            "n_rows": len(rows),
        }
    ]
    return TextureDataset(
        X=X,
        y=y,
        groups=[r["group"] for r in rows],
        sample_ids=[r["sample_id"] for r in rows],
        units=units,
        sources=sources,
        dataset_version="foodml2023-hme-" + _sha256(path)[:12],
        input_file=path.name,
        notes={"process_enriched_rows": enriched, "n_rows": len(rows)},
    )
