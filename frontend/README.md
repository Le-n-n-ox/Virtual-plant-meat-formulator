# Virtual Plant-Meat Formulator — Frontend

The browser workstation for the Virtual Plant-Meat Formulator. A food scientist
builds a formulation from indigenous Kenyan crops, runs nutrition calculations,
texture prediction or optimization, and reads the results as tables, charts and a
live 3D process scene.

The specification is [docs/frontend-guide.md](../docs/frontend-guide.md). This
README records what the code actually does today, and what is still missing.
Where the two disagree, this file is right.

## Stack

| Concern      | Choice                                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| Framework    | Next.js (App Router, Turbopack), React 19, TypeScript                                                           |
| Styling      | Tailwind CSS 4, six colour themes driven by CSS custom properties                                               |
| Server state | Hand-written `hooks/use-api-query.ts`; TanStack Query's provider is mounted but no component queries through it |
| Client state | zustand (`stores/`)                                                                                             |
| Validation   | Zod mirrors of the backend contracts (`lib/validation/schemas.ts`)                                              |
| 3D           | React Three Fiber + drei, Blender-authored GLB assets                                                           |
| Charts       | Plotly, lazy-loaded through `components/charts/plotly-chart.tsx`                                                |
| Testing      | Vitest + Testing Library; Playwright for end-to-end                                                             |

There is **no mock API**. The app talks only to the real backend
(`NEXT_PUBLIC_API_BASE_URL`); `src/mocks/` and MSW do not exist on this branch.

## Getting started

```sh
cd frontend
npm install
npm run dev          # http://localhost:3000
```

Sign-in uses the backend's local auth mode (`AUTH_MODE=local`). The workspace
routes are sign-in gated.

## Scripts

| Script                  | Purpose                                                   |
| ----------------------- | --------------------------------------------------------- |
| `npm run dev`           | Turbopack dev server                                      |
| `npm run build`         | Production build                                          |
| `npm run start`         | Serve the production build                                |
| `npm run lint`          | ESLint                                                    |
| `npm run typecheck`     | `tsc --noEmit`                                            |
| `npm test`              | Vitest (`--configLoader runner`, see note below)          |
| `npm run test:contract` | Contract tests against a live backend (skips without one) |
| `npm run test:e2e`      | Playwright                                                |
| `npm run format`        | Prettier                                                  |

> **Windows note.** Vite 8.3.8 + rolldown 1.2.19 fail to bundle the Vitest config
> on this host (`sourcemapPathTransform … expected string`), so the `test` script
> passes `--configLoader runner`. If you hit that error after a fresh
> `npm install`, run `npx vitest run --configLoader runner` directly.

## Layout

```
src/
  app/                 route groups: (public), (auth), (workspace)
  components/
    candidates/        candidate cards, scatter, compare view and chart
    charts/            ChartFrame + ChartTable, lazy Plotly wrapper
    formulation/       editor, session, tabs
    ingredients/       catalogue, detail, amino-acid chart
    jobs/              job list and detail
    landing/           public landing page
    models/            registry, detail drawer, badges, approved-models table
    results/           nutrition and texture results, charts
    scene/             3D scene, stations, hooks
    ui/                shadcn-style primitives
  lib/
    api/               one module per backend resource, all validated
    sse/               job event stream with reconnect
    validation/        Zod schemas mirroring the backend contracts
  stores/              zustand stores
tests/                 Vitest suites and fixtures
public/scene/assets/   Blender GLBs, one folder per asset with a README
scripts/blender/       headless export of the scene GLBs
```

## What is implemented

### Application shell, auth and landing (F1)

- Public landing page at `/` with a labelled, decorative 3D hero.
- Public `/methodology` in a `(public)` route group, so it is reachable without
  sign-in; it carries a live table of approved models from `GET /api/models`.
- Sign-in at `/login` against `POST /api/auth/login`; the bearer token lives in
  `localStorage` and is attached by the API client.
- Workspace shell with navigation, six themes and a reduced-motion preference.
- `/settings`: theme, process view, motion, and display units (amino acids mg/g,
  energy kcal/kJ, protein g per 100 g / %). Units change only what is shown —
  the values sent to and stored from the backend stay canonical.

### Ingredient catalogue (F1)

