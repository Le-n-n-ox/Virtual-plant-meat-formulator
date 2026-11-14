import type { StageStatus } from "@/stores/jobStore";

/**
 * Schematic stations shown in the 3D scene and 2D fallback. A station lights
 * up only when a worker event reports that stage; nothing here is simulated.
 */
export const PROCESS_STATIONS = [
  { id: "mixing", label: "Mixing" },
  { id: "nutrition", label: "Nutrition" },
  { id: "texture_prediction", label: "Texture" },
  { id: "optimization", label: "Optimization" },
] as const;

export type StationId = (typeof PROCESS_STATIONS)[number]["id"];

export const STAGE_STATUS_TEXT: Record<StageStatus | "idle", string> = {
  idle: "Idle",
  active: "Running",
  complete: "Complete",
  warning: "Warning",
  failed: "Failed",
  cancelled: "Cancelled",
};

/** Scene-theme colour key for a stage status. */
export function stageColorKey(
  status: StageStatus | undefined,
): "active" | "complete" | "warning" | "failed" | "idle" | "metal" {
  switch (status) {
    case "active":
      return "active";
    case "complete":
      return "complete";
    case "warning":
      return "warning";
    case "failed":
      return "failed";
    case "cancelled":
      return "idle";
    default:
      return "metal";
  }
}

/** Layout of ingredient bins on an arc to the left of the mixing vessel. */
export function binPosition(
  index: number,
  count: number,
): [number, number, number] {
  const radius = 3.0;
  const start = (115 * Math.PI) / 180;
  const end = (245 * Math.PI) / 180;
  const t = count <= 1 ? 0.5 : index / (count - 1);
  const a = start + (end - start) * t;
  return [Math.cos(a) * radius, 0, Math.sin(a) * radius];
}

export const STATION_X: Record<Exclude<StationId, "mixing">, number> = {
  nutrition: 2.4,
  texture_prediction: 3.6,
  optimization: 4.8,
};

export const PRODUCT_POSITION: [number, number, number] = [6.9, 0, 0];
export const VESSEL_POSITION: [number, number, number] = [0, 0, 0];

/** World-space anchor points for DOM labels. */
export const LABEL_HEIGHT = {
  bin: 1.65,
  station: 1.75,
  product: 1.55,
} as const;
