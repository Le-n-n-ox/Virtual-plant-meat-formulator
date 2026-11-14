import { HttpResponse, http } from "msw";
import type { JsonBodyType, RequestHandler } from "msw";
import type {
  Candidate,
  Formulation,
  FormulationLine,
  JobEvent,
  JobEventName,
  JobRecord,
  JobStatus,
  JobType,
} from "@/types";
import { validateFormulationLocally } from "@/lib/validation/formulation";
import {
  MOCK_CANDIDATES,
  MOCK_CANDIDATE_DETAILS,
  MOCK_FORMULATIONS,
  MOCK_INGREDIENTS_BY_ID,
  MOCK_INGREDIENT_LIST,
  MOCK_JOBS,
  MOCK_MODELS,
  MOCK_MODELS_BY_ID,
  MOCK_NUTRITION,
  MOCK_PROMOTED,
  MOCK_TOKEN,
  MOCK_USER,
  MOCK_VERSIONS,
} from "./fixtures";

/**
 * DEV-ONLY mock API. Every response is synthetic and must be labelled as such
 * in the UI (see MockProvider). Nothing here is measured data.
 */

const formulations = new Map(MOCK_FORMULATIONS.map((f) => [f.id, { ...f }]));
const versions = structuredClone(MOCK_VERSIONS);
const jobs = new Map(MOCK_JOBS.map((j) => [j.id, { ...j }]));
const candidates =
  structuredClone<Record<string, Candidate[]>>(MOCK_CANDIDATES);
const candidateDetails = structuredClone(MOCK_CANDIDATE_DETAILS);
let sequence = 0;

