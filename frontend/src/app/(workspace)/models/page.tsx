import type { Metadata } from "next";
import { ModelRegistry } from "@/components/models/model-registry";

export const metadata: Metadata = { title: "Models" };

export default function ModelsPage() {
  return <ModelRegistry />;
}
