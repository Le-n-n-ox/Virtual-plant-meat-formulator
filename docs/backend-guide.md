# Virtual Plant-Meat Formulator: Backend Development Guide

Nov 13, 2026 · @Lennox Wanyela

The backend is the scientific authority of the product: it stores traceable ingredient data, calculates nutrition, predicts texture from measured experiments, searches for optimal formulations, and tells the frontend the truth about every job. This guide takes it from an empty repository to a prototype that the frontend (see the *Frontend Development Guide*) can run against, and it follows the *Virtual Plant-Meat Formulator / Technology Plan* (12 November 2026).

## 1. Overview and scope

**What the backend owns**

- Authentication, roles and an audit trail.
- The ingredient catalogue with provenance, units, moisture basis and licence status.
- Formulations, immutable saved versions and validation.
- Deterministic nutrition and amino-acid calculation.
- Texture/rheology prediction models trained only on measured experiments, with uncertainty.
- Constrained optimization and candidate generation.
- Jobs, worker execution and the Server-Sent Events (SSE) stream.
- Model governance (MLflow, DVC) and exports.

**What the backend never does**

- It never fabricates a scientific value. If data or an approved model is missing, it returns a typed error, not a guess.
- It never reports progress it cannot measure: a percentage is sent only when the worker has a real completed/total count.
- It never labels a result DIAAS without amino-acid-specific ileal digestibility data.
- It never trains on synthetic data presented as laboratory measurements.
- It does not simulate molecules or extrusion mechanics in the first release.

**Design principles**

1. Separate deterministic calculation (nutrition) from learned prediction (texture) in code, endpoints and result payloads.
2. Everything a result depends on is recorded: formulation version, ingredient data versions, calculation version, model version, parameters, random seed.
3. Saved formulation versions are immutable; jobs always run against a specific saved version.
4. Start lean: one API service, one worker type, PostgreSQL and Redis. Add PyTorch and BoTorch only when data supports them.

**Decisions made here for the frontend's open points**

The frontend guide left four items for this document. They are settled as follows and detailed in sections 6, 7 and 14.

| Open point | Decision |
| --- | --- |
| SSE event names | `stage.updated`, `progress.updated`, `warning.raised`, `candidate.ready`, `result.ready`, `job.completed`, `job.failed`, `job.cancelled` |
| SSE authentication | Short-lived, single-job stream token from `POST /api/jobs/{job_id}/stream-token`, passed as `?token=` (browser `EventSource` cannot send headers) |
| Optimization `params` | Fixed JSON schema in section 6 (objectives, constraints, seed, candidate count) |
| Export formats | `pdf` and `csv` |

## 2. Tech stack and project structure

The core stack is the one in the technology plan. Pin exact versions in the lockfile at kickoff, and recheck compatibility before upgrading any scientific library.

| Area | Choice | Role |
| --- | --- | --- |
| Language | Python (current stable release) | All services |
| API | FastAPI | REST endpoints, validation, SSE |
| Validation | Pydantic v2 | Request/response schemas, units, percentage totals |
| Database | PostgreSQL (Supabase as the managed option) | Relational data and audit trail |
| ORM and migrations | SQLAlchemy 2.x + Alembic (recommended addition) | Typed models, versioned migrations |
| Numerical | NumPy, Pandas, SciPy | Weighted mixtures, data prep, constrained optimization |
| Machine learning | scikit-learn | Random Forest, Gradient Boosting, Gaussian Process baselines |
| Background work | Celery + Redis | Long jobs; Redis also carries the event stream |
| Model tracking | MLflow | Runs, metrics, model artifacts |
| Data versioning | DVC | Datasets and pipelines |
| Auth | Supabase Auth (JWT verified by the API) | Users and sessions; see section 5 |
| Exports | WeasyPrint or ReportLab for PDF; stdlib `csv` | Formulation summary |
| Quality | pytest, httpx, Ruff, mypy, pre-commit | Tests, lint, typing |
| Packaging | `uv` (or Poetry) with lockfile | Reproducible environments |
| Containers | Docker + Docker Compose; GitHub Actions | Local services and CI |

PyTorch and BoTorch are deliberately absent until experimental evidence supports them (phase B7, optional).

**Recommended folder structure**

```text
backend/
  app/
    main.py                  # FastAPI app factory, routers, middleware
    config.py                # settings from environment (pydantic-settings)
    api/
      deps.py                # auth, db session, role checks
      routers/
        auth.py ingredients.py formulations.py jobs.py
        results.py candidates.py models.py exports.py system.py
      errors.py              # error codes and exception handlers
      sse.py                 # SSE response helpers
    domain/                  # pure Python, no web or DB imports
      units.py moisture.py   # unit and moisture-basis conversions
      validation.py          # formulation rules
      nutrition.py           # weighted mixture calculation
      amino_acids.py         # scoring against a reference pattern
      optimization/          # constraints, objectives, solver wrappers
      texture/               # features, models, applicability domain
    db/
      models/                # SQLAlchemy models
      session.py
      migrations/            # Alembic
      repositories/          # query functions per aggregate
    jobs/
      runner.py              # InlineRunner and CeleryRunner
      events.py              # event schema and EventBus interface
      bus_memory.py bus_redis.py
      tasks/                 # nutrition.py texture.py optimization.py
    ingestion/               # KFCT, USDA, lab-data importers
    mlops/                   # training, evaluation, registry helpers
    schemas/                 # Pydantic API models (one file per resource)
  tests/
    unit/ integration/ contract/ fixtures/
  data/                      # DVC-tracked (never raw secrets or licensed data in git)
  docker/                    # Dockerfiles, compose files
  pyproject.toml
  .env.example
```

The `domain/` package must not import FastAPI, SQLAlchemy or Celery. That keeps every scientific calculation testable in isolation and reusable from workers, scripts and notebooks.

**Environment variables**

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Celery broker, event stream |
| `JOB_RUNNER` | `inline` (development, fast jobs) or `celery` |
| `EVENT_BUS` | `memory` (dev, tests) or `redis` |
| `SUPABASE_URL`, `SUPABASE_JWT_AUDIENCE` | JWT verification settings; keys are fetched from the project's published signing keys |
| `STREAM_TOKEN_SECRET`, `STREAM_TOKEN_TTL_SECONDS` | Signing key and lifetime (default 60) for stream tokens |
| `CORS_ALLOWED_ORIGINS` | Frontend origins, comma separated |
| `MLFLOW_TRACKING_URI` | Model tracking server |
| `ARTIFACT_STORE_URL` | Object storage for GLB, models and exports |
| `LOG_LEVEL`, `SENTRY_DSN` (optional) | Operations |

Secrets are never committed; only `.env.example` with placeholder values lives in git.

## 3. Architecture and request-to-job flow

One FastAPI service handles commands and reads; workers run calculations and publish events; Redis carries the event stream; PostgreSQL is the system of record. Components:

| Component | Responsibility | Talks to |
| --- | --- | --- |
| Browser (Next.js) | Sends REST commands, opens SSE stream | API |
| API (FastAPI) | Auth, validation, job creation, SSE relay, reads | PostgreSQL, Redis, worker |
| Job runner | Executes a job: `InlineRunner` (thread in the API process) or `CeleryRunner` (separate workers) | Domain code, PostgreSQL, event bus |
| Event bus | Delivers job events to SSE streams: `MemoryBus` (dev, tests) or `RedisBus` (Redis Streams) | Runner, API |
| PostgreSQL | Ingredients, formulations, jobs, events, results, experiments, registry | API, workers |
| MLflow + DVC | Model runs, artifacts, dataset versions | Training scripts, workers (load approved models) |
| Object storage | Models, exports, GLB asset copies | API, workers |

**Life of a job**

