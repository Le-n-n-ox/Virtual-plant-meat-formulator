"""Auth, ingredients, formulations, admin back-office and seed loaders."""

import json
from pathlib import Path

import pytest
from app.api.routers import admin
from app.config import get_settings
from app.core.security import hash_password
from app.db.models import (
    AuditLog,
    DataSource,
    Experiment,
    FormulationVersion,
    Ingredient,
    Measurement,
    Profile,
    Sample,
)
from app.seed import catalog as seed
from sqlalchemy import select


@pytest.fixture()
def api(client):  # type: ignore[no-untyped-def]
    client.app.include_router(admin.router, prefix="/api")
    return client


def lines(bean: float = 60, sorghum: float = 40) -> list[dict]:
    return [
        {"ingredient_id": "ing_bean", "percent": bean},
        {"ingredient_id": "ing_sorghum", "percent": sorghum},
    ]


def new_frm(api, headers, role="scientist", name="F1"):  # type: ignore[no-untyped-def]
    r = api.post("/api/formulations", json={"name": name}, headers=headers[role])
    assert r.status_code == 201, r.text
    return r.json()


# --------------------------------------------------------------------------- auth


def test_login_me_logout(api, db, users):  # type: ignore[no-untyped-def]
    users["scientist"].password_hash = hash_password("a-long-password")
    db.commit()
    bad = api.post("/api/auth/login", json={"email": "scientist@example.test", "password": "x"})
    assert bad.status_code == 401 and bad.json()["error"]["code"] == "unauthenticated"
    ok = api.post(
        "/api/auth/login", json={"email": "Scientist@example.test", "password": "a-long-password"}
    )
    assert ok.status_code == 200
    body = ok.json()
    assert body["token_type"] == "bearer" and body["expires_in"] > 0
    h = {"Authorization": f"Bearer {body['access_token']}"}
    me = api.get("/api/auth/me", headers=h).json()
    assert me == {
        "user_id": "usr_scientist",
        "email": "scientist@example.test",
        "display_name": "Scientist",
        "role": "scientist",
    }
    assert api.post("/api/auth/logout", headers=h).status_code == 204
    assert api.get("/api/auth/me").status_code == 401


def test_login_supabase_mode_rejected(api, monkeypatch):  # type: ignore[no-untyped-def]
    monkeypatch.setattr(get_settings(), "auth_mode", "supabase")
    r = api.post("/api/auth/login", json={"email": "a@b.c", "password": "x"})
    assert r.status_code == 400 and "Supabase" in r.json()["error"]["message"]


# --------------------------------------------------------------------------- ingredients


def test_ingredient_list_filters_facets_detail(api, headers, catalog):  # type: ignore[no-untyped-def]
    h = headers["viewer"]
    r = api.get("/api/ingredients?sort=-protein", headers=h).json()
    assert r["total"] == 3 and r["page"] == 1 and r["page_size"] == 25
    assert [i["id"] for i in r["items"]][0] == "ing_bean"
    item = r["items"][0]
    assert item["protein_g_per_100g"] == 22.0 and item["has_amino_acids"] is True
    assert item["source"] == {"id": "src_test", "name": "Test fixtures (fake)"}
    assert api.get("/api/ingredients?q=sorghum", headers=h).json()["total"] == 1
    assert api.get("/api/ingredients?q=%25", headers=h).json()["total"] == 0
    assert api.get("/api/ingredients?crop=bean", headers=h).json()["total"] == 1
    assert api.get("/api/ingredients?flag=estimated", headers=h).json()["total"] == 0
    assert api.get("/api/ingredients?flag=analytical", headers=h).json()["total"] == 3
    assert api.get("/api/ingredients?page_size=2&page=2", headers=h).json()["items"].__len__() == 1
    assert api.get("/api/ingredients?page_size=101", headers=h).status_code == 422
    facets = api.get("/api/ingredients/facets", headers=h).json()
    assert {"value": "bean", "count": 1} in facets["crops"]
    assert {"value": "flour", "count": 2} in facets["forms"]
    assert facets["sources"] == [{"id": "src_test", "name": "Test fixtures (fake)", "count": 3}]
    d = api.get("/api/ingredients/ing_bean", headers=h).json()
    assert d["price"]["currency"] == "KES" and d["dataset_version"] == "test.1"
    assert any(n["key"] == "protein" and n["flag"] == "analytical" for n in d["nutrients"])
    assert any(a["key"] == "lysine" for a in d["amino_acids"])
    assert d["source"]["license_status"] == "open"
    assert api.get("/api/ingredients/nope", headers=h).status_code == 404
    assert api.get("/api/ingredients").status_code == 401


