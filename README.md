# Virtual Plant-Meat Formulator

A monorepo for the Virtual Plant-Meat Formulator: a Next.js frontend, a FastAPI API, PostgreSQL, Redis, a Celery worker and Docker Compose.

The backend implements the [backend guide](docs/backend-guide.md):

- **Catalogue:** Kenya Food Composition Tables 2018 ingredients with provenance and licence status, nutrient definitions and FAO 2013 amino-acid scoring patterns.
- **Formulations:** immutable versions, validation, restore, duplicate and optimistic concurrency.
- **Nutrition:** a deterministic `Decimal` engine. Missing data yields `null` with a reason, never a partial total, and protein quality is reported as AAS (never DIAAS).
- **Texture:** literature-trained estimates (FoodML 2023 HME data) using group-held-out cross-validation, 90 % intervals, applicability-domain checks and an admin approval flow. No approved model means `422 model_unavailable`.
- **Optimization:** HiGHS LP for nutrient and cost problems, multistart SLSQP for texture objectives, Pareto ranking, and plain-language infeasibility explanations.
- **Jobs:** an inline or Celery runner, a memory or Redis event bus, and SSE with replay (`Last-Event-ID`) and single-use stream tokens.
- **Outputs and operations:** candidates, compare, promote, PDF/CSV exports, audit log, admin back office, JSON logs, `/api/metrics` and `/api/ready`.
- **Explanations:** an optional NVIDIA-hosted language model *explains* stored results. It never produces a scientific value; replies are checked for numbers absent from the stored data.

## Guides

- [Frontend development guide](docs/frontend-guide.md)
- [Backend development guide](docs/backend-guide.md)

## Prerequisites

- Docker Desktop with Docker Compose
- Node.js LTS and npm (for frontend development without Docker)
- uv and the Python version in `backend/.python-version` (for backend development without Docker)

## Quick start

From the repository root, run:

```sh
docker compose up --build
```

- Frontend: <http://localhost:3000>
- API health: <http://localhost:8000/api/health>
- API docs: <http://localhost:8000/docs>

On start, the `migrate` service runs `alembic upgrade head`, loads reference data, KFCT 2018 and literature samples (`python -m app.seed --dev-users --kfct`), and registers literature texture models as **candidates** (`python -m app.mlops.train --bootstrap`). Candidates do not serve predictions until an admin approves them (`POST /api/admin/models/{id}/approve`, or `python -m app.mlops.train --target hardness --approve --approver <user_id>`).

Development users (local auth, `AUTH_MODE=local`): `admin@vpmf.local`, `curator@vpmf.local`, `scientist@vpmf.local` and `viewer@vpmf.local`, all with password `DEV_USER_PASSWORD` (default `devpassword123`). Sign in with `POST /api/auth/login`. Never use these in production.

### Share a development database with a teammate

The default setup uses a local Docker PostgreSQL database. To share the same catalogue, formulations, jobs and users, create a Supabase project, open **Connect**, choose **Session pooler**, and put its connection URI in your ignored `.env` as `DATABASE_URL`. Use the pooler values exactly as supplied, change the URI scheme from `postgresql://` to `postgresql+psycopg://`, and add `?sslmode=require` (or `&sslmode=require` if the URI already has query parameters). URL-encode reserved characters in the database password. Keep this URI private: it grants direct database access. Do not put it in Git or expose it in frontend variables.

Run `docker compose up --build`; the migration service applies the schema and seeds the database from the data available in `backend/data`. A teammate using the same Supabase project sets the same `DATABASE_URL` in their own `.env` and runs the stack. The ignored KFCT import file must also be supplied to each checkout (see [data acquisition](backend/data/README.md)); otherwise the shared database will start without those ingredient rows. This is a development sharing setup; keep `AUTH_MODE=local` for now—Supabase Auth is a separate integration.

Verify every endpoint against a running stack:

```sh
docker compose exec -T api python - --base-url http://127.0.0.1:8000 < backend/tests/smoke/smoke_api.py
```

The smoke test writes test records and approves the candidate models. Use it only against a development database, then clean up:

```sh
docker compose exec api python -m app.seed.purge                 # smoke-test and fake records only
docker compose exec api python -m app.seed.purge --all-activity  # also all formulations, jobs and audit history
```

Add `--dry-run` to see the counts first. The purge never deletes real reference data: KFCT ingredients, literature samples and non-retired models.

The dashboard shows a backend status indicator driven by the API health endpoint. The database, Redis, API, worker, and frontend use development-only defaults when no `.env` file is present.

Stop the services and keep the database volume:

```sh
docker compose down
```

Stop and delete the database volume:

```sh
docker compose down -v
```

## Ports and services

| Service | Host port | Container port | Purpose |
| --- | ---: | ---: | --- |
| Frontend | `FRONTEND_PORT` (3000) | 3000 | Next.js standalone server |
| API | `API_PORT` (8000) | 8000 | FastAPI and OpenAPI docs |
| PostgreSQL | `DB_PORT` (5432), localhost only | 5432 | Development database |
| Redis | `REDIS_PORT` (6379), localhost only | 6379 | Celery broker and event bus |
| Worker | — | — | Celery worker, no tasks yet |
| Migrate | — | — | Runs Alembic migrations before API startup |

Set host ports in a local `.env` file if defaults conflict. The frontend API URL is embedded at build time; update `NEXT_PUBLIC_API_BASE_URL` and rebuild when changing it.

## Run without Docker

Frontend:

```sh
cd frontend
npm install
npm run dev
```

Backend (requires PostgreSQL and Redis only when configured to use them):

```sh
cd backend
uv sync --dev
uv run uvicorn app.main:create_app --factory --reload
```

## Scripts

Frontend scripts are in `frontend/package.json`: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:e2e`, and `format`.

Backend tools are installed through `uv sync --dev`: `pytest`, `ruff check`, `ruff format --check`, and `mypy`.

Backend tests run against in-memory SQLite (`uv run pytest`). PyTorch and BoTorch (phase B7) are not included. MLflow logging is optional (`MLFLOW_TRACKING_URI`, with `mlflow` installed). DVC is not configured yet.

## Branching model

`main` is the stable branch. Work is proposed through pull requests into `develop`; feature branches are created from `develop` and merged through pull requests. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Troubleshooting

- **Port in use:** set `FRONTEND_PORT`, `API_PORT`, `DB_PORT`, or `REDIS_PORT` in `.env` and retry.
- **Docker not running:** start Docker Desktop and verify `docker info` succeeds.
- **Dependency changes:** rebuild without cached layers with `docker compose build --no-cache`.
- **Windows line endings:** `.gitattributes` enforces LF; if scripts still fail after checkout, run `git add --renormalize .` and rebuild.
