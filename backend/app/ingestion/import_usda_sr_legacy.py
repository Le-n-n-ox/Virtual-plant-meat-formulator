"""Import source-linked USDA SR Legacy references for the demo ingredients.

The source archive must be downloaded from the official FoodData Central
download page and saved as ``data/raw/fdc_sr_legacy_2018-04.zip``. Outputs are
review candidates in the ignored ``data/processed`` directory; they are not
Kenyan measurements or validated product-catalogue values.
"""

from __future__ import annotations

import csv
import io
import sys
import zipfile
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BACKEND_DIR / "data"
SOURCE_ARCHIVE = DATA_DIR / "raw" / "fdc_sr_legacy_2018-04.zip"
RETRIEVAL_DATE = "2026-11-14"
SOURCE_RELEASE = "USDA FoodData Central SR Legacy 2018-04 final release"
SOURCE_LICENSE = "CC0 1.0"

AMINO_ACIDS = (
    "Histidine",
    "Isoleucine",
    "Leucine",
    "Lysine",
    "Methionine",
    "Cystine",
    "Phenylalanine",
    "Tyrosine",
    "Threonine",
    "Tryptophan",
    "Valine",
    "Arginine",
)

# Keep food form and species decisions explicit. Near matches are retained for
# research, but only flour or cooked-bean records are eligible as same-form
# external composition references.
FOOD_MATCHES = {
    "168943": {
        "ingredient": "sorghum",
        "status": "sorghum whole-grain flour form match; external US source",
        "role": "external composition reference",
        "eligible": True,
        "note": "Whole-grain form is explicit; not a Kenyan cultivar/market lot.",
    },
    "173262": {
        "ingredient": "sorghum",
        "status": "sorghum refined flour form match; external US source",
        "role": "external composition reference",
        "eligible": True,
        "note": "Refined, unenriched flour; keep separate from whole-grain sorghum flour.",
    },
    "170682": {
        "ingredient": "amaranth",
        "status": "crop match only; raw grain, not flour",
        "role": "near-form reference only",
        "eligible": False,
        "note": "Do not map raw grain values to the amaranth flour ingredient.",
    },
    "173758": {
        "ingredient": "cowpea",
        "status": "crop match only; dry mature seed, not flour",
        "role": "raw-crop reference only",
        "eligible": False,
        "note": "Common blackeye/crowder/southern mature cowpeas; not cowpea flour.",
    },
    "173759": {
        "ingredient": "cowpea",
        "status": "crop match; boiled mature seed, not flour",
        "role": "prepared-seed reference only",
        "eligible": False,
        "note": "Boiled and unsalted mature cowpeas; not cowpea flour.",
    },
    "172436": {
        "ingredient": "pigeon_pea",
        "status": "crop match only; dry mature seed",
        "role": "raw-crop reference only",
        "eligible": False,
        "note": "Pigeon peas/red gram mature dry seed; not soaked uncooked or cooked.",
    },
    "172437": {
        "ingredient": "pigeon_pea",
        "status": "crop match; boiled mature seed",
        "role": "prepared-seed reference only",
        "eligible": False,
        "note": "Boiled without salt; does not match soaked uncooked demo.",
    },
    "172472": {
        "ingredient": "pigeon_pea",
        "status": "crop match; boiled mature seed with salt",
        "role": "prepared-seed reference only",
        "eligible": False,
        "note": "Boiled with salt; does not match soaked uncooked demo.",
    },
    "174256": {
        "ingredient": "green_gram",
        "status": "crop match only; dry mature seed, not flour",
        "role": "raw-crop reference only",
        "eligible": False,
        "note": "Mung bean is Vigna radiata/green gram; not flour.",
    },
    "174257": {
        "ingredient": "green_gram",
        "status": "crop match; boiled mature seed, not flour",
        "role": "prepared-seed reference only",
        "eligible": False,
        "note": "Boiled without salt; not green-gram flour.",
    },
    "175210": {
        "ingredient": "lablab",
        "status": "species synonym match; dry mature seed",
        "role": "raw-crop reference only",
        "eligible": False,
        "note": "USDA hyacinth bean maps to Lablab purpureus; no local cultivar match.",
    },
    "175211": {
        "ingredient": "lablab",
        "status": "species synonym and boiled mature-seed match",
        "role": "external cooked-bean composition reference",
        "eligible": True,
        "note": "Boiled without salt; external cooked Njahi/lablab reference, not a Kenya-lot measurement.",
    },
    "175253": {
        "ingredient": "lablab",
        "status": "species synonym and boiled mature-seed match",
        "role": "external cooked-bean composition reference",
        "eligible": True,
        "note": "Boiled with salt; keep separate from unsalted cooked lablab.",
    },
}


