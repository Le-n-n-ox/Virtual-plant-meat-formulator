"""The rate-limit table covers only its intended method and complete path."""

import pytest
from app.core.observability import rate_limit_rule

ROUTES: tuple[tuple[str, str, str | None], ...] = (
    ("GET", "/api/admin/users", None),
    ("POST", "/api/admin/users", None),
    ("PATCH", "/api/admin/users/usr_abc123", None),
    ("POST", "/api/admin/ingredients", None),
    ("PUT", "/api/admin/ingredients/ing_abc123", None),
    ("POST", "/api/admin/imports/ingredients", None),
    ("POST", "/api/admin/imports/imp_abc123/commit", None),
    ("POST", "/api/admin/experiments", None),
    ("POST", "/api/admin/experiments/exp_abc123/samples", None),
    ("POST", "/api/admin/samples/sam_abc123/measurements", None),
    ("POST", "/api/admin/models/mod_abc123/approve", None),
    ("POST", "/api/admin/models/mod_abc123/retire", None),
    ("GET", "/api/admin/audit-log", None),
    ("GET", "/api/assistant/status", None),
    ("POST", "/api/jobs/job_abc123/explain", "explain"),
    ("POST", "/api/candidates/cand_abc123/explain", "explain"),
    ("POST", "/api/models/mod_abc123/explain", "explain"),
    ("POST", "/api/auth/login", "login"),
    ("POST", "/api/auth/logout", None),
    ("GET", "/api/auth/me", None),
    ("GET", "/api/formulations/frm_abc123/candidates", None),
    ("GET", "/api/compare", None),
    ("GET", "/api/candidates/cand_abc123", None),
    ("POST", "/api/candidates/cand_abc123/promote", None),
    ("GET", "/api/formulations/frm_abc123/export", "export"),
    ("GET", "/api/formulations", None),
    ("POST", "/api/formulations", None),
    ("GET", "/api/formulations/frm_abc123", None),
    ("PUT", "/api/formulations/frm_abc123", None),
    ("PATCH", "/api/formulations/frm_abc123", None),
    ("POST", "/api/formulations/frm_abc123/duplicate", None),
    ("POST", "/api/formulations/frm_abc123/validate", None),
    ("GET", "/api/formulations/frm_abc123/versions", None),
    ("GET", "/api/formulations/frm_abc123/versions/2", None),
    ("POST", "/api/formulations/frm_abc123/versions/2/restore", None),
    ("POST", "/api/formulations/frm_abc123/jobs", "job_start"),
    ("POST", "/api/admin/models/train", "model_train"),
    ("GET", "/api/jobs", None),
    ("GET", "/api/jobs/job_abc123", None),
    ("POST", "/api/jobs/job_abc123/stream-token", "stream_token"),
    ("GET", "/api/jobs/job_abc123/events", "stream_events"),
    ("GET", "/api/jobs/job_abc123/result", None),
    ("POST", "/api/jobs/job_abc123/cancel", "job_cancel"),
    ("GET", "/api/ingredients", None),
    ("GET", "/api/ingredients/facets", None),
    ("GET", "/api/ingredients/ing_abc123", None),
    ("GET", "/api/nutrients", None),
    ("GET", "/api/amino-acid-patterns", None),
    ("GET", "/api/models", None),
    ("GET", "/api/models/mod_abc123", None),
    ("GET", "/api/health", None),
    ("GET", "/api/ready", None),
    ("GET", "/api/metrics", None),
    ("GET", "/api/formulations/frm_abc123/nutrition", None),
)


@pytest.mark.parametrize(("method", "path", "expected_name"), ROUTES)
def test_rate_limit_rule_matches_each_route(method: str, path: str, expected_name: str | None):
    match = rate_limit_rule(method, path)

    assert (match.name if match is not None else None) == expected_name


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/api/jobs"),
        ("GET", "/api/jobs/job_abc123"),
        ("POST", "/api/jobs/job_abc123/stream-token/extra"),
        ("POST", "/api/other/jobs/job_abc123/stream-token"),
        ("POST", "/api/jobs/job_abc123/stream-token/"),
        ("POST", "/api/formulations/frm_abc123/jobs/"),
        ("PUT", "/api/auth/login"),
    ],
)
def test_rate_limit_rule_rejects_nonmatching_paths(method: str, path: str):
    assert rate_limit_rule(method, path) is None


@pytest.mark.parametrize(
    ("method", "path", "expected_name"),
    [
        ("POST", "/api/jobs/job.with~punctuation/explain", "explain"),
        ("POST", "/api/jobs/job.with~punctuation/stream-token", "stream_token"),
        ("GET", "/api/jobs/job.with~punctuation/events", "stream_events"),
        ("POST", "/api/formulations/frm.with~punctuation/jobs", "job_start"),
    ],
)
def test_rate_limit_rule_accepts_unusual_nonempty_ids(method: str, path: str, expected_name: str):
    match = rate_limit_rule(method, path)

    assert match is not None
    assert match.name == expected_name


@pytest.mark.parametrize(
    ("method", "path", "expected_name"),
    [
        ("POST", "/api/auth/login", "login"),
        ("POST", "/api/formulations/frm_abc123/jobs", "job_start"),
        ("POST", "/api/jobs/job_abc123/stream-token", "stream_token"),
        ("POST", "/api/jobs/job_abc123/cancel", "job_cancel"),
        ("POST", "/api/candidates/cand_abc123/explain", "explain"),
        ("GET", "/api/formulations/frm_abc123/export", "export"),
        ("POST", "/api/admin/models/train", "model_train"),
        ("GET", "/api/jobs/job_abc123/events", "stream_events"),
    ],
)
def test_rate_limit_rule_has_intended_limit_and_window(method: str, path: str, expected_name: str):
    match = rate_limit_rule(method, path)

    assert match is not None
    assert match.name == expected_name
    assert match.window_seconds == 60
    assert (
        match.limit
        == {
            "login": 10,
            "job_start": 30,
            "stream_token": 60,
            "job_cancel": 30,
            "explain": 20,
            "export": 20,
            "model_train": 10,
            "stream_events": 60,
        }[expected_name]
    )