- `/ingredients`: debounced search, form and crop filters fed by
  `GET /api/ingredients/facets`, a "hide meat, fish and dairy" toggle, quality and
  amino-acid badges, and Previous/Next paging.
- `/ingredients/[id]`: header badges (form, crop, food group, moisture basis,
  quality flag), nutrient table, amino-acid table, amino-acid profile chart,
  "Source and licence" card, and a warning that names any amino acid with no
  reported value.

### Formulations and nutrition (F2)

- `/formulations` list and the formulation editor: lines with percentages, a
  totals bar, validation through `POST /api/formulations/{id}/validate`, and
  save with optimistic concurrency.
- The editor's Targets panel (protein, key amino acids, cost ceiling) saves to
  the formulation's `targets` field and pre-fills the Optimize tab; the action
  bar has an Optimize button beside Run nutrition and Predict texture. Leaving
  with unsaved edits is confirmed both on `beforeunload` and on in-app
  navigation, and reloading re-attaches to a queued or running job instead of
  resetting the job store.
- `/formulations/[id]/versions`: version history and restore-as-new-version,
  plus a diff between any two versions (added, removed and changed
  ingredients with old → new percentages).
- `/formulations/[id]/nutrition`: nutrient table per 100 g as formulated with
  the basis named, macronutrient chart, amino-acid table per gram of protein,
  amino-acid score chart with a reference line at 1.0 and the limiting amino
  acid highlighted, and a provenance footer (calculation version, job, time,
  formulation version). Scores are never labelled DIAAS.

### 3D process scene (F3, F4)

- Five Blender-authored GLBs in `public/scene/assets/`, exported headlessly by
  `scripts/blender/build_assets.py`, each with its own README.
- `SceneModel` loads and clones a GLB per instance, shows a low-poly placeholder
  while loading, and falls back to procedural geometry per object if a GLB
  fails. A failure degrades the object, never the whole scene.
- The scene falls back to a 2D schematic when WebGL is unavailable or
  `usePerformanceCheck` detects a software rasteriser, ≤2 cores or ≤2 GB.
- Keyboard access: a "Scene objects" list beside the canvas with roving
  tabindex (Arrow/Home/End move, Enter/Space inspect, Escape clears).
- Clicking an ingredient bin opens a card with name, scientific name, quantity
  %, form, moisture basis, origin, source, method, collection date, licence,
  citation and any validation issue.
- Touch: orbit, zoom and pan (`touch-action: none` on the canvas).
- Drag and drop (guide §12.3): one `dragStore` drives the HTML pantry, the
  ingredient picker, the 3D canvas and the 2D schematic. Pointer Events with a
  6 px / 180 ms threshold, plane intersection at carry height, pointer capture,
  the camera locked while carrying, and drop volumes 30 percent larger than the
  models. Drop on the vessel to add, on the return tray (or back on the pantry)
  to remove. Newly dropped bins are drawn translucent with a dashed outline
  until a validation snapshot contains them.
- Percentage by drag (guide §12.3 row 4): a fill handle on each bin, 0.5 steps
  and 0.1 with Shift, with plus/minus buttons on the bin's card and
  ArrowUp/ArrowDown on the selected row as equivalents. The solid fill is drawn
  only from `validated`; a draft value that has not been validated yet shows as
  a translucent ghost disc until the snapshot confirms it. The table inputs and
  the totals bar read the same `draft`, so the three agree.
- Click-to-place and keyboard equivalents: click a crop then the vessel, or
  focus a row and press Space to pick up, Space to place, Delete to remove,
  Escape to cancel. Every pick-up, target, drop, cancel and rejection is
  announced through an aria-live region.
- Performance (guide §12.11): the canvas renders on demand when nothing is
  moving (no drag, no active job, no in-flight animation), the DPR is capped at 2
  on desktop and 1.5 on a phone, and drei's `PerformanceMonitor` runs a ladder —
  lower DPR, then disable real-time shadows, then switch to the 2D view with a
  visible explanation. `ContactShadows` renders once and refreshes only when the
  bin layout changes.
- Candidate preview in the scene, with a cutaway/fibre view gated on the
  candidate carrying a validated scene variable. Illustrative visuals stay
  labelled "Illustrative".

### Jobs and live events (F4)

