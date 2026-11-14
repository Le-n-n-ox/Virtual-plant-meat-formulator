"""Job task handlers keyed by job type."""

from collections.abc import Callable

from app.jobs.events import JobEmitter
from app.jobs.tasks.nutrition import run_nutrition
from app.jobs.tasks.optimization import run_optimization
from app.jobs.tasks.texture import run_texture
from app.jobs.tasks.training import run_training

HANDLERS: dict[str, Callable[[str, JobEmitter], None]] = {
    "nutrition": run_nutrition,
    "texture_prediction": run_texture,
    "optimization": run_optimization,
    "model_training": run_training,
}

CANCELLABLE = frozenset({"optimization", "model_training"})
