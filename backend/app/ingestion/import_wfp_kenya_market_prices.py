"""Download WFP's current Kenya market-price records through HDX HAPI."""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
from datetime import date
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

HAPI_ENDPOINT = (
    "https://hapi.humdata.org/api/v2/food-security-nutrition-poverty/food-prices-market-monitor"
)
DATASET_URL = "https://data.humdata.org/dataset/wfp-food-prices-for-kenya"
LICENSE = "CC BY-IGO 3.0"
PAGE_SIZE = 10_000
BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_DIR = BACKEND_DIR.parent
OUTPUT_PATH = BACKEND_DIR / "data" / "processed" / "wfp_kenya_market_prices.csv"
DERIVED_FIELDS = ("normalized_price_per_kg", "normalization_method")


def concise_decimal(value: Decimal) -> str:
    """Format a Decimal without scientific notation or unnecessary zeroes."""
    formatted = format(value, "f")
    if "." in formatted:
        formatted = formatted.rstrip("0").rstrip(".")
    return formatted or "0"


def normalize_mass_price(price: object, unit: object) -> tuple[str, str]:
    """Convert a price to KES/kg only when the source unit states a mass."""
    raw_unit = str(unit or "").strip()
    match = re.fullmatch(
        r"(?:(\d+(?:\.\d+)?)\s*)?(kg|kgs|g|gram|grams)",
        raw_unit,
        flags=re.IGNORECASE,
    )
    if not match:
        return "", "not converted: source unit is not an explicit mass quantity"

    try:
        amount = Decimal(match.group(1) or "1")
        raw_price = Decimal(str(price).strip())
    except InvalidOperation, ValueError:
        return "", "not converted: price or mass quantity is missing or invalid"
    if not amount.is_finite() or amount <= 0 or not raw_price.is_finite() or raw_price < 0:
        return "", "not converted: price or mass quantity is outside the valid range"

    unit_name = match.group(2).lower()
    kg_per_unit = amount / Decimal("1000") if unit_name in {"g", "gram", "grams"} else amount
    price_per_kg = (raw_price / kg_per_unit).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
    return (
        concise_decimal(price_per_kg),
        f"price divided by explicit source mass quantity ({concise_decimal(kg_per_unit)} kg)",
    )


def app_identifier_from_environment() -> str:
    """Read the HAPI identifier from the process environment or project .env."""
    value = os.environ.get("HDX_HAPI_APP_IDENTIFIER", "").strip()
    if value:
        return value

    env_path = PROJECT_DIR / ".env"
    if env_path.is_file():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            key, separator, raw_value = line.partition("=")
            if separator and key.strip().removeprefix("export ").strip() == (
                "HDX_HAPI_APP_IDENTIFIER"
            ):
                value = raw_value.strip()
                if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                    value = value[1:-1]
                return value.strip()
    return ""


def fetch_page(app_identifier: str, offset: int) -> list[dict[str, object]]:
    """Fetch a single HAPI page, returning its records without transforming them."""
    query = urlencode(
        {
            "location_code": "KEN",
            "output_format": "json",
            "offset": offset,
            "limit": PAGE_SIZE,
            "app_identifier": app_identifier,
        }
    )
    request = Request(
        f"{HAPI_ENDPOINT}?{query}",
        headers={"Accept": "application/json", "User-Agent": "vpmf-data-import/1.0"},
    )
    with urlopen(request, timeout=90) as response:
        payload = json.loads(response.read().decode("utf-8"))

    records = payload.get("data") if isinstance(payload, dict) else payload
    if not isinstance(records, list):
        raise ValueError("HDX HAPI returned an unexpected response; expected a data list.")
    if any(not isinstance(record, dict) for record in records):
        raise ValueError("HDX HAPI returned a record that is not a JSON object.")
    return records


