# Virtual Plant-Meat Formulator: Frontend Development Guide

Nov 13, 2026 · @Lennox Wanyela

The frontend is a scientific workstation in the browser: a food scientist builds a formulation from indigenous Kenyan crops, runs calculations or optimization, and watches both the numerical results and a live 3D process scene update. This guide takes the frontend from an empty repository to a working prototype, and was written against the *Virtual Plant-Meat Formulator / Technology Plan* (proposed architecture, 12 November 2026).

## 1. Overview and scope

**What the frontend owns**

- Every page, form, table and chart the scientist sees.
- The interactive 3D scene (React Three Fiber) and its 2D fallback.
- The API client, the SSE job-event client and shared UI state.

**What the frontend does not own**

- Nutrition values, texture predictions and optimization results. These are always computed by the Python/FastAPI services and only displayed here.
- Job progress. It comes from worker events, never from a front-end timer.

**Non-negotiable rules (from the technology plan)**

1. The 3D renderer never calculates a nutritional result and never invents job progress. It reads validated formulation state and authoritative backend events.
2. Show a progress percentage only when the event carries a real completed/total value. Otherwise show the named stage with an indeterminate indicator.
3. Any 3D appearance (density, fibrousness, colour, cutaway) is labelled "Illustrative" unless a calibrated, validated model produced it. Never call the scene a molecular or mechanical simulation.
4. Every result shows its provenance: data source, model version, timestamp and uncertainty where available.
5. Every 3D action has a keyboard-accessible equivalent, and the whole workflow works in 2D when WebGL is unavailable or reduced motion is preferred.

**Assumptions in this guide.** The backend guide has not been written yet, so every endpoint below is the contract the frontend will code against. The five job endpoints come directly from the technology plan; the rest are proposed additions marked *proposed*, to be confirmed or changed in the backend guide. Until the backend exists, the frontend develops against a mock API (section 8).

## 2. Tech stack and project structure

The frontend uses the stack chosen in the technology plan. Pin exact versions in `package.json` at kickoff and commit the lockfile; recheck library compatibility before upgrading.

| Area | Choice | Used for |
| --- | --- | --- |
| Framework | Next.js (App Router) + React + TypeScript | Routing, layouts, type-safe pages |
| Styling | Tailwind CSS + shadcn/ui | Forms, tables, dialogs, dashboard controls |
| 3D | Three.js via React Three Fiber, `@react-three/drei` | Scene, camera controls, loaders, picking |
| 3D assets | Blender, exported as GLB/glTF | Ingredient bins, mixer, extruder, candidate model |
| Shared state | Zustand | Formulation, job and selected-object state |
| UI motion | Motion for React | Panel, badge and status transitions |
| Charts | Plotly.js (scientific), Recharts (simple dashboard charts) | Nutrition, amino-acid, texture, trade-off charts |
| Server data | TanStack Query (recommended addition) | Caching and refetching REST data |
| Forms and validation | React Hook Form + Zod (recommended addition) | Formulation editor, mirrored backend rules |
| Mocking | MSW (recommended addition) | Fake REST and SSE until the backend exists |
| Testing | Vitest, Testing Library, Playwright | Unit, component and end-to-end tests |
| Tooling | ESLint, Prettier, Husky, GitHub Actions | Quality gates on every pull request |

TanStack Query, React Hook Form, Zod and MSW are not in the technology plan; they are suggested here because they reduce hand-written plumbing. Drop them if the team prefers otherwise.

**Recommended folder structure**

```text
frontend/
  src/
    app/                      # Next.js routes (see section 4)
      (auth)/login/
      (workspace)/
        page.tsx              # dashboard
        ingredients/
        formulations/[id]/
        jobs/[id]/
        compare/
        models/
        settings/
    components/
      ui/                     # shadcn/ui primitives
      layout/                 # app shell, sidebar, top bar
      formulation/            # editor, ingredient picker, totals bar
      results/                # nutrition tables, charts, provenance chips
      jobs/                   # status timeline, job list
    scene/                    # everything 3D (Lennox's area)
      WorkspaceScene.tsx
      objects/                # IngredientBin, MixingVessel, ProcessLine, CandidateModel
      hooks/                  # useSceneEvents, useSelection
      assets/                 # GLB files with a version note
      fallback/               # 2D equivalent of the scene
    lib/
      api/                    # typed REST client, one file per resource
      sse/                    # EventSource client with reconnect
      validation/             # Zod schemas mirroring backend rules
      units.ts                # unit and moisture-basis helpers
    stores/                   # Zustand stores
    types/                    # shared TypeScript contracts (section 6)
    mocks/                    # MSW handlers and fixtures
  public/
  tests/
    e2e/
```

**Environment variables**

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | Base URL of the FastAPI service |
| `NEXT_PUBLIC_USE_MOCKS` | `true` to run against MSW instead of the real backend |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Only if Supabase Auth is used; to be confirmed in the backend guide |

