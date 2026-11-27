import { writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

export interface FrameStep {
  step: string;
  frames: number;
  medianFps: number;
  p95FrameMs: number;
}

export interface FrameReport {
  device: string;
  recordedAt: string;
  steps: FrameStep[];
}

/**
 * Measures requestAnimationFrame deltas while the 3D scene is animating.
 *
 * The canvas renders on demand, so frames only flow while something is actually
 * moving — a running job, or a camera drag. Call this during one of those.
 */
export async function recordFrames(
  page: Page,
  step: string,
  ms: number,
): Promise<FrameStep> {
  const deltas = await page.evaluate(
    (duration) =>
      new Promise<number[]>((resolve) => {
        const deltas: number[] = [];
        let last = performance.now();
        const start = last;
        const tick = (now: number) => {
          deltas.push(now - last);
          last = now;
          if (now - start < duration) requestAnimationFrame(tick);
          else resolve(deltas);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );

  const sorted = [...deltas].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const p95 =
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;

  return {
    step,
    frames: deltas.length,
    medianFps: median > 0 ? Math.round(1000 / median) : 0,
    p95FrameMs: Math.round(p95 * 10) / 10,
  };
}

/** Writes the timings so a run on another device can be diffed against them. */
export async function saveFrameReport(
  steps: FrameStep[],
  device = process.env.DEMO_DEVICE ?? "reference laptop",
): Promise<string> {
  const report: FrameReport = {
    device,
    recordedAt: new Date().toISOString(),
    steps,
  };
  const file = path.join("test-results", "demo-framings.json");
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  return file;
}

/** The acceptance thresholds from docs/demo-script.md. */
export function assertBaseline(step: FrameStep): void {
  expect(
    step.medianFps,
    `${step.step}: median frame rate below 30 fps (${step.medianFps})`,
  ).toBeGreaterThanOrEqual(30);
  expect(
    step.p95FrameMs,
    `${step.step}: 95th percentile frame time over 50 ms (${step.p95FrameMs})`,
  ).toBeLessThanOrEqual(50);
}
