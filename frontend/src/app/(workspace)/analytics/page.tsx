import type { Metadata } from "next";
import { CatalogueComposition } from "@/components/analytics/catalogue-composition";
import { DataQualityBreakdown } from "@/components/analytics/data-quality-breakdown";
import { JobThroughputPanel } from "@/components/analytics/job-throughput";
import { ModelCoverage } from "@/components/analytics/model-coverage";
import { StatTiles } from "@/components/analytics/stat-tiles";

export const metadata: Metadata = { title: "Analytics" };

/**
 * Analytics: what the catalogue, the job history and the model registry hold,
 * aggregated from the endpoints that already serve those pages.
 *
 * The page computes nothing scientific. It counts records — catalogue rows, job
 * rows, registry rows — and every count on it is labelled as a count of records
 * so it can never be read as a nutritional or texture finding (guide §1).
 */
export default function AnalyticsPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-1">
        <p className="text-small text-muted-foreground">Workspace overview</p>
        <h1 className="text-h2 sm:text-h1">Analytics</h1>
        <p className="max-w-3xl text-small text-muted-foreground">
          Counts of the records the API already returns: catalogue rows, job
          rows and model-registry rows. Each panel names the endpoint it read
          and the time it read it, and every chart keeps a data table. Nothing
          here is a nutritional or texture result — those are calculated by the
          backend from a formulation, and are shown on the formulation&rsquo;s
          own pages.
        </p>
      </header>

      <StatTiles />
      <CatalogueComposition />
      <DataQualityBreakdown />
      <JobThroughputPanel />
      <ModelCoverage />
    </main>
  );
}