def test_restricted_license_display(api, db, headers, catalog):  # type: ignore[no-untyped-def]
    src = db.get(DataSource, "src_test")
    src.license_status = "restricted"
    db.commit()
    assert api.get("/api/ingredients/ing_bean", headers=headers["viewer"]).status_code == 200
    src.license_notes = "Do not show. [no-display]"
    db.commit()
    r = api.get("/api/ingredients/ing_bean", headers=headers["viewer"])
    assert r.status_code == 403 and r.json()["error"]["code"] == "forbidden"


def test_nutrients_and_patterns(api, db, headers, catalog):  # type: ignore[no-untyped-def]
    n = api.get("/api/nutrients", headers=headers["viewer"]).json()
    assert {"key", "name", "unit", "kind", "infoods_tagname"} <= set(n[0])
    assert api.get("/api/amino-acid-patterns", headers=headers["viewer"]).json() == []
    seed.seed_amino_acid_patterns(db, Path(get_settings().data_dir))
    db.commit()
    p = api.get("/api/amino-acid-patterns", headers=headers["viewer"]).json()
    defaults = [x for x in p if x["is_default"]]
    assert len(p) == 3 and defaults[0]["id"] == "fao2013_older_child_adolescent_adult"
    assert "provisional" in defaults[0]["citation"]


# --------------------------------------------------------------------------- formulations


def test_role_matrix_and_ownership(api, headers, catalog):  # type: ignore[no-untyped-def]
    r = api.post("/api/formulations", json={"name": "x"}, headers=headers["viewer"])
    assert r.status_code == 403 and r.json()["error"]["code"] == "forbidden"
    f = new_frm(api, headers)
    assert api.get(f"/api/formulations/{f['id']}", headers=headers["other"]).status_code == 404
    assert (
        api.put(
            f"/api/formulations/{f['id']}",
            json={"base_version": 0, "lines": lines()},
            headers=headers["other"],
        ).status_code
        == 404
    )
    assert api.get("/api/formulations", headers=headers["other"]).json()["total"] == 0
    assert api.get("/api/formulations", headers=headers["viewer"]).status_code == 403
    assert f["current_version"] == 0 and f["lines"] == [] and f["version"] == 0


def test_save_versions_conflict_restore_immutability(api, db, headers, catalog):  # type: ignore[no-untyped-def]
    h = headers["scientist"]
    f = new_frm(api, headers)
    url = f"/api/formulations/{f['id']}"
    v1 = api.put(
        url,
        json={"base_version": 0, "lines": lines(), "targets": {"protein": 15}, "note": "first"},
        headers=h,
    )
    assert v1.status_code == 200, v1.text
    b1 = v1.json()
    assert b1["version"] == 1 and b1["lines"][0] == {"ingredient_id": "ing_bean", "percent": 60.0}
    assert len(b1["content_hash"]) == 64 and b1["targets"] == {"protein": 15}
    stale = api.put(url, json={"base_version": 0, "lines": lines(50, 50)}, headers=h)
    assert stale.status_code == 409
    err = stale.json()["error"]
    assert err["code"] == "version_conflict" and err["details"] == {"current_version": 1}
    v2 = api.put(
        url, json={"base_version": 1, "lines": lines(50, 50), "name": "Renamed"}, headers=h
    ).json()
    assert v2["version"] == 2 and v2["name"] == "Renamed"
    assert v2["content_hash"] != b1["content_hash"]
    # Same content hashes the same regardless of line order.
    v3 = api.put(
        url, json={"base_version": 2, "lines": list(reversed(lines(50, 50)))}, headers=h
    ).json()
    assert v3["content_hash"] == v2["content_hash"]

    snapshot = {
        v.version: (v.lines, v.targets, v.content_hash)
        for v in db.scalars(select(FormulationVersion)).all()
    }
    restored = api.post(f"{url}/versions/1/restore", json={"base_version": 3}, headers=h)
    assert restored.status_code == 200, restored.text
    r = restored.json()
    assert r["version"] == 4 and r["content_hash"] == b1["content_hash"]
    assert (
        api.post(f"{url}/versions/1/restore", json={"base_version": 3}, headers=h).status_code
        == 409
    )
    assert (
        api.post(f"{url}/versions/9/restore", json={"base_version": 4}, headers=h).status_code
        == 404
    )
    db.expire_all()
    for v in db.scalars(select(FormulationVersion)).all():
        if v.version in snapshot:
            assert (v.lines, v.targets, v.content_hash) == snapshot[v.version]
    old = api.get(f"{url}/versions/1", headers=h).json()
    assert old["version"] == 1 and old["current_version"] == 4 and old["note"] == "first"
    assert api.get(f"{url}?version=2", headers=h).json()["version"] == 2
    assert api.get(f"{url}?version=99", headers=h).status_code == 404
    assert api.get(url, headers=h).json()["version"] == 4

    page = api.get(f"{url}/versions?page_size=2", headers=h).json()
    assert page["total"] == 4 and len(page["items"]) == 2 and page["items"][0]["version"] == 4
    assert page["items"][0]["created_by"] == "Scientist"
    assert set(page["items"][0]) == {"version", "created_at", "created_by", "note", "content_hash"}

    actions = [a.action for a in db.scalars(select(AuditLog)).all()]
    assert actions.count("formulation.save") == 3 and "formulation.restore" in actions


