"""Live smoke test: exercise every API route against a running stack.

Usage (stack seeded with ``python -m app.seed --dev-users --kfct``):
    python tests/smoke/smoke_api.py --base-url http://localhost:8000 [--password devpassword123]

Creates smoke-test records (and approves candidate models) in the target database: use a dev
database, then clean up with ``python -m app.seed.purge``.

Fails (exit 1) if any route in /openapi.json was not exercised or returned an unexpected status.
Not collected by pytest (file name does not start with ``test_``).
"""

from __future__ import annotations

import argparse
import sys
import time
from typing import Any

import httpx

CALLED: set[tuple[str, str]] = set()
FAILURES: list[str] = []


class Api:
    def __init__(self, base: str) -> None:
        self.http = httpx.Client(base_url=base, timeout=120)
        self.token: str | None = None

    def call(
        self,
        method: str,
        template: str,
        expect: tuple[int, ...],
        *,
        token: str | None = "default",
        **params: Any,
    ) -> httpx.Response:
        path_params = params.pop("path", {})
        path = template.format(**path_params)
        headers = dict(params.pop("headers", {}))
        use = self.token if token == "default" else token
        if use:
            headers["Authorization"] = f"Bearer {use}"
        resp = self.http.request(method, "/api" + path, headers=headers, **params)
        CALLED.add((method.upper(), "/api" + template))
        mark = "ok " if resp.status_code in expect else "BAD"
        print(f"{mark} {resp.status_code} {method.upper():6} {path}")
        if resp.status_code not in expect:
            FAILURES.append(f"{method} {path} -> {resp.status_code}: {resp.text[:300]}")
        return resp