## 3. Team workflow and Git rules

Two developers work in parallel on separate branches that merge into `develop`; `main` only receives tested releases. The ownership split below is a suggestion based on the two natural halves of the product (application vs 3D layer) and can be changed by the project owner.

| Branch | Purpose | Who |
| --- | --- | --- |
| `main` | Stable, demo-ready code only | Project owner merges |
| `develop` | Integration branch; all features land here first | Both, via pull request |
| `feature/Steve` | Application shell, data pages, API client, charts | Steve |
| `feature/lennox` | 3D scene, SSE client, event-to-scene mapping, 2D fallback | Lennox |

**Suggested ownership**

| Area | Owner | Notes |
| --- | --- | --- |
| Project setup, layout, navigation, auth pages | Steve | Done first; unblocks everything |
| Ingredient catalogue, formulation editor, saved versions | Steve | Pages 3 to 6 and 12 in section 5 |
| Nutrition and texture charts, compare view, report download | Steve | Plotly and Recharts |
| API client, TypeScript contracts, MSW mocks | Steve | Shared with Lennox from day 2 |
| 3D scene, GLB assets, camera, picking, cutaway | Lennox | `src/scene/` only |
| SSE client, job stores, scene event mapping | Lennox | `src/lib/sse/`, `src/stores/` |
| 2D fallback and reduced-motion mode | Lennox | Must mirror the 3D workflow |
| Accessibility pass, end-to-end tests | Both | Final phase |

**Rules**

1. Never commit directly to `main` or `develop`. Open a pull request into `develop`.
2. Branch off `develop` for short-lived work as `feature/Steve/<topic>` or `feature/lennox/<topic>` when a change is larger than a day; otherwise work on the personal feature branch.
3. Pull and rebase from `develop` at the start of each working day.
4. Every pull request needs one review from the other developer, a passing CI run (lint, type-check, tests) and a short description with a screenshot or screen recording for UI changes.
5. Commit messages follow `type(scope): summary`, for example `feat(editor): add percentage total bar`.
6. Shared files (`src/types/`, `src/lib/api/`, `src/stores/`) are changed in small, early pull requests so the other developer is never blocked.
7. GLB files are binary: keep each under a size agreed at kickoff, and note the Blender source and version in a `README` beside the asset.

## 4. Sitemap and navigation

The app has 17 screens. The formulation workspace is the centre of the product: its layout keeps the 3D scene mounted while the user moves between its tabs, so the scene never reloads when switching from Editor to Results. Phases (F0 to F6) are defined in section 10.

| # | Route | Page | Owner | Phase |
| --- | --- | --- | --- | --- |
| 1 | `/login` | Sign in | Steve | F1 |
| 2 | `/` | Dashboard | Steve | F1 |
| 3 | `/ingredients` | Ingredient catalogue | Steve | F1 |
| 4 | `/ingredients/[id]` | Ingredient detail and provenance | Steve | F1 |
| 5 | `/formulations` | Formulation list and "new formulation" | Steve | F2 |
| 6 | `/formulations/[id]` | Workspace: editor + live 3D scene | Both | F2, F3 |
| 7 | `/formulations/[id]/nutrition` | Nutrition and amino-acid results | Steve | F2 |
| 8 | `/formulations/[id]/texture` | Texture prediction results | Steve | F5 |
| 9 | `/formulations/[id]/optimize` | Optimization setup and run | Both | F5 |
| 10 | `/formulations/[id]/candidates` | Candidate list and 3D preview | Both | F5 |
| 11 | `/compare?ids=a,b` | Side-by-side candidate comparison | Both | F5 |
| 12 | `/formulations/[id]/versions` | Saved versions and diff | Steve | F2 |
| 13 | `/formulations/[id]/report` | Formulation summary and download | Steve | F5 |
| 14 | `/jobs` and `/jobs/[id]` | Job history and job detail timeline | Lennox | F4 |
| 15 | `/models` | Model registry (versions, metrics, limits) | Steve | F5 |
| 16 | `/methodology` | Data sources, method notes, labelling rules | Steve | F2 |
| 17 | `/settings` | Units, reduced motion, force 2D mode | Steve | F1 |

Pages 6 to 13 sit under the shared workspace layout (`formulations/[id]/layout.tsx`), which renders the 3D scene or its 2D fallback on one side and the active tab on the other.

**Navigation**

- **Left sidebar:** Dashboard, Formulations, Ingredients, Jobs, Models, Methodology.
- **Top bar:** current formulation name and version, job status chip (idle, running, failed, complete), user menu, settings.
- **Workspace tab bar:** Editor, Nutrition, Texture, Optimize, Candidates, Versions, Report.
- **Mobile and tablet:** sidebar collapses to a menu; the 3D scene collapses above the tab content and can be switched to the 2D view.
- **Route protection:** every route except `/login` and `/methodology` requires a signed-in user; unauthenticated requests redirect to `/login?next=<path>`.