def test_validation_identical_between_validate_and_put(api, headers, catalog):  # type: ignore[no-untyped-def]
    h = headers["scientist"]
    f = new_frm(api, headers)
    url = f"/api/formulations/{f['id']}"
    bad = [
        {"ingredient_id": "ing_bean", "percent": 60},
        {"ingredient_id": "ing_bean", "percent": 20},
        {"ingredient_id": "ing_missing", "percent": 18.5},
    ]
    v = api.post(f"{url}/validate", json={"lines": bad}, headers=h)
    assert v.status_code == 200 and v.json()["valid"] is False
    codes = {i["code"] for i in v.json()["issues"]}
    assert {"duplicate_ingredient", "unknown_ingredient"} <= codes
    put = api.put(url, json={"base_version": 0, "lines": bad}, headers=h)
    assert put.status_code == 422
    e = put.json()["error"]
    assert e["code"] == "validation_failed" and e["details"]["issues"] == v.json()["issues"]
    assert api.get(url, headers=h).json()["current_version"] == 0
    total = api.post(f"{url}/validate", json={"lines": lines(60, 38.5)}, headers=h).json()
    assert total["valid"] is False and total["total_percent"] == 98.5
    assert any(i["code"] == "total_not_100" for i in total["issues"])
    ok = api.post(f"{url}/validate", json={"lines": lines()}, headers=h).json()
    assert ok["valid"] is True and ok["issues"] == []


def test_patch_duplicate_template_list(api, headers, catalog):  # type: ignore[no-untyped-def]
    h = headers["scientist"]
    f = new_frm(api, headers, name="Alpha")
    url = f"/api/formulations/{f['id']}"
    api.put(url, json={"base_version": 0, "lines": lines()}, headers=h)
    p = api.patch(url, json={"name": "Alpha 2", "archived": False}, headers=h).json()
    assert p["name"] == "Alpha 2" and p["current_version"] == 1
    dup = api.post(f"{url}/duplicate", json={}, headers=h)
    assert dup.status_code == 201 and dup.json()["name"] == "Alpha 2 (copy)"
    assert dup.json()["current_version"] == 1 and len(dup.json()["lines"]) == 2
    tpl = api.post(
        "/api/formulations", json={"name": "From T", "template_id": f["id"]}, headers=h
    ).json()
    assert tpl["current_version"] == 1
    assert (
        api.post(
            "/api/formulations",
            json={"name": "n", "template_id": f["id"]},
            headers=headers["other"],
        ).status_code
        == 404
    )
    api.patch(f"/api/formulations/{tpl['id']}", json={"archived": True}, headers=h)
    live = api.get("/api/formulations", headers=h).json()
    assert live["total"] == 2 and live["items"][0]["last_job"] is None
    assert api.get("/api/formulations?archived=true", headers=h).json()["total"] == 1
    assert api.get("/api/formulations?q=zzz", headers=h).json()["total"] == 0


