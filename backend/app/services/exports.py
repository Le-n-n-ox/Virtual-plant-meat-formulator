"""Export builders: one context dict from stored results, rendered to CSV or PDF.

Values are printed with ``str()`` of the stored payload value, never re-rounded, so an
export always equals what the stored results say.
"""

import csv
import io
import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.ids import iso, utcnow
from app.db.models import (
    DataSource,
    Formulation,
    FormulationVersion,
    Ingredient,
    ModelRegistry,
)
from app.db.repositories.results import latest_completed

AAS_LABEL = "AAS (unadjusted amino-acid score)"
TEXTURE_LABEL = "literature-derived estimate"
NOT_CALCULATED = "not calculated"


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "formulation"


def _s(value: Any) -> str:
    return "" if value is None else str(value)


def _job_audit(job: Any) -> dict[str, Any]:
    return {
        "job_id": job.id,
        "type": job.type,
        "data_versions": job.data_versions or {},
        "calc_version": job.calc_version,
        "seed": job.seed,
        "started_at": iso(job.started_at),
        "finished_at": iso(job.finished_at),
    }


def build_export_context(
    session: Session,
    formulation: Formulation,
    version: FormulationVersion,
    *,
    request_id: str | None = None,
) -> dict[str, Any]:
    notes: list[str] = []
    ids = [ln["ingredient_id"] for ln in version.lines]
    ingredients = {
        i.id: i for i in session.scalars(select(Ingredient).where(Ingredient.id.in_(ids)))
    }
    lines: list[dict[str, Any]] = []
    ingredient_nutrients: list[dict[str, Any]] = []
    source_ids: list[str] = []
    for ln in version.lines:
        ing = ingredients.get(ln["ingredient_id"])
        source = ing.source if ing is not None else None
        restricted = source is not None and source.license_status == "restricted"
        lines.append(
            {
                "ingredient_id": ln["ingredient_id"],
                "name": ing.common_name if ing else "(unknown ingredient)",
                "percent": _s(ln["percent"]),
                "restricted": restricted,
            }
        )
        if ing is not None and ing.source_id and ing.source_id not in source_ids:
            source_ids.append(ing.source_id)
        if restricted:
            notes.append(
                f"Per-ingredient nutrient values for {ing.common_name if ing else ''} are "
                "excluded because their data source has a restricted licence; only "
                "mixture totals from the stored results are shown."
            )
        elif ing is not None:
            for n in sorted(ing.nutrients, key=lambda x: x.nutrient_key):
                if n.value is not None:
                    ingredient_nutrients.append(
                        {
                            "ingredient_id": ing.id,
                            "name": ing.common_name,
                            "key": n.nutrient_key,
                            "value": _s(n.value),
                            "unit": n.unit,
                        }
                    )

    audit_jobs: list[dict[str, Any]] = []
    model_ids: list[str] = []

    nutrition = None
    found = latest_completed(session, formulation.id, "nutrition", version.version)
    if found:
        job, res = found
        p = res.payload
        nutrition = {
            "job_id": job.id,
            "basis": p.get("basis"),
            "nutrients": p.get("nutrients", []),
            "amino_acids": p.get("amino_acids"),
        }
        audit_jobs.append(_job_audit(job))
    else:
        notes.append(f"Nutrition: {NOT_CALCULATED} for version {version.version}.")

    texture = None
    found = latest_completed(session, formulation.id, "texture_prediction", version.version)
    if found:
        job, res = found
        p = res.payload
        texture = {
            "job_id": job.id,
            "predictions": p.get("predictions", []),
            "warnings": p.get("warnings", []),
            "label": TEXTURE_LABEL,
        }
        audit_jobs.append(_job_audit(job))
        model_ids.extend(m for m in (job.model_ids or []) if m not in model_ids)
    else:
        notes.append(f"Texture predictions: {NOT_CALCULATED} for version {version.version}.")

    models = []
    if model_ids:
        for m in session.scalars(select(ModelRegistry).where(ModelRegistry.id.in_(model_ids))):
            models.append(
                {
                    "id": m.id,
                    "target": m.target,
                    "algorithm": m.algorithm,
                    "version": m.version,
                    "status": m.status,
                }
            )

    sources = []
    if source_ids:
        for s in session.scalars(select(DataSource).where(DataSource.id.in_(source_ids))):
            sources.append(
                {
                    "id": s.id,
                    "name": s.name,
                    "citation": s.citation,
                    "license_status": s.license_status,
                }
            )

    return {
        "formulation": {
            "id": formulation.id,
            "name": version.name or formulation.name,
            "description": formulation.description,
            "version": version.version,
            "content_hash": version.content_hash,
        },
        "lines": lines,
        "ingredient_nutrients": ingredient_nutrients,
        "nutrition": nutrition,
        "texture": texture,
        "sources": sources,
        "models": models,
        "notes": notes,
        "audit": {
            "jobs": audit_jobs,
            "exported_at": iso(utcnow()),
            "request_id": request_id,
        },
    }


