"""Protein isolates, concentrates and defatted flours for the ingredient catalogue.

High-moisture extrusion is done with protein isolates and concentrates, which the Kenya
Food Composition Tables do not contain. Two real, citable sources fill that gap:

* USDA FoodData Central SR Legacy (2018-04, CC0): full nutrient and amino-acid rows.
  Stored with ``quality_flag = external_match`` (a US reference, not a Kenyan measurement).
  ``extract_usda`` copies the selected records from the local raw archive into a small
  tracked reference CSV so a clean checkout can seed them.
* Raw-material compositions published with the FoodML 2023 literature dataset (CC BY 4.0;
  Ferawati et al. 2021 and Chiang et al. 2019): proximate composition only. Nutrients the
  papers do not report stay absent (never zero).

No value here is invented: every number is read from one of those files.
"""

from __future__ import annotations

import csv
import io
import zipfile
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.db.models import DataSource, Ingredient
from app.db.repositories.ingredients import replace_nutrients

USDA_SOURCE_ID = "usda-sr-legacy-2018-04"
USDA_RELEASE = "USDA FoodData Central SR Legacy 2018-04 final release"
USDA_ARCHIVE = "raw/fdc_sr_legacy_2018-04.zip"
USDA_REFERENCE = "reference/usda_sr_legacy_protein_ingredients.csv"
USDA_DATASET_VERSION = "usda-sr-legacy-2018-04.1"

# fdc_id -> (common name, form, crop)
USDA_FOODS: dict[str, tuple[str, str, str]] = {
    "174276": ("Soy protein isolate", "isolate", "Soybean"),
    "172447": ("Soy protein concentrate (alcohol extraction)", "concentrate", "Soybean"),
    "168147": ("Vital wheat gluten", "concentrate", "Wheat"),
    "174275": ("Soy flour, defatted", "flour", "Soybean"),
    "174267": ("Peanut flour, defatted", "flour", "Groundnut"),
}

# USDA nutrient name -> (canonical key, canonical unit, multiplier from the USDA unit)
USDA_NUTRIENTS: dict[tuple[str, str], tuple[str, str, Decimal]] = {
    ("Water", "G"): ("water", "g", Decimal(1)),
    ("Protein", "G"): ("protein", "g", Decimal(1)),
    ("Total lipid (fat)", "G"): ("fat", "g", Decimal(1)),
    ("Ash", "G"): ("ash", "g", Decimal(1)),
    ("Fiber, total dietary", "G"): ("fibre", "g", Decimal(1)),
    ("Energy", "KCAL"): ("energy_kcal", "kcal", Decimal(1)),
    ("Energy", "kJ"): ("energy_kj", "kJ", Decimal(1)),
    ("Calcium, Ca", "MG"): ("calcium", "mg", Decimal(1)),
    ("Iron, Fe", "MG"): ("iron", "mg", Decimal(1)),
    ("Magnesium, Mg", "MG"): ("magnesium", "mg", Decimal(1)),
    ("Phosphorus, P", "MG"): ("phosphorus", "mg", Decimal(1)),
    ("Potassium, K", "MG"): ("potassium", "mg", Decimal(1)),
    ("Sodium, Na", "MG"): ("sodium", "mg", Decimal(1)),
    ("Zinc, Zn", "MG"): ("zinc", "mg", Decimal(1)),
    ("Selenium, Se", "UG"): ("selenium", "ug", Decimal(1)),
    ("Thiamin", "MG"): ("thiamin", "mg", Decimal(1)),
    ("Riboflavin", "MG"): ("riboflavin", "mg", Decimal(1)),
    ("Niacin", "MG"): ("niacin", "mg", Decimal(1)),
    ("Vitamin C, total ascorbic acid", "MG"): ("vitamin_c", "mg", Decimal(1)),
    ("Vitamin B-12", "UG"): ("vitamin_b12", "ug", Decimal(1)),
    ("Folate, DFE", "UG"): ("folate_dfe", "ug", Decimal(1)),
    ("Vitamin A, RAE", "UG"): ("vitamin_a_rae", "ug", Decimal(1)),
    ("Retinol", "UG"): ("retinol", "ug", Decimal(1)),
    ("Cholesterol", "MG"): ("cholesterol", "mg", Decimal(1)),
    # Amino acids: USDA reports g per 100 g; the catalogue stores mg per 100 g.
    **{
        (name, "G"): (key, "mg", Decimal(1000))
        for name, key in {
            "Histidine": "histidine",
            "Isoleucine": "isoleucine",
            "Leucine": "leucine",
            "Lysine": "lysine",
            "Methionine": "methionine",
            "Cystine": "cysteine",
            "Phenylalanine": "phenylalanine",
            "Tyrosine": "tyrosine",
            "Threonine": "threonine",
            "Tryptophan": "tryptophan",
            "Valine": "valine",
            "Arginine": "arginine",
            "Alanine": "alanine",
            "Aspartic acid": "aspartic_acid",
            "Glutamic acid": "glutamic_acid",
            "Glycine": "glycine",
            "Proline": "proline",
            "Serine": "serine",
        }.items()
    },
}
CARB_BY_DIFFERENCE = ("Carbohydrate, by difference", "G")
REFERENCE_COLUMNS = [
    "fdc_id",
    "description",
    "nutrient_name",
    "unit",
    "amount_per_100g",
    "source_release",
    "source_license",
]