def test_repository_helpers(db, users, catalog):  # type: ignore[no-untyped-def]
    from app.api.deps import CurrentUser
    from app.api.errors import ApiError
    from app.db.repositories import formulations as frepo
    from app.db.repositories import ingredients as irepo

    user = CurrentUser("usr_scientist", "s@x", "Scientist", "scientist")
    f = frepo.new_formulation(db, user, "N", None)
    with pytest.raises(ApiError) as exc:
        frepo.get_version(db, f.id, None)
    assert exc.value.status_code == 422
    with pytest.raises(ApiError) as exc:
        frepo.get_owned_formulation(db, f.id, CurrentUser("usr_other", "o", "O", "scientist"))
    assert exc.value.status_code == 404
    data = irepo.load_ingredient_data(db, ["ing_bean", "nope"])
    assert set(data) == {"ing_bean"}
    assert data["ing_bean"].nutrients["protein"].value == 22
    assert data["ing_bean"].price_per_kg == 120 and data["ing_bean"].license_status == "open"
    assert irepo.dataset_versions(db, ["ing_bean", "ing_water"]) == {"ingredients": "test.1"}
    units = irepo.nutrient_units(db)
    assert units["protein"] == "g" and "lysine" not in units
    with pytest.raises(ApiError) as exc:
        irepo.get_pattern(db, None)
    assert exc.value.status_code == 422
    seed.seed_amino_acid_patterns(db, Path(get_settings().data_dir))
    assert irepo.get_pattern(db, None).id == "fao2013_older_child_adolescent_adult"
    with pytest.raises(ApiError) as exc:
        irepo.get_pattern(db, "zzz")
    assert exc.value.status_code == 404


# --------------------------------------------------------------------------- models


def test_models_endpoints(api, db, headers):  # type: ignore[no-untyped-def]
    from app.db.models import ModelRegistry

    def mk(mid, status):  # type: ignore[no-untyped-def]
        db.add(
            ModelRegistry(
                id=mid,
                target="hardness",
                unit="N",
                algorithm="ridge",
                version="1",
                status=status,
                training_set_size=40,
            )
        )

    mk("mdl_a", "approved")
    mk("mdl_b", "candidate")
    db.commit()
    v = headers["viewer"]
    assert api.get("/api/models", headers=v).json()["total"] == 1
    assert api.get("/api/models?status=all", headers=v).json()["total"] == 2
    assert api.get("/api/models?status=candidate&target=hardness", headers=v).json()["total"] == 1
    assert api.get("/api/models/mdl_a", headers=v).json()["id"] == "mdl_a"
    assert api.get("/api/models/zzz", headers=v).status_code == 404
    # admin lifecycle
    assert (
        api.post("/api/admin/models/mdl_b/approve", headers=headers["curator"]).status_code == 403
    )
    r = api.post("/api/admin/models/mdl_b/retire", headers=headers["admin"])
    assert r.status_code == 200, r.text
    assert api.post("/api/admin/models/zzz/retire", headers=headers["admin"]).status_code == 404
    log = api.get("/api/admin/audit-log?action=model.retire", headers=headers["admin"]).json()
    assert log["total"] == 1 and log["items"][0]["entity_id"] == "mdl_b"


# --------------------------------------------------------------------------- admin


def test_admin_users(api, headers, users):  # type: ignore[no-untyped-def]
    a = headers["admin"]
    assert api.get("/api/admin/users", headers=headers["curator"]).status_code == 403
    lst = api.get("/api/admin/users", headers=a).json()
    assert lst["total"] == 5
    r = api.post(
        "/api/admin/users",
        json={
            "email": "New@Example.test",
            "display_name": "New",
            "role": "scientist",
            "password": "long-enough-pw",
        },
        headers=a,
    )
    assert r.status_code == 201 and r.json()["email"] == "new@example.test"
    dup = api.post(
        "/api/admin/users",
        json={
            "email": "new@example.test",
            "display_name": "N",
            "role": "viewer",
            "password": "long-enough-pw",
        },
        headers=a,
    )
    assert dup.status_code == 409
    uid = r.json()["user_id"]
    login = api.post(
        "/api/auth/login", json={"email": "new@example.test", "password": "long-enough-pw"}
    )
    assert login.status_code == 200
    p = api.patch(f"/api/admin/users/{uid}", json={"role": "curator", "active": False}, headers=a)
    assert p.json()["role"] == "curator" and p.json()["active"] is False
    assert (
        api.post(
            "/api/auth/login", json={"email": "new@example.test", "password": "long-enough-pw"}
        ).status_code
        == 401
    )
    assert (
        api.patch("/api/admin/users/usr_admin", json={"role": "viewer"}, headers=a).status_code
        == 400
    )
    assert api.patch("/api/admin/users/zzz", json={"role": "viewer"}, headers=a).status_code == 404
    assert api.patch(f"/api/admin/users/{uid}", json={"role": "root"}, headers=a).status_code == 422


