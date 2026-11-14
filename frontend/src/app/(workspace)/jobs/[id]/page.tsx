import type { Metadata } from "next";
import { JobDetailView } from "@/components/jobs/job-detail";

export const metadata: Metadata = { title: "Job" };

export default function JobDetailPage() {
  return <JobDetailView />;
}