- `/jobs` list and `/jobs/[id]` detail.
- `/jobs` filters by status, type and formulation, with the filters in the URL.
- `/jobs/[id]` shows the live stage timeline, the event log from the stored
  events, a link to the result tab and a Cancel action; a queued or running job
  is re-attached automatically on load (and on demand) so a job started in
  another tab can be followed live.
- Job store applies SSE events, tracks stage status, progress, warnings,
  candidates and the last event sequence.
- `lib/sse/jobEventSource.ts` requests a single-use stream token, applies events
  in order, drops stale or duplicate sequence numbers, and reconnects from the
  last applied `seq` after a dropped connection.
- Station status is derived from the backend's real stage names
  (`src/scene/stations.ts`), so the 3D stations and the 2D schematic light up
  during a real job instead of staying idle.

### Results, optimization and comparison (F5)

- **Texture** (`/texture`): process form, target checkboxes, prediction cards
  with value and interval, texture chart with interval whiskers, model badge,
  limitations notice and an out-of-domain warning.
- **Optimize** (`/optimize`): constraint form, objective selector, run button
  with a live timeline, infeasible-constraints message, candidate scatter with
  Pareto candidates highlighted, and a data table.
- **Candidates** (`/candidates`): cards, choose up to two for comparison,
  "Preview in 3D", cutaway toggle and "Promote to formulation".
- **Compare** (`/compare?ids=a,b`): exactly two distinct candidates required,
  two 3D viewports, a numbers panel with differences, a grouped bar chart, a
  camera lock, and links to the models behind the texture estimates.
- **Report** (`/report`): on-screen preview plus PDF and CSV download through an
  authenticated `fetch` and a blob.
- **Models** (`/models`): registry list and a detail drawer; every model version
  on a result links here.

### Hardening (F6) — the FE-1…FE-7 fix list

| Item                               | Status                                                                                                                                                                                                                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FE-1 station status mapping        | Done — `scene/stations.ts`, wired into the 3D scene and the 2D fallback, covered by `tests/stations.test.ts`                                                                                                                                                                |
| FE-2 landing-page link             | Done — the hero links to `/formulations`                                                                                                                                                                                                                                    |
| FE-3 public methodology page       | Done — `(public)/methodology` with a live approved-models table                                                                                                                                                                                                             |
| FE-4 run-time response validation  | Done — every API client validates through Zod and a mismatch throws `ApiError` code `contract_mismatch`; SSE events are validated too. Response types are derived from the schemas with `z.infer`, and `npm run test:contract` checks every endpoint against a live backend |
| FE-5 scripted job-stream scenarios | Done — `tests/fixtures/sse/*.json` and `tests/sseScenarios.test.ts` (9 tests)                                                                                                                                                                                               |
| FE-6 charts                        | Partly — all six charts exist and each has a data-table alternative and a component test. The guide's recommendation to standardise on Recharts and drop Plotly was **not** taken                                                                                           |
| FE-7 unused libraries              | Done — TanStack Query adopted, React Hook Form and Recharts removed                                                                                                                                                                                                         |

## What remains

### Hardening (F6)

- A manual keyboard-only run of the main journey, and touch testing on a real
  phone and tablet.
- A baseline device for the performance target; the demo script records frame
  timings into `test-results/demo-framings.json` for comparison.

### Decisions

- **Chart library.** The guide recommends Recharts and removing Plotly. **The
  decision taken is Plotly**: all six charts go through
  `components/charts/plotly-chart.tsx` (lazy-loaded, about 1 MB in the browser
  bundle), and `recharts` has been removed from `package.json`.
- **TanStack Query.** Adopted. `hooks/use-api-query.ts` wraps `useQuery` and
  keeps its `data` / `error` / `loading` / `reload` shape; every key is a
  resource-prefixed array, so the job-completion invalidator and
  `useInvalidateResource()` refetch a whole resource. React Hook Form was
  removed earlier.
- **Docker image.** `docker compose up -d --build frontend` currently fails
  because `package-lock.json` is missing platform-specific optional deps
  (`@rolldown/binding-linux-*`, `lightningcss-linux-*`, `fsevents`). Regenerate
  the lock file with `npm install --include=optional` on a clean checkout.

### Contract tests

`tests/contract/` calls the real backend through `src/lib/api/` and parses every
response with its schema. Point it at a running stack:

