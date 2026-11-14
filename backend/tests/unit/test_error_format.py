"""Tests for the API's shared error response envelope."""

from app.main import create_app
from fastapi.testclient import TestClient


def test_not_found_uses_shared_error_format() -> None:
    response = TestClient(create_app()).get("/missing")

    assert response.status_code == 404
    assert response.json() == {
        "error": {
            "code": "not_found",
            "message": "Not Found",
            "details": {},
            "request_id": response.headers["x-request-id"],
        }
    }