1. The client saves a formulation (`PUT /api/formulations/{id}`), which creates an immutable version.
2. The client calls `POST /api/formulations/{id}/jobs` with a job type and parameters. The API re-validates the version, creates a `jobs` row with status `queued`, and returns `202` with `job_id`.
3. The runner picks the job up and sets it to `running`. The worker emits events (`stage.updated`, `progress.updated`, `warning.raised`, `candidate.ready`, `result.ready`) through the event bus; each event is also written to `job_events`.
4. The client requests a stream token, then opens `GET /api/jobs/{job_id}/events?token=...`. The API replays stored events after `Last-Event-ID` (if any) and then relays live ones.
5. On success, the worker stores the result and emits `job.completed`. On error it emits `job.failed` with a code; on a cancel request it stops at the next safe point and emits `job.cancelled`. The stream closes after the terminal event.
6. If the client reconnects or misses events, `GET /api/jobs/{job_id}` returns the authoritative status and the stream can be replayed from the stored events.

**Which runner for which job**

| Job type | Typical duration | Runner in prototype | Reason |
| --- | --- | --- | --- |
| `nutrition` | Milliseconds to seconds | `InlineRunner` | Pure arithmetic; no queue needed |
| `texture_prediction` | Seconds | `InlineRunner`, move to Celery if models grow | Loads an approved model and predicts |
| `optimization` | Seconds to minutes | `CeleryRunner` from phase B5 | Needs isolation, cancellation and long runs |
| `model_training` (admin) | Minutes or longer | Celery or a command-line script | Back-office only |

Both runners use the same code path, the same event schema and the same `jobs` table, so moving a job type to Celery is a configuration change, not a rewrite. The plan's rule applies: add Celery and Redis when jobs are long enough to need a worker queue.

**Job state machine**

`queued` → `running` → `completed` | `failed` | `cancelled`. A cancel request sets `cancel_requested_at` but leaves the status `running` until the worker confirms; only terminal statuses are final and no event may follow one.

## 4. Database schema

PostgreSQL with Alembic migrations. Public IDs are prefixed ULIDs (`ing_`, `frm_`, `job_`, `cand_`, `mdl_`) so they sort by time and are readable in logs; the frontend treats them as opaque strings. Percentages and nutrient values use `NUMERIC`, never floating point columns, so totals reconcile exactly. All tables have `created_at`; mutable ones also `updated_at`.

**Reference and ingredient data**

| Table | Key columns | Notes |
| --- | --- | --- |
| `data_sources` | id, name, citation, url, version, retrieved\_at, license\_status, license\_notes | One row per dataset or paper (KFCT 2018, USDA FDC, lab study) |
| `nutrient_definitions` | key, name, unit, kind (proximate, mineral, vitamin, amino\_acid), infoods\_tagname | Canonical nutrient list; FAO/INFOODS tagnames for matching |
| `ingredients` | id, scientific\_name, common\_name, variety, form, origin, moisture\_basis, moisture\_percent, edible\_portion\_percent, source\_id, source\_row\_ref, method, analysed\_on, quality\_flag, status (active, draft, retired), dataset\_version | Raw, cooked, soaked, fermented, roasted and flour forms are separate rows |
| `ingredient_nutrients` | ingredient\_id, nutrient\_key, value (nullable), unit, flag (analytical, estimated), range\_low, range\_high, per\_basis (e.g. per 100 g as-is) | `NULL` value means not reported, never zero |
| `ingredient_functional_properties` | ingredient\_id, property, value, unit, method, source\_id | Measured inputs to texture models (e.g. water-holding capacity) |
| `ingredient_prices` | ingredient\_id, price\_per\_kg, currency, as\_of, source | Used for cost objectives |
| `amino_acid_reference_patterns` | id, name, version, citation, values (JSON, mg per g protein) | Versioned scoring pattern, stored as data not code |

**Users and formulations**

| Table | Key columns | Notes |
| --- | --- | --- |
| `profiles` | user\_id (from auth), display\_name, role (viewer, scientist, curator, admin) | One row per auth user |
| `formulations` | id, owner\_id, name, description, current\_version, archived, updated\_at | Mutable header only |
| `formulation_versions` | id, formulation\_id, version, lines (JSON: ingredient\_id, percent), targets (JSON), note, content\_hash, created\_by | **Immutable**; unique on (formulation\_id, version) |

**Jobs and results**

| Table | Key columns | Notes |
| --- | --- | --- |
| `jobs` | id, formulation\_id, formulation\_version, type, status, params (JSON), stage, stage\_label, progress\_percent, error\_code, error\_message, cancel\_requested\_at, created\_by, created\_at, started\_at, finished\_at, data\_versions (JSON), model\_ids (JSON), calc\_version, seed | Audit fields make every run reproducible |
| `job_events` | job\_id, seq, event, payload (JSON), created\_at | Append-only; `seq` is monotonic per job; used for replay |
| `job_results` | job\_id, kind (nutrition, texture, optimization), payload (JSON) | Result payloads in section 7 |
| `candidates` | id, job\_id, formulation\_id, rank, lines (JSON), metrics (JSON), predictions (JSON), model\_ids (JSON), cost, pareto (bool), promoted\_formulation\_id | One row per optimizer candidate |

**Experiments and models**

| Table | Key columns | Notes |
| --- | --- | --- |
| `experiments` | id, name, lab, operator, run\_on, notes | A batch of physical tests |
| `samples` | id, experiment\_id, lines (JSON), process (JSON: moisture, temperature profile, screw speed, feed rate, cooling), ingredient\_dataset\_version | One physical sample and how it was made |
| `measurements` | id, sample\_id, property (hardness, chewiness, G′, G″, and so on), value, unit, method, instrument, replicates, sd, tested\_on | Only physical measurements; a `source_type` of `measured` is required for training |
| `model_registry` | id, target, algorithm, version, mlflow\_run\_id, status (candidate, approved, retired), training\_set\_size, holdout\_metrics (JSON), feature\_schema (JSON), applicability\_domain (JSON), limitations, dataset\_version, approved\_by, approved\_at | Only `approved` models serve predictions |
| `audit_log` | id, actor\_id, action, entity, entity\_id, payload (JSON), created\_at | Writes of data, approvals, exports, deletes |

**Rules enforced in the database and service layer**

- `formulation_versions` and `job_events` are insert-only; updates and deletes are blocked by a trigger or by permissions.
- A `formulation_versions.lines` array has unique ingredient IDs and a total of exactly 100 within a tolerance of 0.01 percentage points.
- Retired ingredients stay readable (old versions refer to them) but cannot be added to new versions.
- Indexes: ingredients (crop, form, status, full-text on names), jobs (formulation\_id, status, created\_at), job\_events (job\_id, seq), candidates (job\_id).

## 5. API conventions, errors, auth and roles

**Conventions**

- Base path `/api`; JSON bodies; UTC ISO 8601 timestamps; numbers in the units named in each field (nutrient values per 100 g as formulated unless stated).
- Lists are paged: `?page=1&page_size=25` (max 100), response `{ "items": [], "total": 0, "page": 1, "page_size": 25 }`.
- `POST` endpoints that start jobs accept an `Idempotency-Key` header; repeating the same key returns the original job.
- Long operations return `202 Accepted` and a job; nothing scientific is computed inside a plain request except validation.
- OpenAPI is generated by FastAPI at `/openapi.json`. The backend publishes it as a CI artifact at the end of every pull request; the frontend can generate types from it and the contract tests compare against it.
- Every response carries `X-Request-Id`; logs and error bodies include it.

**Error format**

```json
{ "error": { "code": "validation_failed", "message": "Percentages must total 100.", "details": { "total_percent": 98.5 }, "request_id": "req_01J..." } }
```

| HTTP | `code` | When |
| --- | --- | --- |
| 400 | `bad_request` | Malformed JSON or parameters |
| 401 | `unauthenticated` | Missing, expired or invalid token |
| 403 | `forbidden` | Role does not allow the action |
| 404 | `not_found` | Unknown ID or not visible to the user |
| 409 | `version_conflict` | `PUT` sent with a stale `base_version` |
| 409 | `cancel_not_supported` | Job type cannot be cancelled |
| 409 | `job_already_finished` | Cancel on a terminal job |
| 409 | `job_limit_reached` | User already has the maximum number of active jobs |
| 413 | `payload_too_large` | Import or body over the limit |
| 422 | `validation_failed` | Formulation or parameter rules broken; `details.issues` lists them |
| 422 | `missing_ingredient_data` | A required nutrient is missing and the job type cannot proceed |
| 422 | `model_unavailable` | No approved model exists for a requested target |
| 422 | `infeasible` | Optimization constraints cannot be satisfied |
| 429 | `rate_limited` | Too many requests |
| 500 | `internal_error` | Unexpected failure; request ID returned |
| 503 | `dependency_unavailable` | Database, Redis or model store unreachable |
| 409 | result\_not\_ready | Result requested before the job completed |

