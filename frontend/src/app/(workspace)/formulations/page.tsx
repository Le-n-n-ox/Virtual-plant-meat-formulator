import type { Metadata } from "next";
import { FormulationList } from "@/components/formulation/formulation-list";

export const metadata: Metadata = { title: "Formulations" };

export default function FormulationsPage() {
  return <FormulationList />;
}
