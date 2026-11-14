"""Minimal Celery application configured with the Redis broker URL."""

from celery import Celery

from app.config import get_settings

settings = get_settings()
celery_app = Celery(
    "virtual_plant_meat_formulator",
    broker=settings.redis_url,
    backend=settings.redis_url,
)
