# Virtual Plant-Meat Formulator: Frontend Development Guide

Nov 13, 2026 · @Lennox Wanyela · Status updated Nov 22, 2026

The frontend is a scientific workstation in the browser: a food scientist builds a formulation from indigenous Kenyan crops, runs calculations or optimization, and watches both the numerical results and a live 3D process scene update. This guide takes the frontend from an empty repository to a working prototype, and was written against the *Virtual Plant-Meat Formulator / Technology Plan* (proposed architecture, 12 November 2026).

## Implementation status (22 November 2026)

This guide was written as a plan, before any frontend code existed. All 17 screens now exist in `frontend/` and run against the real backend. Sections 1 to 11 remain the specification, and section 12 specifies the rebuilt 3D scene. Each page in section 5 carries a **Status** line, and other sections carry a **Current state** note where the code differs from the plan. This section is the summary.

| Phase (section 10) | Status | What is left |
| --- | --- | --- |
| F0 Setup | Done | The mock API (MSW) was never added |
| F1 Shell and catalogue | Done | — |
| F2 Formulation and nutrition | Done | — |
| F3 3D foundation | Done | Drag-and-drop bench over `dragStore` with Blender-exported GLB assets. The look-development pass of section 12.14 is still open |
| F4 Jobs and SSE | Done | Touch testing on a real phone and tablet |
| F5 Results and optimization | Done | — |
| F6 Integration and hardening | Done | Manual keyboard-only run of the main journey; touch testing |

**Built differently from the plan**

- **No mock API.** The app talks only to the real backend. There is no `src/mocks/`, MSW is not installed, and `NEXT_PUBLIC_USE_MOCKS` is not read (section 8).
- **Routes.** `/` is a public landing page and the dashboard is at `/dashboard`. `/methodology` is public too, in a `(public)` route group (FE-3).
- **Auth.** Sign-in uses the backend's local auth mode: `POST /api/auth/login` returns a bearer token that the client keeps in `localStorage`. Supabase Auth is not used.
- **Data fetching.** Pages fetch through `hooks/use-api-query.ts`, which is now a thin wrapper over TanStack Query's `useQuery`. Every query key is an array starting with the resource name, so `lib/query/invalidator.tsx` refetches a whole resource by prefix when a job finishes (FE-7).
- **Forms.** All forms use React state. React Hook Form and `@hookform/resolvers` were removed from `package.json` (FE-7).
- **Response validation.** Every function in `src/lib/api/` validates its response through the Zod schemas in `lib/validation/schemas.ts` and throws `ApiError` code `contract_mismatch` on a mismatch; SSE events are validated too (FE-4).
- **Charts.** Six charts exist: the ingredient amino-acid profile, the macronutrient bars, the amino-acid score with a reference line at 1.0, the texture interval chart, the candidate scatter and the compare bars. **They are built with Plotly, not with Recharts as recommended in FE-6.** `recharts` has been removed from `package.json`; every chart keeps a data-table alternative.
- **3D scene.** The scene loads Blender-exported GLB assets with `useGLTF`, with a loading placeholder and an error fallback to the 2D view, and has a pointer-based drag-and-drop bench over `dragStore` (section 12).
- **Candidates and compare** have 3D views: the candidate product appears in the scene with a cutaway offered only when a validated variable backs it, and compare shows two viewports whose cameras are locked together.

**Resolved: the station defect (FE-1)**

`stationStatuses()` in `scene/stations.ts` derives each station's status from the job's type, its terminal status and the real stage names in `jobStore`, so the vessel, analyser, extruder and optimizer now follow a job in the 3D scene, the 2D view and the "Stage status" list. `tests/stations.test.ts` feeds the real stage sequences for all three job types through `jobStore.applyEvent` and asserts each station at every step, including a warning, a failure and a cancellation.

**Fix list**

Section 13 turns the audit's findings into seven pieces of work (FE-1 to FE-7), each with the files involved, the steps and a "done when" check. **All seven are done**: the station defect, the broken landing-page link, the public methodology page, run-time response validation, the scripted job-stream scenarios, the six charts, and the unused libraries — TanStack Query adopted, React Hook Form and Recharts removed.

**Added beyond the plan**

- A public landing page at `/` with a decorative, labelled 3D hero.
- An "Explain this result" panel that calls the backend's explanation endpoints and labels the reply "AI explanation — not a measurement" (backend guide, section 6.7).
- Six colour themes that also restyle the 3D scene.
- Approve and Retire actions for admins on the Models page.
- A "Hide meat, fish and dairy" filter in the catalogue and the ingredient picker.

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

**Assumptions in this guide.** This guide was written before the backend guide, so the endpoints below were the contract the frontend planned to code against, with additions marked *proposed*. The backend guide has since confirmed all of them and the backend implements them, so read *proposed* as *confirmed*. The frontend never used a mock API; it was built directly against the real backend (section 8).

## 2. Tech stack and project structure

The frontend uses the stack chosen in the technology plan. Versions are set in `package.json` with a committed lockfile; recheck library compatibility before upgrading.

| Area | Choice | Used for | State |
| --- | --- | --- | --- |
| Framework | Next.js 16 (App Router) + React 19 + TypeScript | Routing, layouts, type-safe pages | In use |
| Styling | Tailwind CSS 4 + shadcn/ui | Forms, tables, dialogs, dashboard controls | In use |
| 3D | Three.js via React Three Fiber, `@react-three/drei` | Scene, camera controls, loaders, picking | In use |
| 3D assets | Blender, exported as GLB/glTF | Ingredient bins, mixer, extruder, candidate model | Not used yet: objects are generated in code. The asset kit to build is specified in section 12.8 |
| Shared state | Zustand | Formulation, job and selected-object state | In use |
| UI motion | Motion for React | Panel, badge and status transitions | In use |
| Themes | `next-themes` with CSS tokens | Six themes for the interface and the scene | In use (added) |
| Charts | Plotly.js | Nutrition, amino-acid, texture, trade-off charts | Done — six charts through `components/charts/plotly-chart.tsx`; `recharts` removed |
| Server data | TanStack Query | Caching and refetching REST data | Done — `use-api-query.ts` wraps `useQuery`, keys are resource-prefixed arrays |
| Forms and validation | React state + Zod | Formulation editor, mirrored backend rules | Done — React Hook Form removed; every API response is validated by a Zod schema |
| Mocking | MSW (recommended addition) | Fake REST and SSE until the backend exists | Not installed; no longer needed for daily work |
| Testing | Vitest, Testing Library, Playwright | Unit, component and end-to-end tests | Unit and end-to-end tests in use; no real component tests |
| Tooling | ESLint, Prettier, Husky, GitHub Actions | Quality gates on every pull request | In use. The pre-commit hook runs Prettier only |

TanStack Query, React Hook Form, Zod and MSW are not in the technology plan; they are suggested here because they reduce hand-written plumbing. *Resolved: TanStack Query and Zod are adopted, React Hook Form and Recharts are removed, and Plotly is the chart library.*

Next.js 16 differs from earlier versions in ways that matter when writing code. `frontend/AGENTS.md` points to the bundled documentation in `node_modules/next/dist/docs/`; read the relevant page before using an unfamiliar API.

**Folder structure (as built)**

```text
frontend/
  src/
    app/                      # Next.js routes (see section 4)
      page.tsx                # public landing page
      (auth)/login/
      (workspace)/            # everything behind sign-in
        dashboard/
        ingredients/ ingredients/[id]/
        formulations/ formulations/[id]/   # layout.tsx keeps the scene mounted
        jobs/ jobs/[id]/
        compare/ models/ methodology/ settings/
    components/
      ui/                     # shadcn/ui primitives
      layout/                 # sidebar, top bar, backend status
      auth/                   # auth provider and guard, login form
      landing/                # landing page sections
      formulation/            # editor, ingredient picker, session, tabs
      workspace/              # nutrition, texture, optimize, candidates, versions, report tabs
      results/                # nutrition and texture result tables
      jobs/                   # job list, detail, progress timeline, status chip
      candidates/             # compare view
      models/                 # model registry, approved-models table
      assistant/              # "Explain this result" panel
      settings/ theme/
    scene/                    # everything 3D (Lennox's area)
      WorkspaceScene.tsx      # shell: badge, controls, keyboard list, announcer
      SceneCanvas.tsx SceneLabels.tsx SceneErrorBoundary.tsx
      stations.ts             # station list and layout
      objects/                # IngredientBin, IngredientFlow, MixingVessel, ProcessLine, CandidateProduct
      hooks/                  # useSceneEnvironment (WebGL, motion, 3D or 2D)
      theme/                  # scene colours read from CSS tokens
      assets/                 # empty; no GLB files yet
      fallback/               # Workspace2D
    hooks/                    # use-api-query, use-debounced-value, ...
    lib/
      api/                    # typed REST client, one file per resource
      sse/                    # EventSource client with reconnect
      jobs/                   # job runner (starts a job, wires the stream to the store)
      query/                  # TanStack Query provider and invalidator
      validation/             # local formulation checks; Zod schemas
      units.ts                # unit helpers (tested, not yet used by any page)
    stores/                   # Zustand stores
    types/                    # shared TypeScript contracts (section 6)
  public/
  tests/                      # Vitest unit tests
    e2e/                      # Playwright, against the real backend
```

**Environment variables**

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | Base URL of the FastAPI service. It is embedded at build time, so rebuild after changing it. This is the only variable the app reads |
| `E2E_API_URL`, `E2E_EMAIL`, `E2E_PASSWORD`, `E2E_BASE_URL` | Read by the Playwright tests only |
| `NEXT_PUBLIC_USE_MOCKS` | Planned for the mock API; not read by any code |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Only if Supabase Auth is adopted; not read by any code today |

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

| # | Route | Page | Owner | Phase | Status (22 Nov 2026) |
| --- | --- | --- | --- | --- | --- |
| 1 | `/login` | Sign in | Steve | F1 | Done |
| 2 | `/dashboard` (planned as `/`) | Dashboard | Steve | F1 | Done |
| 3 | `/ingredients` | Ingredient catalogue | Steve | F1 | Done |
| 4 | `/ingredients/[id]` | Ingredient detail and provenance | Steve | F1 | Done |
| 5 | `/formulations` | Formulation list and "new formulation" | Steve | F2 | Done |
| 6 | `/formulations/[id]` | Workspace: editor + live 3D scene | Both | F2, F3 | Done |
| 7 | `/formulations/[id]/nutrition` | Nutrition and amino-acid results | Steve | F2 | Done |
| 8 | `/formulations/[id]/texture` | Texture prediction results | Steve | F5 | Done |
| 9 | `/formulations/[id]/optimize` | Optimization setup and run | Both | F5 | Done |
| 10 | `/formulations/[id]/candidates` | Candidate list and 3D preview | Both | F5 | Done |
| 11 | `/compare?ids=a,b` | Side-by-side candidate comparison | Both | F5 | Done |
| 12 | `/formulations/[id]/versions` | Saved versions and diff | Steve | F2 | Done |
| 13 | `/formulations/[id]/report` | Formulation summary and download | Steve | F5 | Done |
| 14 | `/jobs` and `/jobs/[id]` | Job history and job detail timeline | Lennox | F4 | Done |
| 15 | `/models` | Model registry (versions, metrics, limits) | Steve | F5 | Done |
| 16 | `/methodology` | Data sources, method notes, labelling rules | Steve | F2 | Done |
| 17 | `/settings` | Units, reduced motion, force 2D mode | Steve | F1 | Done |
| — | `/` | Public landing page (added) | — | — | Done |

