"""Idempotent seed loaders. They read the processed data files READ-ONLY and upsert rows.

Licence handling: a ``restricted`` source hides its ingredients (HTTP 403) only when its
``license_notes`` carry the ``[no-display]`` marker. KFCT 2018 is restricted ("non-commercial
research use with acknowledgement") but displayable, so it has no marker.
"""

import csv
import json
import os
import re
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.core.security import hash_password
from app.db.models import (
    AminoAcidReferencePattern,
    DataSource,
    Experiment,
    Ingredient,
    IngredientPrice,
    Measurement,
    NutrientDefinition,
    Profile,
    Sample,
)
from app.db.repositories.ingredients import replace_nutrients

KFCT_DATASET_VERSION = "kfct2018.1"
KFCT_SOURCE_ID = "kfct-2018"
DEFAULT_PATTERN_ID = "fao2013_older_child_adolescent_adult"

# key, name, unit, kind, INFOODS tagname
_DEFS: list[tuple[str, str, str, str, str | None]] = [
    ("water", "Water", "g", "proximate", "WATER"),
    ("protein", "Protein", "g", "proximate", "PROCNT"),
    ("fat", "Fat", "g", "proximate", "FAT"),
    ("carbohydrate_available", "Carbohydrate, available", "g", "proximate", "CHOAVL"),
    ("fibre", "Fibre", "g", "proximate", "FIBTG"),
    ("ash", "Ash", "g", "proximate", "ASH"),
    ("energy_kj", "Energy", "kJ", "energy", "ENERC"),
    ("energy_kcal", "Energy", "kcal", "energy", "ENERC"),
    ("calcium", "Calcium", "mg", "mineral", "CA"),
    ("iron", "Iron", "mg", "mineral", "FE"),
    ("magnesium", "Magnesium", "mg", "mineral", "MG"),
    ("phosphorus", "Phosphorus", "mg", "mineral", "P"),
    ("potassium", "Potassium", "mg", "mineral", "K"),
    ("sodium", "Sodium", "mg", "mineral", "NA"),
    ("zinc", "Zinc", "mg", "mineral", "ZN"),
    ("selenium", "Selenium", "ug", "mineral", "SE"),
    ("vitamin_a_rae", "Vitamin A (RAE)", "ug", "vitamin", "VITA_RAE"),
    ("retinol", "Retinol", "ug", "vitamin", "RETOL"),
    ("beta_carotene_eq", "Beta-carotene equivalent", "ug", "vitamin", "CARTBEQ"),
    ("thiamin", "Thiamin", "mg", "vitamin", "THIA"),
    ("riboflavin", "Riboflavin", "mg", "vitamin", "RIBF"),
    ("niacin", "Niacin", "mg", "vitamin", "NIA"),
    ("vitamin_b12", "Vitamin B12", "ug", "vitamin", "VITB12"),
    ("folate_dfe", "Folate (DFE)", "ug", "vitamin", "FOLDFE"),
    ("vitamin_c", "Vitamin C", "mg", "vitamin", "VITC"),
    ("cholesterol", "Cholesterol", "mg", "other", "CHOLE"),
    ("histidine", "Histidine", "mg", "amino_acid", "HISTN"),
    ("isoleucine", "Isoleucine", "mg", "amino_acid", "ILE"),
    ("leucine", "Leucine", "mg", "amino_acid", "LEU"),
    ("lysine", "Lysine", "mg", "amino_acid", "LYS"),
    ("methionine", "Methionine", "mg", "amino_acid", "MET"),
    ("cysteine", "Cysteine", "mg", "amino_acid", "CYS"),
    ("phenylalanine", "Phenylalanine", "mg", "amino_acid", "PHE"),
    ("tyrosine", "Tyrosine", "mg", "amino_acid", "TYR"),
    ("threonine", "Threonine", "mg", "amino_acid", "THR"),
    ("tryptophan", "Tryptophan", "mg", "amino_acid", "TRP"),
    ("valine", "Valine", "mg", "amino_acid", "VAL"),
    ("arginine", "Arginine", "mg", "amino_acid", "ARG"),
    ("alanine", "Alanine", "mg", "amino_acid", "ALA"),
    ("aspartic_acid", "Aspartic acid", "mg", "amino_acid", "ASP"),
    ("glutamic_acid", "Glutamic acid", "mg", "amino_acid", "GLU"),
    ("glycine", "Glycine", "mg", "amino_acid", "GLY"),
    ("proline", "Proline", "mg", "amino_acid", "PRO"),
    ("serine", "Serine", "mg", "amino_acid", "SER"),
]