def test_admin_ingredient_create_update(api, db, headers, catalog):  # type: ignore[no-untyped-def]
    c = headers["curator"]
    body = {
        "common_name": "Test lentil",
        "scientific_name": "Lens culinaris",
        "form": "flour",
        "origin": "Kenya",
        "moisture_basis": "as_is",
        "moisture_percent": 10,
        "source_id": "src_test",
        "method": "Kjeldahl",
        "analysed_on": "2026",
        "nutrients": [
            {"key": "protein", "value": 25, "unit": "g"},
            {"key": "iron", "value": 0.006, "unit": "g", "flag": "estimated"},
        ],
    }
    assert (
        api.post("/api/admin/ingredients", json=body, headers=headers["scientist"]).status_code
        == 403
    )
    r = api.post("/api/admin/ingredients", json=body, headers=c)
    assert r.status_code == 201, r.text
    d = r.json()
    iron = next(n for n in d["nutrients"] if n["key"] == "iron")
    assert iron["value"] == 6.0 and iron["unit"] == "mg" and iron["flag"] == "estimated"
    v1 = d["dataset_version"]
    bad = api.post(
        "/api/admin/ingredients",
        json={**body, "nutrients": [{"key": "protein", "value": 1, "unit": "kg"}]},
        headers=c,
    )
    assert bad.status_code == 422
    assert (
        api.post("/api/admin/ingredients", json={**body, "source_id": "zzz"}, headers=c).status_code
        == 422
    )
    u = api.put(
        f"/api/admin/ingredients/{d['id']}",
        json={"variety": "local", "nutrients": [{"key": "protein", "value": 26, "unit": "g"}]},
        headers=c,
    )
    assert u.status_code == 200, u.text
    assert u.json()["dataset_version"] != v1 and u.json()["variety"] == "local"
    assert [n["value"] for n in u.json()["nutrients"]] == [26.0]
    entry = db.scalars(select(AuditLog).where(AuditLog.action == "ingredient.update")).one()
    assert entry.payload["before"]["nutrients"]["protein"]["value"] == "25.000000"
    assert api.put("/api/admin/ingredients/zzz", json={}, headers=c).status_code == 404


CSV_HEAD = (
    "common_name,scientific_name,variety,form,origin,moisture_basis,moisture_percent,"
    "nutrient_key,value,unit,flag,range_low,range_high,source_name,method,analysed_on,"
    "license_status\n"
)


def _row(name, key, value, unit="g", lic="open", flag="analytical", form="flour"):  # type: ignore[no-untyped-def]
    return (
        f"{name},Sci name,,{form},Kenya,as_is,10,{key},{value},{unit},{flag},,,"
        f"Lab study,Kjeldahl,2026,{lic}\n"
    )