Validation errors use the frontend's issue shape: `details.issues = [{ "ingredient_id": "ing_...", "code": "percent_out_of_range", "message": "..." }]`, so the editor and 3D scene can highlight the right ingredient.

**Authentication**

- Users sign in with Supabase Auth. The frontend sends the access token as `Authorization: Bearer <jwt>`; FastAPI verifies the signature, expiry and audience, then loads the user's `profiles` row.
- If the team prefers not to use Supabase Auth, the same interface works with any OIDC provider; only `api/deps.py` changes.
- `POST /api/auth/login`, `POST /api/auth/logout` and `GET /api/auth/me` from the frontend guide exist: login and logout are thin wrappers (or are replaced by the Supabase client in the browser, which is the recommended route); `me` returns the profile and role.
- The browser's `EventSource` cannot send headers, so the stream uses a stream token (section 7).
- The API talks to the database with a server-side credential only; no table is exposed directly to the browser.

**Roles**

| Action | viewer | scientist | curator | admin |
| --- | --- | --- | --- | --- |
| Read ingredients, models, methodology | Yes | Yes | Yes | Yes |
| Create and edit own formulations | No | Yes | Yes | Yes |
| Start jobs | No | Yes | Yes | Yes |
| Export summaries | No | Yes | Yes | Yes |
| Import and edit ingredient data, experiments | No | No | Yes | Yes |
| Train, approve and retire models | No | No | No | Yes |
| Manage users and roles | No | No | No | Yes |

A user sees only their own formulations and jobs unless a later sharing feature is added (out of scope for the prototype).

## 6. Endpoint specification

Every endpoint the frontend guide lists is specified here, plus a few additions the frontend pages need (marked **New**). Roles are the minimum required. Response bodies use the TypeScript contracts in the frontend guide, with the additions noted in section 14.

### 6.1 System and auth

| Method and path | Role | Request | Response |
| --- | --- | --- | --- |
| `GET /api/health` | none | n/a | `200 { "status": "ok", "version": "<git sha>" }`; `503` if database or Redis unreachable |
| `GET /api/auth/me` | any | n/a | `200 { "user_id", "email", "display_name", "role" }` |
| `POST /api/auth/login` | none | `{ "email", "password" }` | `200 { "access_token", "expires_in" }` (omit if the browser uses the Supabase client) |
| `POST /api/auth/logout` | any | n/a | `204` |

### 6.2 Ingredients and reference data

| Method and path | Role | Notes |
| --- | --- | --- |
| `GET /api/ingredients` | viewer | Query: `q`, `crop`, `form`, `source_id`, `flag` (analytical or estimated), `status` (default active), `sort`, `page`, `page_size`. Item: `id`, `common_name`, `scientific_name`, `variety`, `form`, `moisture_basis`, `source: { id, name }`, `quality_flag`, `protein_g_per_100g` (or null), `has_amino_acids` |
| `GET /api/ingredients/{id}` | viewer | Full `Ingredient` (nutrients, amino acids, source, method, date, licence status, ranges) plus `functional_properties[]`, `price` and `dataset_version`. Ingredients whose licence status forbids display return `403 forbidden` with an explanatory message |
| `GET /api/ingredients/facets` (**New**) | viewer | `{ crops[], forms[], sources[] }` with counts, used to build filters on page 3 |
| `GET /api/nutrients` (**New**) | viewer | Nutrient definitions (key, name, unit, kind) used to label tables |
| `GET /api/amino-acid-patterns` (**New**) | viewer | Available scoring patterns with the default marked |

### 6.3 Formulations

| Method and path | Role | Request | Response |
| --- | --- | --- | --- |
| `GET /api/formulations` | scientist | `q`, `archived`, paging | Items: `id`, `name`, `current_version`, `last_job: { id, type, status, finished_at } or null`, `updated_at` |
| `POST /api/formulations` | scientist | `{ "name", "description?", "template_id?" }` | `201` with `Formulation`; `current_version` is `0` and `lines` empty until the first save |
| `GET /api/formulations/{id}` | scientist | optional `?version=n` | `Formulation` (current or requested version) |
| `PUT /api/formulations/{id}` | scientist | `{ "base_version", "name?", "description?", "lines", "targets?", "note?" }` | `200` with the new `Formulation` (version incremented). `409 version_conflict` if `base_version` is not the current version; `422 validation_failed` if the lines are invalid |
| `PATCH /api/formulations/{id}` (**New**) | scientist | `{ "name?", "description?", "archived?" }` | `200`; changes the header only, creates no version |
| `POST /api/formulations/{id}/duplicate` (**New**) | scientist | `{ "name?" }` | `201` new formulation with the current version copied as version 1 |
| `POST /api/formulations/{id}/validate` | scientist | `{ "lines", "targets?" }` | Always `200` with `ValidationResult`; nothing is saved |
| `GET /api/formulations/{id}/versions` | scientist | paging | Items: `version`, `created_at`, `created_by` (display name), `note`, `content_hash` |
| `GET /api/formulations/{id}/versions/{version}` | scientist | n/a | `Formulation` as it was in that version |
| `POST /api/formulations/{id}/versions/{version}/restore` (**New**) | scientist | `{ "base_version" }` | `200`; creates a new version with the old lines, never alters history |

**Validation rules** (identical for `/validate`, `PUT` and job start; implemented once in `domain/validation.py`)

| Code | Rule |
| --- | --- |
| `percent_out_of_range` | Each line is greater than 0 and at most 100 |
| `total_not_100` | Sum of lines equals 100 within 0.01 percentage points (`Decimal` arithmetic) |
| `duplicate_ingredient` | An ingredient appears once per version |
| `unknown_ingredient` | ID does not exist |
| `ingredient_retired` | Retired ingredient added to a new version |
| `bound_violation` | A target or bound in `targets` is contradictory (for example minimum above maximum) |
| `unit_or_basis_mismatch` | Ingredient moisture basis cannot be reconciled with the formulation basis |

**Example: validate**

```json
POST /api/formulations/frm_01J.../validate
{ "lines": [ { "ingredient_id": "ing_01J...", "percent": 60 }, { "ingredient_id": "ing_01K...", "percent": 38.5 } ] }

200
{ "valid": false, "total_percent": 98.5,
  "issues": [ { "code": "total_not_100", "message": "Percentages total 98.5, expected 100." } ] }
```

Only valid versions are saved. Drafts being edited stay in the browser; the editor disables Save while `valid` is false.

### 6.4 Jobs

| Method and path | Role | Request | Response |
| --- | --- | --- | --- |
| `POST /api/formulations/{id}/jobs` | scientist | `{ "type", "version?", "params?" }` (below) | `202` with `{ "job_id", "type", "status": "queued", "formulation_id", "formulation_version", "created_at" }`. `422` if the version is invalid or required data is missing; `409 job_limit_reached` |
| `GET /api/jobs` | scientist | `status` (comma list), `type`, `formulation_id`, paging | Items: `id`, `type`, `formulation: { id, name, version }`, `status`, `stage_label`, `created_at`, `started_at`, `finished_at`, `duration_ms` |
| `GET /api/jobs/{job_id}` | scientist | n/a | Current status (below); the frontend calls it on every reconnect |
| `POST /api/jobs/{job_id}/stream-token` (**New**) | scientist | n/a | `200 { "token", "expires_at" }`; valid for this job only, default 60 seconds |
| `GET /api/jobs/{job_id}/events` | scientist | `?token=`, header `Last-Event-ID` optional | SSE stream (section 7) |
| `GET /api/jobs/{job_id}/result` | scientist | n/a | Result payload for the job type (section 7); `409 result_not_ready` while not completed |
| `POST /api/jobs/{job_id}/cancel` | scientist | n/a | `202 { "accepted": true }`; `409 cancel_not_supported` for `nutrition` and `texture_prediction`; `409 job_already_finished` |