# KFCT component label -> canonical key (fatty acids, phytate, etc. are not imported).
KFCT_LABELS = {
    "water": "water",
    "protein": "protein",
    "fat": "fat",
    "carbohydrate available": "carbohydrate_available",
    "fibre": "fibre",
    "ash": "ash",
    "ca": "calcium",
    "fe": "iron",
    "mg": "magnesium",
    "p": "phosphorus",
    "k": "potassium",
    "na": "sodium",
    "zn": "zinc",
    "se": "selenium",
    "vit a-rae": "vitamin_a_rae",
    "retinol": "retinol",
    "b-carotene equivalent": "beta_carotene_eq",
    "thiamin": "thiamin",
    "riboflavin": "riboflavin",
    "niacin": "niacin",
    "vit b12": "vitamin_b12",
    "dietary folate eq.": "folate_dfe",
    "vit c": "vitamin_c",
    "cholesterol": "cholesterol",
    "histidine": "histidine",
    "isoleucin": "isoleucine",
    "isoleucine": "isoleucine",
    "leucine": "leucine",
    "lysine": "lysine",
    "methionine": "methionine",
    "cystine": "cysteine",
    "cysteine": "cysteine",
    "phenylalanine": "phenylalanine",
    "tyrosine": "tyrosine",
    "threonine": "threonine",
    "tryptophan": "tryptophan",
    "valine": "valine",
    "arginine": "arginine",
    "alanine": "alanine",
    "aspartic acid": "aspartic_acid",
    "glutamic acid": "glutamic_acid",
    "glycine": "glycine",
    "proline": "proline",
    "serine": "serine",
}
_UNIT_ALIASES = {"mcg": "ug", "µg": "ug", "μg": "ug"}
PER_100G_EDIBLE = "/100 g edible portion"


def seed_nutrient_definitions(session: Session) -> int:
    for order, (key, name, unit, kind, tag) in enumerate(_DEFS):
        row = session.get(NutrientDefinition, key)
        if row is None:
            row = NutrientDefinition(key=key)
            session.add(row)
        row.name, row.unit, row.kind, row.infoods_tagname = name, unit, kind, tag
        row.sort_order = (1000 + order) if kind == "amino_acid" else order
    session.flush()
    return len(_DEFS)


def _upsert_source(session: Session, source_id: str, **fields: Any) -> DataSource:
    row = session.get(DataSource, source_id)
    if row is None:
        row = DataSource(id=source_id, name=fields.pop("name"))
        session.add(row)
    for key, value in fields.items():
        setattr(row, key, value)
    session.flush()
    return row


def seed_amino_acid_patterns(session: Session, data_dir: Path) -> int:
    path = Path(data_dir) / "reference" / "fao_amino_acid_patterns_2013.yaml"
    if not path.exists():
        return 0
    doc = yaml.safe_load(path.read_text(encoding="utf-8"))
    keys: list[str] = doc["amino_acid_keys"]
    groupings = {
        "sulfur_amino_acids_methionine_cysteine": ["methionine", "cysteine"],
        "aromatic_amino_acids_phenylalanine_tyrosine": ["phenylalanine", "tyrosine"],
    }
    citation = (
        f"FAO. {doc.get('source_year', 2013)}. {doc.get('source_title', '')}. "
        f"{doc.get('source_url', '')}"
    ).strip()
    count = 0
    for p in doc["recommended_patterns"]:
        row = session.get(AminoAcidReferencePattern, p["id"])
        if row is None:
            row = AminoAcidReferencePattern(id=p["id"], name=p["label"], version="2013")
            session.add(row)
        row.name = p["label"]
        row.version = "2013"
        row.values = dict(zip(keys, p["values"], strict=True))
        row.groupings = groupings
        row.is_default = p["id"] == DEFAULT_PATTERN_ID
        row.citation = citation + (
            " NOTE: the default pattern is provisional pending project-owner confirmation."
            if row.is_default
            else ""
        )
        count += 1
    session.flush()
    return count


# --------------------------------------------------------------------------- KFCT


