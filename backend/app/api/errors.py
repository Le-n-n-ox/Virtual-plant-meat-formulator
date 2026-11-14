"""Shared API error type and response handlers."""

from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    """An expected API failure with a stable public error code."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or {}
        super().__init__(message)


def _error_response(
    request: Request,
    status_code: int,
    code: str,
    message: str,
    details: dict[str, Any] | None = None,
) -> JSONResponse:
    request_id = getattr(request.state, "request_id", "req_unknown")
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": code,
                "message": message,
                "details": details or {},
                "request_id": request_id,
            }
        },
        headers={"X-Request-Id": request_id},
    )


async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
    """Format an application error according to the shared API contract."""
    return _error_response(request, exc.status_code, exc.code, exc.message, exc.details)


async def http_error_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Format framework HTTP errors using the shared envelope."""
    labels = {404: "not_found", 401: "unauthenticated", 403: "forbidden"}
    code = labels.get(exc.status_code, "bad_request" if exc.status_code < 500 else "internal_error")
    message = exc.detail if isinstance(exc.detail, str) else "Request failed."
    return _error_response(request, exc.status_code, code, message)


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Format FastAPI request validation failures as a stable client error."""
    return _error_response(
        request,
        422,
        "bad_request",
        "Request validation failed.",
        {"issues": exc.errors()},
    )


async def unexpected_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Return a non-sensitive envelope for unexpected server failures."""
    return _error_response(request, 500, "internal_error", "An unexpected error occurred.")