FOODML_SOURCE_ID = "foodml-texture-prediction-2023"
FOODML_REFERENCE = "reference/foodml_texture_prediction_2023.csv"
FOODML_DATASET_VERSION = "foodml2023-materials.1"
# FoodML group label -> (ingredient id, common name, form, crop, cited study)
FOODML_MATERIALS: dict[str, tuple[str, str, str, str, str]] = {
    "YPI-com": (
        "ing_lit_ypi_com",
        "Yellow pea protein isolate, commercial (Ferawati et al. 2021)",
        "isolate",
        "Pea",
        "Ferawati et al. (2021), Foods 10:843, https://doi.org/10.3390/foods10040843",
    ),
    "YPI-local": (
        "ing_lit_ypi_local",
        "Yellow pea protein isolate, locally produced (Ferawati et al. 2021)",
        "isolate",
        "Pea",
        "Ferawati et al. (2021), Foods 10:843, https://doi.org/10.3390/foods10040843",
    ),
    "FBC-com": (
        "ing_lit_fbc_com",
        "Faba bean protein concentrate, commercial (Ferawati et al. 2021)",
        "concentrate",
        "Faba bean",
        "Ferawati et al. (2021), Foods 10:843, https://doi.org/10.3390/foods10040843",
    ),
    "FBI-local": (
        "ing_lit_fbi_local",
        "Faba bean protein isolate, locally produced (Ferawati et al. 2021)",
        "isolate",
        "Faba bean",
        "Ferawati et al. (2021), Foods 10:843, https://doi.org/10.3390/foods10040843",
    ),
    "ext._0%WG": (
        "ing_lit_spc_chiang",
        "Soy protein concentrate (Chiang et al. 2019)",
        "concentrate",
        "Soybean",
        "Chiang et al. (2019), Food Structure 19:100102, "
        "https://doi.org/10.1016/j.foostr.2018.11.002",
    ),
}
# FoodML column -> canonical nutrient key (all "% wet basis" = g per 100 g as-is)
FOODML_COLUMNS = {
    "protein": "protein",
    "moisture": "water",
    "ash": "ash",
    "carbs": "carbohydrate_available",
    "fat": "fat",
    "fiber": "fibre",
}


def extract_usda(data_dir: Path) -> int:
    """Copy the selected SR Legacy records from the raw archive into the reference CSV."""
    archive_path = data_dir / USDA_ARCHIVE
    with zipfile.ZipFile(archive_path) as archive:

        def rows(basename: str) -> csv.DictReader[str]:
            member = next(n for n in archive.namelist() if n.rsplit("/", 1)[-1] == basename)
            return csv.DictReader(io.TextIOWrapper(archive.open(member), encoding="utf-8"))

        descriptions = {r["fdc_id"]: r["description"] for r in rows("food.csv")}
        nutrients = {r["id"]: (r["name"], r["unit_name"]) for r in rows("nutrient.csv")}
        wanted = set(USDA_NUTRIENTS) | {CARB_BY_DIFFERENCE}
        out: list[dict[str, str]] = []
        for r in rows("food_nutrient.csv"):
            if r["fdc_id"] not in USDA_FOODS:
                continue
            name_unit = nutrients.get(r["nutrient_id"])
            if name_unit in wanted and r["amount"] != "":
                out.append(
                    {
                        "fdc_id": r["fdc_id"],
                        "description": descriptions[r["fdc_id"]],
                        "nutrient_name": name_unit[0],
                        "unit": name_unit[1],
                        "amount_per_100g": r["amount"],
                        "source_release": USDA_RELEASE,
                        "source_license": "CC0 1.0",
                    }
                )
    out.sort(key=lambda r: (r["fdc_id"], r["nutrient_name"], r["unit"]))
    target = data_dir / USDA_REFERENCE
    with target.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=REFERENCE_COLUMNS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(out)
    return len(out)


def _source(session: Session, source_id: str, **fields: Any) -> None:
    row = session.get(DataSource, source_id)
    if row is None:
        row = DataSource(id=source_id, name=fields["name"])
        session.add(row)
    for key, value in fields.items():
        setattr(row, key, value)
    session.flush()


def _ingredient(session: Session, ing_id: str, common_name: str, form: str) -> Ingredient:
    ing = session.get(Ingredient, ing_id)
    if ing is None:
        ing = Ingredient(id=ing_id, common_name=common_name, form=form)
        session.add(ing)
    ing.common_name = common_name
    ing.form = form
    ing.moisture_basis = "as_is"
    ing.status = "active"
    ing.is_fake = False
    return ing