**Job start parameters by type**

```json
// nutrition
{ "type": "nutrition", "params": { "amino_acid_pattern_id": "aap_..." } }

// texture_prediction
{ "type": "texture_prediction",
  "params": {
    "process": {
      "moisture_percent": 60,
      "temperature_profile_c": [ { "zone": 1, "temp": 80 }, { "zone": 2, "temp": 140 } ],
      "screw_speed_rpm": 250,
      "feed_rate_kg_h": 12,
      "cooling": { "type": "die", "temp_c": 40 }
    },
    "targets": [ "hardness", "chewiness", "water_holding_capacity" ] } }

// optimization
{ "type": "optimization",
  "params": {
    "objectives": [
      { "target": "protein_g_per_100g", "direction": "maximize" },
      { "target": "hardness", "direction": "target", "value": 45, "unit": "N" },
      { "target": "cost_per_kg", "direction": "minimize" } ],
    "constraints": {
      "ingredient_bounds": [ { "ingredient_id": "ing_...", "min_percent": 5, "max_percent": 40 } ],
      "excluded_ingredient_ids": [],
      "nutrient_minimums": [ { "key": "lysine", "min": 50, "unit": "mg_per_g_protein" } ],
      "nutrient_maximums": [],
      "cost_ceiling": { "value": 450, "currency": "KES", "per": "kg" } },
    "process": { "moisture_percent": 60, "screw_speed_rpm": 250 },
    "n_candidates": 5,
    "seed": 42 } }
```

Rules: `version` defaults to the current saved version; the job is pinned to it. `texture_prediction` requires the process block because process conditions are model inputs; the API returns `422 validation_failed` naming any missing field, and `422 model_unavailable` when no approved model exists for a requested target. In optimization, texture objectives are allowed only for targets that have an approved model; nutrient and cost objectives need no model. `seed` makes a run reproducible; if omitted the API generates one and stores it.

**`GET /api/jobs/{job_id}` response**

```json
{ "id": "job_01J...", "type": "optimization", "status": "running",
  "stage": "searching", "stage_label": "Searching formulations",
  "progress_percent": 40, "message": "Start 4 of 10",
  "cancel_requested": false,
  "formulation_id": "frm_01J...", "formulation_version": 3,
  "error": null, "candidate_ids": ["cand_01J..."], "result_available": false,
  "last_event_seq": 14,
  "created_at": "2026-11-13T09:00:00Z", "started_at": "2026-11-13T09:00:01Z", "finished_at": null,
  "data_versions": { "ingredients": "2026.11.1" }, "model_ids": [], "calc_version": "a1b2c3d", "seed": 42 }
```

### 6.5 Results, candidates, comparison, export, models

| Method and path | Role | Response |
| --- | --- | --- |
| `GET /api/formulations/{id}/nutrition` | scientist | `?version=` optional. Latest completed nutrition result for that version (payload in section 7). `404 not_found` with `details.hint = "start a nutrition job"` if none exists |
| `GET /api/formulations/{id}/candidates` | scientist | `?job_id=`, `?pareto=true`, paging. Items are `Candidate` objects (section 7) |
| `GET /api/candidates/{candidate_id}` | scientist | One `Candidate` with metrics, predictions, model metadata, scene hints |
| `POST /api/candidates/{candidate_id}/promote` (**New**) | scientist | `{ "name?" }` creates a new formulation with the candidate's lines as version 1 and returns it with `201` |
| `GET /api/compare?ids=a,b` | scientist | `{ "items": [Candidate, Candidate], "differences": [ { "metric", "unit", "a", "b", "delta" } ] }`. Exactly two candidate IDs; comparison against a reference product is out of scope for the prototype |
| `GET /api/formulations/{id}/export?format=pdf\|csv` | scientist | File download. Contents: formulation lines, nutrition, texture predictions with intervals, data sources, model versions, audit trail (inputs, data versions, timestamps). Restricted-licence data is excluded or summarised |
| `GET /api/models` | viewer | `?target=`, `?status=` (default approved). Items: `ModelMeta` plus `status`, `dataset_version`, `approved_at` |
| `GET /api/models/{id}` | viewer | Adds `limitations`, `feature_schema`, `applicability_domain`, holdout metrics |

### 6.6 Back-office endpoints (not used by the frontend prototype)

| Method and path | Role | Purpose |
| --- | --- | --- |
| `POST /api/admin/ingredients`, `PUT /api/admin/ingredients/{id}` | curator | Create or edit an ingredient with provenance fields; edits create a new `dataset_version` |
| `POST /api/admin/imports/ingredients` | curator | Upload a CSV; returns a validation report (row errors, unit problems, duplicates); nothing is written until `POST .../imports/{import_id}/commit` |
| `POST /api/admin/experiments`, `POST /api/admin/experiments/{id}/samples`, `POST /api/admin/samples/{id}/measurements` | curator | Record physical experiments and measurements |
| `POST /api/admin/models/train` | admin | Starts a `model_training` job for a target on a chosen dataset version |
| `POST /api/admin/models/{id}/approve`, `POST /api/admin/models/{id}/retire` | admin | Model lifecycle (section 10) |
| `GET /api/admin/audit-log` | admin | Filterable audit trail |

Until these endpoints and a simple admin page exist, the same operations run as documented command-line scripts in `app/ingestion/` and `app/mlops/`.

## 7. Jobs, events and Server-Sent Events

**Wire format**

Each SSE message uses the event name, a stable ID and the `JobEvent` JSON as data:

```text
id: 1731488100000-0
event: stage.updated
data: {"job_id":"job_01J...","seq":3,"event":"stage.updated","status":"running","stage":"texture_prediction","stage_label":"Predicting texture","progress_percent":null,"message":"Evaluating the selected formulation","candidate_id":null,"timestamp":"2026-11-13T09:15:00Z"}

: heartbeat
```

The `data` object is the frontend's `JobEvent` contract plus additive fields the frontend may ignore: `seq` (monotonic per job), `completed` and `total` (integers, present only when `progress_percent` is a number), and `details` (object, for warnings and errors).

**Event types**

| Event | Emitted when | Required fields |
| --- | --- | --- |
| `stage.updated` | The worker enters a new named stage | `stage`, `stage_label`, `progress_percent` (null unless measurable) |
| `progress.updated` | A measurable count advances | `progress_percent`, `completed`, `total` |
| `warning.raised` | A non-fatal issue (extrapolation, missing optional data, relaxed constraint) | `message`, `details.code`, optional `details.ingredient_id` |
| `candidate.ready` | The optimizer stored a candidate | `candidate_id` |
| `result.ready` | The job's result is stored and readable | none beyond envelope |
| `job.completed` | Terminal success | `status: completed` |
| `job.failed` | Terminal failure | `status: failed`, `details.code`, `message` |
| `job.cancelled` | Terminal cancellation | `status: cancelled` |