Section 5 gives the detail behind each status.

Pages 6 to 10, 12 and 13 sit under the shared workspace layout (`formulations/[id]/layout.tsx`), which renders the 3D scene or its 2D fallback on one side and the active tab on the other. The scene stays mounted while the user switches tabs. Compare (page 11) is a separate top-level route.

**Navigation**

- **Left sidebar:** Dashboard, Formulations, Ingredients, Jobs, Models, Methodology.
- **Top bar:** current formulation name and version, job status chip (idle, running, failed, complete), user menu, settings.
- **Workspace tab bar:** Editor, Nutrition, Texture, Optimize, Candidates, Versions, Report.
- **Mobile and tablet:** sidebar collapses to a menu; the 3D scene collapses above the tab content and can be switched to the 2D view.
- **Route protection:** every route except `/login` and `/methodology` requires a signed-in user; unauthenticated requests redirect to `/login?next=<path>`.

**Current state**

- **Sidebar:** Dashboard, Workspace (the formulation list), Ingredients, Compare, Jobs, Models and Methodology, with Settings pinned at the bottom. Below the large breakpoint it becomes a menu opened from the top bar.
- **Top bar:** job status chip, theme switcher, the user's name and role, and a Sign out button. The formulation name and version are shown in the editor header, not the top bar, and there is no user menu.
- **Tab bar:** as planned, in the order Editor, Nutrition, Texture, Optimize, Candidates, Report, Versions.
- **Route protection:** done in the browser by `AuthGuard` in `components/auth/auth-provider.tsx`, which wraps the whole `(workspace)` group and redirects to `/login?next=<path>`. Any later `401` clears the token and redirects again. There is no server-side middleware.
- **Public routes** are `/` and `/login`. `/methodology` currently requires sign-in because it sits inside the `(workspace)` group, although the landing page links to it.
- **Broken link:** the landing page footer links to `/formulations/demo`, which does not exist.

## 5. Page-by-page specifications

Each page lists its purpose, main components, the endpoints it calls (full contracts in section 6), the states it must handle and a "done when" check. Every page must implement loading, empty and error states; they are not repeated below unless specific.

### Page 1: Sign in (`/login`)

- **Purpose:** authenticate the scientist and return them to the page they asked for.
- **Components:** email and password form, error banner, link to `/methodology`.
- **Endpoints:** `POST /api/auth/login`, `GET /api/auth/me` (both *proposed*; replaced by the Supabase client if Supabase Auth is chosen).
- **States:** invalid credentials (inline message, no field hints that reveal which part was wrong), locked or expired session, network failure.
- **Done when:** a valid login lands on `next` or `/`; protected routes redirect when signed out.
- **Status: done.** The form calls `POST /api/auth/login`, stores the token, and the guard confirms it with `GET /api/auth/me`. A valid login lands on a checked `next` path or `/dashboard`. There is no link to `/methodology` on the page.

### Page 2: Dashboard (`/`)

- **Purpose:** show where the user left off.
- **Components:** recent formulations (name, version, last result), running and recent jobs with status chips, quick actions (New formulation, Browse ingredients), data-quality notice if any catalogue rows are flagged.
- **Endpoints:** `GET /api/formulations?limit=5`, `GET /api/jobs?limit=5&status=running,failed,completed`.
- **States:** first-time user with no formulations shows a single "Create your first formulation" call to action.
- **Done when:** clicking a recent item opens the correct workspace or job.
- **Status: done.** Built: quick actions, recent formulations with the first-time empty state, a backend status indicator, a "Trust rules" card, the running and recent jobs panel (five rows with a status chip and a link to `/jobs/[id]`), and a data-quality notice that counts the catalogue rows flagged as estimated and links to the catalogue.

### Page 3: Ingredient catalogue (`/ingredients`)

- **Purpose:** browse and filter the curated ingredient records that formulations are built from.
- **Components:** search box, filters (crop, ingredient form such as raw, cooked, soaked, fermented, roasted, flour; data source; analytical or estimated), sortable table with data-quality badges, pagination.
- **Endpoints:** `GET /api/ingredients?q=&crop=&form=&source=&page=&page_size=`.
- **States:** no results (offer to clear filters); missing data shown explicitly as "not reported", never as zero.
- **Done when:** filters and search are reflected in the URL so a filtered view can be shared.
- **Status: done.** Built: debounced search; form, crop, data-source and analytical/estimated filters fed by `GET /api/ingredients/facets`; a "Hide meat, fish and dairy" toggle; quality and amino-acid badges; sortable ingredient and protein columns; and Previous/Next paging. `q`, `crop`, `form`, `source`, `flag`, `sort` and `page` are reflected in the URL, so a filtered view can be shared and restored on reload.

### Page 4: Ingredient detail (`/ingredients/[id]`)

- **Purpose:** show every value with its provenance so the user can judge it.
- **Components:** header (scientific and common name, variety, form, origin, moisture basis), nutrient table with unit, analytical or estimated flag and range, amino-acid profile chart, source card (original source, method, date, license or permission status), "Add to formulation" button.
- **Endpoints:** `GET /api/ingredients/{id}`.
- **States:** incomplete amino-acid profile shows which acids are missing and warns that amino-acid scores will be partial.
- **Done when:** every number on the page has a visible unit and source.
- **Status: done.** Built: the header badges; nutrient and amino-acid tables with value, unit, range (an explicit dash when the source reports none) and flag; an amino-acid profile chart; an "Add to formulation" picker that lists the user's formulations, adds the ingredient at 0% to the chosen draft and routes to its workspace; and a warning that names every amino acid with no reported value and states that the score will be partial.

### Page 5: Formulation list (`/formulations`)

- **Purpose:** list, search, create, duplicate and archive formulations.
- **Components:** table (name, current version, status, last job result, updated), "New formulation" dialog (name, description, optional template), row actions.
- **Endpoints:** `GET /api/formulations`, `POST /api/formulations`.
- **States:** creation failure keeps the dialog open with the server message.
- **Done when:** creating a formulation routes straight to its workspace.
- **Status: done.** Built: the table with search, status/type/formulation filters, paging and a "Show archived" toggle; a create dialog with name, description and an optional "Start from" template; and per-row Duplicate (which routes to the copy) and Archive (behind a confirmation, with Restore). A creation failure keeps the dialog open with the server message.

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
- **Status: done.**
  - Built: the ingredient picker, percentage inputs and totals bar; a debounced `POST /validate` (300 ms) whose stale replies are dropped, with the scene rendering only the validated snapshot; Save with `base_version`, disabled while the draft is invalid or unchanged; a `version_conflict` banner with "Reload latest"; an "Unsaved changes" badge; a Targets panel (protein, key amino acids, cost ceiling) saved on the formulation's `targets` and pre-filled into the Optimize tab; Run nutrition, Predict texture, Optimize (which routes to the optimize tab) and Cancel; results shown inline with an Explain panel.
  - Also built: leaving with unsaved edits is confirmed both on `beforeunload` and on in-app navigation; a queued or running job is re-attached on load (the job store is rebuilt from `GET /api/jobs/{id}` and the SSE stream is reopened, not reset); and ingredients can be added, removed and re-percentaged by dragging them in the scene, in 3D and in 2D (section 12).
  - "A job's real events change the scene" now holds: the stations follow the job's stages (FE-1, section 7).

### Page 7: Nutrition and amino acids (`/formulations/[id]/nutrition`)

- **Purpose:** show deterministic composition results calculated from source data (a weighted mixture, not an AI prediction).
- **Components:** nutrient table (per 100 g, with moisture basis shown), macronutrient chart, individual amino-acid table and chart, amino-acid score against the stated reference pattern with the **limiting amino acid** highlighted, missing-data list, provenance and calculation-version footer.
- **Endpoints:** `GET /api/formulations/{id}/nutrition` (*proposed*), or the result of a nutrition job via `GET /api/jobs/{job_id}/result`.
- **Rules:** do not label any score as DIAAS unless the response says amino-acid-specific ileal digestibility data was used. Show "not calculable" with the reason when ingredient data is missing.
- **Done when:** results update after a nutrition job completes and every value shows its unit and basis.
- **Status: done.** Built: the nutrient table (missing values shown as "missing" with a count of ingredients lacking a value), the macronutrient bar chart, the amino-acid score summary with the limiting amino acid and reference pattern, the amino-acid table per gram of protein, the amino-acid score chart with a reference line at 1.0, and a provenance footer with the calculation version, job, time and formulation version. Every chart keeps a data-table alternative. "DIAAS" is never used to label a score — the chart states "a pattern score, not DIAAS", and the end-to-end test checks that the disclaimer is present.

### Page 8: Texture prediction (`/formulations/[id]/texture`)

- **Purpose:** show learned predictions of hardness, chewiness, springiness, G′, G″, viscosity, water-holding capacity and anisotropy.
- **Components:** prediction cards with value and uncertainty interval, bar or whisker chart, model badge (name, version, training-set size, holdout metric), limitations notice, "Illustrative" tag on any 3D representation.
- **Endpoints:** `POST /api/formulations/{id}/jobs` with type `texture_prediction`, then the job endpoints; `GET /api/jobs/{job_id}/result`.
- **Rules:** never show a prediction without its model version. If the backend flags the input as outside the training range, show a clear warning instead of a confident number.
- **Done when:** a completed job shows predictions with intervals and the model version.
- **Status: done.** Built: a process form (moisture, screw speed, feed rate), target checkboxes for hardness and chewiness (the only targets with a backend model), prediction cards with value, interval and model, a whisker chart of each target with its interval, a link to the Models page, and the "Texture model unavailable" state. For an out-of-domain input the backend returns no number, so the page shows the reasons and the nearest published samples instead. Still open: temperature-profile and cooling inputs.

### Page 9: Optimization (`/formulations/[id]/optimize`)

- **Purpose:** let the user set objectives and constraints, run a search and review trade-offs.
- **Components:** constraint form (ingredient bounds, total 100 percent, nutrient minimums, cost ceiling, safety or availability exclusions), objective selector (nutrition, texture, cost), "Run optimization" button, live job timeline, scatter chart of candidates (Pareto view when the backend returns it), "Send to candidates" action.
- **Endpoints:** `POST /api/formulations/{id}/jobs` with type `optimization` and a `params` object, job endpoints, `GET /api/formulations/{id}/candidates`.
- **States:** infeasible constraints show the backend's explanation; cancel supported only where the worker reports support.
- **Done when:** candidate cards appear as the worker emits `candidate.ready` events and match the stored results.
- **Status: done.** Built: objectives (protein, cost, amino-acid score, hardness, chewiness; maximize, minimize or target), per-ingredient bounds and exclusions, nutrient minimums and maximums, a cost ceiling, the process block, candidate count, seed and out-of-domain policy, the Run button, a live timeline with Cancel, an infeasible state that lists the violated constraints, the saved targets from the editor as the starting point, and a candidate scatter with the Pareto candidates marked. On completion the page links to the Candidates tab.

### Page 10: Candidates and 3D preview (`/formulations/[id]/candidates`)