def test_import_validate_and_commit(api, db, headers, catalog):  # type: ignore[no-untyped-def]
    c = headers["curator"]
    good = [
        ("Okra", k, v)
        for k, v in [
            ("water", 10),
            ("protein", 20),
            ("fat", 5),
            ("carbohydrate_available", 60),
            ("ash", 5),
        ]
    ]
    csv_text = CSV_HEAD
    for n, k, v in good:
        csv_text += _row(n, k, v)
    csv_text += _row("Sumsy", "water", 10) + _row("Sumsy", "protein", 20)
    csv_text += _row("Sumsy", "fat", 5) + _row("Sumsy", "carbohydrate_available", 20)
    csv_text += _row("Sumsy", "ash", 5)
    csv_text += _row("Bad unit", "protein", 20, unit="kg")
    csv_text += _row("Restricted", "protein", 20, lic="restricted")
    r = api.post("/api/admin/imports/ingredients", json={"csv": csv_text}, headers=c)
    assert r.status_code == 201, r.text
    report = r.json()["report"]
    status = {i["common_name"]: i for i in report["ingredients"]}
    assert status["Okra"]["status"] == "ok"
    assert status["Sumsy"]["status"] == "flagged"
    assert status["Sumsy"]["issues"][0]["code"] == "proximate_sum"
    assert status["Bad unit"]["status"] == "rejected"
    assert status["Restricted"]["status"] == "rejected" and report["blocked"] is True
    assert (
        api.post(
            "/api/admin/imports/ingredients", json={"csv": "a,b\n1,2\n"}, headers=c
        ).status_code
        == 400
    )
    assert db.scalar(select(Ingredient).where(Ingredient.common_name == "Okra")) is None
    iid = r.json()["import_id"]
    cm = api.post(f"/api/admin/imports/{iid}/commit", headers=c)
    assert cm.status_code == 200, cm.text
    assert len(cm.json()["ingredient_ids"]) == 1
    db.expire_all()
    ing = db.scalars(select(Ingredient).where(Ingredient.common_name == "Okra")).one()
    assert ing.dataset_version == cm.json()["dataset_version"] and len(ing.nutrients) == 5
    assert db.scalars(select(Ingredient).where(Ingredient.common_name == "Sumsy")).first() is None
    assert api.post(f"/api/admin/imports/{iid}/commit", headers=c).status_code == 409
    assert api.post("/api/admin/imports/zzz/commit", headers=c).status_code == 404
    actions = {a.action for a in db.scalars(select(AuditLog)).all()}
    assert {"import.validate", "import.commit"} <= actions
    # re-import flags the duplicate
    again = api.post(
        "/api/admin/imports/ingredients",
        json={"csv": CSV_HEAD + _row("Okra", "protein", 20)},
        headers=c,
    )
    assert any(
        i["code"] == "duplicate_ingredient"
        for i in again.json()["report"]["ingredients"][0]["issues"]
    )


def test_experiments_samples_measurements(api, db, headers, catalog):  # type: ignore[no-untyped-def]
    c = headers["curator"]
    assert (
        api.post(
            "/api/admin/experiments", json={"name": "E"}, headers=headers["scientist"]
        ).status_code
        == 403
    )
    e = api.post("/api/admin/experiments", json={"name": "E1", "lab": "L"}, headers=c).json()
    s = api.post(
        f"/api/admin/experiments/{e['id']}/samples", json={"process": {"rpm": 300}}, headers=c
    )
    assert s.status_code == 201
    sid = s.json()["id"]
    m = api.post(
        f"/api/admin/samples/{sid}/measurements",
        json={"property": "hardness", "value": 41.5, "unit": "N", "source_type": "measured"},
        headers=c,
    )
    assert m.status_code == 201 and m.json()["never_for_training"] is False
    syn = api.post(
        f"/api/admin/samples/{sid}/measurements",
        json={"property": "hardness", "value": 1, "unit": "N", "source_type": "synthetic"},
        headers=c,
    ).json()
    assert syn["never_for_training"] is True
    assert (
        api.post(
            f"/api/admin/samples/{sid}/measurements",
            json={"property": "h", "value": 1, "unit": "N", "source_type": "guess"},
            headers=c,
        ).status_code
        == 422
    )
    assert api.post("/api/admin/experiments/zzz/samples", json={}, headers=c).status_code == 404
    assert (
        api.post(
            "/api/admin/samples/zzz/measurements",
            json={"property": "h", "value": 1, "unit": "N", "source_type": "measured"},
            headers=c,
        ).status_code
        == 404
    )
    assert len(db.scalars(select(Measurement)).all()) == 2


def test_audit_log_filters(api, headers, catalog):  # type: ignore[no-untyped-def]
    new_frm(api, headers)
    a = headers["admin"]
    assert api.get("/api/admin/audit-log", headers=headers["curator"]).status_code == 403
    r = api.get("/api/admin/audit-log?actor_id=usr_scientist&entity=formulation", headers=a).json()
    assert r["total"] == 1 and r["items"][0]["action"] == "formulation.create"
    assert api.get("/api/admin/audit-log?actor_id=nobody", headers=a).json()["total"] == 0