**Integrity rules (backend side of the plan's progress rules)**

1. `progress_percent` is `null` unless the worker holds a real `completed` and `total`; it is computed as `100 × completed / total`, rounded down, and never decreases within a stage.
2. Events are written to `job_events` before being published, so replay never contains an event the database lacks.
3. `seq` is gapless per job. Terminal events are the last event; the API refuses to append any event after one.
4. Timestamps come from the worker clock in UTC; the API adds none.
5. The API never generates a synthetic event on a timer. The only non-job traffic is the `: heartbeat` comment line every 15 seconds.

**Stages by job type**

| Job type | Stages in order | Progress measurable? |
| --- | --- | --- |
| `nutrition` | `validating`, `loading_ingredients`, `calculating`, `scoring_amino_acids`, `storing` | No; stages only |
| `texture_prediction` | `validating`, `building_features`, `checking_domain`, `predicting`, `storing` | No; stages only |
| `optimization` | `validating`, `preparing_constraints`, `searching` (numeric: starts completed of total), `ranking`, `storing` | Only in `searching`, when total starts is fixed |
| `model_training` | `loading_dataset`, `cross_validating`, `fitting`, `evaluating`, `registering` | Cross-validation folds only |

**Streaming implementation**

- **Endpoint:** `GET /api/jobs/{job_id}/events?token=...` with `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no` and `Connection: keep-alive`. Use FastAPI's built-in SSE support or `sse-starlette`; confirm which at implementation and pin the version.
- **Stream token:** an HMAC-signed value containing `job_id`, `user_id` and expiry (default 60 seconds), single use per connection attempt. It is checked on connect; once the stream is open it stays open. The client requests a fresh token for every reconnect.
- **Replay:** on connect the API reads `Last-Event-ID` (or `?after_seq=`), sends stored events after it from `job_events`, then subscribes to live events. If the job is already terminal it sends the remaining events and closes.
- **Redis bus:** each job has a Redis Stream `job:{job_id}:events`; workers `XADD` after the database write; the API `XREAD`s with a block timeout. Streams expire 24 hours after the terminal event; PostgreSQL stays the permanent record.
- **Memory bus:** same interface backed by in-process queues for development and tests.
- **Disconnects:** a closed client does not affect the job. The API stops reading and frees the connection.
- **Limits:** at most 5 concurrent streams per user and 1 per job per browser tab; extra attempts get `429`.
- **Proxy:** the reverse proxy must not buffer or compress `text/event-stream`, and its read timeout must exceed the heartbeat interval.

**Cancellation**

`POST .../cancel` sets `cancel_requested_at` and, for Celery jobs, flags the task. The optimizer checks the flag between starts and the training job between folds; at the next check it stops, stores nothing partial as a final result (candidates already emitted stay readable and are marked as from a cancelled job) and emits `job.cancelled`. Jobs that cannot be interrupted cleanly return `409 cancel_not_supported`.

**Result payloads (`GET /api/jobs/{job_id}/result`)**

Nutrition (`kind: nutrition`):

```json
{ "basis": "per_100g_as_formulated",
  "nutrients": [ { "key": "protein", "value": 21.4, "unit": "g", "flag": "calculated",
                   "range": [19.9, 22.8], "contains_estimated": false, "missing_ingredient_ids": [] },
                 { "key": "vitamin_b12", "value": null, "unit": "ug", "flag": "calculated",
                   "reason": "missing_data", "missing_ingredient_ids": ["ing_01K..."] } ],
  "amino_acids": { "per_g_protein_mg": [ { "key": "lysine", "value": 48.2 } ],
                   "reference_pattern": { "id": "aap_...", "name": "...", "version": "..." },
                   "scores": [ { "key": "lysine", "score": 0.84 } ],
                   "limiting_amino_acid": "lysine", "score": 0.84, "method": "AAS", "complete": true, "missing": [] },
  "calc_version": "a1b2c3d", "data_versions": { "ingredients": "2026.11.1" } }
```

Texture (`kind: texture`):

```json
{ "predictions": [ { "target": "hardness", "value": 42.1, "unit": "N", "interval": [35.0, 49.3], "interval_level": 0.9,
                    "in_domain": true, "model": { "id": "mdl_...", "target": "hardness", "algorithm": "gaussian_process",
                    "version": "3", "training_set_size": 64, "holdout_metric": { "name": "rmse", "value": 4.1 } } } ],
  "warnings": [], "process": { } }
```

Optimization (`kind: optimization`) lists candidate IDs and the search summary; each candidate:

```json
{ "id": "cand_01J...", "job_id": "job_01J...", "formulation_id": "frm_01J...", "rank": 1, "pareto": true,
  "lines": [ { "ingredient_id": "ing_...", "percent": 41.5 } ],
  "metrics": { "protein_g_per_100g": 22.3, "limiting_amino_acid": "lysine", "amino_acid_score": 0.86, "cost_per_kg": { "value": 410, "currency": "KES" } },
  "predictions": [ ],
  "model_ids": [ "mdl_..." ],
  "scene": { "visual_basis": "illustrative", "variables": [ { "key": "anisotropy", "derived_from_model": "mdl_...", "validated": false } ] } }
```

`scene.visual_basis` is `illustrative` unless a calibrated model validated against physical measurements produced the variable; the frontend uses it to decide whether a cutaway or fibre layer may be offered and how it is labelled.

## 8. Scientific services

Three services, kept separate in code and in payloads: a deterministic nutrition engine, learned texture models, and an optimizer that uses both. All live in `app/domain/` and are callable without the web layer.

### 8.1 Nutrition engine (deterministic)

For ingredient i with percentage p\_i of formulation mass and nutrient concentration c\_i,n on the same mass basis, the mixture value for nutrient n is a weighted sum:

```latex
C_n = \sum_i \frac{p_i}{100}\, c_{i,n}
```

Rules that make the sum valid:

- **Basis:** all values are converted to *per 100 g as formulated* before summing. Dry-basis values are converted with the ingredient's `moisture_percent` (c\_as-is = c\_dry × (1 − moisture/100)). If a basis cannot be reconciled, the job fails with `validation_failed` and `unit_or_basis_mismatch`; it never guesses.
- **Formulation lines refer to the ingredient as used** (its stated form: raw, cooked, soaked, fermented, roasted, flour). Water and oil added to the formulation are catalogue ingredients with complete nutrient rows, so their zeros are known values, not missing data.
- **Units:** converted to canonical units through `domain/units.py` (g, mg, µg); incompatible units raise an error.
- **Missing data:** if any ingredient with p\_i > 0 has no value for nutrient n, the result is `null` with `reason: missing_data` and the ingredient IDs. A partial sum is never presented as the total.
- **Range:** when every contributing ingredient has `range_low` and `range_high`, the same sum over the bounds gives the result range; otherwise no range is returned.
- **Flags:** `contains_estimated` is true if any contributing value is flagged estimated.
- **Precision:** `Decimal` throughout; rounding happens only in display and export.
- **Energy** is reported only from reported energy values. Computing energy from Atwater factors is out of scope for the prototype.

Tests: at least ten hand-computed golden cases (checked independently by a food scientist), plus property tests (scaling, additivity, a formulation of one ingredient reproduces its row).

### 8.2 Amino-acid scoring

For each indispensable amino acid a, the mixture's content per gram of protein is compared with a stated reference pattern R\_a (mg per g protein):

```latex
S_a = \frac{\left(\sum_i \frac{p_i}{100}\, aa_{i,a}\right) / \left(\sum_i \frac{p_i}{100}\, protein_i\right)}{R_a}, \qquad \text{score} = \min_a S_a
```

- Amino-acid values are stored as mg per 100 g as-is (converted at import); protein is the reported protein value, with its nitrogen conversion factor recorded in the data source notes.
- The **limiting amino acid** is the one with the lowest S\_a. Grouped amino acids (methionine + cysteine, phenylalanine + tyrosine) follow the grouping defined in the reference-pattern data.
- Reference patterns are versioned rows in `amino_acid_reference_patterns`, loaded by a curator from the cited publication and checked against it, not typed from memory. The default pattern (the FAO 2013 scoring pattern for a chosen age group is the usual choice) is to be confirmed by the project owner.
- If any contributing ingredient lacks a value for an amino acid, that S\_a is `null`, `complete` is `false`, and the limiting amino acid is reported among the amino acids that are available, with `missing` listing the rest.
- The method is labelled `AAS` (unadjusted amino-acid score). **DIAAS is never calculated** unless amino-acid-specific ileal digestibility values exist for every contributing ingredient and the method is implemented and reviewed; until then no field says DIAAS.

### 8.3 Texture and rheology models (learned)

**Data.** Models train only on rows from `measurements` whose `source_type` is `measured` (in-house) or `published` (extracted from a paper with method, equipment, units, moisture basis, variety and processing conditions recorded). `synthetic` data is rejected by the training loader and can never be registered as a training set.

**Features.** Per sample: ingredient mass fractions, mass-weighted functional properties (Σ p\_i × f\_i for each measured property), and process conditions (moisture, temperature profile summary, screw speed, feed rate, cooling). The feature schema is saved with the model and checked at prediction time.

**Targets.** Hardness, chewiness, springiness, G′, G″, viscosity, water-holding capacity, anisotropy. One model per target at first, so each has its own metrics and approval.

**Candidates.** Ridge regression and a mean predictor as sanity baselines; Random Forest, Gradient Boosting and Gaussian Process Regression as the compared models. The Gaussian Process is not assumed best: it is selected only if cross-validation says so for the dataset's size and feature count.

**Validation.**

- Grouped cross-validation by experiment (replicates and same-batch samples never split between train and test) and, where possible, leave-one-experiment-out.
- Report RMSE, MAE and R² per target with fold spread, and the empirical coverage of the stated interval (a 90 percent interval should cover close to 90 percent of held-out points).
- A model is eligible for approval only if it beats the baselines, has calibrated enough intervals for the team's purposes, and meets the minimum training size set in configuration (`MIN_TRAINING_SAMPLES`; a starting value such as 30 distinct formulations is a placeholder to review with a statistician).

**Uncertainty.** Gaussian Process: predictive standard deviation gives the interval. Tree ensembles: conformal prediction (split or CV+) gives an interval with a coverage guarantee under exchangeability. Every prediction response carries the interval and its level.

**Applicability domain.** The registry stores training ranges and a distance measure per feature. At prediction time the job checks the input: an ingredient or process value outside the training support sets `in_domain: false` and emits `warning.raised` with `details.code = "out_of_domain"`. The frontend must show this warning instead of presenting a confident number. The system makes no claim that a model generalizes to unfamiliar crops or process settings without out-of-sample testing.

**No model, no number.** If no approved model exists for a requested target, the API returns `422 model_unavailable`. It never substitutes a default, a literature average or a language-model guess.

### 8.4 Optimization

**Decision variables:** ingredient percentages x\_i, with x\_i ≥ 0, a total of 100, per-ingredient bounds, and excluded ingredients fixed at 0.

**Nutrition and cost are linear in x.** Per-100 g nutrient minimums are linear, and so are amino-acid-per-gram-protein constraints, which can be written without division:

```latex
\sum_i x_i \left( aa_{i,a} - r_a \, protein_i \right) \ge 0
```

Problems that use only nutrient constraints and a cost or nutrient objective are therefore linear programs, solved exactly with `scipy.optimize.linprog` (HiGHS) and a global optimum.

**Texture objectives** use approved model predictions, which are nonlinear and treated as a black box. They use SciPy constrained solvers (SLSQP or `trust-constr`) with multiple starting points taken from feasible linear-program solutions, with a fixed `seed`.

**Several objectives** (nutrition, texture, cost) are handled by sweeping weights or the epsilon-constraint method, then keeping the non-dominated set, so the user sees Pareto trade-offs and not one claimed universal best. BoTorch for Bayesian multi-objective search is phase B7, only if model uncertainty needs to guide the search.

**Every candidate** is re-evaluated through the same nutrition engine and prediction code as a normal job, rounded to a practical precision (for example 0.1 percentage points), renormalized to 100, re-validated, and checked for applicability domain. Out-of-domain candidates are dropped or returned with a warning, according to `params`.

**Infeasibility.** If the constraints cannot be met, a feasibility check using elastic (slack) variables identifies the smallest set of violated constraints; the job ends with `job.failed`, `details.code = "infeasible"` and a plain-language explanation listing those constraints.

**Progress.** `searching` reports `completed` of `total` starts only when the number of starts is fixed in advance; solver iterations are never reported as a percentage.

**Reproducibility.** Params, seed, ingredient dataset version, calculation version and model versions are stored on the job, so the same inputs reproduce the same candidates.

## 9. Ingredient data ingestion, provenance and licensing

Ingredient data is the foundation of every number the product shows, so ingestion is a reviewed, versioned pipeline and never a bulk paste.

**Sources and how each is used**

| Source | Use | Caution |
| --- | --- | --- |
| Kenya Food Composition Tables 2018 | Primary starting source for Kenyan foods and crops; the Kenyan Nutrition Portal describes 522 foods and 142 recipes, with amino-acid profiles for some protein-rich foods | Not every crop, variety or processing form has a complete profile; check every row and source note |
| FAO/INFOODS guidance | Food identification, matching, data quality and documentation; tagnames for nutrients | Normalise units and food descriptions before merging datasets |
| USDA FoodData Central | Supplementary nutrients where a relevant match exists | A match from another country or cultivar is not automatically equivalent to the Kenyan ingredient; store it as a separate row with `quality_flag = external_match` |
| Laboratory and published studies | Texture, rheology, extrusion and ingredient functional properties | Capture method, equipment, units, moisture basis, sample variety and processing conditions |

Confirm each source's reuse rights before import. The catalogue is a starting point, not an authority to be copied blindly.

**Required ingredient record**

Scientific and common name, crop variety (if known), ingredient form, origin, moisture basis, nutrient unit, analytical or estimated flag, original source, method, date, licence or permission status, and an uncertainty or range. The import refuses rows missing any of these, except variety, range and method where the source genuinely does not provide them (stored as null with a reason).

**Pipeline**

1. **Acquire:** raw source files go into DVC-tracked storage (`data/raw/`), with source URL, access date and licence note in `data_sources`.
2. **Extract:** a parser per source (`app/ingestion/kfct.py`, `usda.py`, `lab_csv.py`) produces a standard intermediate CSV.
3. **Normalise:** map nutrients to `nutrient_definitions` (INFOODS tagnames), convert units, convert moisture basis, split forms (raw, cooked, soaked, fermented, roasted, flour) into separate rows.
4. **Validate:** automated checks produce a report; nothing is written yet.
5. **Review:** a curator opens the report, resolves flagged rows, and approves.
6. **Commit:** rows are written in one transaction, a new `dataset_version` (for example `2026.11.1`) is created, and the change is recorded in `audit_log`.
7. **Never edit in place:** a correction creates a new version of the ingredient row, so old formulations and jobs keep the values they were calculated with.

**Automated validation checks**

| Check | Failure handling |
| --- | --- |
| Required fields present | Row rejected with reason |
| Units known and convertible | Row rejected |
| Proximate composition adds up to about 100 g per 100 g (water, protein, fat, carbohydrate, ash) within a stated tolerance | Row flagged for review, not auto-corrected |
| Value within plausible range for the nutrient | Row flagged for review |
| Amino acids sum consistent with reported protein | Row flagged for review |
| Duplicate food (same name, form, variety, source) | Row flagged; curator chooses |
| Licence status `unknown` or `restricted` | Import blocked until resolved |

**Licence handling**

`license_status` is one of `open`, `permission_granted`, `restricted`, `unknown`. Restricted data is stored only if the licence allows it, is never included in exports, and is hidden or summarised in the UI according to the licence note. Commercial use of any dataset requires a recorded permission before its `license_status` can be `permission_granted`.

**Import file for lab and ingredient data (CSV columns)**

| Column | Required | Example |
| --- | --- | --- |
| `common_name`, `scientific_name` | Yes | Cowpea, *Vigna unguiculata* |
| `variety`, `form`, `origin` | `form` yes | local landrace, flour, Kenya |
| `moisture_basis`, `moisture_percent` | Yes | as\_is, 10.5 |
| `nutrient_key`, `value`, `unit`, `flag` | Yes (one row per nutrient) | protein, 22.1, g, analytical |
| `range_low`, `range_high` | If known | 20.8, 23.4 |
| `source_name`, `method`, `analysed_on` | Source yes | KFCT 2018, Kjeldahl, 2018 |
| `license_status` | Yes | open |

## 10. Model governance

A prediction is only as trustworthy as the process that produced the model. MLflow records the runs; DVC versions the data; the registry decides which model may serve users.

**What each tool holds**

| Tool | Holds | Convention |
| --- | --- | --- |
| DVC | Raw and processed datasets, the training pipeline (`dvc.yaml`) | One DVC-tracked dataset snapshot per `dataset_version`; remote storage configured outside git |
| MLflow | Parameters, metrics, cross-validation results, plots, the serialized model and its feature schema | One experiment per target; every run tagged with `dataset_version`, git commit and seed |
| `model_registry` table | Status and metadata the API serves | Mirrors the chosen MLflow run; the API never reads MLflow on a user request |

**Model lifecycle**

`candidate` → `approved` → `retired`

1. **Train:** an admin starts `model_training` (or runs the script). The pipeline loads only `measured` and `published` rows, builds features, runs the grouped cross-validation, and logs everything to MLflow.
2. **Register:** the best run for a target is written to `model_registry` as `candidate` with metrics, feature schema, applicability domain and a written `limitations` field (required; for example "trained on three crops; not validated on fermented products").
3. **Review:** a scientist checks the metrics against baselines, the interval coverage and the limitations text. Approval records the reviewer and date.
4. **Approve:** `POST /api/admin/models/{id}/approve`. At most one approved model per target at a time; approving a new one retires the previous one automatically.
5. **Serve:** workers load the approved model from artifact storage and cache it by `model_id`. Each job stores the `model_ids` it used.
6. **Retire:** retired models remain readable so that old results can still show which model produced them.

**Rules**

- Every prediction shown to a user carries the model ID and version.
- A model with no recorded dataset version or no limitations text cannot be approved.
- Retraining never overwrites a model: it creates a new version.
- Reproducibility test: re-running the training pipeline on the same dataset version and seed must reproduce the registered metrics within a tolerance set in the pipeline test.
- The hold-out performance and limitations displayed on the frontend's Models page are read from the registry, not restated by hand.

**Before any real data exists**

The texture endpoints return `422 model_unavailable` and the frontend shows an explicit "no approved model yet" state. To test the full pipeline, use a clearly labelled **test model** built from fixtures in `tests/fixtures/` that only loads when `ENV=test`. It must never be registered in a production database or shown as laboratory data.

## 11. Security, testing and observability

**Security**

- Verify every JWT (signature, expiry, audience) on each request; reject tokens for other audiences.
- Role checks happen in dependencies (`api/deps.py`), once per route, and are covered by tests that call every endpoint with every role.
- Ownership checks: a scientist can read and change only their own formulations, jobs and candidates (`404`, not `403`, for other users' records).
- Pydantic validates every body; request size limits; CSV imports are parsed in a sandboxed, size-limited step.
- CORS allows only the configured frontend origins; no wildcard with credentials.
- Stream tokens are short-lived, bound to one job and one user, and signed with a secret that is not the JWT secret.
- Rate limits per user and per IP (auth, job start, export, stream connect).
- Secrets only in environment variables or the host's secret store; `.env` files are git-ignored; a secret scanner runs in CI.
- Dependencies are pinned and scanned (`pip-audit` or Dependabot) in CI.
- Database access uses parameterised queries through SQLAlchemy only; no string-built SQL.
- Exports and logs never include tokens, passwords or restricted-licence data.
- Audit trail records data imports, formulation saves, job starts, model approvals and exports with actor, time and request ID.
- Personal data stays minimal (email, display name, role); document retention in the privacy note before external users are added.

**Testing**

| Layer | What is tested | Tool |
| --- | --- | --- |
| Unit (domain) | Unit conversion, moisture basis, validation rules, nutrition sum, amino-acid scoring, optimizer constraints | pytest, Hypothesis for properties |
| Golden cases | Hand-computed nutrition and amino-acid examples reconciled by a food scientist; any change to results requires explicit sign-off | pytest fixtures |
| Repository / DB | Migrations apply from empty; immutability rules (versions, events) cannot be bypassed | pytest with a throwaway PostgreSQL container |
| API integration | Every endpoint, every role, error codes, pagination, idempotency, `version_conflict` | pytest + httpx |
| Job and event | Event ordering and gapless `seq`; no event after a terminal one; progress is `null` unless `completed` and `total` exist; replay from `Last-Event-ID`; cancel; failure; reconnect | pytest with `MemoryBus` and `RedisBus` |
| ML pipeline | Training is reproducible; synthetic data is rejected; no model approved without limitations; out-of-domain input warns | pytest with fixtures marked `ENV=test` |
| Contract | `/openapi.json` matches the frontend's Zod schemas and TypeScript types | Schemathesis or a schema diff in CI |
| Load | Concurrent SSE streams, job queue behaviour, export size | Locust or k6, run before the demo |

Coverage gate in CI for `app/domain/` (high, set by the team) and a hard rule that scientific code has no untested branch for missing data.

**Observability**

- Structured JSON logs with `request_id`, `job_id`, `user_id`; no sensitive values.
- Metrics: request latency, job duration by type, job failures by error code, active streams, queue length (Prometheus-compatible endpoint or the host's metrics).
- Error tracking with Sentry (optional) including `job_id` and `calc_version`.
- `GET /api/health` for liveness; a separate readiness check verifies database, Redis and model store.

## 12. Docker, CI/CD and hosting

**Local development (Docker Compose)**

| Service | Purpose | Notes |
| --- | --- | --- |
| `api` | FastAPI with auto-reload | Port 8000; `JOB_RUNNER=inline`, `EVENT_BUS=memory` by default |
| `worker` | Celery worker | Started only when `JOB_RUNNER=celery` (profile `workers`) |
| `db` | PostgreSQL | Used when not pointing at Supabase; data volume |
| `redis` | Broker and event streams | Profile `workers` |
| `mlflow` | Tracking server | Profile `mlops`; artifacts in a local volume |

Commands to document in the README: `docker compose up api db`, `alembic upgrade head`, `python -m app.ingestion.seed_dev` (loads clearly labelled fake ingredients for development only), `pytest`.

**CI (GitHub Actions)**

1. On every pull request: Ruff lint and format check, mypy, unit and integration tests (PostgreSQL service container), migration check from empty, OpenAPI export and diff against the previous contract, dependency and secret scans.
2. On merge to `develop`: build the Docker image and push it to the registry with the commit SHA as tag; deploy to the staging environment.
3. On a tagged release from `main`: deploy to production after a manual approval.
4. A breaking change to the OpenAPI contract fails the build unless the pull request has the label `contract-change` and a note for the frontend developers.

**Environments**

| Environment | Database | Runner and bus | Purpose |
| --- | --- | --- | --- |
| Local | Local PostgreSQL | inline + memory | Daily development |
| Staging | Supabase project (or managed PostgreSQL) | celery + redis | Frontend integration, demos |
| Production | Separate Supabase project | celery + redis | Real users |

**Hosting**

As the project owner is hosting it, the simplest first deployment is one virtual server running Docker Compose behind a reverse proxy (Caddy or Nginx) with automatic TLS, plus managed PostgreSQL (Supabase) and managed or containerised Redis. Settings that matter for this product:

- Proxy: no response buffering and no compression for `/api/jobs/*/events`; read timeout above 60 seconds; HTTP/2 enabled so several streams share one connection.
- Workers and API scale independently; one Celery worker is enough for the prototype.
- Daily database backups with a tested restore; MLflow artifacts and DVC remote stored in object storage with versioning.
- Run the API as a non-root user, health checks in compose, resource limits on workers (optimization can use all CPU).
- Domain and CORS: frontend and API on the same parent domain if possible, so cookies and CORS stay simple.

## 13. Phased plan to a working prototype

Backend phases B0 to B6 run in parallel with the frontend's F0 to F6, so the frontend develops against mocks and switches to the real API one resource at a time. The team for the backend has not been named; the table assumes one backend developer plus a data/ML lead (who can be the same person at prototype scale). Durations are rough estimates to adjust. Use the same branch model as the frontend (`main`, `develop`, short-lived feature branches off `develop` named `feature/<name>`), with pull requests into `develop`.

| Phase | Goal | Work | Est. | Exit condition |
| --- | --- | --- | --- | --- |
| B0 Setup (with F0) | Service skeleton running | Repository, `pyproject.toml`, folder structure, Docker Compose, config, `GET /api/health`, CI, pre-commit, OpenAPI published as a CI artifact | 2 days | CI green; `docker compose up` serves `/health` and `/openapi.json` |
| B1 Data foundation (with F1) | Auth and ingredient catalogue | Alembic migrations for reference and user tables, JWT verification, roles, ingredient list/detail/facets/nutrients endpoints, dev seed (fake, labelled), first reviewed import of a KFCT subset, audit log | 1 week | Frontend can sign in and browse real ingredients; OpenAPI for auth and ingredients frozen |
| B2 Formulations and domain engines (with F2) | Save, version and validate formulations; nutrition maths proven | Formulation CRUD, immutable versions, restore, duplicate, validation rules, `domain/nutrition.py`, `domain/amino_acids.py`, units and moisture conversions, golden tests | 1.5 weeks | Section 8.1 and 8.2 tests pass with scientist sign-off; frontend editor works against the real API |
| B3 Jobs and events (with F3) | Real events | `jobs`, `job_events`, `job_results` tables, `InlineRunner`, `MemoryBus` and `RedisBus`, SSE endpoint with replay and heartbeat, stream tokens, nutrition job, status and result endpoints, cancel semantics | 1.5 weeks | Event-ordering and replay tests pass; frontend job timeline and scene receive real events for a nutrition job |
| B4 Texture data and models (starts early, runs with F3 to F5) | Honest prediction pipeline | Experiment, sample and measurement tables and importers, feature builder, grouped cross-validation, training script, MLflow and DVC set up, registry and approval flow, texture job, applicability-domain checks | 2 to 3 weeks of engineering, plus the time to collect real measurements | Either an approved model with documented limitations and metrics, or the `model_unavailable` path working end to end and documented as the prototype state |
| B5 Optimization and results (with F5) | Candidates and trade-offs | LP and constrained-search solvers, candidate storage, Pareto filtering, infeasibility explanations, Celery runner and cancellation, compare, promote, export (PDF and CSV), models endpoints | 2 weeks | Optimization jobs stream real `candidate.ready` events; candidates satisfy all constraints when re-validated; export matches on-screen values |
| B6 Integration and hardening (with F6) | Prototype on staging | Contract tests against the frontend schemas, load test on streams and jobs, security pass, backups, staging deployment, demo dataset and script, runbook | 1 to 2 weeks | Section 14 definition of done met on staging; demo runs without manual fixes |
| B7 Advanced (optional) | Only if evidence supports it | PyTorch models, BoTorch Bayesian multi-objective search, selected molecular tools for a defined research question | Open | Added complexity beats the validated baseline on held-out data |

**Synchronisation points with the frontend**

| When | Backend delivers | Frontend does |
| --- | --- | --- |
| End of B0 | `/openapi.json`, `.env.example`, running compose file | Generate or hand-check types; point mocks at the same schemas |
| End of B1 | Real auth and ingredients | Switch pages 1 to 4 off mocks |
| End of B2 | Formulation, validation and version endpoints | Switch editor, versions and validation off mocks |
| End of B3 | Job and SSE endpoints with a nutrition job | Replace mock scenarios with real streams for nutrition; keep mocks for texture and optimization |
| End of B5 | All job types, candidates, compare, export | Remove remaining mocks; run end-to-end suite on staging |

The backend never changes a published response shape without a pull request labelled `contract-change` and a note in the frontend channel.

## 14. Definition of done, frontend changes and open questions

**Backend definition of done (prototype)**

| Area | Acceptance condition |
| --- | --- |
| Nutrition | Golden cases match hand calculations to the stored precision; missing data yields `null` with a reason, never a partial total |
| Amino acids | Limiting amino acid and score match hand calculations against the stated pattern; no output is labelled DIAAS |
| Validation | `/validate`, `PUT` and job start return identical issues for the same input |
| Immutability | Saved versions and job events cannot be updated or deleted through the API or by the application database role |
| Events | `seq` is gapless, nothing follows a terminal event, replay from `Last-Event-ID` returns exactly the missed events, `progress_percent` is `null` unless `completed` and `total` exist |
| Cancellation | Cancel works for optimization; unsupported types return `409 cancel_not_supported`; terminal state is always emitted |
| Texture | No approved model returns `422 model_unavailable`; out-of-domain input emits `warning.raised`; every prediction has an interval, a level and a model version; synthetic data cannot be registered for training |
| Optimization | Every returned candidate re-validates to 100 percent within tolerance and satisfies all constraints; infeasible problems return an explanation; the same seed and inputs reproduce the same candidates |
| Provenance | Every result stores and returns `data_versions`, `calc_version`, `model_ids` and `seed` |
| Security | Role matrix and ownership checks covered by tests; stream tokens expire and are job-bound; no secret in the repository |
| Export | PDF and CSV values equal the stored results; restricted-licence data is excluded |
| Operations | Staging deploy from CI, health and readiness checks, backups tested, runbook written |
| Performance | Targets set at kickoff on a baseline server (for example validate and nutrition response times, concurrent streams); met in the load test |
| Contract | `/openapi.json` published; contract tests against the frontend schemas pass |

**Changes the frontend must make to its guide and code**

This document settles the frontend's open points and adds a few requirements. Apply these to the *Frontend Development Guide* before phase F4:

| # | Change | Where in the frontend guide |
| --- | --- | --- |
| 1 | Before every `EventSource` connection call `POST /api/jobs/{job_id}/stream-token` and add `?token=` to the stream URL; request a new token on each reconnect | Section 7 (SSE client) |
| 2 | Add a process-conditions form (moisture, temperature profile, screw speed, feed rate, cooling) on the Texture and Optimize pages; it is required job input | Pages 8 and 9 |
| 3 | Extend `NutrientValue.flag` with `"calculated"`; add optional `reason`, `missing_ingredient_ids` and `contains_estimated` to nutrition results | Section 6 types, page 7 |
| 4 | Accept the additive `JobEvent` fields `seq`, `completed`, `total`, `details`; use `seq` to ignore stale or duplicate events | Sections 6 and 7 |
| 5 | Use the new endpoints: `PATCH` and `duplicate` on formulations, version `restore`, ingredient `facets`, `nutrients`, `amino-acid-patterns`, candidate `promote` | Pages 3, 5, 10, 12 and section 6 table |
| 6 | `PUT` requires `base_version`; handle `409 version_conflict` with a reload prompt; Save stays disabled while `/validate` returns `valid: false`; drafts live in the browser only | Page 6 behaviour |
| 7 | Show dedicated states for `model_unavailable`, `infeasible`, `result_not_ready`, `job_limit_reached` and `warning.raised` with `details.code = out_of_domain` | Pages 8, 9, section 6 error handling |
| 8 | Drive the "Illustrative" label and cutaway availability from `candidate.scene.visual_basis` and `scene.variables[].validated` | Section 7 scene rules, page 10 |
| 9 | Download exports with an authenticated `fetch` and a blob (a plain link cannot send the bearer token) | Page 13 |
| 10 | Compare accepts two candidate IDs only; remove the reference-product option until a later phase | Page 11 |

**Open questions for the project owner**

- [ ] Which amino-acid reference pattern (and age group) is the default for scoring?
- [ ] Confirm Supabase Auth as the identity provider, or name the alternative.
- [ ] Who maintains ingredient prices, in which currency, and how often? (Needed for cost objectives.)
- [ ] What are the licence and commercial-use terms for each data source to be imported first?
- [ ] Which crops and ingredient forms are in the first curated catalogue?
- [ ] Who will produce the laboratory texture measurements, with which methods and how many samples? This decides when the first model can be approved.
- [ ] What minimum training size and interval-coverage level count as acceptable for approving a model?
- [ ] Hosting target: provider, domain, and who operates backups.
- [ ] Names of the backend developer and data/ML lead, to assign branches and reviews.
- [ ] Is comparison against a reference product required in the prototype?