```sh
E2E_API_URL=http://localhost:8000 \
E2E_EMAIL=scientist@vpmf.local E2E_PASSWORD=devpassword123 \
E2E_ADMIN_EMAIL=admin@vpmf.local E2E_ADMIN_PASSWORD=devpassword123 \
npm run test:contract
```

Admin credentials are optional and only needed for the training and
model-approval endpoints. Without a reachable backend, or without credentials,
the whole suite skips. Running it against the current backend surfaced four real
schema bugs — a `current_version` of `0` on a draft, `targets: null`, nested
`holdout_metrics`, and a missing `value` on an out-of-domain prediction — all
since fixed.

### Open decisions

- **Chart library.** The guide recommends Recharts and removing Plotly
  (`plotly.js-dist-min`, `react-plotly.js`, `@types/react-plotly.js`). All six
  charts are built with Plotly through a shared lazy frame, which costs about
  1 MB in the browser bundle. `recharts` is still installed but no component
  imports it.
- **TanStack Query.** Adopting it needs array query keys across roughly 25 call
  sites so the invalidator matches; the hand-written `useApiQuery` works today.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Current state on `feature/steve`: typecheck clean, lint clean, 210 unit tests
passing, 35 contract tests passing against the local backend, `next build`
exits 0, and Playwright collects 23 e2e tests. The a11y gate and the public-page
specs were run against a local dev server and pass; the remaining specs need a
formulation in the seeded database.

## End-to-end tests

`npm run test:e2e` runs Playwright against the dev server (`playwright.config.ts`
starts it on `:3000`). Specs that need the seeded dev users skip when the API is
not reachable.

| Spec                       | Covers                                                                                                                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a11y.spec.ts`             | `@axe-core/playwright` on `/`, `/methodology`, `/login`, `/dashboard`, `/ingredients`, `/formulations`, `/jobs`, `/models`, `/settings` and a formulation editor; fails on serious or critical violations |
| `public-pages.spec.ts`     | signed-out `/methodology` with no redirect, guarded pages going to sign-in, and every landing-page link resolving                                                                                         |
| `forced-2d.spec.ts`        | the "Always 2D" preference shows the schematic and mounts no canvas                                                                                                                                       |
| `optimize-compare.spec.ts` | optimize → candidates → compare two candidates                                                                                                                                                            |
| `export-download.spec.ts`  | CSV and PDF downloads from the report tab                                                                                                                                                                 |
| `job-lifecycle.spec.ts`    | a job survives a reload, re-attaches on `/jobs/[id]`, and can be cancelled                                                                                                                                |
| `workspace.spec.ts`        | build, validate, save, run nutrition; out-of-range texture; the catalogue animal toggle                                                                                                                   |
| `demo.spec.ts`             | the whole journey in `docs/demo-script.md`, unattended, recording frame timings during the 3D steps into `test-results/demo-framings.json`                                                                |

The a11y gate found and fixed three real problems: a `<dl>` used for a plain
bullet list on the landing page, inline links distinguished only by colour, and
`aria-label` on a role-less skeleton.

Running the demo script against the real stack also found a crash in the
workspace: `Pantry` selected a fresh array out of the formulation store on every
call, which made `useSyncExternalStore` loop until React's update-depth limit
and rendered "This page couldn't load". It now uses `useShallow`.

`npm run test:e2e:a11y` runs only the accessibility gate.

To re-export the scene GLBs after editing the Blender sources:

```sh
"C:/Program Files/Blender Foundation/Blender 5.3/blender.exe" -b --python scripts/blender/build_assets.py
```

## Conventions

- **Every number is labelled with its provenance.** Missing is shown as "not
  reported" with a reason, never as zero.
- **Every chart has a data-table alternative** holding the same values, and an
  `aria-label` summary. Missing data is a labelled gap, not a zero-height bar.
- **Uncertainty is drawn wherever the payload carries it.** No interval is
  invented for a point estimate.
- **No over-claiming.** Scores are labelled with the method that produced them;
  a pattern score is never called DIAAS; an illustrative 3D visual stays
  labelled illustrative.
- **Never trust a type cast.** Responses are validated against Zod and a
  mismatch surfaces as `ApiError` code `contract_mismatch`.