## 5. Page-by-page specifications

Each page lists its purpose, main components, the endpoints it calls (full contracts in section 6), the states it must handle and a "done when" check. Every page must implement loading, empty and error states; they are not repeated below unless specific.

### Page 1: Sign in (`/login`)

- **Purpose:** authenticate the scientist and return them to the page they asked for.
- **Components:** email and password form, error banner, link to `/methodology`.
- **Endpoints:** `POST /api/auth/login`, `GET /api/auth/me` (both *proposed*; replaced by the Supabase client if Supabase Auth is chosen).
- **States:** invalid credentials (inline message, no field hints that reveal which part was wrong), locked or expired session, network failure.
- **Done when:** a valid login lands on `next` or `/`; protected routes redirect when signed out.

### Page 2: Dashboard (`/`)

- **Purpose:** show where the user left off.
- **Components:** recent formulations (name, version, last result), running and recent jobs with status chips, quick actions (New formulation, Browse ingredients), data-quality notice if any catalogue rows are flagged.
- **Endpoints:** `GET /api/formulations?limit=5`, `GET /api/jobs?limit=5&status=running,failed,completed`.
- **States:** first-time user with no formulations shows a single "Create your first formulation" call to action.
- **Done when:** clicking a recent item opens the correct workspace or job.

### Page 3: Ingredient catalogue (`/ingredients`)

- **Purpose:** browse and filter the curated ingredient records that formulations are built from.
- **Components:** search box, filters (crop, ingredient form such as raw, cooked, soaked, fermented, roasted, flour; data source; analytical or estimated), sortable table with data-quality badges, pagination.
- **Endpoints:** `GET /api/ingredients?q=&crop=&form=&source=&page=&page_size=`.
- **States:** no results (offer to clear filters); missing data shown explicitly as "not reported", never as zero.
- **Done when:** filters and search are reflected in the URL so a filtered view can be shared.

### Page 4: Ingredient detail (`/ingredients/[id]`)

- **Purpose:** show every value with its provenance so the user can judge it.
- **Components:** header (scientific and common name, variety, form, origin, moisture basis), nutrient table with unit, analytical or estimated flag and range, amino-acid profile chart, source card (original source, method, date, license or permission status), "Add to formulation" button.
- **Endpoints:** `GET /api/ingredients/{id}`.
- **States:** incomplete amino-acid profile shows which acids are missing and warns that amino-acid scores will be partial.
- **Done when:** every number on the page has a visible unit and source.

### Page 5: Formulation list (`/formulations`)

- **Purpose:** list, search, create, duplicate and archive formulations.
- **Components:** table (name, current version, status, last job result, updated), "New formulation" dialog (name, description, optional template), row actions.
- **Endpoints:** `GET /api/formulations`, `POST /api/formulations`.
- **States:** creation failure keeps the dialog open with the server message.
- **Done when:** creating a formulation routes straight to its workspace.

### Page 6: Formulation workspace (`/formulations/[id]`)

This is the core screen. It is a two-pane layout: the 3D scene (or 2D fallback) on one side, the active tab on the other. This page is the **Editor** tab.

- **Purpose:** build and edit a formulation, run jobs, and watch the scene respond.
- **Components:**
  - Ingredient picker (search the catalogue, add with one click).
  - Formulation table: ingredient, form, percentage input, optional water/oil rows, remove button, data-quality badge.
  - Totals bar: running percentage total, green at exactly 100 percent, amber or red otherwise, with the server's validation message.
  - Targets panel: protein, key amino acids, cost ceiling, other constraints used by optimization.
  - Action bar: Save, Calculate nutrition, Predict texture, Optimize, Cancel job.
  - Job status timeline and status chip (shared with the top bar).
  - Scene panel: 3D canvas, camera reset, view toggle (3D/2D), "Illustrative" label.
- **Endpoints:** `GET /api/formulations/{id}`, `PUT /api/formulations/{id}`, `POST /api/formulations/{id}/validate`, `GET /api/ingredients`, `POST /api/formulations/{id}/jobs`, `GET /api/jobs/{job_id}/events`, `GET /api/jobs/{job_id}`, `POST /api/jobs/{job_id}/cancel`.
- **Behaviour:**
  1. Editing a percentage updates local state immediately and debounces a call to `/validate`; the scene proportions change only to values the server has validated.
  2. Save creates a new saved version; unsaved changes show a dot on the tab and block starting a job until saved or validated.
  3. Starting a job disables the action it started, opens the SSE stream, and hands the events to the scene (section 7).
  4. Closing or reloading the page does not cancel a job; on return the app calls `GET /api/jobs/{job_id}` and reattaches to the stream.
