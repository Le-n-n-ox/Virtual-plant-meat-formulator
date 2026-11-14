"""Pin the insert-only trigger function's search path."""

from collections.abc import Sequence

from alembic import op

revision: str = "b2_trigger_search_path"
down_revision: str | None = "b1_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "ALTER FUNCTION public.vpmf_block_mutation() SET search_path = pg_catalog"
    )


def downgrade() -> None:
    op.execute(
        "ALTER FUNCTION public.vpmf_block_mutation() RESET search_path"
    )