# ----------------------------------------------------------------------------- CSV

CSV_HEADER = ["section", "key", "label", "value", "unit", "lower", "upper", "flag", "note"]


def _csv_rows(ctx: dict[str, Any]) -> list[list[str]]:
    rows: list[list[str]] = []

    def add(
        section: str,
        key: Any = "",
        label: Any = "",
        value: Any = "",
        unit: Any = "",
        lower: Any = "",
        upper: Any = "",
        flag: Any = "",
        note: Any = "",
    ) -> None:
        cells = (key, label, value, unit, lower, upper, flag, note)
        rows.append([section, *(_s(x) for x in cells)])

    f = ctx["formulation"]
    add("formulation", f["id"], f["name"], f["version"], note=f["description"] or "")
    for ln in ctx["lines"]:
        add("line", ln["ingredient_id"], ln["name"], ln["percent"], "%")
    for n in ctx["ingredient_nutrients"]:
        add(
            "ingredient_nutrient",
            n["key"],
            n["name"],
            n["value"],
            n["unit"],
            note=n["ingredient_id"],
        )
    nut = ctx["nutrition"]
    if nut is None:
        add("nutrient", note=NOT_CALCULATED)
    else:
        for n in nut["nutrients"]:
            rng = n.get("range") or [None, None]
            add(
                "nutrient",
                n["key"],
                n["key"],
                n.get("value"),
                n.get("unit"),
                rng[0],
                rng[1],
                n.get("flag"),
                n.get("reason") or "",
            )
        aa = nut.get("amino_acids") or {}
        for a in aa.get("per_g_protein_mg", []):
            add("amino_acid", a["key"], "mg per g protein", a.get("value"), "mg/g protein")
        for sc in aa.get("scores", []):
            add("amino_acid", sc["key"], "score", sc.get("score"), "")
        if aa:
            add(
                "amino_acid",
                "aas",
                AAS_LABEL,
                aa.get("score"),
                "",
                flag=aa.get("method"),
                note=f"limiting={_s(aa.get('limiting_amino_acid'))}; "
                f"complete={_s(aa.get('complete'))}",
            )
    tex = ctx["texture"]
    if tex is None:
        add("prediction", note=NOT_CALCULATED)
    else:
        for p in tex["predictions"]:
            iv = p.get("interval") or [None, None]
            add(
                "prediction",
                p.get("target"),
                TEXTURE_LABEL,
                p.get("value"),
                p.get("unit"),
                iv[0],
                iv[1],
                f"in_domain={_s(p.get('in_domain'))}",
                f"interval_level={_s(p.get('interval_level'))}",
            )
        for w in tex["warnings"]:
            add("prediction", "warning", "warning", note=w if isinstance(w, str) else w)
    for s in ctx["sources"]:
        add("source", s["id"], s["name"], s["license_status"], note=s["citation"] or "")
    for m in ctx["models"]:
        add("model", m["id"], m["target"], m["version"], flag=m["status"], note=m["algorithm"])
    for note in ctx["notes"]:
        add("note", note=note)
    a = ctx["audit"]
    for j in a["jobs"]:
        add(
            "audit",
            j["job_id"],
            j["type"],
            j["calc_version"],
            flag=_s(j["seed"]),
            lower=j["started_at"],
            upper=j["finished_at"],
            note=_s(j["data_versions"]),
        )
    add("audit", "exported_at", "export timestamp", a["exported_at"])
    add("audit", "request_id", "request id", a["request_id"])
    return rows