- **States:** validation failure (amber or red highlight on the ingredient in both table and scene, text explanation), job failed or cancelled (animation stops, terminal state and next action shown), connection lost (banner with automatic retry), WebGL unavailable (2D view with the same controls).
- **Done when:** adding and removing an ingredient changes the table, totals bar and scene from the same validated state, and a job's real events change the scene.

### Page 7: Nutrition and amino acids (`/formulations/[id]/nutrition`)

- **Purpose:** show deterministic composition results calculated from source data (a weighted mixture, not an AI prediction).
- **Components:** nutrient table (per 100 g, with moisture basis shown), macronutrient chart, individual amino-acid table and chart, amino-acid score against the stated reference pattern with the **limiting amino acid** highlighted, missing-data list, provenance and calculation-version footer.
- **Endpoints:** `GET /api/formulations/{id}/nutrition` (*proposed*), or the result of a nutrition job via `GET /api/jobs/{job_id}/result`.
- **Rules:** do not label any score as DIAAS unless the response says amino-acid-specific ileal digestibility data was used. Show "not calculable" with the reason when ingredient data is missing.
- **Done when:** results update after a nutrition job completes and every value shows its unit and basis.

### Page 8: Texture prediction (`/formulations/[id]/texture`)

- **Purpose:** show learned predictions of hardness, chewiness, springiness, G′, G″, viscosity, water-holding capacity and anisotropy.
- **Components:** prediction cards with value and uncertainty interval, bar or whisker chart, model badge (name, version, training-set size, holdout metric), limitations notice, "Illustrative" tag on any 3D representation.
- **Endpoints:** `POST /api/formulations/{id}/jobs` with type `texture_prediction`, then the job endpoints; `GET /api/jobs/{job_id}/result`.
- **Rules:** never show a prediction without its model version. If the backend flags the input as outside the training range, show a clear warning instead of a confident number.
- **Done when:** a completed job shows predictions with intervals and the model version.

### Page 9: Optimization (`/formulations/[id]/optimize`)

- **Purpose:** let the user set objectives and constraints, run a search and review trade-offs.
- **Components:** constraint form (ingredient bounds, total 100 percent, nutrient minimums, cost ceiling, safety or availability exclusions), objective selector (nutrition, texture, cost), "Run optimization" button, live job timeline, scatter chart of candidates (Pareto view when the backend returns it), "Send to candidates" action.
- **Endpoints:** `POST /api/formulations/{id}/jobs` with type `optimization` and a `params` object, job endpoints, `GET /api/formulations/{id}/candidates`.
- **States:** infeasible constraints show the backend's explanation; cancel supported only where the worker reports support.
- **Done when:** candidate cards appear as the worker emits `candidate.ready` events and match the stored results.

### Page 10: Candidates and 3D preview (`/formulations/[id]/candidates`)

- **Purpose:** inspect and select candidate formulations.
- **Components:** candidate cards (ID, key metrics, model version, cost), selection checkboxes (max 2 for compare), "Preview in 3D" that switches the scene to that candidate, cutaway or fibre-pattern toggle when the candidate carries a defined variable for it, "Promote to formulation" action.
- **Endpoints:** `GET /api/formulations/{id}/candidates`, `GET /api/candidates/{candidate_id}`, `POST /api/candidates/{candidate_id}/promote` (*proposed*).
- **Done when:** selecting a candidate changes the scene and the side panel, and its ID, formulation, model version and results stay linked.

### Page 11: Compare (`/compare?ids=a,b`)

- **Purpose:** compare two candidates, optionally against a reference product.
- **Components:** two scene viewports (or one with a switch), numerical side panel with differences highlighted, grouped bar or radar chart (Plotly), shared camera lock toggle.
- **Endpoints:** `GET /api/compare?ids=a,b` (*proposed*).
- **Done when:** numerical values remain visible beside the 3D views at all times.

### Page 12: Versions (`/formulations/[id]/versions`)

- **Purpose:** show saved versions and what changed between them.
- **Components:** version list (number, author, timestamp, note), diff view (added, removed and changed ingredients and percentages), "Restore as new version" action.
- **Endpoints:** `GET /api/formulations/{id}/versions`, `GET /api/formulations/{id}/versions/{version}` (*proposed*).
- **Done when:** restoring creates a new version and never overwrites history.

### Page 13: Report (`/formulations/[id]/report`)

- **Purpose:** produce the downloadable formulation summary.
- **Components:** on-screen preview (formulation, nutrition, texture predictions with uncertainty, data sources, model version, audit trail) and a download button.
- **Endpoints:** `GET /api/formulations/{id}/export?format=pdf|csv` (*proposed*; formats to be confirmed in the backend guide).
- **Done when:** the downloaded file matches the on-screen values.

### Page 14: Jobs (`/jobs`, `/jobs/[id]`)

