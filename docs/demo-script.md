# Demo script — the full journey

A step-by-step walkthrough of the complete workflow, with what should happen at
each step and how long it takes on the reference machine. `npm run test:e2e:demo`
runs the same journey unattended and records frame timings for the 3D steps into
`frontend/test-results/demo-framings.json`, so a run on a slower device can be
compared against a baseline.

The script needs the real stack (`docker compose up`) with the seeded catalogue
and dev users. Every step below is one the Playwright script performs; the
selectors it uses are the ones named in the "You should see" column.

---

## 0. Before you start

- Backend healthy at `http://localhost:8000/api/health`.
- Frontend at `http://localhost:3000`.
- Sign in as `scientist@vpmf.local` / `devpassword123`.

**Expected:** the dashboard loads with "Formulations", "Job history" and
"Settings" in the sidebar.

---

## 1. Create a formulation

`Formulations` → **New formulation**. Name it `Demo blend`, leave "Start from" on
*Blank formulation*, submit.

**Expected:** a new saved version `v1` opens in the workspace; the ingredient
table is empty and the totals bar reads **Total 0%**.

---

## 2. Add ingredients

In "Add ingredient", search `cowpea` and add **Cowpea grain**; then search
`sorghum` and add **Sorghum grain**. Each row appears immediately.

**Expected:** two rows in the table, both at **0%**, and a warning that the total
is not 100%. The ingredient picker marks both as **Added** and disables their
buttons. The 3D bench shows two bins, both at fill level zero, in the pending
(translucent, dashed) style until the server validates them.

---

## 3. Set the proportions

Set **Cowpea grain** to 60% and **Sorghum grain** to 40%. Validation is debounced
(300 ms) and the scene only ever draws the validated snapshot.

**Expected:** after about a second the totals bar turns green and reads
**Total 100% · Valid — scene updated**. The bins take their solid style and the
fill heights match the percentages.

---

## 4. Save

**Save**.

**Expected:** a new version badge (`v2`), the badge flips to **Saved**, and the
"Unsaved changes" warning disappears. Reloading the page shows the same lines —
the formulation is versioned, and restoring an old version creates a *new*
version rather than rewriting history.

---

## 5. Calculate nutrition

**Run nutrition**.

**Expected:** the action is replaced by a live progress bar; the SSE timeline
fills with the worker's own stages; and the nutrition panel appears with
protein, fat, carbohydrate, fibre and energy **per 100 g as formulated**, an
amino-acid score with the limiting amino acid named, and a provenance footer
(citation, calculation version, time). Energy is shown in the unit chosen in
Settings. The words "DIAAS" and "digestibility-corrected" never appear.

> **Frame timings:** recorded during this step. A running job animates the belt
> and vessel, so this is the number to compare against the baseline device.

---

## 6. Predict texture

Open the **Texture** tab, set the moisture and process conditions, and
**Predict texture**.

**Expected:** either a prediction with its 90% interval and the model version,
or — for a whole-food blend outside the models' training range — an explicit
"insufficient supporting evidence" explanation with the nearest published
samples and **no** number. No value is invented for an out-of-domain blend.

---

## 7. Optimize

Open the **Optimize** tab. The **Targets** panel from the editor pre-fills the
objectives: protein as a target value, the amino acids as minimums, and the cost
ceiling. Leave the defaults and **Run optimization**.

**Expected:** the search runs, the stage timeline tracks it, and on completion
the candidates appear — ranked, with the Pareto candidates marked. The
candidates tab lists them with their metrics and model metadata.

---

## 8. Compare two candidates

Open the **Candidates** tab, tick any two rows, and choose **Compare**.

**Expected:** `/compare?ids=…` shows the two side by side, grouped bars per
metric, and each candidate's formulation, model version and numerical results
stay linked to its ID.

---

## 9. Export

Open the **Report** tab and choose **Download CSV**, then **Download PDF**.

**Expected:** a real file downloads for each format with the formulation ID in
the name. The report states which data was excluded because its licence does not
allow redistribution, and every value carries its unit and source.

---

## 10. Follow a job from another tab

With a job running, open `/jobs` (or `/jobs/[id]`) in a second tab.

**Expected:** the job appears in the list with a status chip; its detail page
shows the live stage timeline, the event log, a link to the result tab and a
**Cancel** button while it runs. The same job can be followed live without
starting a second run.

---

## Baseline and performance comparison

`npm run test:e2e:demo` writes `frontend/test-results/demo-framings.json`:

```json
{
  "device": "reference laptop",
  "steps": [
    { "step": "nutrition", "frames": 2400, "medianFps": 60, "p95FrameMs": 20.1 },
    { "step": "optimize", "frames": 1800, "medianFps": 59, "p95FrameMs": 21.4 }
  ]
}
```

Compare a new device against the baseline by re-running the demo there:

```sh
DEMO_DEVICE="baseline laptop" npm run test:e2e:demo
```

The script accepts two environment variables: `DEMO_DEVICE` (the label stored in
the report) and `DEMO_FRAME_MS` (how long to sample each 3D step, default 5000).

**Acceptance:** no step's median frame rate falls below 30 fps, and the 95th
percentile frame time stays under 50 ms. If a device cannot hold that, the
performance monitor steps down in this order — lower device pixel ratio, then
real-time shadows off, then the 2D view with a written explanation — rather
than degrading silently.
