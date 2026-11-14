"""Celery application configured with the Redis broker URL and the job task."""

from celery import Celery

from app.config import get_settings

settings = get_settings()
celery_app = Celery(
    "virtual_plant_meat_formulator",
    broker=settings.redis_url,
    backend=settings.redis_url,
)
celery_app.conf.update(
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_track_started=True,
    broker_connection_retry_on_startup=True,
)


@celery_app.task(name="vpmf.execute_job")  # type: ignore[untyped-decorator]
def execute_job_task(job_id: str) -> None:
    """Execute a job; all outcomes are recorded as job events, never as task results."""
    from app.jobs.runner import execute_job

    execute_job(job_id)