def wait_job(api: Api, job_id: str, timeout: float = 300) -> dict[str, Any]:
    deadline = time.time() + timeout
    while time.time() < deadline:
        status = api.http.get(
            f"/api/jobs/{job_id}", headers={"Authorization": f"Bearer {api.token}"}
        ).json()
        if status["status"] in ("completed", "failed", "cancelled"):
            return status
        time.sleep(0.5)
    raise TimeoutError(job_id)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--password", default="devpassword123")
    args = parser.parse_args()
    api = Api(args.base_url)
    pw = args.password

    # ---------------------------------------------------------------- system & auth
    api.call("GET", "/health", (200,), token=None)
    api.call("GET", "/ready", (200,), token=None)
    tokens = {}
    for role in ("admin", "scientist", "viewer"):
        r = api.call(
            "POST",
            "/auth/login",
            (200,),
            token=None,
            json={"email": f"{role}@vpmf.local", "password": pw},
        )
        tokens[role] = r.json()["access_token"]
    api.call(
        "POST",
        "/auth/login",
        (401,),
        token=None,
        json={"email": "scientist@vpmf.local", "password": "wrong-password"},
    )
    api.token = tokens["scientist"]
    me = api.call("GET", "/auth/me", (200,)).json()
    assert me["role"] == "scientist", me

    # ---------------------------------------------------------------- catalogue
    listing = api.call(
        "GET", "/ingredients", (200,), params={"sort": "-protein", "page_size": 100}
    ).json()
    assert listing["total"] > 0, "catalogue is empty; run python -m app.seed --kfct"
    api.call("GET", "/ingredients/facets", (200,))
    api.call("GET", "/nutrients", (200,))
    api.call("GET", "/amino-acid-patterns", (200,))
    rich = [i for i in listing["items"] if i.get("has_amino_acids") and i["protein_g_per_100g"]]
    assert len(rich) >= 2, "need two ingredients with amino-acid profiles"
    a, b = rich[0]["id"], rich[min(5, len(rich) - 1)]["id"]
    detail = api.call("GET", "/ingredients/{id}", (200,), path={"id": a}).json()
    print("   using", detail["common_name"], "and", b)

    # ---------------------------------------------------------------- formulations
    frm = api.call("POST", "/formulations", (201,), json={"name": "Smoke blend"}).json()
    fid = frm["id"]
    lines = [{"ingredient_id": a, "percent": 60}, {"ingredient_id": b, "percent": 40}]
    bad = api.call(
        "POST",
        "/formulations/{id}/validate",
        (200,),
        path={"id": fid},
        json={"lines": [{"ingredient_id": a, "percent": 50}]},
    ).json()
    assert bad["valid"] is False
    api.call(
        "PUT",
        "/formulations/{id}",
        (200,),
        path={"id": fid},
        json={"base_version": 0, "lines": lines, "note": "v1"},
    )
    api.call(
        "PUT",
        "/formulations/{id}",
        (409,),
        path={"id": fid},
        json={"base_version": 0, "lines": lines},
    )
    api.call(
        "PUT",
        "/formulations/{id}",
        (200,),
        path={"id": fid},
        json={
            "base_version": 1,
            "lines": [{"ingredient_id": a, "percent": 70}, {"ingredient_id": b, "percent": 30}],
        },
    )
    api.call("GET", "/formulations", (200,))
    api.call("GET", "/formulations/{id}", (200,), path={"id": fid})
    api.call(
        "PATCH", "/formulations/{id}", (200,), path={"id": fid}, json={"description": "smoke test"}
    )
    api.call("GET", "/formulations/{id}/versions", (200,), path={"id": fid})
    api.call("GET", "/formulations/{id}/versions/{v}", (200,), path={"id": fid, "v": 1})
    api.call(
        "POST",
        "/formulations/{id}/versions/{v}/restore",
        (200,),
        path={"id": fid, "v": 1},
        json={"base_version": 2},
    )
    api.call("POST", "/formulations/{id}/duplicate", (201,), path={"id": fid}, json={})
    api.call("POST", "/formulations", (403,), token=tokens["viewer"], json={"name": "x"})

    # ---------------------------------------------------------------- models (admin approve)
    api.token = tokens["admin"]
    models = api.call("GET", "/models", (200,), params={"status": "all"}).json()["items"]
    approved: dict[str, str] = {}
    for m in models:
        api.call("GET", "/models/{id}", (200,), path={"id": m["id"]})
        if m["status"] == "approved":
            approved[m["target"]] = m["id"]
    for m in models:
        if m["status"] == "candidate" and m["target"] not in approved:
            r = api.call("POST", "/admin/models/{id}/approve", (200, 422), path={"id": m["id"]})
            if r.status_code == 200:
                approved[m["target"]] = m["id"]
    print("   approved models:", approved)
    api.token = tokens["scientist"]

    # ---------------------------------------------------------------- jobs
    r = api.call(
        "POST",
        "/formulations/{id}/jobs",
        (202,),
        path={"id": fid},
        json={"type": "nutrition"},
        headers={"Idempotency-Key": f"smoke-{fid}"},
    )
    nut_job = r.json()["job_id"]
    status = wait_job(api, nut_job)
    assert status["status"] == "completed", status
    tok = api.call("POST", "/jobs/{id}/stream-token", (200,), path={"id": nut_job}).json()
    with api.http.stream(
        "GET", f"/api/jobs/{nut_job}/events", params={"token": tok["token"]}
    ) as stream:
        CALLED.add(("GET", "/api/jobs/{id}/events"))
        body = "".join(stream.iter_text())
    n_events = body.count("\nevent: ") + body.startswith("event: ")
    print(f"ok SSE replay: {body.count('event: ')} events, terminal={'job.completed' in body}")
    if "job.completed" not in body:
        FAILURES.append("SSE stream did not end with job.completed")
    del n_events
    result = api.call("GET", "/jobs/{id}/result", (200,), path={"id": nut_job}).json()
    protein = next(n for n in result["nutrients"] if n["key"] == "protein")
    print(f"   protein = {protein['value']} g/100 g; AAS = {result['amino_acids'].get('score')}")
    api.call("GET", "/formulations/{id}/nutrition", (200,), path={"id": fid})
    api.call("GET", "/jobs", (200,))
    api.call("GET", "/jobs/{id}", (200,), path={"id": nut_job})
    api.call("POST", "/jobs/{id}/cancel", (409,), path={"id": nut_job})

    process = {
        "moisture_percent": 60,
        "screw_speed_rpm": 250,
        "feed_rate_kg_h": 12,
        "temperature_profile_c": [{"zone": 1, "temp": 80}, {"zone": 2, "temp": 140}],
        "cooling": {"type": "die", "temp_c": 40},
    }
    if "hardness" in approved:
        r = api.call(
            "POST",
            "/formulations/{id}/jobs",
            (202,),
            path={"id": fid},
            json={
                "type": "texture_prediction",
                "params": {"process": process, "targets": ["hardness"]},
            },
        )
        tex = wait_job(api, r.json()["job_id"])
        print("   texture:", tex["status"], tex.get("error"))
    objectives: list[dict[str, Any]] = [{"target": "protein_g_per_100g", "direction": "maximize"}]
    if "hardness" in approved:
        objectives.append({"target": "hardness", "direction": "target", "value": 40, "unit": "N"})
    r = api.call(
        "POST",
        "/formulations/{id}/jobs",
        (202,),
        path={"id": fid},
        json={
            "type": "optimization",
            "params": {
                "objectives": objectives,
                "process": process,
                "n_candidates": 3,
                "n_starts": 4,
                "seed": 42,
                "constraints": {
                    "ingredient_bounds": [
                        {"ingredient_id": a, "min_percent": 20, "max_percent": 80}
                    ]
                },
            },
        },
    )
    opt_job = r.json()["job_id"]
    opt = wait_job(api, opt_job)
    print("   optimization:", opt["status"], opt.get("error"))
    cands = api.call(
        "GET", "/formulations/{id}/candidates", (200,), path={"id": fid}, params={"job_id": opt_job}
    ).json()["items"]
    if len(cands) >= 1:
        api.call("GET", "/candidates/{id}", (200,), path={"id": cands[0]["id"]})
        ids = [c["id"] for c in cands[:2]]
        if len(ids) == 2:
            api.call("GET", "/compare", (200,), params={"ids": ",".join(ids)})
        else:
            api.call("GET", "/compare", (400,), params={"ids": ids[0]})
        api.call(
            "POST",
            "/candidates/{id}/promote",
            (201,),
            path={"id": cands[0]["id"]},
            json={"name": "Promoted smoke"},
        )
        api.call(
            "POST", "/candidates/{id}/explain", (200, 503), path={"id": cands[0]["id"]}, json={}
        )
    else:
        FAILURES.append("optimization produced no candidates")

    # cancellation of a long optimization
    r = api.call(
        "POST",
        "/formulations/{id}/jobs",
        (202,),
        path={"id": fid},
        json={
            "type": "optimization",
            "params": {"objectives": objectives, "process": process, "n_starts": 40, "seed": 1},
        },
    )
    cancel_job = r.json()["job_id"]
    api.call("POST", "/jobs/{id}/cancel", (202, 409), path={"id": cancel_job})
    print("   cancel ->", wait_job(api, cancel_job)["status"])

    exp = api.call(
        "GET", "/formulations/{id}/export", (200,), path={"id": fid}, params={"format": "csv"}
    )
    assert "section" in exp.text.splitlines()[0]
    pdf = api.call(
        "GET", "/formulations/{id}/export", (200,), path={"id": fid}, params={"format": "pdf"}
    )
    assert pdf.content[:4] == b"%PDF"

    # ---------------------------------------------------------------- assistant (NVIDIA LLM)
    status_llm = api.call("GET", "/assistant/status", (200,)).json()
    print("   assistant:", status_llm)
    r = api.call(
        "POST",
        "/jobs/{id}/explain",
        (200, 503),
        path={"id": nut_job},
        json={"question": "Which amino acid limits this blend?"},
    )
    if r.status_code == 200:
        print("   LLM says:", r.json()["text"][:300].replace("\n", " "), "...")
        print("   numbers_check:", r.json()["numbers_check"])
    if models:
        api.call(
            "POST",
            "/models/{id}/explain",
            (200, 503),
            path={"id": models[0]["id"]},
            json={},
            token=tokens["viewer"],
        )

    # ---------------------------------------------------------------- admin
    api.token = tokens["admin"]
    api.call("GET", "/admin/users", (200,))
    stamp = str(int(time.time()))
    user = api.call(
        "POST",
        "/admin/users",
        (201,),
        json={
            "email": f"smoke{stamp}@vpmf.local",
            "display_name": "Smoke",
            "role": "viewer",
            "password": "smoke-password-123",
        },
    ).json()
    api.call(
        "PATCH",
        "/admin/users/{id}",
        (200,),
        path={"id": user["user_id"]},
        json={"role": "scientist"},
    )
    ing = api.call(
        "POST",
        "/admin/ingredients",
        (201,),
        json={
            "common_name": f"[SMOKE] Test flour {stamp}",
            "scientific_name": "Testus flourus",
            "form": "flour",
            "origin": "Test",
            "moisture_basis": "as_is",
            "moisture_percent": 10,
            "source_id": "kfct-2018",
            "nutrients": [
                {"key": "protein", "value": 20, "unit": "g"},
                {"key": "water", "value": 10, "unit": "g"},
            ],
            "status": "draft",
        },
    ).json()
    api.call(
        "PUT", "/admin/ingredients/{id}", (200,), path={"id": ing["id"]}, json={"status": "retired"}
    )
    csv_text = (
        "common_name,scientific_name,variety,form,origin,moisture_basis,moisture_percent,"
        "nutrient_key,value,unit,flag,range_low,range_high,source_name,method,analysed_on,"
        "license_status\n"
        f"Smoke bean {stamp},Vigna smoke,,flour,Kenya,as_is,10,protein,22,g,analytical,,,"
        "Smoke lab,Kjeldahl,2026,open\n"
    )
    imp = api.call("POST", "/admin/imports/ingredients", (201,), json={"csv": csv_text}).json()
    api.call(
        "POST",
        "/admin/imports/{id}/commit",
        (200,),
        path={"id": imp["import_id"]},
        json={"include_flagged": True},
    )
    experiment = api.call(
        "POST", "/admin/experiments", (201,), json={"name": "Smoke experiment"}
    ).json()
    sample = api.call(
        "POST",
        "/admin/experiments/{id}/samples",
        (201,),
        path={"id": experiment["id"]},
        json={"composition": {"protein": 60}, "process": process},
    ).json()
    api.call(
        "POST",
        "/admin/samples/{id}/measurements",
        (201,),
        path={"id": sample["id"]},
        json={"property": "hardness", "value": 40, "unit": "N", "source_type": "measured"},
    )
    api.call("GET", "/admin/audit-log", (200,))
    train = api.call(
        "POST", "/admin/models/train", (202,), json={"target": "chewiness", "seed": 7}
    ).json()
    trained = wait_job(api, train["job_id"])
    print("   training:", trained["status"], trained.get("model_ids"))
    if trained["status"] == "completed" and trained["model_ids"]:
        api.call("POST", "/admin/models/{id}/retire", (200,), path={"id": trained["model_ids"][0]})
    else:
        FAILURES.append(f"training job did not complete: {trained.get('error')}")
    metrics = api.call("GET", "/metrics", (200,), token=None)
    assert "http_requests_total" in metrics.text
    api.call("POST", "/auth/logout", (204,))

    # ---------------------------------------------------------------- coverage
    spec = api.http.get("/openapi.json").json()
    routes = {
        (method.upper(), path)
        for path, ops in spec["paths"].items()
        for method in ops
        if method in ("get", "post", "put", "patch", "delete")
    }

    def norm(path: str) -> str:
        import re

        return re.sub(r"\{[^}]+\}", "{}", path)

    called = {(m, norm(p)) for m, p in CALLED}
    missing = sorted(r for r in routes if (r[0], norm(r[1])) not in called)
    print(f"\nroutes in OpenAPI: {len(routes)}; exercised: {len(routes) - len(missing)}")
    for route in missing:
        FAILURES.append(f"route never exercised: {route}")
    if FAILURES:
        print("\nFAILURES:\n" + "\n".join(FAILURES))
        return 1
    print("ALL ROUTES CONNECTED AND RESPONDING AS EXPECTED")
    print("Smoke records were created; remove them with: python -m app.seed.purge")
    return 0


if __name__ == "__main__":
    sys.exit(main())