- **Purpose:** audit and re-open runs.
- **Components:** job table (ID, type, formulation, status, started, duration), detail page with the full stage timeline, event log, result link and failure message, "Re-attach to live stream" when still running.
- **Endpoints:** `GET /api/jobs`, `GET /api/jobs/{job_id}`, `GET /api/jobs/{job_id}/events`, `POST /api/jobs/{job_id}/cancel`.
- **Done when:** a job started in another tab or device can be opened and followed live.

### Page 15: Models (`/models`)

- **Purpose:** make model provenance visible.
- **Components:** model list (target, algorithm, version, training-set size, holdout metric, date), detail drawer with limitations and the dataset version used.
- **Endpoints:** `GET /api/models`, `GET /api/models/{id}` (both *proposed*).
- **Done when:** the model version on any result links to its entry here.

### Page 16: Methodology (`/methodology`)

- **Purpose:** public explanation of data sources, the weighted-mixture calculation, amino-acid scoring, what the 3D scene is and is not, and licensing notes for data sources.
- **Content:** static, authored in the repository; no endpoint required. Must repeat the labelling rule: the 3D scene is illustrative and not a molecular or mechanical simulation.

### Page 17: Settings (`/settings`)

- **Purpose:** personal preferences.
- **Components:** unit preferences, reduced-motion toggle, "always use 2D view" toggle, theme. Stored locally; synced to the account only if the backend adds a preferences endpoint.
- **Done when:** the reduced-motion and 2D preferences take effect immediately and persist after reload.

## 6. Endpoint reference and data contracts

All endpoints are under `NEXT_PUBLIC_API_BASE_URL`. Requests and responses are JSON unless stated. Rows marked **Plan** are in the technology plan; rows marked **Proposed** are added by this guide and must be confirmed in the backend guide before the real backend integration phase (F6).

| Group | Method and path | Purpose | Source |
| --- | --- | --- | --- |
| Auth | `POST /api/auth/login` | Sign in | Proposed |
| Auth | `POST /api/auth/logout` | Sign out | Proposed |
| Auth | `GET /api/auth/me` | Current user | Proposed |
| Ingredients | `GET /api/ingredients` | Search and filter catalogue (paged) | Proposed |
| Ingredients | `GET /api/ingredients/{id}` | Ingredient with nutrients, amino acids, provenance | Proposed |
| Formulations | `GET /api/formulations` | List formulations | Proposed |
| Formulations | `POST /api/formulations` | Create a formulation | Plan |
| Formulations | `GET /api/formulations/{id}` | Fetch current version | Proposed |
| Formulations | `PUT /api/formulations/{id}` | Save changes as a new version | Plan (create or update) |
| Formulations | `POST /api/formulations/{id}/validate` | Validate totals, bounds, units without saving | Proposed |
| Formulations | `GET /api/formulations/{id}/versions` | Version list | Proposed |
| Formulations | `GET /api/formulations/{id}/versions/{version}` | One version | Proposed |
| Jobs | `POST /api/formulations/{id}/jobs` | Start nutrition, texture or optimization job; returns `job_id` | Plan |
| Jobs | `GET /api/jobs` | Job history (filter by status, formulation) | Proposed |
| Jobs | `GET /api/jobs/{job_id}` | Current status (used on reconnect) | Plan |
| Jobs | `GET /api/jobs/{job_id}/events` | SSE stream of job events | Plan |
| Jobs | `POST /api/jobs/{job_id}/cancel` | Request cancellation | Plan |
| Jobs | `GET /api/jobs/{job_id}/result` | Final stored result | Proposed |
| Results | `GET /api/formulations/{id}/nutrition` | Latest nutrition result | Proposed |
| Results | `GET /api/formulations/{id}/candidates` | Candidates for a formulation | Proposed |
| Results | `GET /api/candidates/{candidate_id}` | One candidate with metrics and model metadata | Proposed |
| Results | `POST /api/candidates/{candidate_id}/promote` | Turn a candidate into a formulation | Proposed |
| Results | `GET /api/compare?ids=a,b` | Side-by-side payload for two candidates | Proposed |
| Results | `GET /api/formulations/{id}/export?format=pdf\|csv` | Downloadable summary | Proposed |
| Models | `GET /api/models`, `GET /api/models/{id}` | Model registry entries | Proposed |
| System | `GET /api/health` | Liveness check | Proposed |

**Conventions for the API client**

- One typed function per endpoint in `src/lib/api/`, returning parsed and validated data (Zod), never raw `fetch` results in components.
- Errors arrive as `{ "error": { "code": string, "message": string, "details"?: object } }`; the client converts them to a typed `ApiError` shown by a shared error component.
- Validation errors name the field and ingredient ID so the editor and the scene can highlight the right object.
- List endpoints take `page` and `page_size` and return `{ items, total, page, page_size }`.

**Core TypeScript contracts (`src/types/`)**

