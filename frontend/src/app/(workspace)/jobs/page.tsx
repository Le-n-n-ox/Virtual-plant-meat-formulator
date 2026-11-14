import type { Metadata } from "next";
import { JobList } from "@/components/jobs/job-list";

export const metadata: Metadata = { title: "Jobs" };

export default function JobsPage() {
  return <JobList />;
}