# --------------------------------------------------------------------------- seed


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _kfct_nut(
    label,
    unit,
    value,
    kind="numeric",
    flags=(),
    denom="/100 g edible portion, fresh weight basis",
    rng=None,
):  # type: ignore[no-untyped-def]
    n = {
        "component_label": label,
        "unit": unit,
        "denominator": denom,
        "value_kind": kind,
        "numeric_value": value,
        "flags": list(flags),
    }
    if rng:
        n["statistic"] = {"range_values": rng}
    return n


@pytest.fixture()
def tmp_data(tmp_path: Path) -> Path:
    src = {
        "source_id": "kfct-2018",
        "citation": "FAO 2018",
        "license_notice": "Non-commercial.",
        "worksheet": "04",
        "row": 6,
    }
    foods = [
        {
            "record_type": "food",
            "code": "1001",
            "name": "Amaranth, whole grain, dry, raw",
            "food_group": "Cereals",
            "scientific_name": "Amaranthus",
            "source": src,
            "nutrients": [
                _kfct_nut("Energy", "kJ", 1520),
                _kfct_nut("Energy", "kcal", 360),
                _kfct_nut("Water", "g", 10),
                _kfct_nut("Protein", "g", 14.7, rng=[13, 16]),
                _kfct_nut("Fat", "g", 5.6, flags=["alternative_method_or_lower_quality"]),
                _kfct_nut("Se", "mcg", None, kind="text"),
                _kfct_nut("Thiamin", "mg", None, kind="trace", flags=["estimated_trace"]),
                _kfct_nut("Lysine", "mg", 700),
                _kfct_nut("Isoleucin", "mg", 500),
                _kfct_nut("Valine", "mg", 9, denom="/g N"),
                _kfct_nut("Fatty acid 4:0", "g", 1),
            ],
        },
        {
            "record_type": "food",
            "code": "1002",
            "name": "Amaranth whole grain flour",
            "food_group": "Cereals",
            "source": src,
            "nutrients": [_kfct_nut("Water", "g", 11)],
        },
        {"record_type": "recipe", "code": "R1", "name": "Recipe", "nutrients": []},
    ]
    _write(
        tmp_path / "processed" / "kfct2018_review.jsonl", "\n".join(json.dumps(f) for f in foods)
    )
    _write(
        tmp_path / "processed" / "kfct2018_demo_ingredient_crosswalk_2026-11-14.csv",
        "demo_ingredient_key,kfct_food_code\namaranth,1001\nsorghum,1038\nsorghum,1040\n",
    )
    _write(
        tmp_path / "processed" / "kamis_nairobi_market_price_observations_2026-11.csv",
        "record_id,ingredient_key,normalized_price_per_kg,currency_code,observation_period\n"
        "k1,amaranth,150,KES,2026-11\nk2,sorghum,75,KES,2026-11\nk3,unknown,10,KES,2026-11\n",
    )
    rec = {
        "identifiers": {
            "sample_id": "foodml2023-1",
            "source_study_id": 2,
            "source_group_id": 5,
            "source_study_label": "x",
        },
        "processing": {"regime": "high_moisture_extrusion", "source_study": "Chiang 2019"},
        "values": {
            "protein": {"value": 62.7, "unit": "%"},
            "target moisture": {"value": 56.8, "unit": "%"},
        },
        "targets": {
            "hardness": {"value": 46.7, "unit": "N", "method": "TPA"},
            "chewiness": {"value": 38.0, "unit": "N (as reported by source)"},
        },
    }
    _write(tmp_path / "processed" / "foodml_texture_prediction_2023_review.jsonl", json.dumps(rec))
    _write(
        tmp_path / "reference" / "fao_amino_acid_patterns_2013.yaml",
        "source_year: 2013\nsource_title: T\nsource_url: u\ndefault_pattern_id: null\n"
        "amino_acid_keys: [histidine, lysine]\nrecommended_patterns:\n"
        "  - {id: fao2013_older_child_adolescent_adult, label: Adult, values: [16, 48]}\n"
        "  - {id: fao2013_infant_breast_milk, label: Infant, values: [21, 69]}\n",
    )
    return tmp_path