```ts
export type JobType = "nutrition" | "texture_prediction" | "optimization";
export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface Ingredient {
  id: string;
  scientific_name: string;
  common_name: string;
  variety?: string;
  form: "raw" | "cooked" | "soaked" | "fermented" | "roasted" | "flour" | string;
  origin?: string;
  moisture_basis: string;
  nutrients: NutrientValue[];
  amino_acids: NutrientValue[];
  source: { name: string; method?: string; date?: string; license_status: string };
}

export interface NutrientValue {
  key: string;            // e.g. "protein", "lysine"
  value: number | null;   // null = not reported, never 0
  unit: string;
  flag: "analytical" | "estimated";
  range?: [number, number];
}

export interface FormulationLine {
  ingredient_id: string;
  percent: number;        // percent of total mass
}

export interface Formulation {
  id: string;
  name: string;
  version: number;
  lines: FormulationLine[];
  targets?: Record<string, number>;
  updated_at: string;
}

export interface ValidationResult {
  valid: boolean;
  total_percent: number;
  issues: { ingredient_id?: string; code: string; message: string }[];
}

export interface JobEvent {
  job_id: string;
  event: JobEventName;
  status: JobStatus;
  stage: string;                 // e.g. "texture_prediction"
  stage_label: string;           // e.g. "Predicting texture"
  progress_percent: number | null; // null = indeterminate; never faked
  message?: string;
  candidate_id: string | null;
  timestamp: string;             // ISO 8601, UTC
}

export type JobEventName =
  | "stage.updated" | "progress.updated" | "warning.raised"
  | "candidate.ready" | "result.ready"
  | "job.completed" | "job.failed" | "job.cancelled";

export interface ModelMeta {
  id: string;
  target: string;
  algorithm: string;
  version: string;
  training_set_size: number;
  holdout_metric?: { name: string; value: number };
}

export interface Prediction {
  target: string;                  // e.g. "hardness"
  value: number;
  unit: string;
  interval?: [number, number];     // prediction interval, when available
  model: ModelMeta;
}
```

