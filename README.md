# Virtual Plant-Meat Formulator

A monorepo skeleton for the Virtual Plant-Meat Formulator, with a Next.js frontend, FastAPI API, PostgreSQL, Redis, a Celery worker, and Docker Compose. This setup contains placeholders only: it does not implement formulation, nutrition, texture, optimization, or job-progress features.

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

PyTorch, BoTorch, MLflow, and DVC are planned for later backend phases and are not in the runtime image yet.

## Branching model

`main` is the stable branch. Work is proposed through pull requests into `develop`; feature branches are created from `develop` and merged through pull requests. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Troubleshooting

- **Port in use:** set `FRONTEND_PORT`, `API_PORT`, `DB_PORT`, or `REDIS_PORT` in `.env` and retry.
- **Docker not running:** start Docker Desktop and verify `docker info` succeeds.
- **Dependency changes:** rebuild without cached layers with `docker compose build --no-cache`.
- **Windows line endings:** `.gitattributes` enforces LF; if scripts still fail after checkout, run `git add --renormalize .` and rebuild.