def test_seed_with_fixture_files_idempotent(db, tmp_data):  # type: ignore[no-untyped-def]
    assert seed.seed_nutrient_definitions(db) > 40
    seed.seed_nutrient_definitions(db)
    assert seed.seed_amino_acid_patterns(db, tmp_data) == 2
    kf = seed.seed_kfct(db, tmp_data)
    assert kf == {"foods": 2, "skipped_amino_cells": 1}
    pr = seed.seed_prices(db, tmp_data)
    assert pr["matched"] == 1  # sorghum ambiguous (two foods), unknown absent
    lit = seed.seed_literature_experiments(db, tmp_data)
    assert lit == {"experiments": 1, "samples": 1, "measurements": 2}
    for _ in range(2):  # idempotent
        seed.seed_kfct(db, tmp_data)
        seed.seed_prices(db, tmp_data)
        seed.seed_literature_experiments(db, tmp_data)
        seed.seed_amino_acid_patterns(db, tmp_data)
    db.commit()
    ing = db.get(Ingredient, "ing_kfct_1001")
    by = {n.nutrient_key: n for n in ing.nutrients}
    assert ing.form == "raw" and ing.crop == "Amaranth" and ing.dataset_version == "kfct2018.1"
    assert ing.moisture_percent == 10 and ing.quality_flag == "estimated"
    assert by["protein"].range_low == 13 and by["protein"].flag == "analytical"
    assert by["fat"].flag == "estimated"
    assert by["selenium"].value is None and by["thiamin"].value is None
    assert by["selenium"].unit == "ug"
    assert "valine" not in by and "isoleucine" in by and "fatty_acid" not in by
    assert by["energy_kj"].value == 1520 and by["energy_kj"].unit == "kJ"
    assert by["energy_kcal"].value == 360 and by["energy_kcal"].unit == "kcal"
    assert db.get(Ingredient, "ing_kfct_1002").form == "flour"
    assert len(ing.prices) == 1 and float(ing.prices[0].price_per_kg) == 150
    assert db.get(DataSource, "kfct-2018").license_status == "restricted"
    assert len(db.scalars(select(Sample)).all()) == 1
    assert len(db.scalars(select(Experiment)).all()) == 1
    assert {m.source_type for m in db.scalars(select(Measurement)).all()} == {"published"}
    from app.db.models import AminoAcidReferencePattern as P

    pats = {p.id: p for p in db.scalars(select(P)).all()}
    assert pats["fao2013_older_child_adolescent_adult"].is_default is True
    assert pats["fao2013_infant_breast_milk"].is_default is False
    assert pats["fao2013_infant_breast_milk"].values == {"histidine": 21, "lysine": 69}


def test_seed_dev_users(db, monkeypatch):  # type: ignore[no-untyped-def]
    monkeypatch.setenv("DEV_USER_PASSWORD", "another-dev-pass")
    settings = get_settings()
    assert seed.seed_dev_users(db, settings) == 4
    assert seed.seed_dev_users(db, settings) == 0
    from app.core.security import verify_password

    p = db.scalars(select(Profile).where(Profile.email == "admin@vpmf.local")).one()
    assert p.role == "admin" and verify_password("another-dev-pass", p.password_hash)
    monkeypatch.setattr(settings, "env", "production")
    assert seed.seed_dev_users(db, settings) == 0


def test_seed_run_all_and_real_kfct(db):  # type: ignore[no-untyped-def]
    settings = get_settings()
    real = Path(settings.data_dir) / "processed" / "kfct2018_review.jsonl"
    summary = seed.run_all(db, settings, kfct=real.exists())
    assert "fake_ingredients" not in summary
    assert not db.scalars(select(Ingredient).where(Ingredient.is_fake)).all()
    if not real.exists():
        pytest.skip("real KFCT file not present")
    assert summary["kfct"]["foods"] > 400
    assert db.get(Ingredient, "ing_kfct_1001") is not None


def test_exclude_animal_groups_filter(client, headers, catalog, db):  # type: ignore[no-untyped-def]
    db.get(Ingredient, "ing_bean").food_group = "Legumes and pulses"
    db.get(Ingredient, "ing_sorghum").food_group = "Fish and sea foods"  # pretend animal group
    db.commit()
    everything = client.get("/api/ingredients", headers=headers["viewer"]).json()
    assert everything["total"] == 3
    filtered = client.get(
        "/api/ingredients?exclude_animal_groups=true", headers=headers["viewer"]
    ).json()
    ids = {i["id"] for i in filtered["items"]}
    assert ids == {"ing_bean", "ing_water"}  # ungrouped items are kept
    assert filtered["total"] == 2
    assert {i["food_group"] for i in filtered["items"]} == {"Legumes and pulses", None}
