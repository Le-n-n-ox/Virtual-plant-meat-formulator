"""FastAPI application factory, middleware, shared errors, and routers."""

import hashlib
import logging
import time
from collections.abc import Awaitable, Callable
from uuid import uuid4

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.errors import (
    ApiError,
    _error_response,
    api_error_handler,
    http_error_handler,
    unexpected_error_handler,
    validation_error_handler,
)
from app.api.routers import (
    admin,
    assistant,
    auth,
    candidates,
    exports,
    formulations,
    ingredients,
    jobs,
    models,
    results,
    system,
)
from app.config import get_settings
from app.core.limits import get_limits
from app.core.observability import (
    configure_logging,
    metrics,
    rate_limit_rule,
    request_id_var,
)

logger = logging.getLogger("app.http")


def create_app() -> FastAPI:
    """Build and configure the API app without performing startup I/O."""
    settings = get_settings()
    configure_logging(settings.log_level)
    get_limits().reset()
    application = FastAPI(
        title="Virtual Plant-Meat Formulator API",
        version=settings.git_sha,
        description=(
            "Deterministic nutrition, literature-trained texture estimates with uncertainty, "
            "and constrained formulation search. No scientific value is ever fabricated."
        ),
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-Id", "Content-Disposition"],
    )

    @application.middleware("http")
    async def request_middleware(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        request_id = request.headers.get("X-Request-Id", "").strip()
        if not request_id or len(request_id) > 128:
            request_id = f"req_{uuid4().hex}"
        request.state.request_id = request_id
        token = request_id_var.set(request_id)
        started = time.perf_counter()
        try:
            length = request.headers.get("content-length")
            if length and length.isdigit() and int(length) > settings.max_request_bytes:
                return _error_response(
                    request,
                    413,
                    "payload_too_large",
                    "Request body is too large.",
                    {"max_bytes": settings.max_request_bytes},
                )
            rule = rate_limit_rule(request.method, request.url.path)
            if rule is not None:
                caller = request.headers.get("authorization") or (
                    request.client.host if request.client else "unknown"
                )
                key = f"{rule.name}:{hashlib.sha256(caller.encode()).hexdigest()[:16]}"
                if not get_limits().allow(key, rule.limit, rule.window_seconds):
                    metrics.inc("http_rate_limited_total", rule=rule.name)
                    return _error_response(
                        request, 429, "rate_limited", "Too many requests; slow down."
                    )
            response = await call_next(request)
            response.headers["X-Request-Id"] = request_id
            elapsed_ms = (time.perf_counter() - started) * 1000
            route = request.scope.get("route")
            path = getattr(route, "path", "unmatched")
            metrics.observe(
                "http_request_duration_ms", elapsed_ms, method=request.method, path=path
            )
            metrics.inc(
                "http_requests_total",
                method=request.method,
                path=path,
                status=str(response.status_code),
            )
            logger.info(
                "request",
                extra={
                    "path": path,
                    "method": request.method,
                    "status": response.status_code,
                    "duration_ms": round(elapsed_ms, 1),
                },
            )
            return response
        finally:
            request_id_var.reset(token)

    application.add_exception_handler(ApiError, api_error_handler)  # type: ignore[arg-type]
    application.add_exception_handler(
        StarletteHTTPException,
        http_error_handler,  # type: ignore[arg-type]
    )
    application.add_exception_handler(
        RequestValidationError,
        validation_error_handler,  # type: ignore[arg-type]
    )
    application.add_exception_handler(Exception, unexpected_error_handler)

    for resource_router in (
        auth.router,
        ingredients.router,
        formulations.router,
        jobs.router,
        results.router,
        candidates.router,
        models.router,
        exports.router,
        admin.router,
        assistant.router,
        system.router,
    ):
        application.include_router(resource_router, prefix="/api")

    return application


app = create_app()