- **Purpose:** inspect and select candidate formulations.
- **Components:** candidate cards (ID, key metrics, model version, cost), selection checkboxes (max 2 for compare), "Preview in 3D" that switches the scene to that candidate, cutaway or fibre-pattern toggle when the candidate carries a defined variable for it, "Promote to formulation" action.
- **Endpoints:** `GET /api/formulations/{id}/candidates`, `GET /api/candidates/{candidate_id}`, `POST /api/candidates/{candidate_id}/promote` (*proposed*).
- **Done when:** selecting a candidate changes the scene and the side panel, and its ID, formulation, model version and results stay linked.
- **Status: done.** Built, as a table with expandable rows: key metrics, filters by job and Pareto-only, selection of at most two with a Compare action, Promote to formulation, badges for "Illustrative visual", "Out of domain" and "From cancelled job", an Explain panel, and a "Preview in 3D" action that selects the candidate for the scene. The scene shows the selected candidate, and the cutaway is offered only when the candidate carries a variable a calibrated model actually validated.

### Page 11: Compare (`/compare?ids=a,b`)

- **Purpose:** compare two candidates. Comparison against a reference product is out of scope for the prototype (backend guide, section 14).
- **Components:** two scene viewports (or one with a switch), numerical side panel with differences highlighted, grouped bar or radar chart (Plotly), shared camera lock toggle.
- **Endpoints:** `GET /api/compare?ids=a,b` (*proposed*).
- **Done when:** numerical values remain visible beside the 3D views at all times.
- **Status: done.** Built: exactly two different candidate IDs are required; two candidate columns and a differences table (A, B and delta); a grouped bar chart per metric; and two 3D viewports whose cameras are locked together, so orbiting one orbits both.

### Page 12: Versions (`/formulations/[id]/versions`)

- **Purpose:** show saved versions and what changed between them.
- **Components:** version list (number, author, timestamp, note), diff view (added, removed and changed ingredients and percentages), "Restore as new version" action.
- **Endpoints:** `GET /api/formulations/{id}/versions`, `GET /api/formulations/{id}/versions/{version}` (*proposed*).
- **Done when:** restoring creates a new version and never overwrites history.
- **Status: done.** Built: the version list (number, author, time, note, content hash), a viewer for one version's lines, a diff between any two versions (added, removed and changed ingredients with old → new percentages, in colour with an icon and a text label), and "Restore as new version" with a confirmation dialog, `base_version` and conflict handling.

### Page 13: Report (`/formulations/[id]/report`)

- **Purpose:** produce the downloadable formulation summary.
- **Components:** on-screen preview (formulation, nutrition, texture predictions with uncertainty, data sources, model version, audit trail) and a download button.
- **Endpoints:** `GET /api/formulations/{id}/export?format=pdf|csv` (confirmed: PDF and CSV).
- **Done when:** the downloaded file matches the on-screen values.
- **Status: done.** The preview shows the lines, nutrition summary, amino-acid score and texture summary for a chosen version. Downloads use an authenticated `fetch` and a blob, because a plain link cannot send the bearer token.

### Page 14: Jobs (`/jobs`, `/jobs/[id]`)

- **Purpose:** audit and re-open runs.
- **Components:** job table (ID, type, formulation, status, started, duration), detail page with the full stage timeline, event log, result link and failure message, "Re-attach to live stream" when still running.
- **Endpoints:** `GET /api/jobs`, `GET /api/jobs/{job_id}`, `GET /api/jobs/{job_id}/events`, `POST /api/jobs/{job_id}/cancel`.
- **Done when:** a job started in another tab or device can be opened and followed live.
- **Status: done.** Built: a paged job table (ID, type, formulation, status, created, finished, duration) with status, type and formulation filters kept in the URL, and a detail page with the live stage timeline, the event log from the stored events, a link to the result tab, a Cancel action and "Re-attach to live stream". A queued or running job is re-attached automatically on load, so a job started in another tab or device can be opened and followed live.

### Page 15: Models (`/models`)

- **Purpose:** make model provenance visible.
- **Components:** model list (target, algorithm, version, training-set size, holdout metric, date), detail drawer with limitations and the dataset version used.
- **Endpoints:** `GET /api/models`, `GET /api/models/{id}` (both *proposed*).
- **Done when:** the model version on any result links to its entry here.
- **Status: done.** One card per model with status, holdout metric, training-set size, dataset version and limitations, plus an Explain panel. Added: admins get Approve and Retire buttons with a confirmation dialog. There is no screen for starting a training job; that goes through the API or the command line (backend guide, section 10).

### Page 16: Methodology (`/methodology`)

- **Purpose:** public explanation of data sources, the weighted-mixture calculation, amino-acid scoring, what the 3D scene is and is not, and licensing notes for data sources.
- **Content:** static, authored in the repository; no endpoint required. Must repeat the labelling rule: the 3D scene is illustrative and not a molecular or mechanical simulation.
- **Status: done.** Sections cover data sources, nutrition, amino-acid scoring (stated as not DIAAS), texture models, optimization and AI explanations, with a live table of approved models from `GET /api/models` (or a sign-in prompt when there is no session). The page is public in a `(public)` route group and carries the labelling rule for the 3D scene.

### Page 17: Settings (`/settings`)

- **Purpose:** personal preferences.
- **Components:** unit preferences, reduced-motion toggle, "always use 2D view" toggle, theme. Stored locally; synced to the account only if the backend adds a preferences endpoint.
- **Done when:** the reduced-motion and 2D preferences take effect immediately and persist after reload.
- **Status: done.** Built: a theme picker with six themes; process view (Automatic, Always 3D, Always 2D); motion (Follow system, Reduce, Full); and display units — amino acids mg or g, energy kcal or kJ, protein g per 100 g or percent of mass. The units are applied in the nutrition, ingredient-detail and report views through `lib/units.ts`; only the display changes, and the values sent to and stored from the backend stay canonical. Preferences are kept in `localStorage`.

## 6. Endpoint reference and data contracts

All endpoints are under `NEXT_PUBLIC_API_BASE_URL`. Requests and responses are JSON unless stated. Rows marked **Plan** are in the technology plan; rows marked **Proposed** were added by this guide.

**Current state.** Every row below is confirmed in the backend guide (section 6) and implemented by the backend. The backend's `/openapi.json` is now the authoritative contract. The typed client in `src/lib/api/` covers all of these plus the endpoints the backend guide added afterwards:

| Group | Method and path | Purpose | Used by the UI |
| --- | --- | --- | --- |
| Jobs | `POST /api/jobs/{job_id}/stream-token` | Short-lived token for the event stream | Yes |
| Ingredients | `GET /api/ingredients/facets` | Filter options with counts | Yes |
| Ingredients | `GET /api/nutrients` | Nutrient definitions | Yes (Optimize tab) |
| Ingredients | `GET /api/amino-acid-patterns` | Scoring patterns | No |
| Formulations | `PATCH /api/formulations/{id}` | Rename or archive | Yes |
| Formulations | `POST /api/formulations/{id}/duplicate` | Copy a formulation | Yes |
| Formulations | `POST /api/formulations/{id}/versions/{version}/restore` | Restore as a new version | Yes |
| Models | `POST /api/admin/models/{id}/approve`, `.../retire` | Model lifecycle (admin) | Yes |
| Models | `POST /api/admin/models/train` | Start a training job (admin) | No |
| Explanations | `GET /api/assistant/status`; `POST /api/jobs/{job_id}/explain`, `/api/candidates/{candidate_id}/explain`, `/api/models/{id}/explain` | Plain-language explanation of a stored result | Yes |

The original table follows.

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

**Current state.** There is one typed function per endpoint, and errors become an `ApiError` carrying the status, code, details and request ID. The bearer token is kept in memory and in `localStorage` (`lib/api/token.ts`) and attached to every request; a `401` clears it. One convention is not met: responses are cast to their TypeScript types, not validated. The Zod schemas in `lib/validation/schemas.ts` are ready but nothing calls them outside a unit test, so a backend change that breaks the contract would surface as a display bug instead of a clear error.

**Core TypeScript contracts (`src/types/`)**

The block below is the original starting point. The live contracts are in `src/types/index.ts`, which has since grown to cover the backend's additions: the `"calculated"` flag and missing-data fields on `NutrientValue`; `seq`, `completed`, `total` and `details` on `JobEvent`; and types for job status, candidates, comparison, nutrition and texture results, model detail and paging. Treat the file as the source of truth.

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

**Open points, now settled in the backend guide:**

| Open point | Decision |
| --- | --- |
| SSE event names | The eight names in `JobEventName` above |
| Authentication for the SSE stream | A short-lived, single-use token from `POST /api/jobs/{job_id}/stream-token`, passed as `?token=` |
| Optimization `params` schema | Fixed in the backend guide, section 6.4 |
| Export formats | `pdf` and `csv` |

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

**Current state of the SSE client** (`lib/sse/jobEventSource.ts`, driven by `lib/jobs/job-runner.ts`). All of the requirements above are met, with a different shape:

- The entry point is `openJobEventStream(jobId, { onEvent, onError, onOpen, lastSeq })`, which returns `{ close }`. Connection state (idle, connecting, open, reconnecting, closed) lives in `jobStore.connection`.
- Before every connection, including reconnects, it requests a fresh token from `POST /api/jobs/{job_id}/stream-token` and connects with `?token=` and `?after_seq=<last seq>`.
- It reconnects with exponential backoff from 500 ms up to 15 s. On an error it first reads `GET /api/jobs/{job_id}`; if the job has finished it replays any missed events once and stops.
- Stale and duplicate events are dropped by `seq`, not by timestamp, both in the client and in `jobStore`. Nothing is applied after a terminal event, and the stream closes on one.

**Scene rules**

- Animation timing is decorative only. A stage, completion state or percentage must come from an event, never from a timer or `useFrame` counter.
- The scene must be reproducible from a formulation ID and a result payload; no scene-only state that cannot be rebuilt.
- Label any density, fibrousness, colour or cutaway as **Illustrative** unless the result payload says it derives from a validated model.
- Interaction: orbit, zoom and pan with mouse and touch; click or tap to select (Three.js raycasting through React Three Fiber events); camera reset button; every selectable object reachable by keyboard (Tab to move, Enter to inspect) through a mirrored list of controls outside the canvas.
- Assets: GLB files from Blender, loaded with `useGLTF`, compressed, with a loading placeholder and an error fallback to the 2D view.

**Current state of the scene**

Section 12 is the specification for the rebuilt scene; the rules in this section still govern it. The rows below now describe the current build.

