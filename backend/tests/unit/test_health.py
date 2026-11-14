"""Health endpoint contract tests with dependency checks stubbed."""

from app.api.errors import ApiError
from app.api.routers.system import check_dependencies
from app.main import create_app
from fastapi.testclient import TestClient


def test_health_returns_contract_shape() -> None:
    app = create_app()
    app.dependency_overrides[check_dependencies] = lambda: None

    response = TestClient(app).get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "dev"}
    assert response.headers["x-request-id"].startswith("req_")


def test_health_returns_503_when_database_check_fails() -> None:
    app = create_app()

    def unavailable() -> None:
        raise ApiError(503, "dependency_unavailable", "A required service is unavailable.")

    app.dependency_overrides[check_dependencies] = unavailable
    response = TestClient(app).get("/api/health")

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "dependency_unavailable"
    assert response.json()["error"]["request_id"] == response.headers["x-request-id"]
