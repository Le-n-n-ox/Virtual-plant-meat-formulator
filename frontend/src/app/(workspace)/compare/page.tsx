import type { Metadata } from "next";
import { Suspense } from "react";
import { CompareView } from "@/components/candidates/compare-view";

export const metadata: Metadata = { title: "Compare candidates" };

export default function ComparePage() {
  return (
    <Suspense>
      <CompareView />
    </Suspense>
  );
}
