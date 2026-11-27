import type { JobListItem, JobStatus } from "@/types";

/**
 * Bucketing for the job-throughput panel. Pure functions over the records
 * `GET /api/jobs` returned, so nothing on screen depends on a clock, a timer or
 * a guess: a bucket is a count of job records, nothing more.
 */

/** Terminal outcomes first, then the two states a job can still be in. */
export const JOB_STATUSES: readonly JobStatus[] = [
  "completed",
  "failed",
  "cancelled",
  "running",
  "queued",
];

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  running: "Running",
  queued: "Queued",
};

export interface JobDayBucket {
  /** UTC calendar day, as `YYYY-MM-DD`. */
  day: string;
  counts: Record<JobStatus, number>;
  total: number;
}

export interface JobThroughput {
  buckets: JobDayBucket[];
  /** Job records that carried a `created_at` this code could read. */
  counted: number;
  /**
   * Job records whose `created_at` could not be parsed. Reported rather than
   * dropped quietly, so the day counts and the record count still reconcile.
   */
  undated: number;
  /**
   * True when every day between the first and last record is present, including
   * the days with no record. A day inside the window with no job record is a
   * true count of zero records — unlike a missing measurement, which is never
   * drawn as a zero.
   */
  filled: boolean;
}

function emptyCounts(): Record<JobStatus, number> {
  return {
    completed: 0,
    failed: 0,
    cancelled: 0,
    running: 0,
    queued: 0,
  };
}

/** The UTC calendar day of an ISO timestamp, or null if it will not parse. */
function utcDay(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Beyond this span the empty days are not filled in. A daily axis covering more
 * than two months of a paged window turns into noise, and the data table would
 * carry hundreds of zero rows that say nothing.
 */
export const MAX_FILLED_DAYS = 62;

function daysBetween(first: string, last: string): number {
  return Math.round((Date.parse(last) - Date.parse(first)) / DAY_MS);
}

function dayRange(first: string, last: string): string[] {
  const days: string[] = [];
  for (let t = Date.parse(first); t <= Date.parse(last); t += DAY_MS) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

export function bucketJobsByDay(jobs: JobListItem[]): JobThroughput {
  const byDay = new Map<string, Record<JobStatus, number>>();
  let undated = 0;

  for (const job of jobs) {
    const day = utcDay(job.created_at);
    if (day === null) {
      undated += 1;
      continue;
    }
    const counts = byDay.get(day) ?? emptyCounts();
    counts[job.status] += 1;
    byDay.set(day, counts);
  }

  const present = [...byDay.keys()].sort();
  const filled =
    present.length > 1 &&
    daysBetween(present[0], present[present.length - 1]) <= MAX_FILLED_DAYS;
  const days = filled
    ? dayRange(present[0], present[present.length - 1])
    : present;

  const buckets = days.map((day) => {
    const counts = byDay.get(day) ?? emptyCounts();
    return {
      day,
      counts,
      total: JOB_STATUSES.reduce((sum, status) => sum + counts[status], 0),
    };
  });

  return { buckets, counted: jobs.length - undated, undated, filled };
}

/** Record counts per job type and status, for the outcomes chart. */
export function countByTypeAndStatus(
  jobs: JobListItem[],
): { type: string; counts: Record<JobStatus, number>; total: number }[] {
  const byType = new Map<string, Record<JobStatus, number>>();
  for (const job of jobs) {
    const counts = byType.get(job.type) ?? emptyCounts();
    counts[job.status] += 1;
    byType.set(job.type, counts);
  }
  return [...byType.entries()]
    .map(([type, counts]) => ({
      type,
      counts,
      total: JOB_STATUSES.reduce((sum, status) => sum + counts[status], 0),
    }))
    .sort((a, b) => b.total - a.total);
}