| Item | State |
| --- | --- |
| Objects | Built: `IngredientBin`, `IngredientFlow` (pour-in), `MixingVessel`, `ProcessLine` (stations with status beacons) and `CandidateProduct`, all loading Blender-exported GLB assets from `public/scene/assets/` through `SceneModel` (`useGLTF`), with a placeholder while loading and an error fallback to 2D |
| Loading | Built: `next/dynamic` without SSR, a skeleton while loading, and an error boundary that falls back to the 2D view |
| Formulation to scene | Built: the scene renders only the validated snapshot from `formulationStore` |
| Job events to scene | Built: stations follow the job's stages, and the pour and belt animations are driven by the store, never by a timer |
| Candidate in the scene | Built: the selected candidate is shown from `selectionStore`, with a cutaway and fibre layer offered only when the candidate carries a variable a calibrated model validated |
| "Illustrative" label | Built: a badge with a tooltip stating that the scene is not a physical, molecular or mechanical simulation |
| Interaction | Built: orbit, zoom and camera reset, click-to-select, and a pointer-based drag-and-drop bench (`dragStore`) with click-to-place and keyboard alternatives, in 3D and in the 2D view |
| Keyboard and screen readers | Built: a list of scene objects with Inspect buttons outside the canvas, a details panel, a stage-status list, and an `aria-live` announcer. The canvas itself is hidden from assistive technology |
| Themes | Built: scene colours follow the active theme through CSS tokens |
| Timers | The belt and vessel loop while a job is queued or running and stop when it ends. This is decorative motion only; no stage, completion state or percentage comes from a timer |

**Resolved (FE-1): stations follow stages.** `stationStatuses()` in `scene/stations.ts` derives each station's status from the active job's type and its current stage status in `jobStore` — `mixing` follows `validating`, and the station whose ID equals `jobType` is active, warns, then ends complete, failed or cancelled. `ProcessLine`, `SceneLabels`, `Workspace2D`, `WorkspaceScene` and `SceneCanvas` all read that one function instead of `stages[station.id]`, so station colours, beacons and the "Stage status" list follow the job. `tests/stations.test.ts` feeds the real stage sequences for all three job types through `jobStore.applyEvent` and asserts each station at every step, including a warning, a failure and a cancellation.

The scene no longer has HTML5 drop targets with no drag source: section 12.3's pointer-based drag layer replaced them, and `selectionStore.selectCandidate` is now set by the candidates tab's "Preview in 3D". Still to finish: the legacy `connect()` and `disconnect()` helpers in the SSE file, and `comparePair`, which no screen sets.

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

**Current state**

| State | Where it lives now |
| --- | --- |
| Server data | Fetched by `hooks/use-api-query.ts` over TanStack Query's `useQuery`, keyed by resource-prefixed arrays. The job-completion invalidator in `lib/query/invalidator.tsx` and `useInvalidateResource()` after save, restore, promote, approve and retire refetch by prefix |
| Formulation draft and validation | `formulationStore`: the draft, saved lines, version, the validated snapshot the scene renders, and a revision counter used to drop stale validation replies |
| Job | `jobStore`: active job and type, status, stage statuses and labels, measured progress, warnings, candidate IDs, events, last `seq` and connection state. Written by the job runner and the SSE client |
| Results (added) | `resultStore`: the latest nutrition and texture results with their version and job |
| Selection | `selectionStore`: the selected ingredient is used by the editor and the scene, and the selected candidate is set by the candidates tab's "Preview in 3D". `comparePair` is still unused |
| Preferences | `preferencesStore`: view mode, motion and display units (amino acids mg/g, energy kcal/kJ, protein g per 100 g or %), persisted in `localStorage`; the browser's reduced-motion setting is respected unless the user overrides it |
| Scene (added) | `sceneStore`: the camera-reset signal only |

**Mock API (so frontend work never waits for the backend)**

*Not built, and no longer needed for its original purpose: the backend arrived early, so the frontend was written against the real API. The seven scenarios below are still worth having as automated tests of the job store and the scene, because several of them (a dropped connection, an out-of-order event, a failure) are hard to produce on demand with a real backend. Today only `tests/jobStore.test.ts` covers event ordering, duplicates and terminal states, by calling the store directly.*

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

When the backend guide is delivered, switch the flag off, run the contract tests against the real service, and fix any differences in `src/types/` and `src/lib/api/` only. *The switch has effectively happened; the contract tests have not been written.*

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

**Current state of this section**

| Topic | State |
| --- | --- |
| Values in tables and charts | Tables only. No chart exists yet, so the "data-table alternative" rule is met by default and the charts themselves are outstanding |
| Units, source, missing data | Built on the result pages; missing values are shown as missing, never as zero |
| Themes | Six themes (two neutral, four coloured) from one token file, `app/globals.css`; this goes beyond the "light and dark if time allows" plan |
| Scene accessibility | Built: controls beside the canvas, an `aria-live` announcer, reduced-motion handling |
| WCAG 2.2 AA | Not verified: no automated axe check and no recorded keyboard-only run |
| 2D fallback | Built. It is used when WebGL is unavailable, when the user chooses "Always 2D", when reduced motion is on in automatic mode, or when the 3D scene crashes. There is no device performance check |
| Performance | The scene is lazy-loaded. No baseline device has been agreed and nothing has been benchmarked |

## 10. Phased plan to a working prototype

The frontend reaches a working prototype at the end of F5 against the mock API, and a demo-ready prototype at the end of F6 against the real backend. Durations are rough estimates for two developers and should be adjusted once capacity is confirmed. Phases F2 and F3 map to technology-plan phase 1; F4 to phase 3; F5 to phases 4 and 5.

The plan assumed mocks first and the real backend last. In practice the backend was ready early, so every phase was built directly on the real API and "on mocks" in the exit conditions below should be read as "on the real backend".

| Phase | Goal | Work | Owner | Est. | Exit condition | Status (22 Nov 2026) |
| --- | --- | --- | --- | --- | --- | --- |
| F0 Setup | Repository ready to work in | Scaffold Next.js app, lint, formatting, CI, folder structure, theme tokens, MSW, branches, README | Steve (Lennox reviews) | 2 days | App builds and deploys locally; CI passes on a pull request into `develop` | **Done**, without MSW |
| F1 Shell and catalogue | Navigable app with data pages | Layout and navigation, auth pages, dashboard, ingredient catalogue and detail, settings, API client, types | Steve; Lennox starts 3D assets and a scene prototype | 1 week | Pages 1 to 4 and 17 work on mocks; typed client covers ingredient and auth endpoints | **Done.** The pages work and the client covers every endpoint |
| F2 Formulation and nutrition | Build and save a formulation | Formulation list, editor, validation, totals bar, versions, nutrition page, methodology page | Steve; Lennox continues scene objects | 1.5 weeks | A user can create, edit, validate, save and version a formulation and see nutrition results (mock) | **Exit condition met** on the real backend, and covered by the end-to-end test. Gaps: templates, duplicate, archive, targets panel, version diff, charts |
| F3 3D foundation | Scene tied to formulation state | Scene shell in workspace layout, ingredient bins, mixing vessel, picking, camera controls, 2D fallback, selection store | Lennox; Steve supports layout | 1.5 weeks | Changing the formulation changes the scene and numbers from the same state; rotate, zoom, select work on mouse, touch and keyboard | **Done.** The scene loads Blender GLBs, is driven by the validated store, and the drag-and-drop bench of sections 12.3 and 12.13 stages 1 to 4 is built. The look-development pass of 12.14 is still open |
| F4 Jobs and SSE | Real events drive the scene | Job store, SSE client with reconnect, status timeline, job pages, event-to-scene mapping, mock scenarios | Lennox; Steve builds job pages | 1 week | All seven mock scenarios in section 8 behave correctly; progress never moves without an event | **Done.** Built: job store, SSE client with reconnect, timeline, job pages, the station mapping (FE-1) and the scripted scenarios (FE-5). The job detail page re-attaches on load. Progress never moves without an event |
| F5 Results and optimization | Full workflow on mocks | Texture page, optimization form, candidates, compare, report, models page, candidate preview and cutaway | Both | 2 weeks | The complete journey (create, calculate, predict, optimize, compare, export) works end to end against the mock API | **Done.** Every page exists, all six charts are built, and the candidate preview with its validated-variable cutaway and the compare viewports with a locked camera are in place. The whole journey runs unattended in `tests/e2e/demo.spec.ts` |
| F6 Integration and hardening | Prototype on the real backend | Switch to real API, contract tests, fix type differences, accessibility pass, performance benchmark, bug fixes, demo script | Both | 1 to 2 weeks | Section 11 definition of done is met on the real backend and the demo script runs without intervention | **Done.** Contract tests, run-time response validation, the axe accessibility gate on every main page, component tests, the performance monitor with its step-down ladder, and `tests/e2e/demo.spec.ts` all exist and run against the real backend. Still open: the manual keyboard-only and touch runs |

**Hand-over checkpoints**

- End of F0: Steve shares the setup README; Lennox confirms the repository runs on his machine.
- End of F1: shared types and API client are frozen for a review before the scene depends on them.
- End of F4: demo to the project owner on the mock API.
- End of F5: backend integration starts as soon as the backend guide's services are available.
- End of F6: merge `develop` into `main` and tag the prototype release.

## 11. Testing and definition of done

The prototype is done when every row below passes on the real backend, as defined by the technology plan's live-3D acceptance tests.

| Test | Acceptance condition | Status (22 Nov 2026) |
| --- | --- | --- |
| Ingredient interaction | Adding or removing an ingredient updates the scene and the visible formulation values from the same validated state | Met |
| Progress truthfulness | A progress bar never advances without a worker event or a measurable completed/total count | Met; covered by `tests/jobStore.test.ts` |
| Warning and failure | A backend warning or failure visibly changes the scene and shows a text explanation | Met — the stations follow the job's stages (FE-1) and the warning message is shown as text |
| Candidate result | A completed candidate can be selected; its ID, formulation, model version and numerical results stay linked | Met — selecting a candidate changes the scene, and the ID, model version and results stay linked |
| Usability | Rotate, zoom and select work with mouse and touch; essential actions have keyboard equivalents | Mouse and keyboard: met. Touch: still to be tested on a real phone and tablet |
| Fallback | With WebGL off or reduced motion on, the same workflow works in 2D | Met |
| Performance | Smooth interaction on the agreed baseline device, controls never blocked while a job runs | Partly — on-demand rendering, a DPR cap, a performance monitor with a step-down ladder, and frame timings recorded by `tests/e2e/demo.spec.ts` (60 fps median, ~17 ms p95 on the reference machine). No baseline device has been agreed |
| Labelling | Every illustrative 3D feature carries the "Illustrative" label; no page calls the scene a simulation | Met |
| Provenance | Every result shows unit, source or model version and timestamp | Met on the nutrition, texture and report pages |

**Automated tests**

- **Unit (Vitest):** unit and moisture-basis helpers, Zod schemas, percentage total logic, store reducers, SSE event ordering and duplicate handling.
- **Component (Testing Library):** formulation table, totals bar, job timeline, provenance chips, error states.
- **End to end (Playwright against mocks, then the real backend):** the full journey in section 10 (F5 exit), job failure, cancel, reload during a running job, 2D fallback.
- **Contract tests:** responses from the real API validated against the Zod schemas in `src/lib/api/`; failures block the pull request.
- **Accessibility:** automated axe checks in CI plus a manual keyboard-only run of the main journey.

**Current state of the automated tests**