def seed_usda_protein_ingredients(session: Session, data_dir: Path) -> int:
    path = data_dir / USDA_REFERENCE
    if not path.exists():
        return 0
    by_food: dict[str, dict[tuple[str, str], Decimal]] = {}
    descriptions: dict[str, str] = {}
    with path.open(encoding="utf-8", newline="") as handle:
        for r in csv.DictReader(handle):
            by_food.setdefault(r["fdc_id"], {})[(r["nutrient_name"], r["unit"])] = Decimal(
                r["amount_per_100g"]
            )
            descriptions[r["fdc_id"]] = r["description"]
    if not by_food:
        return 0
    _source(
        session,
        USDA_SOURCE_ID,
        name="USDA FoodData Central, SR Legacy (2018-04)",
        citation=(
            "U.S. Department of Agriculture, Agricultural Research Service. FoodData "
            "Central, SR Legacy, April 2018. https://fdc.nal.usda.gov/"
        ),
        url="https://fdc.nal.usda.gov/download-datasets/",
        version="2018-04",
        license_status="open",
        license_notes="CC0 1.0 public domain. US reference values; not Kenyan measurements.",
    )
    count = 0
    for fdc_id, (name, form, crop) in USDA_FOODS.items():
        values = by_food.get(fdc_id)
        if not values:
            continue
        rows: list[dict[str, Any]] = []
        for name_unit, amount in values.items():
            mapped = USDA_NUTRIENTS.get(name_unit)
            if mapped is None:
                continue
            key, unit, factor = mapped
            rows.append({"key": key, "value": amount * factor, "unit": unit})
        by_difference = values.get(CARB_BY_DIFFERENCE)
        fibre = values.get(("Fiber, total dietary", "G"))
        if by_difference is not None and fibre is not None:
            # USDA reports carbohydrate by difference (fibre included); the catalogue key
            # is available carbohydrate, so subtract the reported fibre and flag it.
            rows.append(
                {
                    "key": "carbohydrate_available",
                    "value": max(by_difference - fibre, Decimal(0)),
                    "unit": "g",
                    "flag": "estimated",
                }
            )
        ing = _ingredient(session, f"ing_usda_{fdc_id}", name, form)
        ing.scientific_name = None
        ing.crop = crop
        ing.food_group = "Protein ingredients (isolates, concentrates, defatted flours)"
        ing.origin = "United States (USDA reference; not Kenya-specific)"
        ing.moisture_percent = values.get(("Water", "G"))
        ing.source_id = USDA_SOURCE_ID
        ing.source_row_ref = f"FDC {fdc_id}: {descriptions[fdc_id]}"
        ing.method = (
            "USDA SR Legacy record. Available carbohydrate = carbohydrate by difference "
            "minus total dietary fibre (derived)."
        )
        ing.analysed_on = "2018"
        ing.quality_flag = "external_match"
        ing.dataset_version = USDA_DATASET_VERSION
        replace_nutrients(ing, rows)
        count += 1
    session.flush()
    return count


def seed_literature_materials(session: Session, data_dir: Path) -> int:
    path = data_dir / FOODML_REFERENCE
    if not path.exists() or session.get(DataSource, FOODML_SOURCE_ID) is None:
        return 0
    seen: dict[str, dict[str, str]] = {}
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle)
        header = next(reader)
        label_index = 13  # unnamed column holding the source group label
        for raw in reader:
            label = raw[label_index] if len(raw) > label_index else ""
            if label in FOODML_MATERIALS and label not in seen:
                seen[label] = dict(zip(header, raw, strict=False))
    count = 0
    for label, record in seen.items():
        ing_id, name, form, crop, study = FOODML_MATERIALS[label]
        rows = [
            {"key": key, "value": Decimal(record[column]), "unit": "g"}
            for column, key in FOODML_COLUMNS.items()
        ]
        ing = _ingredient(session, ing_id, name, form)
        ing.scientific_name = None
        ing.crop = crop
        ing.food_group = "Protein ingredients (isolates, concentrates, defatted flours)"
        ing.origin = "Literature (not Kenya-specific)"
        ing.moisture_percent = Decimal(record["moisture"])
        ing.source_id = FOODML_SOURCE_ID
        ing.source_row_ref = f"FoodML group {label}, sample {record['no']}; {study}"
        ing.method = (
            "Raw-material proximate composition (% wet basis) as curated in the FoodML 2023 "
            "dataset from the cited study. Only these six values are reported."
        )
        ing.analysed_on = None
        ing.quality_flag = "external_match"
        ing.dataset_version = FOODML_DATASET_VERSION
        replace_nutrients(ing, rows)
        count += 1
    session.flush()
    return count


def seed_protein_ingredients(session: Session, data_dir: Path) -> dict[str, int]:
    return {
        "usda": seed_usda_protein_ingredients(session, data_dir),
        "literature": seed_literature_materials(session, data_dir),
    }


if __name__ == "__main__":  # python -m app.seed.protein_ingredients  (re-extract from raw)
    from app.config import get_settings

    print(f"wrote {extract_usda(Path(get_settings().data_dir))} USDA rows to {USDA_REFERENCE}")
