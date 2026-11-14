import { Suspense } from "react";
import { FormulationEditor } from "@/components/formulation/formulation-editor";
import { Skeleton } from "@/components/ui/skeleton";

export default function FormulationWorkspacePage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <FormulationEditor />
    </Suspense>
  );
}