| Layer | State |
| --- | --- |
| Unit | Built, in `frontend/tests/`: local formulation validation and the formulation store, job store event handling (ordering, duplicates, terminal states, measured progress), the Zod schemas, theme tokens, and unit helpers. CI runs them with lint, type-check and a production build |
| Component | Built. `tests/components.test.tsx` covers the formulation table and totals bar, the job progress timeline, the model provenance badge and the shared error block (19 tests) |
| End to end | Playwright against the real backend, skipping itself when the API is unreachable: `workspace.spec.ts` (create, validate, save, run nutrition, out-of-range texture, catalogue animal toggle), `demo.spec.ts` (the whole journey, unattended, with frame timings), `optimize-compare.spec.ts`, `export-download.spec.ts`, `job-lifecycle.spec.ts` (cancel and reload during a run), `forced-2d.spec.ts`, `public-pages.spec.ts` and `a11y.spec.ts`. CI does not run them |
| Contract | Built. `tests/contract/*.test.ts` sign in against the real backend and parse every endpoint in `src/lib/api/` with its Zod schema (`npm run test:contract`) |
| Accessibility | Built. `@axe-core/playwright` runs on every main page and fails on serious or critical violations (`npm run test:e2e:a11y`). It found and fixed a misused `<dl>`, links distinguished only by colour, and `aria-label` on a role-less skeleton. The manual keyboard-only run is still open |
| Pre-commit | Husky runs Prettier on staged files only; lint, type-check and tests run in CI |

**Pull request checklist**

- [ ] Lint, type-check and tests pass in CI
- [ ] Loading, empty and error states handled
- [ ] No result, percentage or status is computed or faked in the UI
- [ ] Units, source and model version visible where a value is shown
- [ ] Keyboard and reduced-motion behaviour checked
- [ ] Screenshot or recording attached for UI changes

## 12. 3D workspace redesign: the drag-and-drop bench (specification)

The first version of the scene (section 7, "Current state of the scene") is a schematic made of code-generated shapes that the user can only look at and click. It is not the scene the team agreed on. The agreed scene is a workbench the scientist builds a formulation on **by dragging**: crops are dragged from a pantry into a mixing vessel, and the scene looks like a crafted object, not a diagram.

This section is the brief for whoever rebuilds it. It is written to be followed without the rest of the conversation that produced it. The builder models the assets in Blender, driving Blender through the Blender MCP server (12.10), and integrates them in `frontend/src/scene/`.

Everything in sections 1 and 7 still applies. In particular: the scene never calculates a result, never invents progress, and is labelled "Illustrative".

### 12.1 Goals and non-goals

**Goals**

1. Building a formulation by drag and drop feels direct and physical: pick a crop up, carry it, drop it in.
2. The scene is pleasant to look at in all six themes and reads clearly at the size of the workspace panel (often 500 to 700 px wide).
3. Every drag has an equivalent that needs no dragging, for keyboard, touch and assistive technology.
4. The stations react to real job events (this fixes the defect in section 7).
5. It holds 60 frames per second on a mid-range laptop and degrades gracefully below that.

**Non-goals**

- No physics engine, no fluid or particle simulation, no photorealism.
- No new scientific meaning. A fill level, a blend colour or a product shape remains a drawing of validated data.
- The table editor stays. The bench is a second way to do the same edits, never the only way.

### 12.2 Concept and layout

The scene is a small food-lab workbench, seen from a raised three-quarter view, read from left to right like a sentence: **pantry → bench → vessel → process line → product**.

| Zone | What it is | Position (scene units, starting values) | Interaction |
| --- | --- | --- | --- |
| Pantry | A two-tier shelf at the back left holding up to eight crops: a 3D mirror of the ingredient picker's current search results | Centre `(-4.2, 0, -3.2)`, 5 wide, tiers at heights 0.6 and 1.7 | Drag source |
| Bench | The open area left of the vessel where the formulation's ingredient bins stand on an arc | The existing arc: radius 3.1 around the vessel, from 135° to 225° | Bins are drag sources and percentage controls |
| Vessel | The mixing vessel, the visual centre and the main drop target | `(0, 0, 0)` (unchanged) | Drop target |
| Return tray | A low tray at the front left; dropping a bin here removes the ingredient | `(-3.4, 0, 3.3)` | Drop target |
| Process line | Analyser, extruder and optimizer stations on a short conveyor | x = 2.4, 3.6 and 4.8 (unchanged) | Display only; selectable |
| Product board | A board where the candidate product appears | `(6.9, 0, 0)` (unchanged) | Candidate is a drag source (stage 4) |
| Compare plinths | Two small plinths in front of the product board | `(6.2, 0, 2.3)` and `(7.6, 0, 2.3)` | Drop targets (stage 4) |

Keeping the vessel, line and product where they are today lets the existing layout code (`scene/stations.ts`) and label anchors carry over. The camera's home target moves left to about `(0.9, 0.7, 0)` to frame the wider scene; tune it during look development.

### 12.3 Drag-and-drop interactions

**What can be dragged**

| # | Gesture | Result | Store call | Stage |
| --- | --- | --- | --- | --- |
| 1 | Drag a crop from the pantry onto the vessel or the bench | The ingredient joins the draft at 0 percent; its bin appears and its percentage control opens | `formulationStore.addIngredient` | 1 |
| 2 | Drag a row from the HTML ingredient picker onto the scene | Same as 1 | Same | 1 |
| 3 | Drag a bin to the return tray, or back onto the pantry | The ingredient leaves the draft | `removeIngredient` | 1 |
| 4 | Drag the fill handle on a bin up or down | The percentage changes in steps of 0.5 (0.1 with Shift held) | `setPercent` | 2 |
| 5 | Drag a candidate product onto a compare plinth | The candidate joins the compare pair; with two set, a "Compare" button appears | `selectionStore.toggleCompare` | 4 |

A drag never saves, never starts a job and never bypasses validation. It only edits the browser draft, exactly as the table does.

**The life of a drag**

| Phase | Trigger | What the user sees |
| --- | --- | --- |
| Hover | Pointer over a draggable | The object lifts slightly and the cursor becomes a grab hand |
| Grab | Pointer down, then 6 px of movement (mouse) or a 180 ms hold (touch) | The object rises about 0.35 units, scales to 105 percent, and its shadow shrinks and softens. Camera orbit is switched off. Valid targets show a soft ring; everything else dims by about 15 percent |
| Carry | Pointer moves | The object follows the pointer on a horizontal plane at carry height, with a small tilt in the direction of travel (at most 8°) that settles when it stops |
| Over a target | The object comes within about 0.9 units of a target | It is pulled gently toward the target's socket; the ring brightens and the target's label reads "Drop to add" (or "Drop to remove") |
| Drop | Pointer up over a target | The object settles into the socket with a small squash. For an added crop, a short pour of grains runs into the vessel |
| Cancel | Pointer up elsewhere, or Escape | The object returns along a low arc to where it came from. Nothing changes |
| Reject | Drop of something the target cannot take (for example a crop already in the formulation) | A short side-to-side shake, a return arc, and a text reason in the status line |

Thresholds matter. Without the 6 px and 180 ms thresholds, every click-to-select or camera orbit on touch would start a drag.

**Pending versus validated.** This is how drag and drop keeps rule 1 of section 1. A drop changes the draft at once, but the server has not validated it yet. Until the debounced `POST /validate` answers, the new or changed bin is drawn in a **pending** style: translucent, with a dashed outline and no fill change in the vessel. When the validated snapshot arrives, the bin turns solid and the vessel blend updates. If validation reports an issue for that ingredient, the bin takes the warning or error ring and the message is shown as text. The solid style is only ever drawn from `formulationStore.validated`.

**Equivalents without dragging.** WCAG 2.2 criterion 2.5.7 (Dragging Movements, level AA, which this guide commits to in section 9) requires that anything done by dragging can also be done with a single pointer without dragging. So:

| Drag | Pointer alternative | Keyboard alternative |
| --- | --- | --- |
| Add a crop | Click the crop, then click the vessel ("pick up, then place"); or the Add button in the picker | Focus the crop in the object list, press Space to pick it up, Space again to place it, Escape to cancel |
| Remove a bin | "Remove" button on the bin's card | Delete, or the Remove button in the object list |
| Change a percentage | Plus and minus buttons on the bin's card; the table input | Arrow up and down on the focused bin (0.5), with Shift (0.1) |
| Compare a candidate | "Add to compare" button on the candidate card | Same button in the object list |

Every pick-up, move over a target, drop, cancel and rejection is announced through the existing `aria-live` region, in words ("Cowpea flour picked up. Vessel: drop to add.").

**Touch.** One finger drags an object after the hold; one finger on empty space orbits; two fingers zoom. While an object is carried, the page must not scroll (`touch-action: none` on the canvas during a drag only). Draggable objects have a hit area of at least 44 px on screen at the home zoom, even when the model is smaller.

**How to build the drag layer**

- Use Pointer Events for everything, not the HTML5 drag-and-drop API. HTML5 drag does not fire on touch screens and cannot show a 3D object under the pointer. The unused helpers in `lib/dnd.ts` and the HTML5 drop handlers in `WorkspaceScene.tsx` are replaced by this.
- Keep one `dragStore` (Zustand): what is being dragged (`ingredient`, `bin` or `candidate`, with its ID), where it came from, the phase from the table above, and the current target. The HTML picker, the canvas and the 2D view all read and write this one store, so a drag can start in HTML and end in the canvas.
- For a drag that starts in the HTML picker, show a small HTML chip under the pointer until the pointer enters the canvas, then hide the chip and show the 3D object in its place.
- Inside the canvas, convert the pointer to a world position by intersecting its ray with a horizontal plane at carry height. Capture the pointer on grab so the drag continues if the pointer leaves the canvas.
- Disable `CameraControls` for the duration of a drag and restore it on drop or cancel.
- Give each drop target an invisible hit volume about 30 percent larger than the visible model. Small targets are the most common reason drag and drop feels fiddly.
- `@react-three/drei` ships a `DragControls` helper. It is fine for a quick prototype, but it has no notion of targets, snapping or cancel, so the production version should use the plane-intersection approach above. Check the helper's current types in `node_modules/@react-three/drei/web/DragControls.d.ts` before relying on it.

### 12.4 Visual direction

The reference is a **crafted miniature**: a tidy tabletop model of a food lab, as if made from painted wood, enamelled metal, glass and real grain. Friendly, calm and precise. It should not look like an engineering diagram, a game level or a photograph.

**Form**

- Rounded, slightly chunky shapes. Every hard edge carries a bevel of 2 to 4 percent of the object's size; a perfectly sharp edge catches no light and looks computer-made.
- Exaggerate slightly: handles a little too big, rims a little too thick. Small objects must read at 48 px.
- Each object must be recognisable from its silhouette alone. Test it by viewing it as a flat black shape.
- One consistent level of detail. A finely modelled extruder next to a plain box bin looks unfinished.

**Colour**

- The bench, shelf and machines are neutral and take their colours from the theme tokens (`--scene-*` in `app/globals.css`). The crops and the status lights are the only saturated things in the scene, so the eye goes to them.
- Aim for roughly 60 percent neutral surfaces, 30 percent secondary tone (metal, glass, wood) and 10 percent accent.
- Crops keep their natural colours (red-brown sorghum, cream cowpea with its dark eye, green mung bean), because that is how a food scientist recognises them. The ingredient's identity colour from `--scene-crop-1` to `--scene-crop-6`, which matches the table and the 2D view, goes on the bin's trim, its fill band and its ribbon in the vessel.
- No pure black and no pure white anywhere; both flatten under tone mapping.
- Status colours always come with a shape or text as well (section 9).

**Materials**