def kfct_form(name: str) -> str:
    n = name.lower()
    for words, form in (
        (("flour",), "flour"),
        (("fermented",), "fermented"),
        (("roasted", "roast"), "roasted"),
        (("soaked",), "soaked"),
        (("boiled", "cooked", "stewed", "steamed", "fried"), "cooked"),
        (("raw",), "raw"),
        (("dry", "dried"), "dry"),
    ):
        if any(re.search(rf"\b{w}\b", n) for w in words):
            return form
    return "raw"


def _kfct_nutrients(food: dict[str, Any]) -> tuple[list[dict[str, Any]], int]:
    rows: dict[str, dict[str, Any]] = {}
    skipped_amino = 0
    for n in food.get("nutrients", []):
        label = str(n.get("component_label", "")).strip().lower()
        key = KFCT_LABELS.get(label)
        if label == "energy":  # KFCT reports energy twice under one label: kJ and kcal
            key = {"kj": "energy_kj", "kcal": "energy_kcal"}.get(
                str(n.get("unit", "")).strip().lower()
            )
        if key is None or key in rows:
            continue
        if key in {d[0] for d in _DEFS if d[3] == "amino_acid"} and PER_100G_EDIBLE not in str(
            n.get("denominator", "")
        ):
            skipped_amino += 1  # per g N or other denominators are not comparable
            continue
        unit = _UNIT_ALIASES.get(str(n.get("unit", "")), str(n.get("unit", "")))
        kind = n.get("value_kind")
        value = n.get("numeric_value") if kind == "numeric" else None
        flags = n.get("flags") or []
        rng = (n.get("statistic") or {}).get("range_values")
        low = high = None
        if isinstance(rng, list) and len(rng) == 2:
            low, high = Decimal(str(rng[0])), Decimal(str(rng[1]))
        rows[key] = {
            "key": key,
            "value": None if value is None else Decimal(str(value)),
            "unit": unit,
            "flag": (
                "estimated"
                if {"alternative_method_or_lower_quality", "estimated_trace"} & set(flags)
                else "analytical"
            ),
            "range_low": low,
            "range_high": high,
        }
    return list(rows.values()), skipped_amino


def seed_kfct(session: Session, data_dir: Path) -> dict[str, int]:
    path = Path(data_dir) / "processed" / "kfct2018_review.jsonl"
    if not path.exists():
        return {"foods": 0, "skipped_amino_cells": 0}
    seed_nutrient_definitions(session)
    foods_seen = skipped = 0
    source_set = False
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            rec = json.loads(line)
            if rec.get("record_type") != "food":
                continue
            src = rec.get("source", {})
            if not source_set:
                _upsert_source(
                    session,
                    KFCT_SOURCE_ID,
                    name="Kenya Food Composition Tables 2018",
                    citation=src.get("citation"),
                    version="2018",
                    license_status="restricted",
                    license_notes=(
                        f"{src.get('license_notice', '')} Displayed with acknowledgement; "
                        "excluded from exports."
                    ).strip(),
                )
                source_set = True
            rows, skipped_here = _kfct_nutrients(rec)
            skipped += skipped_here
            ing_id = f"ing_kfct_{rec['code']}"
            ing = session.get(Ingredient, ing_id)
            if ing is None:
                ing = Ingredient(id=ing_id, common_name=rec["name"], form="raw")
                session.add(ing)
            name = rec["name"]
            ing.common_name = name
            ing.scientific_name = rec.get("scientific_name")
            ing.form = kfct_form(name)
            ing.crop = name.split(",")[0].strip()[:128]
            ing.food_group = rec.get("food_group")
            ing.origin = "Kenya"
            ing.moisture_basis = "as_is"
            water = next((r["value"] for r in rows if r["key"] == "water"), None)
            ing.moisture_percent = water
            ing.source_id = KFCT_SOURCE_ID
            ing.source_row_ref = f"{src.get('worksheet')} row {src.get('row')}"
            ing.analysed_on = "2018"
            prox = {"water", "protein", "fat", "carbohydrate_available"}
            ing.quality_flag = (
                "estimated"
                if any(r["flag"] == "estimated" for r in rows if r["key"] in prox)
                else "analytical"
            )
            ing.status = "active"
            ing.dataset_version = KFCT_DATASET_VERSION
            ing.is_fake = False
            replace_nutrients(ing, rows)
            foods_seen += 1
            if foods_seen % 100 == 0:
                session.flush()
    session.flush()
    return {"foods": foods_seen, "skipped_amino_cells": skipped}


# --------------------------------------------------------------------------- dev users


