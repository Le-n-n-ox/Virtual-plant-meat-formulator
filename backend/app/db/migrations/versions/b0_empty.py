"""Empty B0 baseline; application tables will be added in phase B1."""

revision = "b0_empty"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Keep the initial schema empty until the data foundation phase."""


def downgrade() -> None:
    """The empty baseline has no application objects to remove."""
