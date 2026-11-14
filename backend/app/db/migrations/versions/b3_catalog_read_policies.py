"""Allow read-only Data API access to safe shared catalog data."""

from collections.abc import Sequence

from alembic import op

revision: str = "b3_catalog_read_policies"
down_revision: str | None = "b2_trigger_search_path"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Shared catalog/reference records can be read over the Data API. Writes remain
    # denied because there are no INSERT, UPDATE, or DELETE policies.
    for table in (
        "amino_acid_reference_patterns",
        "data_sources",
        "nutrient_definitions",
    ):
        op.execute(
            f"CREATE POLICY api_read_shared_catalog ON public.{table} "
            "FOR SELECT TO anon, authenticated USING (true)"
        )

    # Keep test, non-active, and explicitly non-displayable ingredient records out
    # of the public catalog. Source licensing metadata is kept in data_sources.
    op.execute(
        """
        CREATE POLICY api_read_shared_catalog ON public.ingredients
        FOR SELECT TO anon, authenticated
        USING (
            status = 'active'
            AND is_fake IS FALSE
            AND (
                source_id IS NULL
                OR NOT EXISTS (
                    SELECT 1
                    FROM public.data_sources AS source
                    WHERE source.id = ingredients.source_id
                      AND source.license_status = 'restricted'
                      AND COALESCE(source.license_notes, '') LIKE '%[no-display]%'
                )
            )
        )
        """
    )

    # Child catalog rows are visible only when their ingredient is visible.
    for table in (
        "ingredient_functional_properties",
        "ingredient_nutrients",
        "ingredient_prices",
    ):
        op.execute(
            f"""
            CREATE POLICY api_read_shared_catalog ON public.{table}
            FOR SELECT TO anon, authenticated
            USING (
                EXISTS (
                    SELECT 1
                    FROM public.ingredients AS ingredient
                    WHERE ingredient.id = {table}.ingredient_id
                )
            )
            """
        )


def downgrade() -> None:
    for table in (
        "ingredient_prices",
        "ingredient_nutrients",
        "ingredient_functional_properties",
        "ingredients",
        "nutrient_definitions",
        "data_sources",
        "amino_acid_reference_patterns",
    ):
        op.execute(
            f"DROP POLICY IF EXISTS api_read_shared_catalog ON public.{table}"
        )