Use few materials and reuse them. Three finishes carry the whole scene: matte painted surfaces (roughness about 0.7), satin metal (metalness 1, roughness about 0.35) and clear glass. Avoid noisy textures; variation comes from baked ambient occlusion and from light.

**Light**

- Three roles: a warm key light from the front left and above, which casts the only real-time shadow; a soft, cooler fill from the sky side; and a rim light from behind on the right to separate objects from the background.
- Keep the existing approach of building the reflection environment from `Lightformer` panels tinted by the theme. It costs no download and follows the theme. Arrange them as a large overhead softbox, a left strip and a right rim, so glass and metal show long clean highlights.
- Shadows ground everything. Fit the key light's shadow camera tightly to the bench so the 2048 px shadow map is not wasted, and keep a soft contact shadow under each object. A carried object gets its own blob shadow that shrinks and fades as the object rises; this single cue does most of the work of making a drag feel physical.
- The current `ContactShadows` re-renders every frame. Render it once and refresh it only when the layout changes.
- Compare tone mapping during look development. React Three Fiber defaults to ACES Filmic, which shifts and desaturates strong colours; `NeutralToneMapping` (available in the installed Three.js) keeps crop and status colours closer to their CSS tokens. Choose by eye across the six themes.

**Camera**

- A longer lens than today: field of view 30° to 34° (now 38°). A longer lens flattens perspective and makes a small scene look like a model, which is the intent.
- Home view from the front, raised about 25° to 30° above the horizon, framing the whole bench with a margin for labels. Keep the existing logic that reframes for the panel's aspect ratio.
- Limit orbit to about 40° either side of home and between 15° and 65° of elevation, and limit zoom so the user can never get lost or look under the bench. Double-click or the reset button returns home.

**Background and floor**

Remove the floor grid and the floating sparkles; they make the scene read as a technology demo. Replace them with a bench surface that fades into a soft two-tone background gradient with a gentle vignette. Keep the light fog so the far edge dissolves.

**Labels**

Labels stay as HTML projected over the canvas (the existing `LabelProjector`), never as 3D text: they stay sharp, they follow the theme, and they are readable by assistive technology. During a drag, hide all labels except the carried object's and the current target's.

### 12.5 Motion

Motion explains cause and effect; it is never decoration that claims progress. All durations are short.

| Moment | Motion | Duration |
| --- | --- | --- |
| Object appears | Scale from 85 to 100 percent with a slight overshoot, fading in | 250 ms |
| Several objects appear | Same, staggered | 50 ms apart |
| Hover | Lift 0.06 units | 120 ms |
| Grab | Lift to carry height, scale to 105 percent | 150 ms |
| Carry | Follows the pointer with a slight lag; tilt from speed | Continuous |
| Drop | Settle with a squash to 94 percent and back | 280 ms |
| Pour | 60 to 100 instanced grains arc into the vessel | 600 to 800 ms |
| Cancel or reject | Return along an arc; reject adds three small shakes first | 300 to 400 ms |
| Percentage change | Fill level eases to the new height | 200 ms |
| Station becomes active | Beacon and trim cross-fade to the status colour | 300 ms |

Use ease-out curves for things arriving and springs with little bounce for things settling. Nothing loops except the idle motion of an active station, and that loop only says "this stage is running", as today.

With reduced motion (the setting or the browser preference), every row above becomes an instant change or a short cross-fade, the pour is skipped, and the carried object does not tilt. Drag and drop still works.

### 12.6 Object states

Every interactive object needs all of these states designed, not just the first two:

| State | Look |
| --- | --- |
| Idle | Resting |
| Hover | Slight lift, soft outline |
| Keyboard focus | A clear focus ring that meets contrast rules; never hover-only |
| Selected | Lift plus an accent ring on the base |
| Carried | Raised, scaled, with the blob shadow |
| Valid drop target | Soft ring; brighter when the carried object is near |
| Pending (awaiting validation) | Translucent with a dashed outline |
| Server warning or error | Amber or red ring, with the message in text |
| Unavailable | Dimmed; for example a pantry crop already in the formulation |

### 12.7 Job events on the bench

The stations must follow real events. Map them like this, in the scene layer:

| Station | Lights up for job type | Status comes from |
| --- | --- | --- |
| Vessel | Any job, during its `validating` stage | That stage's status in `jobStore` |
| Analyser | `nutrition` | The job's current stage status and terminal status |
| Extruder | `texture_prediction` | Same |
| Optimizer | `optimization` | Same; numeric progress during `searching` may drive a progress ring, only from `completed` and `total` |
| Product board | `candidate.ready` | The candidate appears; nothing appears before the event |

The station's HTML label shows the backend's own `stage_label` ("Scoring amino acids") under the station name, so the scene and the timeline always say the same thing. A warning turns the station amber and a failure red, with the message as text. Add a unit test that feeds the real stage names from the backend guide (section 7) through `jobStore` and asserts each station's status.

### 12.8 The asset kit to build in Blender

Six files. Budgets are upper limits for triangles after export.

| File | Contents | Named parts the code needs | Triangles |
| --- | --- | --- | --- |
| `bench.glb` | Bench top, pantry shelf with eight slots, return tray, product board, two compare plinths | `Socket_Pantry_01` to `_08`, `Socket_Return`, `Socket_Product`, `Socket_Compare_A`, `Socket_Compare_B` | 9,000 |
| `vessel.glb` | Glass vessel on a stand, with a rim, a paddle and a drop ring | `Vessel_Glass`, `Vessel_Rim` (takes the highlight colour), `Vessel_Paddle` (rotates; origin on its axis), `Socket_Drop`, `Socket_Label` | 6,000 |
| `bin.glb` | One ingredient bin, reused for every ingredient | `Bin_Body`, `Bin_Trim` (takes the crop colour), `Bin_Fill` (origin at its base, so scaling in height sets the level), `Bin_Handle`, `Socket_Crop`, `Socket_Label` | 2,500 |
| `crops.glb` | Four containers and about twelve crop toppers that combine | `Container_Crate`, `Container_Sack`, `Container_Jar`, `Container_Bottle`; `Crop_<name>` for each topper; `Crop_Generic` | 1,500 each |
| `line.glb` | Conveyor, analyser, extruder, optimizer | `Station_Analyser`, `Station_Extruder`, `Station_Optimizer`, each with `_Beacon`, `_Trim`, `_Moving` (the part that turns) and `Socket_Label`; `Conveyor_Belt` | 16,000 |
| `product.glb` | The illustrative product, whole and cut | `Product_Whole`, `Product_Cut` (shown only when the candidate defines a validated variable for it), `Product_Fibres` (same rule) | 4,000 |

**Crops.** The catalogue holds hundreds of foods, so crops are not modelled one by one. An ingredient is shown as a **container chosen by its form** (crate for whole or raw, sack for flour, jar for isolates, concentrates and powders, bottle for oils and liquids) with a **topper chosen by its crop**: a small heap or bunch of that crop sitting in the container. An ingredient with no matching topper gets `Crop_Generic`. Take the first list of toppers from the crops the catalogue actually contains (`GET /api/ingredients/facets`), most common first; expect cereals such as sorghum, millet and maize, and legumes such as cowpea, pigeon pea, green gram and beans. Record the mapping from crop name to topper in one file, `scene/cropModels.ts`.

**Budgets for the whole scene:** at most 60,000 triangles on screen, at most 60 draw calls, at most four textures of 1024 px or smaller, and at most 2.5 MB for all six files together after compression. Bins, containers, toppers and grains are drawn with instancing.

### 12.9 Blender conventions and export

**Modelling**

- One Blender unit is one scene unit. Match the positions in 12.2 so nothing needs rescaling in code.
- Apply scale and rotation on every object before export. Put each object's origin where the code will move or turn it: at the centre of its base for anything that stands on the bench, on the axis for anything that rotates, at the bottom for `Bin_Fill`.
- Sockets are Empty objects. They export as named nodes, and the code reads their positions for drop points and label anchors. Never hard-code a position in code that could be a socket.
- Apply bevels (two or three segments) and use weighted normals so bevelled edges shade cleanly. No overlapping faces, no loose vertices, no faces with flipped normals.
- Name objects and materials exactly as in the tables here. The code finds parts by name.

**Materials**

- Use only the Principled BSDF with plain values or image textures. Procedural node setups do not export to glTF; bake them first.
- Do not bake colour into the neutral parts. Give them a mid-grey base colour and a material named for its role, and let the code tint them from the theme tokens:

  | Material | Tinted from |
  | --- | --- |
  | `MAT_Bench` | `--scene-floor` |
  | `MAT_Surface` | `--scene-surface` |
  | `MAT_Metal` | `--scene-metal` |
  | `MAT_Glass` | `--scene-glass` |
  | `MAT_Dark` | `--scene-line` |
  | `MAT_Accent` | `--scene-accent` |
  | `MAT_Crop` | The ingredient's `--scene-crop-n`, set per instance |
  | `MAT_Status` | The station's status colour |
  | `MAT_Product` | `--scene-product` |
  | `MAT_Natural` | Not tinted: the crop toppers' own colours |

- Give all crop toppers one shared material, `MAT_Natural`, that samples a single small palette texture (256 px is enough). One material for all crops keeps them consistent and cheap.
- Bake ambient occlusion: to vertex colours for small props, or to one shared 1024 px texture for the bench and machines. Baked occlusion is what makes simple shapes look solid, and because it is greyscale it survives every theme.
- Glass: use a thin, mostly transparent, low-roughness material. Avoid glTF transmission for now; it needs an extra render pass every frame.

**Export**

- Format glTF Binary (`.glb`), Y up, modifiers applied, custom properties included, no cameras or lights, no animations unless listed.
- Compress geometry with meshopt. The loader in `@react-three/drei` decodes meshopt with a decoder that is already bundled. Draco also works, but by default its decoder is downloaded from a Google CDN at run time; if Draco is used, host the decoder in `public/` and set the path with `useGLTF.setDecoderPath`.
- Run every exported file through the Khronos glTF Validator and fix all errors and warnings.

**Where files live**

| What | Where |
| --- | --- |
| Blender sources and the scripts that build them | `frontend/scene-src/`, with a `README.md` that lists for each asset: Blender version, script, triangle count, and the source and licence of anything not made in-house |
| Exported models | `frontend/public/scene/v1/`; start a `v2/` folder for any change that breaks node names |
| Crop mapping, material tinting, loaders | `frontend/src/scene/` |

`.blend` files are large binaries. Track `frontend/scene-src/*.blend` with Git LFS, or keep them out of the repository and record where they are stored; decide before the first commit.

### 12.10 Working with Blender MCP

The builder drives Blender through the Blender MCP server, which lets Claude inspect the Blender scene, run Python inside Blender, take viewport screenshots and, where enabled, pull assets from online libraries. The exact tools depend on the server version, so list them at the start of a session. Work this way:

