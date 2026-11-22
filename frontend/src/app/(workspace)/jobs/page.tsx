import type { Metadata } from "next";
import { Suspense } from "react";
import { JobList } from "@/components/jobs/job-list";

export const metadata: Metadata = { title: "Jobs" };

export default function JobsPage() {
  // The job list reads its filters from the address bar.
  return (
    <Suspense>
      <JobList />
    </Suspense>
  );
}
