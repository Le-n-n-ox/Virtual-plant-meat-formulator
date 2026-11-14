"""CLI: ``python -m app.seed [--dev-users] [--kfct]``.

Reference data (nutrient definitions, amino-acid patterns) always load. With no flags the
KFCT, price and literature steps also run; with flags only the selected steps run.
"""

import argparse
import json

from app.config import get_settings
from app.db.session import SessionLocal
from app.seed.catalog import run_all


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.seed")
    parser.add_argument("--dev-users", action="store_true", help="create local dev users")
    parser.add_argument("--kfct", action="store_true", help="load KFCT 2018, prices, literature")
    args = parser.parse_args()
    kfct = args.kfct or not args.dev_users
    settings = get_settings()
    with SessionLocal() as session:
        summary = run_all(session, settings, dev_users=args.dev_users, kfct=kfct)
    print(json.dumps(summary, indent=2, default=str))


if __name__ == "__main__":
    main()
