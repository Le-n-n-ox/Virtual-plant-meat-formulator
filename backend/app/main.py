"""FastAPI application factory, middleware, shared errors, and routers."""

from collections.abc import Awaitable, Callable
from uuid import uuid4

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.errors import (
    ApiError,
    api_error_handler,
    http_error_handler,
    unexpected_error_handler,
    validation_error_handler,
)
from app.api.routers import (
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


def create_app() -> FastAPI:
    """Build and configure the API app without performing startup I/O."""
    settings = get_settings()
    application = FastAPI(title="Virtual Plant-Meat Formulator API", version=settings.git_sha)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-Id"],
    )

    @application.middleware("http")
    async def request_id_middleware(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        request_id = request.headers.get("X-Request-Id", "").strip()
        if not request_id or len(request_id) > 128:
            request_id = f"req_{uuid4().hex}"
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-Id"] = request_id
        return response

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
        system.router,
    ):
        application.include_router(resource_router, prefix="/api")

    return application


app = create_app()
