import { Suspense } from "react";
import { CandidatesTab } from "@/components/workspace/candidates-tab";

export default function Page() {
  return (
    <Suspense>
      <CandidatesTab />
    </Suspense>
  );
}
