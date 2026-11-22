import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SceneLab } from "@/components/scene-lab/SceneLab";

export const metadata: Metadata = { title: "Scene lab" };

/**
 * Look development for the Blender asset kit (guide §12.10). Development only:
 * there is nothing to see in a production build.
 */
export default function SceneLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <SceneLab />;
}