def seed_dev_users(session: Session, settings: Settings | None = None) -> int:
    from app.config import get_settings

    settings = settings or get_settings()
    if settings.env == "production":
        print("Refusing to seed dev users when ENV=production.")
        return 0
    password = os.environ.get("DEV_USER_PASSWORD") or "devpassword123"
    count = 0
    for role in ("admin", "curator", "scientist", "viewer"):
        email = f"{role}@vpmf.local"
        row = session.scalars(select(Profile).where(Profile.email == email)).first()
        if row is not None:
            # Create-only: never reset the password, role or active flag of an existing
            # account, so a changed password or a disabled account survives restarts.
            continue
        session.add(
            Profile(
                user_id=f"usr_dev_{role}",
                email=email,
                display_name=role.title(),
                role=role,
                active=True,
                password_hash=hash_password(password),
            )
        )
        count += 1
    if count:
        print(f"WARNING: created {count} development users with a known password. Dev only.")
    session.flush()
    return count


# --------------------------------------------------------------------------- prices


def _read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


_PRICE_ALIASES = {"cowpeas": "cowpea", "green_grams": "green_gram", "pigeon_peas": "pigeon_pea"}


def seed_prices(session: Session, data_dir: Path) -> dict[str, int]:
    """Attach KES/kg prices to KFCT foods through the curated crosswalk, conservatively.

    A price is attached only when its ingredient key maps (after plural aliasing) to exactly ONE
    KFCT food in the crosswalk; keys with several candidate foods are ambiguous and skipped.
    Sources used: KAMIS then Kenya Agri Atlas (newest observation first). Retail packaged
    products and the stale Husfarm quote are not used."""
    processed = Path(data_dir) / "processed"
    crosswalk = processed / "kfct2018_demo_ingredient_crosswalk_2026-11-14.csv"
    if not crosswalk.exists():
        return {"matched": 0, "skipped": 0}
    codes: dict[str, set[str]] = {}
    for r in _read_csv(crosswalk):
        if r.get("kfct_food_code"):
            codes.setdefault(r["demo_ingredient_key"], set()).add(r["kfct_food_code"])
    observations: list[tuple[str, Decimal, str, str]] = []  # key, price, as_of, source
    sources = (
        ("kamis_nairobi_market_price_observations_2026-11.csv", "observation_period", "KAMIS"),
        (
            "kenya_agri_atlas_nairobi_price_proxies_2026-11-14.csv",
            "observation_date",
            "Kenya Agri Atlas",
        ),
    )
    for filename, date_col, label in sources:
        path = processed / filename
        if not path.exists():
            continue
        for r in _read_csv(path):
            try:
                price = Decimal(r["normalized_price_per_kg"])
            except Exception:  # noqa: S112 - skip unparsable rows
                continue
            if r.get("currency_code") != "KES":
                continue
            key = _PRICE_ALIASES.get(r["ingredient_key"], r["ingredient_key"])
            observations.append((key, price, r.get(date_col, ""), f"{label}: {r.get('record_id')}"))
    matched = skipped = 0
    done: set[str] = set()
    for key, price, as_of, source in observations:
        candidates = codes.get(key, set())
        if len(candidates) != 1 or key in done:
            skipped += key not in done
            continue
        ing = session.get(Ingredient, f"ing_kfct_{next(iter(candidates))}")
        if ing is None:
            skipped += 1
            continue
        done.add(key)
        if not any(p.source == source for p in ing.prices):
            ing.prices.append(
                IngredientPrice(price_per_kg=price, currency="KES", as_of=as_of, source=source)
            )
        matched += 1
    session.flush()
    print(f"Prices: matched {matched} KFCT ingredient(s); skipped {skipped} ambiguous/unmatched.")
    return {"matched": matched, "skipped": skipped}


# --------------------------------------------------------------------------- literature


FOODML_SOURCE_ID = "foodml-texture-prediction-2023"