1. **Script everything.** Create each asset by Python (`bpy`) and save the script in `frontend/scene-src/scripts/`, one script per asset. An asset that exists only as clicks in a session cannot be rebuilt or reviewed.
2. **Set up a look-development file first.** A grey bench, the camera at the web scene's home view and field of view, and three lights in the roles from 12.4. Build and judge every asset in that file so they are all seen the same way.
3. **One asset at a time, in this loop:** block out the main shapes, take a screenshot from the home camera, check it against 12.4 (silhouette, bevels, chunkiness, level of detail), refine, then repeat. Screenshot after every meaningful change; do not model blind.
4. **Check the numbers by script** before export: triangle count against the budget, applied transforms, origins, names, and that every socket exists.
5. **Export by script** with the settings in 12.9, so every file is exported the same way.
6. **Judge the result in the browser, not in Blender.** Blender's viewport uses different tone mapping and lighting from the web scene. Build a development-only page (suggested: `/dev/scene-lab`) that loads one model under the real scene lighting and switches between the six themes, and review there.
7. **Save the `.blend` before running any script** that changes many objects; a script run through MCP cannot be undone as easily as a manual step.

**Outside assets**

- Prefer modelling from primitives. The style depends on consistent bevels and proportions, which imported models rarely share.
- Assets under CC0 (public domain dedication) may be used freely; record them in the README anyway.
- Anything under another licence needs its licence and author recorded, and its terms followed. Do not use assets whose licence forbids commercial use or modification.
- Meshes from AI generators are acceptable as reference or for background props after cleanup. Do not use them for the vessel, bins or stations: their topology is heavy and irregular, they blow the triangle budget, and they do not match the rest of the kit.

### 12.11 Front-end integration