def csv_rows(archive: zipfile.ZipFile, basename: str) -> list[dict[str, str]]:
    """Read a named CSV member from an FDC zip archive."""
    member = next(
        (name for name in archive.namelist() if name.endswith(f"/{basename}")),
        None,
    )
    if member is None:
        raise ValueError(f"{basename} was not found in {SOURCE_ARCHIVE.name}")
    with archive.open(member) as raw_file:
        text_file = io.TextIOWrapper(raw_file, encoding="utf-8-sig", newline="")
        return list(csv.DictReader(text_file))


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    if not SOURCE_ARCHIVE.is_file():
        print(f"Missing USDA source archive: {SOURCE_ARCHIVE}", file=sys.stderr)
        return 2

    with zipfile.ZipFile(SOURCE_ARCHIVE) as archive:
        foods_by_id = {row["fdc_id"]: row for row in csv_rows(archive, "food.csv")}
        nutrients_by_id = {row["id"]: row for row in csv_rows(archive, "nutrient.csv")}
        food_nutrients = csv_rows(archive, "food_nutrient.csv")

    missing_ids = sorted(set(FOOD_MATCHES) - set(foods_by_id))
    if missing_ids:
        print(f"FDC food IDs missing from SR Legacy archive: {', '.join(missing_ids)}", file=sys.stderr)
        return 2

    food_rows: list[dict[str, object]] = []
    nutrients_out: list[dict[str, object]] = []
    nutrients_for_food: dict[str, list[dict[str, object]]] = {
        fdc_id: [] for fdc_id in FOOD_MATCHES
    }

    for fdc_id, match in FOOD_MATCHES.items():
        food = foods_by_id[fdc_id]
        food_rows.append(
            {
                "fdc_id": fdc_id,
                "description": food["description"],
                "fdc_data_type": food["data_type"],
                "publication_date": food["publication_date"],
                "food_category_id": food["food_category_id"],
                "demo_ingredient_key": match["ingredient"],
                "match_status": match["status"],
                "reference_role": match["role"],
                "eligible_as_external_form_reference": str(match["eligible"]).lower(),
                "eligible_as_kenya_measurement": "false",
                "source_release": SOURCE_RELEASE,
                "source_license": SOURCE_LICENSE,
                "review_note": match["note"],
            }
        )

    for row in food_nutrients:
        fdc_id = row["fdc_id"]
        match = FOOD_MATCHES.get(fdc_id)
        if match is None:
            continue
        nutrient = nutrients_by_id.get(row["nutrient_id"], {})
        output_row = {
            "fdc_id": fdc_id,
            "food_description": foods_by_id[fdc_id]["description"],
            "demo_ingredient_key": match["ingredient"],
            "match_status": match["status"],
            "reference_role": match["role"],
            "nutrient_id": row["nutrient_id"],
            "nutrient_name": nutrient.get("name", ""),
            "nutrient_number": nutrient.get("nutrient_nbr", ""),
            "unit": nutrient.get("unit_name", ""),
            # Empty source values stay empty; missing values are never zero-filled.
            "amount_per_100g": row["amount"],
            "data_points": row["data_points"],
            "derivation_id": row["derivation_id"],
            "min": row["min"],
            "max": row["max"],
            "median": row["median"],
            "footnote": row["footnote"],
            "source_release": SOURCE_RELEASE,
            "source_file": "food_nutrient.csv",
            "source_license": SOURCE_LICENSE,
            "country_context": "USDA reference data; not Kenya-specific",
        }
        nutrients_out.append(output_row)
        nutrients_for_food[fdc_id].append(output_row)

    crosswalk: list[dict[str, object]] = []
    amino_acids_out: list[dict[str, object]] = []

    for food_row in food_rows:
        fdc_id = str(food_row["fdc_id"])
        nutrient_rows = nutrients_for_food[fdc_id]
        numeric_rows = [row for row in nutrient_rows if row["amount_per_100g"] != ""]
        protein_row = next(
            (
                row
                for row in numeric_rows
                if row["nutrient_name"] == "Protein" and row["unit"] == "G"
            ),
            None,
        )
        protein_amount = float(protein_row["amount_per_100g"]) if protein_row else None

        selected_amino_acids = [
            row
            for row in numeric_rows
            if row["nutrient_name"] in AMINO_ACIDS and row["unit"] == "G"
        ]
        for amino_acid in selected_amino_acids:
            amino_amount = float(amino_acid["amount_per_100g"])
            mg_per_g_protein = (
                round(amino_amount * 1000.0 / protein_amount, 4)
                if protein_amount and protein_amount > 0
                else ""
            )
            amino_acids_out.append(
                {
                    "fdc_id": fdc_id,
                    "food_description": food_row["description"],
                    "demo_ingredient_key": food_row["demo_ingredient_key"],
                    "match_status": food_row["match_status"],
                    "amino_acid": amino_acid["nutrient_name"],
                    "amino_acid_g_per_100g_food": amino_acid["amount_per_100g"],
                    "protein_g_per_100g_food": (
                        protein_row["amount_per_100g"] if protein_row else ""
                    ),
                    "derived_mg_per_g_protein": mg_per_g_protein,
                    "calculation": "amino acid g/100 g food * 1000 / protein g/100 g food",
                    "source_release": SOURCE_RELEASE,
                    "source_fdc_id": fdc_id,
                    "source_license": SOURCE_LICENSE,
                    "use_note": "Derived reference only; preserve food-form and country caveats; not a Kenya measurement",
                }
            )

        crosswalk.append(
            {
                **food_row,
                "numeric_nutrient_count": len(numeric_rows),
                "numeric_amino_acid_count": len(selected_amino_acids),
            }
        )

    processed = DATA_DIR / "processed"
    nutrients_file = processed / f"usda_sr_legacy_demo_nutrients_{RETRIEVAL_DATE}.csv"
    crosswalk_file = processed / f"usda_sr_legacy_demo_food_crosswalk_{RETRIEVAL_DATE}.csv"
    amino_acids_file = processed / f"usda_sr_legacy_demo_amino_acids_mg_per_g_protein_{RETRIEVAL_DATE}.csv"

    write_csv(
        nutrients_file,
        list(nutrients_out[0]),
        nutrients_out,
    )
    write_csv(crosswalk_file, list(crosswalk[0]), crosswalk)
    write_csv(amino_acids_file, list(amino_acids_out[0]), amino_acids_out)

    numeric_value_count = sum(int(row["numeric_nutrient_count"]) for row in crosswalk)
    print(
        f"Imported {len(crosswalk)} USDA SR Legacy foods, "
        f"{numeric_value_count} numeric nutrient values, and "
        f"{len(amino_acids_out)} derived amino-acid values."
    )
    print(f"Crosswalk: {crosswalk_file}")
    print(f"Nutrients: {nutrients_file}")
    print(f"Amino acids: {amino_acids_file}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