def fetch_all(app_identifier: str) -> list[dict[str, object]]:
    """Fetch all available Kenyan food-price records using offset pagination."""
    records: list[dict[str, object]] = []
    offset = 0
    while True:
        page = fetch_page(app_identifier, offset)
        records.extend(page)
        print(f"Fetched {len(records)} Kenya price records", file=sys.stderr)
        if len(page) < PAGE_SIZE:
            break
        offset += len(page)
    if not records:
        raise ValueError("HDX HAPI returned no Kenya food-price records.")
    return records


def write_records(records: list[dict[str, object]]) -> None:
    """Write source fields and retrieval provenance to the ignored processed area."""
    provenance = {
        "source_name": "World Food Programme Food Prices via HDX HAPI",
        "source_url": DATASET_URL,
        "source_license": LICENSE,
        "source_retrieved_on": date.today().isoformat(),
        "source_api_endpoint": HAPI_ENDPOINT,
    }
    fieldnames = list(dict.fromkeys(key for record in records for key in record))
    fieldnames.extend(key for key in DERIVED_FIELDS if key not in fieldnames)
    fieldnames.extend(key for key in provenance if key not in fieldnames)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = OUTPUT_PATH.with_suffix(".csv.tmp")
    with temporary_path.open("w", encoding="utf-8", newline="") as output_file:
        writer = csv.DictWriter(output_file, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for record in records:
            normalized_price, normalization_method = normalize_mass_price(
                record.get("price"), record.get("unit")
            )
            writer.writerow(
                {
                    **record,
                    "normalized_price_per_kg": normalized_price,
                    "normalization_method": normalization_method,
                    **provenance,
                }
            )
    temporary_path.replace(OUTPUT_PATH)


def normalize_existing_file() -> int:
    """Add safe mass-price fields to an already downloaded CSV, offline."""
    if not OUTPUT_PATH.is_file():
        print(f"No existing WFP import found at {OUTPUT_PATH}", file=sys.stderr)
        return 2

    temporary_path = OUTPUT_PATH.with_suffix(".csv.tmp")
    with OUTPUT_PATH.open("r", encoding="utf-8-sig", newline="") as input_file:
        reader = csv.DictReader(input_file)
        if not reader.fieldnames:
            print("The existing WFP import has no CSV header.", file=sys.stderr)
            return 2
        fieldnames = list(reader.fieldnames)
        fieldnames.extend(key for key in DERIVED_FIELDS if key not in fieldnames)
        with temporary_path.open("w", encoding="utf-8", newline="") as output_file:
            writer = csv.DictWriter(output_file, fieldnames=fieldnames)
            writer.writeheader()
            count = 0
            for record in reader:
                normalized_price, normalization_method = normalize_mass_price(
                    record.get("price"), record.get("unit")
                )
                writer.writerow(
                    {
                        **record,
                        "normalized_price_per_kg": normalized_price,
                        "normalization_method": normalization_method,
                    }
                )
                count += 1
    temporary_path.replace(OUTPUT_PATH)
    print(f"Added mass-based price normalization to {count} records in {OUTPUT_PATH}")
    return 0


def main(argv: list[str] | None = None) -> int:
    """Download and save all Kenya price records."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--normalize-existing",
        action="store_true",
        help="add safe mass-unit price conversions without making an API request",
    )
    arguments = parser.parse_args(argv)
    if arguments.normalize_existing:
        return normalize_existing_file()

    app_identifier = app_identifier_from_environment()
    if not app_identifier or app_identifier.startswith("REPLACE_WITH_"):
        print(
            "Set HDX_HAPI_APP_IDENTIFIER in the project .env first. Generate it at "
            "https://hdx-hapi.readthedocs.io/en/latest/getting-started/#generating-a-key.",
            file=sys.stderr,
        )
        return 2

    try:
        records = fetch_all(app_identifier)
        write_records(records)
    except (HTTPError, URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError) as error:
        # Do not print the request URL: it contains the app identifier query parameter.
        print(
            "Could not import WFP Kenya market prices "
            f"({type(error).__name__}). Check the app identifier, network, and API response.",
            file=sys.stderr,
        )
        return 1

    print(f"Saved {len(records)} records to {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