function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}${sequence}`;
}

function json(data: JsonBodyType, status = 200) {
  return HttpResponse.json(data, { status });
}

function apiError(
  status: number,
  code: string,
  message: string,
  details: Record<string, unknown> = {},
) {
  return HttpResponse.json({ error: { code, message, details } }, { status });
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total: items.length,
    page,
    page_size: pageSize,
  };
}

type Params = Record<string, string | readonly string[] | undefined>;

function param(params: Params, key: string): string {
  const value = params[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

function intParam(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// ---------------------------------------------------------------- auth

const authHandlers: RequestHandler[] = [
  http.post("/api/auth/login", async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
    };
    if (!body.email?.trim() || !body.password) {
      return apiError(
        400,
        "validation_error",
        "Email and password are required.",
        {
          fields: ["email", "password"],
        },
      );
    }
    return json({
      access_token: MOCK_TOKEN,
      token_type: "bearer",
      expires_in: 3600,
    });
  }),
  http.post("/api/auth/logout", () => json({ ok: true })),
  http.get("/api/auth/me", () => json(MOCK_USER)),
];

// ---------------------------------------------------------------- ingredients

const ingredientHandlers: RequestHandler[] = [
  http.get("/api/ingredients", ({ request }) => {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const crop = (url.searchParams.get("crop") ?? "").toLowerCase();
    const form = url.searchParams.get("form") ?? "";
    const source = (url.searchParams.get("source") ?? "").toLowerCase();
    const flag = url.searchParams.get("flag") ?? "";
    const sort = url.searchParams.get("sort") ?? "common_name";
    const page = intParam(url.searchParams.get("page"), 1);
    const pageSize = intParam(url.searchParams.get("page_size"), 25);

    let items = MOCK_INGREDIENT_LIST.filter((item) => {
      if (
        q &&
        !`${item.common_name} ${item.scientific_name}`.toLowerCase().includes(q)
      )
        return false;
      if (crop && !item.common_name.toLowerCase().includes(crop)) return false;
      if (form && item.form !== form) return false;
      if (source && !item.source.name.toLowerCase().includes(source))
        return false;
      if (flag && item.quality_flag !== flag) return false;
      return true;
    });

    const direction = sort.startsWith("-") ? -1 : 1;
    const key = sort.replace(/^-/, "");
    items = [...items].sort((a, b) => {
      const av = String(a[key as keyof typeof a] ?? "");
      const bv = String(b[key as keyof typeof b] ?? "");
      return av.localeCompare(bv) * direction;
    });

    return json(paginate(items, page, pageSize));
  }),
  http.get("/api/ingredients/:id", ({ params }) => {
    const ingredient = MOCK_INGREDIENTS_BY_ID[param(params, "id")];
    if (!ingredient) {
      return apiError(404, "not_found", "No mock ingredient with that id.", {
        id: param(params, "id"),
      });
    }
    return json(ingredient);
  }),
];

// ---------------------------------------------------------------- formulations

const formulationHandlers: RequestHandler[] = [
  http.get("/api/formulations", ({ request }) => {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const page = intParam(url.searchParams.get("page"), 1);
    const pageSize = intParam(url.searchParams.get("page_size"), 25);
    const items = MOCK_FORMULATIONS.filter(
      (f) => !q || f.name.toLowerCase().includes(q),
    ).map((f) => ({
      id: f.id,
      name: f.name,
      current_version: f.version,
      last_job: null,
      updated_at: f.updated_at,
    }));
    return json(paginate(items, page, pageSize));
  }),
  http.post("/api/formulations", async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as { name?: string };
    if (!body.name?.trim()) {
      return apiError(
        400,
        "validation_error",
        "A formulation name is required.",
        {
          fields: ["name"],
        },
      );
    }
    const formulation: Formulation = {
      id: nextId("mock-formulation"),
      name: body.name,
      version: 1,
      lines: [],
      updated_at: new Date().toISOString(),
    };
    formulations.set(formulation.id, formulation);
    versions[formulation.id] = [
      {
        version: 1,
        created_by: MOCK_USER.display_name,
        created_at: formulation.updated_at,
        note: "Mock initial version.",
        content_hash: `mock-hash-${formulation.id}-v1`,
        lines: [],
      },
    ];
    return json(formulation, 201);
  }),
  http.get("/api/formulations/:id", ({ params }) => {
    const formulation = formulations.get(param(params, "id"));
    if (!formulation) {
      return apiError(404, "not_found", "No mock formulation with that id.", {
        id: param(params, "id"),
      });
    }
    return json(formulation);
  }),
  http.put("/api/formulations/:id", async ({ params, request }) => {
    const existing = formulations.get(param(params, "id"));
    if (!existing) {
      return apiError(404, "not_found", "No mock formulation with that id.", {
        id: param(params, "id"),
      });
    }
    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      lines?: FormulationLine[];
      targets?: Record<string, number>;
    };
    const lines = body.lines ?? existing.lines;
    const version = existing.version + 1;
    const updated: Formulation = {
      ...existing,
      name: body.name ?? existing.name,
      targets: body.targets ?? existing.targets,
      lines,
      version,
      updated_at: new Date().toISOString(),
    };
    formulations.set(param(params, "id"), updated);
    versions[param(params, "id")] = [
      ...(versions[param(params, "id")] ?? []),
      {
        version,
        created_by: MOCK_USER.display_name,
        created_at: updated.updated_at,
        note: "Mock save.",
        content_hash: `mock-hash-${param(params, "id")}-v${version}`,
        lines,
      },
    ];
    return json(updated);
  }),
  http.post("/api/formulations/:id/validate", async ({ params, request }) => {
    const existing = formulations.get(param(params, "id"));
    const body = (await request.json().catch(() => ({}))) as {
      lines?: FormulationLine[];
    };
    const lines = body.lines ?? existing?.lines ?? [];
    return json(validateFormulationLocally(lines));
  }),
  http.get("/api/formulations/:id/versions", ({ params }) => {
    const items = versions[param(params, "id")];
    if (!items) {
      return apiError(404, "not_found", "No mock formulation with that id.", {
        id: param(params, "id"),
      });
    }
    return json({ items, total: items.length });
  }),
  http.get("/api/formulations/:id/versions/:version", ({ params }) => {
    const items = versions[param(params, "id")] ?? [];
    const version = items.find(
      (v) => v.version === Number(param(params, "version")),
    );
    if (!version) {
      return apiError(404, "not_found", "No mock version with that number.", {
        id: param(params, "id"),
        version: param(params, "version"),
      });
    }
    const formulation = formulations.get(param(params, "id"));
    if (!formulation) {
      return apiError(404, "not_found", "No mock formulation with that id.", {
        id: param(params, "id"),
      });
    }
    return json({
      ...formulation,
      version: version.version,
      lines: version.lines,
    });
  }),
  http.get("/api/formulations/:id/nutrition", ({ params }) => {
    const result = MOCK_NUTRITION[param(params, "id")];
    if (!result) {
      return apiError(
        404,
        "result_not_found",
        "No mock nutrition result for this formulation yet.",
        { formulation_id: param(params, "id") },
      );
    }
    return json(result);
  }),
  http.get("/api/formulations/:id/candidates", ({ params, request }) => {
    const url = new URL(request.url);
    const page = intParam(url.searchParams.get("page"), 1);
    const pageSize = intParam(url.searchParams.get("page_size"), 25);
    const items = candidates[param(params, "id")] ?? [];
    return json(paginate(items, page, pageSize));
  }),
  http.get("/api/formulations/:id/export", ({ params, request }) => {
    const format = new URL(request.url).searchParams.get("format") ?? "csv";
    const formulation = formulations.get(param(params, "id"));
    if (!formulation) {
      return apiError(404, "not_found", "No mock formulation with that id.", {
        id: param(params, "id"),
      });
    }
    if (format === "csv") {
      const rows = [
        "ingredient_id,percent",
        ...formulation.lines.map(
          (line) => `${line.ingredient_id},${line.percent}`,
        ),
      ];
      return new HttpResponse(rows.join("\n"), {
        status: 200,
        headers: { "Content-Type": "text/csv; charset=utf-8" },
      });
    }
    return new HttpResponse("Mock PDF placeholder — not a real export.", {
      status: 200,
      headers: { "Content-Type": "application/pdf" },
    });
  }),
];

// ---------------------------------------------------------------- jobs

function makeEvent(
  jobId: string,
  seq: number,
  event: JobEventName,
  status: JobStatus,
  stage: string,
  stageLabel: string,
  extra: Partial<JobEvent> = {},
): JobEvent {
  return {
    job_id: jobId,
    event,
    status,
    stage,
    stage_label: stageLabel,
    progress_percent: null,
    candidate_id: null,
    timestamp: new Date().toISOString(),
    seq,
    ...extra,
  };
}

/** Scripted events for the mock SSE stream. Progress only comes from here. */
function buildJobEvents(jobId: string, type: JobType): JobEvent[] {
  const events: JobEvent[] = [];
  let seq = 0;
  const push = (
    event: JobEventName,
    status: JobStatus,
    stage: string,
    stageLabel: string,
    extra: Partial<JobEvent> = {},
  ) => {
    seq += 1;
    events.push(makeEvent(jobId, seq, event, status, stage, stageLabel, extra));
  };

  push("stage.updated", "running", "mixing", "Preparing formulation");
  if (type === "optimization") {
    push("stage.updated", "running", "optimization", "Searching formulations", {
      completed: 0,
      total: 30,
    });
    for (let completed = 1; completed <= 30; completed += 1) {
      push(
        "progress.updated",
        "running",
        "optimization",
        "Searching formulations",
        {
          completed,
          total: 30,
        },
      );
      if (completed % 10 === 0) {
        push(
          "candidate.ready",
          "running",
          "optimization",
          "Searching formulations",
          {
            candidate_id: `mock-candidate-${completed / 10}`,
          },
        );
      }
    }
  } else if (type === "texture_prediction") {
    push(
      "stage.updated",
      "running",
      "texture_prediction",
      "Predicting texture",
    );
    push("result.ready", "running", "texture_prediction", "Predicting texture");
  } else {
    push("stage.updated", "running", "nutrition", "Calculating nutrients");
    push("result.ready", "running", "nutrition", "Calculating nutrients", {
      message: "Mock nutrition result stored.",
    });
  }
  push("job.completed", "completed", type, "Complete");
  return events;
}

function sseResponse(events: JobEvent[]) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (const event of events) {
        controller.enqueue(
          encoder.encode(
            `event: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`,
          ),
        );
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      controller.close();
    },
  });
  return new HttpResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

const jobHandlers: RequestHandler[] = [
  http.post("/api/formulations/:id/jobs", async ({ params, request }) => {
    const formulation = formulations.get(param(params, "id"));
    if (!formulation) {
      return apiError(404, "not_found", "No mock formulation with that id.", {
        id: param(params, "id"),
      });
    }
    const body = (await request.json().catch(() => ({}))) as { type?: JobType };
    const type: JobType = body.type ?? "nutrition";
    const jobId = nextId("mock-job");
    const job: JobRecord = {
      id: jobId,
      type,
      status: "queued",
      formulation_id: param(params, "id"),
      stage: null,
      stage_label: null,
      progress_percent: null,
      message: null,
      candidate_ids: [],
      started_at: new Date().toISOString(),
      finished_at: null,
      duration_ms: null,
    };
    jobs.set(jobId, job);
    return json(
      {
        job_id: jobId,
        type,
        status: "queued",
        formulation_id: param(params, "id"),
        formulation_version: formulation.version,
        created_at: job.started_at,
      },
      202,
    );
  }),
  http.get("/api/jobs", ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? "";
    const page = intParam(url.searchParams.get("page"), 1);
    const pageSize = intParam(url.searchParams.get("page_size"), 25);
    const items = [...jobs.values()]
      .filter((job) => !status || job.status === status)
      .map((job) => {
        const formulation = formulations.get(job.formulation_id ?? "");
        return {
          id: job.id,
          type: job.type,
          formulation: {
            id: job.formulation_id ?? "",
            name: formulation?.name ?? "Unknown mock formulation",
            version: formulation?.version ?? 1,
          },
          status: job.status,
          stage_label: job.stage_label,
          created_at: job.started_at,
          started_at: job.started_at,
          finished_at: job.finished_at,
          duration_ms: job.duration_ms,
        };
      });
    return json(paginate(items, page, pageSize));
  }),
  http.get("/api/jobs/:id", ({ params }) => {
    const job = jobs.get(param(params, "id"));
    if (!job) {
      return apiError(404, "not_found", "No mock job with that id.", {
        id: param(params, "id"),
      });
    }
    const formulation = formulations.get(job.formulation_id ?? "");
    return json({
      ...job,
      cancel_requested: false,
      formulation_version: formulation?.version ?? 1,
      error:
        job.status === "failed"
          ? { code: "mock_failure", message: job.message ?? null }
          : null,
      result_available: job.status === "completed",
      last_event_seq: 0,
      data_versions: {},
      model_ids: [],
      calc_version: job.type === "nutrition" ? "mock-calc-v0" : null,
      seed: null,
    });
  }),
  http.post("/api/jobs/:id/cancel", ({ params }) => {
    const job = jobs.get(param(params, "id"));
    if (!job) {
      return apiError(404, "not_found", "No mock job with that id.", {
        id: param(params, "id"),
      });
    }
    const cancelled: JobRecord = {
      ...job,
      status: "cancelled",
      finished_at: new Date().toISOString(),
      message: "Cancelled by user.",
    };
    jobs.set(param(params, "id"), cancelled);
    return json({ accepted: true });
  }),
  http.post("/api/jobs/:id/stream-token", () =>
    json({ token: "mock-stream-token", expires_at: "2099-01-01T00:00:00Z" }),
  ),
  http.get("/api/jobs/:id/result", ({ params }) => {
    const job = jobs.get(param(params, "id"));
    if (!job) {
      return apiError(404, "not_found", "No mock job with that id.", {
        id: param(params, "id"),
      });
    }
    let result: JsonBodyType = null;
    if (job.type === "optimization") {
      result = candidates[job.formulation_id ?? ""] ?? [];
    } else if (job.type === "texture_prediction") {
      result = null;
    } else {
      result = MOCK_NUTRITION[job.formulation_id ?? ""] ?? null;
    }
    return json(result);
  }),
  http.get("/api/jobs/:id/events", ({ params }) => {
    const job = jobs.get(param(params, "id"));
    if (!job) {
      return apiError(404, "not_found", "No mock job with that id.", {
        id: param(params, "id"),
      });
    }
    return sseResponse(buildJobEvents(job.id, job.type));
  }),
];

// ---------------------------------------------------------------- candidates

const candidateHandlers: RequestHandler[] = [
  http.get("/api/candidates/:id", ({ params }) => {
    const candidate = candidateDetails[param(params, "id")];
    if (!candidate) {
      return apiError(404, "not_found", "No mock candidate with that id.", {
        id: param(params, "id"),
      });
    }
    return json(candidate);
  }),
  http.post("/api/candidates/:id/promote", ({ params }) => {
    const candidate = candidateDetails[param(params, "id")];
    if (!candidate) {
      return apiError(404, "not_found", "No mock candidate with that id.", {
        id: param(params, "id"),
      });
    }
    return json({ ...MOCK_PROMOTED, lines: candidate.lines });
  }),
  http.get("/api/compare", ({ request }) => {
    const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",");
    const [a, b] = ids;
    if (!a || !b) {
      return apiError(
        400,
        "validation_error",
        "Two candidate ids are required.",
        {
          fields: ["ids"],
        },
      );
    }
    const candidatesForPair = [
      candidateDetails[a] ?? null,
      candidateDetails[b] ?? null,
    ];
    if (!candidatesForPair[0] || !candidatesForPair[1]) {
      return apiError(
        404,
        "not_found",
        "One of the mock candidates was not found.",
        {
          ids,
        },
      );
    }
    const keys = new Set([
      ...Object.keys(candidatesForPair[0].metrics),
      ...Object.keys(candidatesForPair[1].metrics),
    ]);
    const differences = [...keys].map((key) => {
      const av = Number(candidatesForPair[0].metrics[key] ?? 0);
      const bv = Number(candidatesForPair[1].metrics[key] ?? 0);
      return {
        metric: key,
        unit: null,
        a: av,
        b: bv,
        delta: Math.round((bv - av) * 100) / 100,
      };
    });
    return json({ items: candidatesForPair, differences });
  }),
];

// ---------------------------------------------------------------- models

const modelHandlers: RequestHandler[] = [
  http.get("/api/models", ({ request }) => {
    const url = new URL(request.url);
    const target = url.searchParams.get("target") ?? "";
    const page = intParam(url.searchParams.get("page"), 1);
    const pageSize = intParam(url.searchParams.get("page_size"), 25);
    const items = MOCK_MODELS.filter(
      (model) => !target || model.target === target,
    );
    return json(paginate(items, page, pageSize));
  }),
  http.get("/api/models/:id", ({ params }) => {
    const model = MOCK_MODELS_BY_ID[param(params, "id")];
    if (!model) {
      return apiError(404, "not_found", "No mock model with that id.", {
        id: param(params, "id"),
      });
    }
    return json(model);
  }),
];

export const handlers: RequestHandler[] = [
  http.get("/api/health", () => json({ status: "ok", version: "mock-0.0.0" })),
  ...authHandlers,
  ...ingredientHandlers,
  ...formulationHandlers,
  ...jobHandlers,
  ...candidateHandlers,
  ...modelHandlers,
];
