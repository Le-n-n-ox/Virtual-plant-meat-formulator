"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProcessConditions } from "@/lib/api/jobs";

export interface ProcessDraft {
  moisture: string;
  screw: string;
  feed: string;
}

export const EMPTY_PROCESS: ProcessDraft = {
  moisture: "",
  screw: "",
  feed: "",
};

function num(text: string): number | undefined {
  if (text.trim() === "") return undefined;
  const n = Number(text);
  return Number.isFinite(n) ? n : undefined;
}

/** Returns the process block (moisture required when asked) or an error message. */
export function parseProcess(
  draft: ProcessDraft,
  required: boolean,
): { process?: Partial<ProcessConditions>; error?: string } {
  const moisture = num(draft.moisture);
  if (draft.moisture.trim() !== "" && moisture === undefined)
    return { error: "Moisture must be a number." };
  if (moisture !== undefined && (moisture < 0 || moisture > 100))
    return { error: "Moisture must be between 0 and 100 %." };
  if (required && moisture === undefined)
    return { error: "Moisture (%) is required for texture." };
  const screw = num(draft.screw);
  const feed = num(draft.feed);
  if ((screw !== undefined && screw < 0) || (feed !== undefined && feed < 0))
    return { error: "Screw speed and feed rate cannot be negative." };
  const process: Partial<ProcessConditions> = {};
  if (moisture !== undefined) process.moisture_percent = moisture;
  if (screw !== undefined) process.screw_speed_rpm = screw;
  if (feed !== undefined) process.feed_rate_kg_h = feed;
  return { process };
}

export function ProcessFields({
  idPrefix,
  value,
  onChange,
  moistureRequired,
}: {
  idPrefix: string;
  value: ProcessDraft;
  onChange: (next: ProcessDraft) => void;
  moistureRequired: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-moisture`}>
          Moisture (%){moistureRequired ? " (required)" : ""}
        </Label>
        <Input
          id={`${idPrefix}-moisture`}
          type="number"
          min={0}
          max={100}
          step="any"
          value={value.moisture}
          onChange={(e) => onChange({ ...value, moisture: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-screw`}>Screw speed (rpm)</Label>
        <Input
          id={`${idPrefix}-screw`}
          type="number"
          min={0}
          step="any"
          value={value.screw}
          onChange={(e) => onChange({ ...value, screw: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-feed`}>Feed rate (kg/h)</Label>
        <Input
          id={`${idPrefix}-feed`}
          type="number"
          min={0}
          step="any"
          value={value.feed}
          onChange={(e) => onChange({ ...value, feed: e.target.value })}
        />
      </div>
    </div>
  );
}