**Open points to settle in the backend guide:** final SSE event names (the plan's example uses `stage.updated`; its endpoint outline mentions `job.stage` and `job.progress`), authentication method for the SSE stream (the browser `EventSource` cannot send an `Authorization` header, so cookie-based sessions or a short-lived stream token are needed), the optimization `params` schema, and export formats.

## 7. The live 3D scene and event handling

The scene is a reactive client layer. It renders what the stores contain and never decides what is true. Scene code lives in `src/scene/`; the rest of the app talks to it only through the Zustand stores.

**How a real event reaches the scene**

1. The user acts (adds cowpea, changes a percentage, clicks Optimize).
2. The frontend sends a REST command; FastAPI validates it and creates a job.
3. A worker runs the calculation and publishes stage and progress events.
4. FastAPI streams them over SSE at `GET /api/jobs/{job_id}/events`.
5. The SSE client writes each event to the job store; the scene subscribes to the store and animates the relevant object.

**Scene objects**

| Object | Purpose | Interaction |
| --- | --- | --- |
| Ingredient bins / crop models | Show which crops are in the formulation | Click or tap to open a card with name, quantity and data provenance |
| Mixing vessel | Visual anchor for the current formulation | Ingredient objects flow in when added (schematic only) |
| Processing line / extruder model | Shows the active stage | Highlights the stage reported by the worker |
| Candidate product model | Illustrative product preview | Appears only when a candidate is ready; cutaway or fibre layer only if the result defines a variable for it |
| Status markers | Active, complete, warning, failed | Each has a text equivalent for screen readers |

**Event-to-scene mapping**

| Event or user action | Scene and UI response | Authoritative source |
| --- | --- | --- |
| Ingredient added | Bin highlights, mix label updates | User action + validated formulation state |
| Percentage changed | Proportions update, invalid total flagged | Validated percentages from `/validate` |
| Validation failed | Scene pauses, ingredient turns amber or red, text error shown | Backend validation result |
| `stage.updated` (nutrition) | Nutrition stage active; panel loading | Worker status |
| `result.ready` (nutrition) | Nutrition panel and charts update; stage marked complete | Nutrition service output |
| `stage.updated` (texture) | Processing stage highlighted; schematic motion cue while worker is active | Worker status, not an invented percentage |
| `progress.updated` | Progress bar moves | Only when `progress_percent` is a number |
| `warning.raised` | Amber marker on the stage, warning text in the timeline | Backend warning |
| `candidate.ready` | Candidate preview enters the scene; candidate card loads | Optimizer result and model metadata |
| Candidate selected | Scene switches to that candidate; compare panel updates | Selected candidate ID and stored output |
| `job.failed` / `job.cancelled` | Animation stops; terminal state and next action shown | Worker terminal status |
| `job.completed` | Animation stops; final state shown | Worker terminal status |

**SSE client requirements (`src/lib/sse/`)**

- Wrap `EventSource`; expose `connect(jobId)`, `disconnect()` and connection state (connecting, open, reconnecting, closed).
- Reconnect with backoff. On every reconnect first call `GET /api/jobs/{job_id}` to read the current status, then resume the stream, so no terminal event is missed.
- Ignore events whose `job_id` is not the active job; drop events with a `timestamp` older than the last applied event for that job; never let a late `stage.updated` overwrite a terminal state.
- Close the stream on any terminal event (`job.completed`, `job.failed`, `job.cancelled`).
- Reduced motion or 2D mode: skip animations but still update status text and the timeline.

**Scene rules**

- Animation timing is decorative only. A stage, completion state or percentage must come from an event, never from a timer or `useFrame` counter.
- The scene must be reproducible from a formulation ID and a result payload; no scene-only state that cannot be rebuilt.
- Label any density, fibrousness, colour or cutaway as **Illustrative** unless the result payload says it derives from a validated model.
- Interaction: orbit, zoom and pan with mouse and touch; click or tap to select (Three.js raycasting through React Three Fiber events); camera reset button; every selectable object reachable by keyboard (Tab to move, Enter to inspect) through a mirrored list of controls outside the canvas.
- Assets: GLB files from Blender, loaded with `useGLTF`, compressed, with a loading placeholder and an error fallback to the 2D view.

## 8. State management and mock API

**Where state lives**

| State | Home | Notes |
| --- | --- | --- |
| Server data (ingredients, formulations, results, models) | TanStack Query cache | Refetch after saves and job completion |
| Current formulation draft, validation result | `formulationStore` (Zustand) | Single source for the table, totals bar and scene |
| Active job, latest event, event history, connection state | `jobStore` (Zustand) | Written only by the SSE client and job REST calls |
| Selected ingredient, candidate and compare pair | `selectionStore` (Zustand) | Shared by panels and the scene |
| View mode (3D or 2D), reduced motion, units | `preferencesStore` (Zustand, persisted locally) | Also respects the browser's reduced-motion setting |

Rules: the scene reads from stores and never from component props that bypass them; components never write to `jobStore` directly; derived values (such as "is the total valid") are selectors, not copies.

**Mock API (so frontend work never waits for the backend)**

With `NEXT_PUBLIC_USE_MOCKS=true`, MSW handlers answer every endpoint in section 6 using fixtures in `src/mocks/`. Fixtures must use obviously fake data and be labelled as such in the UI banner while mocks are on; they must never be presented as real nutrition values.

The mock event stream must replay scripted scenarios, so the scene and timeline can be tested for every outcome:

1. Nutrition job: stage events, then `result.ready`, then `job.completed`.
2. Texture job with indeterminate progress (`progress_percent: null` throughout).
3. Optimization with numeric progress and three `candidate.ready` events.
4. Job with `warning.raised`.
5. Job that fails; job that is cancelled.
6. Dropped connection and reconnect (status call returns the current state).
7. Out-of-order or duplicate event (the client must ignore it).

The mock server's own timers only pace these scripted events during development; the real frontend still shows progress purely from event contents.

When the backend guide is delivered, switch the flag off, run the contract tests against the real service, and fix any differences in `src/types/` and `src/lib/api/` only.

## 9. Design system, accessibility, fallback and performance

**Design principles**

- Scientific values live in tables and charts; the 3D scene gives spatial context, feedback and interaction. Never put a result only in the scene.
- Every number shows its unit; every result shows its source or model version; missing data is shown as missing, never as zero.
- Uncertainty is visible: intervals, error bars or an "estimated" badge wherever the backend supplies them.
- Status colours always come with text or an icon (never colour alone): green complete, blue running, amber warning, red failed, grey cancelled or idle.
- Dense, calm dashboard layout built from shadcn/ui components; one theme token file for colours, spacing and type so both developers stay consistent. Light and dark themes if time allows.

**Accessibility**

- Meet WCAG 2.2 AA for contrast, focus visibility and target size.
- All actions possible in the scene are possible through standard controls beside it (ingredient list with buttons, "Inspect", "Reset camera").
- Stage changes are announced through an `aria-live` region ("Predicting texture, running").
- Respect `prefers-reduced-motion`: disable scene motion and Motion transitions, keep status text.
- Charts get a data-table alternative.

**2D fallback**

Use the 2D view when WebGL is unavailable, when the user turns on "always 2D" or reduced motion, or when the device fails the performance check. It shows the same ingredients, stages and candidates as an illustrated schematic with the same selection and status behaviour, so the whole workflow is usable without WebGL.

**Performance**

- Agree one baseline device at kickoff and benchmark against it; the target is smooth interaction and no blocked controls while a job runs.
- Lazy-load the scene (`next/dynamic`, no SSR) and the Plotly bundle; show a skeleton while loading.
- Keep GLB files small (compress meshes and textures, reuse materials, instance repeated crop models).
- Do not re-render the canvas for unrelated state changes; subscribe to narrow store selectors.
- Throttle high-frequency events before they reach the scene (progress updates do not need more than a few updates per second).

## 10. Phased plan to a working prototype

The frontend reaches a working prototype at the end of F5 against the mock API, and a demo-ready prototype at the end of F6 against the real backend. Durations are rough estimates for two developers and should be adjusted once capacity is confirmed. Phases F2 and F3 map to technology-plan phase 1; F4 to phase 3; F5 to phases 4 and 5.

| Phase | Goal | Work | Owner | Est. | Exit condition |
| --- | --- | --- | --- | --- | --- |
| F0 Setup | Repository ready to work in | Scaffold Next.js app, lint, formatting, CI, folder structure, theme tokens, MSW, branches, README | Steve (Lennox reviews) | 2 days | App builds and deploys locally; CI passes on a pull request into `develop` |
| F1 Shell and catalogue | Navigable app with data pages | Layout and navigation, auth pages, dashboard, ingredient catalogue and detail, settings, API client, types | Steve; Lennox starts 3D assets and a scene prototype | 1 week | Pages 1 to 4 and 17 work on mocks; typed client covers ingredient and auth endpoints |
| F2 Formulation and nutrition | Build and save a formulation | Formulation list, editor, validation, totals bar, versions, nutrition page, methodology page | Steve; Lennox continues scene objects | 1.5 weeks | A user can create, edit, validate, save and version a formulation and see nutrition results (mock) |
| F3 3D foundation | Scene tied to formulation state | Scene shell in workspace layout, ingredient bins, mixing vessel, picking, camera controls, 2D fallback, selection store | Lennox; Steve supports layout | 1.5 weeks | Changing the formulation changes the scene and numbers from the same state; rotate, zoom, select work on mouse, touch and keyboard |
| F4 Jobs and SSE | Real events drive the scene | Job store, SSE client with reconnect, status timeline, job pages, event-to-scene mapping, mock scenarios | Lennox; Steve builds job pages | 1 week | All seven mock scenarios in section 8 behave correctly; progress never moves without an event |
| F5 Results and optimization | Full workflow on mocks | Texture page, optimization form, candidates, compare, report, models page, candidate preview and cutaway | Both | 2 weeks | The complete journey (create, calculate, predict, optimize, compare, export) works end to end against the mock API |
| F6 Integration and hardening | Prototype on the real backend | Switch to real API, contract tests, fix type differences, accessibility pass, performance benchmark, bug fixes, demo script | Both | 1 to 2 weeks | Section 11 definition of done is met on the real backend and the demo script runs without intervention |

**Hand-over checkpoints**

- End of F0: Steve shares the setup README; Lennox confirms the repository runs on his machine.
- End of F1: shared types and API client are frozen for a review before the scene depends on them.
- End of F4: demo to the project owner on the mock API.
- End of F5: backend integration starts as soon as the backend guide's services are available.
- End of F6: merge `develop` into `main` and tag the prototype release.

## 11. Testing and definition of done

The prototype is done when every row below passes on the real backend, as defined by the technology plan's live-3D acceptance tests.

| Test | Acceptance condition |
| --- | --- |
| Ingredient interaction | Adding or removing an ingredient updates the scene and the visible formulation values from the same validated state |
| Progress truthfulness | A progress bar never advances without a worker event or a measurable completed/total count |
| Warning and failure | A backend warning or failure visibly changes the scene and shows a text explanation |
| Candidate result | A completed candidate can be selected; its ID, formulation, model version and numerical results stay linked |
| Usability | Rotate, zoom and select work with mouse and touch; essential actions have keyboard equivalents |
| Fallback | With WebGL off or reduced motion on, the same workflow works in 2D |
| Performance | Smooth interaction on the agreed baseline device, controls never blocked while a job runs |
| Labelling | Every illustrative 3D feature carries the "Illustrative" label; no page calls the scene a simulation |
| Provenance | Every result shows unit, source or model version and timestamp |

**Automated tests**

- **Unit (Vitest):** unit and moisture-basis helpers, Zod schemas, percentage total logic, store reducers, SSE event ordering and duplicate handling.
- **Component (Testing Library):** formulation table, totals bar, job timeline, provenance chips, error states.
- **End to end (Playwright against mocks, then the real backend):** the full journey in section 10 (F5 exit), job failure, cancel, reload during a running job, 2D fallback.
- **Contract tests:** responses from the real API validated against the Zod schemas in `src/lib/api/`; failures block the pull request.
- **Accessibility:** automated axe checks in CI plus a manual keyboard-only run of the main journey.

**Pull request checklist**

- [ ] Lint, type-check and tests pass in CI
- [ ] Loading, empty and error states handled
- [ ] No result, percentage or status is computed or faked in the UI
- [ ] Units, source and model version visible where a value is shown
- [ ] Keyboard and reduced-motion behaviour checked
- [ ] Screenshot or recording attached for UI changes