def render_csv(ctx: dict[str, Any]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(CSV_HEADER)
    writer.writerows(_csv_rows(ctx))
    return buf.getvalue()


# ----------------------------------------------------------------------------- PDF


def _span(pair: Any) -> str:
    return f"{pair[0]} - {pair[1]}" if pair else ""


def render_pdf(ctx: dict[str, Any]) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    styles = getSampleStyleSheet()
    body = styles["BodyText"]
    story: list[Any] = []

    def esc(x: Any) -> str:
        return _s(x).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    def table(header: list[str], data: list[list[Any]]) -> None:
        cells = [[Paragraph(f"<b>{esc(h)}</b>", body) for h in header]]
        cells += [[Paragraph(esc(c), body) for c in r] for r in data]
        t = Table(cells, repeatRows=1)
        t.setStyle(
            TableStyle(
                [
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                    ("BACKGROUND", (0, 0), (-1, 0), colors.whitesmoke),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]
            )
        )
        story.extend([t, Spacer(1, 10)])

    def heading(text: str) -> None:
        story.append(Paragraph(esc(text), styles["Heading2"]))

    f = ctx["formulation"]
    story.append(Paragraph(esc(f"{f['name']} (version {f['version']})"), styles["Title"]))
    story.append(Paragraph(esc(f"Formulation {f['id']}. {f['description'] or ''}"), body))
    heading("Formulation lines")
    table(
        ["Ingredient", "ID", "Percent"],
        [[x["name"], x["ingredient_id"], x["percent"]] for x in ctx["lines"]],
    )
    if ctx["ingredient_nutrients"]:
        heading("Ingredient nutrient values")
        table(
            ["Ingredient", "Nutrient", "Value", "Unit"],
            [[n["name"], n["key"], n["value"], n["unit"]] for n in ctx["ingredient_nutrients"]],
        )
    heading("Nutrition")
    nut = ctx["nutrition"]
    if nut is None:
        story.append(Paragraph(NOT_CALCULATED, body))
    else:
        story.append(Paragraph(esc(f"Basis: {nut['basis']}"), body))
        table(
            ["Nutrient", "Value", "Unit", "Range", "Flag / note"],
            [
                [
                    n["key"],
                    n.get("value"),
                    n.get("unit"),
                    _span(n.get("range")),
                    n.get("reason") or n.get("flag"),
                ]
                for n in nut["nutrients"]
            ],
        )
        aa = nut.get("amino_acids")
        if aa:
            story.append(Paragraph(esc(AAS_LABEL), styles["Heading3"]))
            story.append(
                Paragraph(
                    esc(
                        f"Score: {_s(aa.get('score'))}; limiting amino acid: "
                        f"{_s(aa.get('limiting_amino_acid'))}; complete: {_s(aa.get('complete'))}"
                    ),
                    body,
                )
            )
            scores = {s["key"]: s.get("score") for s in aa.get("scores", [])}
            table(
                ["Amino acid", "mg per g protein", "Score"],
                [
                    [
                        a["key"],
                        a.get("value"),
                        scores.get(a["key"], ""),
                    ]
                    for a in aa.get("per_g_protein_mg", [])
                ],
            )
    heading(f"Texture predictions ({TEXTURE_LABEL})")
    tex = ctx["texture"]
    if tex is None:
        story.append(Paragraph(NOT_CALCULATED, body))
    else:
        table(
            ["Target", "Value", "Unit", "Interval", "Level", "In domain"],
            [
                [
                    p.get("target"),
                    p.get("value"),
                    p.get("unit"),
                    _span(p.get("interval")),
                    p.get("interval_level"),
                    p.get("in_domain"),
                ]
                for p in tex["predictions"]
            ],
        )
        for w in tex["warnings"]:
            story.append(Paragraph(esc(f"Warning: {w}"), body))
    heading("Data sources")
    table(
        ["Source", "Citation", "Licence status"],
        [[s["name"], s["citation"], s["license_status"]] for s in ctx["sources"]],
    )
    heading("Model versions")
    table(
        ["Model", "Target", "Algorithm", "Version", "Status"],
        [[m["id"], m["target"], m["algorithm"], m["version"], m["status"]] for m in ctx["models"]],
    )
    if ctx["notes"]:
        heading("Notes")
        for n in ctx["notes"]:
            story.append(Paragraph(esc(n), body))
    heading("Audit trail")
    a = ctx["audit"]
    table(
        ["Job", "Type", "Calc version", "Seed", "Started", "Finished", "Data versions"],
        [
            [
                j["job_id"],
                j["type"],
                j["calc_version"],
                j["seed"],
                j["started_at"],
                j["finished_at"],
                j["data_versions"],
            ]
            for j in a["jobs"]
        ],
    )
    story.append(Paragraph(esc(f"Exported at {a['exported_at']}; request {a['request_id']}"), body))
    story.append(Paragraph(esc(f"Content hash {f['content_hash']}"), body))

    buf = io.BytesIO()
    SimpleDocTemplate(buf, pagesize=A4, title=f"{f['name']} v{f['version']}").build(story)
    return buf.getvalue()