- **Loading.** Load models with `useGLTF` inside the existing lazy-loaded canvas, preload the six files, and show simple placeholder shapes in the theme's neutral colour while they load. If a model fails to load, the existing error boundary switches to the 2D view.
- **Tinting.** After loading, walk each model once, find materials by name, and bind their colour to the scene theme (`scene/theme/sceneTheme.ts`), so a theme switch recolours the scene without reloading models. If the bench needs a colour the tokens lack, add a new `--scene-*` token to all six themes; `tests/themes.test.ts` checks that every theme defines every token.
- **State.** Scene objects keep reading from the stores only: `formulationStore` (draft for pending, `validated` for solid), `jobStore`, `selectionStore`, and the new `dragStore`. No scene-only state that cannot be rebuilt from them.
- **Structure.** Keep one component per object in `scene/objects/`, each taking its status as props. Put the drag layer in `scene/drag/` and the station mapping from 12.7 in one function with a unit test.
- **Performance.**
  - Instancing for bins, containers, toppers and pour grains.
  - Render on demand when nothing is moving: with no drag, no active job and no animation in flight, the canvas should not redraw every frame.
  - Cap the device pixel ratio at 2 on desktop and about 1.5 on phones.
  - Watch the frame rate (drei's `PerformanceMonitor`). If it stays low, first drop the pixel ratio, then turn off real-time shadows, and if it is still low, switch to the 2D view and say why. This also closes the missing performance check in section 9.
- **Library check.** The installed versions are Three.js 0.187, React Three Fiber 9 and drei 10. Confirm any helper's current props in `node_modules` before using it; do not rely on memory of older versions.

### 12.12 The 2D view

The 2D view must offer the same drag and drop: chips for crops in a pantry strip, a vessel area to drop onto, a remove area, and the same pending, valid-target and rejected states, using the same `dragStore`. The click-to-place and keyboard alternatives are identical. A user in 2D must be able to do everything a user in 3D can.

### 12.13 Build order

| Stage | Work | Done when |
| --- | --- | --- |
| 1. Interaction on the current shapes | `dragStore`, pointer-based drag from the picker and a temporary pantry, drop on the vessel, remove on a tray, pending style, click-to-place and keyboard alternatives, announcements, the station mapping fix | A formulation can be built and emptied by drag, by click and by keyboard, in 3D and 2D, using today's simple shapes |
| 2. Percentage by drag | Fill handle on bins, with the button and keyboard equivalents | A percentage can be set from the bench and matches the table and totals bar |
| 3. Asset kit and look | Look-development file, the six models, the `/dev/scene-lab` page, lighting, camera, background, tinting from tokens | The models replace the simple shapes and pass the visual checks in 12.14 in all six themes |
| 4. Motion and candidates | The motion table in 12.5, the pour, the candidate product with its cut view when validated, drag to the compare plinths | Section 5 page 10's "Preview in 3D" and compare selection work from the scene |
| 5. Performance and accessibility | Frame-rate monitor and fallbacks, touch testing on a real phone and tablet, a keyboard-only run, a screen-reader run | The acceptance checklist below passes |

Stage 1 comes first on purpose. It proves the interaction and the truthfulness rules before any time goes into modelling, and it is useful on its own.

**State of the bench (27 November 2026).** Stages 1 to 4 are built and the bench works end to end against the real backend: a crop dragged from the pantry onto the vessel joins the draft, shows as pending, and turns solid or takes an error ring from the server's validation reply. What was added in this pass, and what is worth knowing before touching it again:

- **The bench asset is in the scene.** `bench.glb` and `crops.glb` were built but only the scene-lab page loaded them. `Bench` now mounts the bench, pantry shelf, return tray, product board and compare plinths, and registers their Empty sockets with `scene/objects/benchSockets.ts`. Drop points and pantry slots read those sockets, so moving one in Blender moves the drop point with it.
- **Ingredients are container-plus-topper models.** `CropModel` picks `Container_<form>` and `Crop_<crop>` by name through `scene/cropModels.ts`, which the scene had never used. Each topper's nine grains are merged into one geometry, cached per crop, so a pantry of eight costs 16 draw calls rather than 80.
- **Crops carry their own colours.** Every topper shares one `MAT_Natural` in the asset, so the colour is applied per instance from `TOPPER_COLOR`. That table mirrors `CROPS` in `scripts/blender/build_assets.py` — change both together.
- **Two bugs worth remembering.** The drop never fired because (a) the vessel was treated as radius 0.62 against a model whose rim is 1.5, and (b) the pointer was projected onto a plane at carry height, which sits between the camera and the bench, so a point that looked like it was over the vessel resolved about five units in front of it. The pointer is now projected onto the bench (`BENCH_LEVEL`) and the carried object is drawn above the spot it will land on, with its shadow marking it. `tests/dragMath.test.ts` and `tests/dropTargets.test.ts` pin both.
- **A target is sticky once acquired** (`TARGET_STICKINESS`), so a pixel of jitter or a frame of camera settling cannot lose the drop point.
- **Release has its own motion** (`scene/drag/releaseAnimation.ts`, unit-tested): a drop settles with a squash, a cancel returns along a low arc, a reject shakes first. The drag store keeps the release alive for the animation and clears it under a sequence guard, so a new drag is never wiped by the previous one's clean-up.
- **`scripts/shoot-lab.mjs` and `scripts/shoot-workspace.mjs`** drive the scene in a headless browser and screenshot it. Headless Chromium needs the SwiftShader flags they set, and the workspace script forces `viewMode: "3d"` because software GL is judged a weak device. These are how the visual checks in 12.14 get done.

Still open: the look-development pass in 12.14 (the containers read as plain blocks and the crate, sack, jar and bottle silhouettes barely differ), touch testing on real hardware, and the screen-reader run.

### 12.14 Acceptance checklist

**Interaction**

- [ ] A crop can be added by dragging from the pantry and from the picker, with mouse and with touch
- [ ] A bin can be removed by dragging, and a percentage changed by dragging
- [ ] Every drag has a working click alternative and a working keyboard alternative
- [ ] A cancelled or rejected drag changes nothing and says why
- [ ] The camera never moves during a drag, and the page never scrolls
- [ ] A dropped ingredient shows as pending until the server validates it; the solid style is only ever drawn from validated state
- [ ] Each station follows real job events, and nothing in the scene advances without an event

**Appearance**

- [ ] Each object is recognisable from its silhouette, and at 48 px
- [ ] Bevels, proportions and level of detail are consistent across all six files
- [ ] The scene looks deliberate in every one of the six themes, with no unreadable label and no colour that only works in one theme
- [ ] Every object sits on a shadow; nothing floats, flickers or overlaps
- [ ] Crops and status lights are the most saturated things in view
- [ ] The "Illustrative" badge is visible, and nothing calls the scene a simulation

**Technical**

- [ ] Budgets in 12.8 are met, and every file passes the glTF Validator
- [ ] 60 frames per second on the agreed baseline laptop; a slow device steps down and ends in the 2D view with an explanation
- [ ] With reduced motion on, drag and drop still works with no animation
- [ ] A screen reader announces each pick-up, target, drop, cancel and rejection

### 12.15 Decisions still needed

- [ ] Confirm that the layout in 12.2 matches what the team agreed, in particular that the pantry mirrors the picker's search results.
- [ ] The first list of crop toppers.
- [ ] The baseline device for the performance target.
- [ ] Git LFS or external storage for the Blender sources.

## 13. Fix list from the 19 November audit

The audit behind the status notes in this guide found five problems in the frontend. Each is written here as a piece of work: what is wrong, where, what to do, and how to tell it is done. A sixth problem, in the API's rate limits, is in the backend guide (section 15).

| ID | Work | Size | Owner (section 3) | Order | Status (22 Nov 2026) |
| --- | --- | --- | --- | --- | --- |
| FE-1 | Make the scene's stations follow job events | Small | Lennox | 1 | Done — `scene/stations.ts` + `tests/stations.test.ts` |
| FE-2 | Fix the landing page's broken link | Trivial | Steve | 2 | Done — the footer links to `/formulations` |
| FE-3 | Make `/methodology` public | Small | Steve | 3 | Done — `(public)` route group |
| FE-4 | Validate API responses at run time | Medium | Steve | 4 | Done — `contract_mismatch` plus `tests/contract/` |
| FE-5 | Script the seven job-stream scenarios as tests | Medium | Lennox | 5 | Done — `tests/fixtures/sse/` + `tests/sseScenarios.test.ts` |
| FE-6 | Build the charts | Large | Steve | 6 | Done — six charts, built with Plotly |
| FE-7 | Adopt or remove TanStack Query and React Hook Form | Medium | Steve | 7 | Done — TanStack Query adopted, React Hook Form and Recharts removed |

The order puts the visible defect first, then the two quick fixes, then the work that protects against silent breakage, then the larger features.

### FE-1 Make the scene's stations follow job events

**Status: done (22 November 2026).**

**Problem.** During a job, the process stations in the 3D scene and the 2D view stay "Idle". The stations are named after job types, but the job store records stage status under the backend's stage names, so the lookups never match.

**Where**

- `src/scene/stations.ts`: `PROCESS_STATIONS` has the IDs `mixing`, `nutrition`, `texture_prediction` and `optimization`.
- `src/stores/jobStore.ts`: `stages` is keyed by `event.stage`, for example `validating`, `calculating` or `searching`. The store also holds `jobType`, `status` and `currentStage`, which is everything the fix needs.
- The lookups that never match: `ProcessLine.tsx` (`stages[station.id]`), `SceneLabels.tsx` (`stages[station.id]` and `stageLabels[station.id]`), `fallback/Workspace2D.tsx`, `WorkspaceScene.tsx` (the "Stage status" list) and `SceneCanvas.tsx` (`job.stages["mixing"]`).

**Work**

1. Add one pure function to `scene/stations.ts`, for example `stationStatuses({ jobType, status, stages, currentStage })`, that returns a status for each station:

   | Station | Status |
   | --- | --- |
   | The station whose ID equals `jobType` | `active` while the job is running; `warning` if any stage carries a warning; then `complete`, `failed` or `cancelled` from the job's terminal status |
   | `mixing` (the vessel) | `active` while `currentStage` is `validating`; `complete` once the job moves past it; `failed` if the job fails in that stage |
   | Every other station | No status (idle) |

   A queued job lights nothing. The function must not read a clock or a counter.
2. Replace the five lookups with the function's result.
3. Under the station's name, show the backend's own label for the current stage (`stageLabels[currentStage]`, for example "Scoring amino acids"), so the scene and the timeline use the same words.
4. Add `tests/stations.test.ts`. Feed the real stage sequences for the three job types (backend guide, section 7) through `jobStore.applyEvent` and assert each station's status at every step, including a warning, a failure and a cancellation.

**Done when**

- Running a nutrition job turns the Nutrition station to "Running" and then "Complete", in the 3D scene, the 2D view and the "Stage status" list; the same holds for texture and optimization jobs.
- A failed job leaves its station red with the failure message shown as text.
- The new test passes in CI.

This is the same mapping as section 12.7. It is the first item of stage 1 in section 12.13, and it can ship on the current shapes without waiting for the redesign.

### FE-2 Fix the landing page's broken link

**Status: done (22 November 2026).**

**Problem.** The landing page footer has a "3D workspace" link to `/formulations/demo`. No formulation has the ID `demo`, so the link ends in a load error.

**Where.** `src/app/page.tsx`, the footer link list (`href="/formulations/demo"`).

**Work.** Point the link at `/formulations`, as the hero's "Try the 3D workspace" button already does. A signed-out visitor is sent to sign in and then returned.

**Done when.** No link on the landing page leads to an error. Add one Playwright check that follows every landing-page link and asserts that none shows the error state.

### FE-3 Make `/methodology` public

**Status: done (22 November 2026).**

**Problem.** Section 4 says `/methodology` needs no sign-in, and the landing page links to it twice, but a signed-out visitor is redirected to `/login`.

**Where**

- `src/app/(workspace)/methodology/page.tsx`. Everything in the `(workspace)` group is wrapped by `AuthGuard` in `src/app/(workspace)/layout.tsx`.
- `src/components/models/approved-models.tsx`, used by the page, calls `GET /api/models`, which needs a signed-in user.

**Work**

1. Move the page out of the guarded group, for example to `src/app/(public)/methodology/page.tsx`, with a light layout that reuses the landing page's header and footer. The sidebar's Methodology link keeps working for signed-in users.
2. Show the live approved-models table only when a token is present. Otherwise show one line: "Sign in to see the currently approved models."
3. While editing the page, add the labelling rule it is missing (section 5, page 16): the 3D scene is illustrative and is not a molecular or mechanical simulation.

**Done when.** A signed-out visitor can open `/methodology` and read every section with no redirect and no failed request, and the end-to-end suite has a test for that.

### FE-4 Validate API responses at run time

**Status: done (22 November 2026).**

**Problem.** Section 6 says the client returns parsed and validated data. Today `requestJson` in `src/lib/api/client.ts` casts the JSON to the expected TypeScript type without checking it. If the backend changes a field, the page breaks in some unrelated place, or shows a blank value, with no clear error.

**Where**

- `src/lib/api/client.ts`: `requestJson<T>(path, init)`.
- `src/lib/validation/schemas.ts`: 35 Zod schemas, imported only by `tests/schemas.test.ts`.
- `src/types/index.ts`: the hand-written types the app really uses.
- `src/lib/sse/jobEventSource.ts`: event payloads are parsed without a check too.

**Work**

1. **Reconcile the schemas first.** They were written before the backend existed and have drifted: for example `logoutResponseSchema` describes a body, but logout returns `204` with none, and `formulationVersionDiffSchema` describes an endpoint the backend does not have. Compare each schema with `src/types/index.ts` and with the backend's `/openapi.json`, fix it, and delete the ones with no endpoint.
2. **Add an optional schema argument** to `requestJson`. When given, parse the response with it. On a mismatch, throw an `ApiError` with the code `contract_mismatch` and the path and first few issues in `details`, so the shared error block shows a clear message.
3. **Pass a schema from every function in `src/lib/api/`,** one resource at a time: auth, ingredients, formulations, jobs, results, candidates, models.
4. **Validate each SSE event** with `jobEventSchema` before it reaches `jobStore.applyEvent`. Drop an invalid event and log it; never apply it.
5. **Let unknown fields through.** Do not use strict object schemas, so that an additive backend change does not break the app.
6. **Move toward one source of truth.** Where a schema exists, derive the TypeScript type from it (`z.infer`) and remove the hand-written copy from `src/types/index.ts`.
7. **Add contract tests** under `tests/contract/` that call the real backend and parse each response with its schema. Run them wherever the backend is available: locally, and in the CI job that already starts the Compose stack.

**Done when.** Every function in `src/lib/api/` validates its response; a response with a wrong shape produces a visible `contract_mismatch` error that names the endpoint; the contract tests pass against the current backend.

### FE-5 Script the seven job-stream scenarios as tests

**Status: done (22 November 2026).**

**Problem.** Section 8 planned a mock API that could replay seven scripted event streams. It was never built, so several behaviours of the job stream have never been exercised: a dropped connection, an out-of-order event, a failure in mid-run.

**Decision.** Do not build a mock mode for daily development; the real backend covers that. Build the seven scenarios as automated tests, which is where they are still needed.

**Where.** New files only: `tests/fixtures/sse/*.json` for the event scripts and `tests/sseScenarios.test.ts` for the tests. The code under test is `src/lib/sse/jobEventSource.ts`, `src/lib/jobs/job-runner.ts` and `src/stores/jobStore.ts`.

**Work**

1. Write a small fake `EventSource` for the tests that can emit scripted events, raise an error, and close.
2. Stub `fetch` for the two calls the client makes around the stream: `POST /api/jobs/{job_id}/stream-token` and `GET /api/jobs/{job_id}`.
3. Write one fixture per scenario, using the backend's real stage names and the full event shape (`seq`, `completed`, `total`, `details`):

   | # | Scenario | Assert |
   | --- | --- | --- |
   | 1 | Nutrition job: stages, `result.ready`, `job.completed` | Stages complete in order; the stream closes; status is completed |
   | 2 | Texture job with `progress_percent: null` throughout | Progress stays `null` from start to end |
   | 3 | Optimization with numeric progress and three `candidate.ready` events | Progress only ever takes values an event carried; three candidate IDs, in order |
   | 4 | A job with `warning.raised` | The warning is stored with its stage and message; the job still completes |
   | 5 | A job that fails; a job that is cancelled | Terminal status and error are stored; nothing after the terminal event is applied |
   | 6 | Dropped connection and reconnect | A new token is requested; the stream resumes from the last `seq`; no event is applied twice; if the job finished meanwhile, the final state comes from the status call |
   | 7 | Out-of-order and duplicate events | They are ignored; state is identical to the clean run |

4. Once FE-1 is done, add station assertions to scenarios 1 to 5.
5. Remove `NEXT_PUBLIC_USE_MOCKS` from `frontend/.env.local` and from the table in section 2; nothing reads it.

**Done when.** All seven scenarios pass in `npm test` and in CI.

### FE-6 Build the charts

**Status: done (22 November 2026).**

**Problem.** Sections 5 and 9 specify charts on five pages. None exists; every result is a table. Plotly and Recharts are both installed and neither is imported.

**The charts**

| Page | Chart | Data |
| --- | --- | --- |
| 4 Ingredient detail | Amino-acid profile, as bars | The ingredient's amino acids; a missing value is a labelled gap, not a zero-height bar |
| 7 Nutrition | Macronutrients per 100 g, as bars | The nutrition result |
| 7 Nutrition | Amino-acid score per amino acid, as bars with a reference line at 1.0 and the limiting amino acid highlighted | `amino_acids.scores` and `limiting_amino_acid` from the result |
| 8 Texture | Predicted value with its interval, as a point with whiskers per target | `value` and `interval`; an out-of-domain target shows no point |
| 9 Optimize | Candidates as a scatter of two chosen metrics, with Pareto candidates marked | The candidates list and its `pareto` flag |
| 11 Compare | Candidate A against B, as grouped bars per metric | The compare response |

**Work**

1. **Choose the library.** ~~Recommended: build all six with Recharts…~~ **Decision taken: Plotly.** All six charts are built on `react-plotly.js` through the shared `components/charts/plotly-chart.tsx` frame, because the plot types needed (grouped bars, whisker intervals, scatter with Pareto marking) were already available there. The recommendation to standardise on Recharts and drop Plotly was **not** taken, and `recharts` remains in `package.json` without a single importer. Either finish the move to Recharts or remove the library; do not leave both.
2. **Put shared pieces in `src/components/charts/`:** a frame with title, axis labels with units, and an empty state. Take colours from the theme tokens in `app/globals.css` so charts follow all six themes.
3. **Rules for every chart**
   - It draws stored results only. No chart computes a score, a total or an interval.
   - Every axis names its unit; the chart names its basis (for example "per 100 g as formulated").
   - Missing data is shown as missing, with the reason, never as zero.
   - Uncertainty is drawn wherever the result carries it.
   - The existing table stays beside the chart as its accessible alternative, and the chart has a text summary for screen readers.
   - Animation is off under reduced motion.
   - Charts are loaded lazily so they do not slow the first paint.

**Done when.** The six charts are on their pages, match the tables beside them value for value, read correctly in all six themes, and each has a component test with a normal result, a result with missing data and an empty result.

### FE-7 Adopt or remove TanStack Query and React Hook Form

**Status: done (22 November 2026).**

**Problem.** Both libraries are installed and neither does anything. The TanStack Query provider is mounted, and `JobInvalidator` in `src/lib/query/invalidator.tsx` invalidates the keys `jobs`, `results`, `candidates` and `formulations` when a job finishes, but no component registers a query, so nothing is refetched. Pages fetch through `src/hooks/use-api-query.ts`, which has no shared cache, so the same data is fetched again on every visit.

**TanStack Query: adopt (recommended)**

1. Re-implement `useApiQuery` on top of `useQuery`, keeping its return shape (`data`, `error`, `loading`, `reload`), so its 25 call sites keep working.
2. Change its key from one string to an array that starts with the resource name, for example `["formulations", id]` or `["ingredients", { q, form, crop, page }]`, and update the call sites. The invalidator's keys then match real queries.
3. After a save, restore, promote, approve or retire, invalidate the affected keys in place of calling `reload()` by hand.

Done when: finishing a job refreshes the nutrition tab, the candidates tab and the job list without a manual reload; returning to a list shows the cached data at once and refreshes it in the background; no component fetches inside its own effect.

If the team decides against it, remove `@tanstack/react-query`, `src/lib/query/` and the provider from the layout, and keep `useApiQuery` as it is.

**TanStack Query: adopted.**

`hooks/use-api-query.ts` is now a wrapper over `useQuery` that keeps the `data` / `error` / `loading` / `reload` shape, and every call site passes a resource-prefixed array key. The job-completion invalidator matches real queries, and save, restore, promote, approve and retire invalidate through `useInvalidateResource()`.

**React Hook Form: removed.** `react-hook-form` and `@hookform/resolvers` are out of `package.json`, and `recharts` went with them — all six charts use Plotly.

Done when: `package.json` lists no library that the code does not import, and the tech-stack table in section 2 matches.
