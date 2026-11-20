import type { TexturePrediction } from "@/types";

/**
 * Reads the prediction interval off a texture prediction. Accepts both the
 * tuple form and the `{ lower, upper }` object form the API may send.
 */
export function intervalOf(p: TexturePrediction): [number, number] | null {
  const raw = p.interval as unknown;
  if (Array.isArray(raw) && raw.length === 2) {
    return [Number(raw[0]), Number(raw[1])];
  }
  if (raw && typeof raw === "object") {
    const o = raw as { lower?: number; upper?: number };
    if (typeof o.lower === "number" && typeof o.upper === "number")
      return [o.lower, o.upper];
  }
  return null;
}