def _foodml_records(data_dir: Path) -> list[dict[str, Any]]:
    jsonl = Path(data_dir) / "processed" / "foodml_texture_prediction_2023_review.jsonl"
    if jsonl.exists():
        with jsonl.open(encoding="utf-8") as handle:
            return [json.loads(line) for line in handle if line.strip()]
    csv_path = Path(data_dir) / "reference" / "foodml_texture_prediction_2023.csv"
    if not csv_path.exists():
        return []
    records = []
    for r in _read_csv(csv_path):
        keys = ("protein", "target moisture", "moisture", "ash", "carbs", "fat", "fiber")
        records.append(
            {
                "identifiers": {
                    "sample_id": f"foodml2023-{r['no']}",
                    "source_study_id": r["Study_ID"],
                    "source_group_id": r["Group_ID"],
                    "source_study_label": r.get("") or r["Study_ID"],
                },
                "processing": {"regime": "high_moisture_extrusion", "source_study": None},
                "values": {
                    k: {"value": float(r[k]), "unit": "% wet basis"} for k in keys if r.get(k)
                },
                "targets": {
                    "hardness": {"value": float(r["Hardness"]), "unit": "N"},
                    "chewiness": {"value": float(r["Chewiness"]), "unit": "N (as reported)"},
                },
            }
        )
    return records


def seed_literature_experiments(session: Session, data_dir: Path) -> dict[str, int]:
    records = _foodml_records(Path(data_dir))
    if not records:
        return {"experiments": 0, "samples": 0, "measurements": 0}
    _upsert_source(
        session,
        FOODML_SOURCE_ID,
        name="FoodML texture prediction dataset (Kircali Ata et al. 2023)",
        citation=(
            "Kircali Ata, S.; Shi, J. K.; Yao, X.; Hua, X. Y.; Haldar, S.; Chiang, J. H.; "
            "Wu, M. 2023. Foods 12(2), 344. https://doi.org/10.3390/foods12020344"
        ),
        license_status="open",
        license_notes="CC BY 4.0; attribution required.",
    )
    exps = samples = meas = 0
    for rec in records:
        ident = rec["identifiers"]
        study = str(ident["source_study_id"])
        exp_id = f"exp_foodml2023_study{study}"
        if session.get(Experiment, exp_id) is None:
            session.add(
                Experiment(
                    id=exp_id,
                    name=str(
                        rec.get("processing", {}).get("source_study") or f"FoodML study {study}"
                    ),
                    notes="Literature data curated in the FoodML 2023 dataset.",
                    source_id=FOODML_SOURCE_ID,
                )
            )
            session.flush()
            exps += 1
        sample_id = ident["sample_id"]
        if session.get(Sample, sample_id) is not None:
            continue
        composition = {k: v["value"] for k, v in rec.get("values", {}).items()}
        process = {"source_study_label": ident.get("source_study_label")}
        if "target moisture" in rec.get("values", {}):
            process["target_moisture_percent"] = rec["values"]["target moisture"]["value"]
        if rec.get("processing", {}).get("crosswalked_process_settings"):
            process["crosswalked_process_settings"] = rec["processing"][
                "crosswalked_process_settings"
            ]
        session.add(
            Sample(
                id=sample_id,
                experiment_id=exp_id,
                composition=composition,
                process=process,
                regime=rec.get("processing", {}).get("regime", "high_moisture_extrusion"),
                group_id=f"foodml2023-g{ident['source_group_id']}",
            )
        )
        session.flush()
        samples += 1
        for prop, t in rec.get("targets", {}).items():
            session.add(
                Measurement(
                    sample_id=sample_id,
                    property=prop,
                    value=Decimal(str(t["value"])),
                    unit=str(t["unit"])[:32],
                    method=t.get("method"),
                    source_type="published",
                )
            )
            meas += 1
    session.flush()
    return {"experiments": exps, "samples": samples, "measurements": meas}


# --------------------------------------------------------------------------- orchestration


def run_all(
    session: Session,
    settings: Settings,
    *,
    dev_users: bool = False,
    kfct: bool = True,
) -> dict[str, Any]:
    data_dir = Path(settings.data_dir)
    summary: dict[str, Any] = {"at": datetime.now(UTC).isoformat()}
    summary["nutrient_definitions"] = seed_nutrient_definitions(session)
    summary["amino_acid_patterns"] = seed_amino_acid_patterns(session, data_dir)
    if kfct:
        summary["kfct"] = seed_kfct(session, data_dir)
        summary["prices"] = seed_prices(session, data_dir)
        summary["literature"] = seed_literature_experiments(session, data_dir)
        from app.seed.protein_ingredients import seed_protein_ingredients

        summary["protein_ingredients"] = seed_protein_ingredients(session, data_dir)
    if dev_users:
        summary["dev_users"] = seed_dev_users(session, settings)
    session.commit()
    return summary
