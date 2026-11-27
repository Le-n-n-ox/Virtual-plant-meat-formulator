"use client";

import { cn } from "@/lib/utils";
import {
  type MotionPreference,
  type ViewMode,
  usePreferencesStore,
} from "@/stores/preferencesStore";

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; hint: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-small font-medium">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "focus-ring flex cursor-pointer flex-col gap-0.5 rounded-lg border p-3 text-small",
              value === o.value
                ? "border-primary bg-accent/50"
                : "hover:bg-muted/50",
            )}
          >
            <input
              type="radio"
              className="sr-only"
              name={label}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <span className="font-medium">{o.label}</span>
            <span className="text-caption text-muted-foreground">{o.hint}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function DisplayPreferences() {
  const { viewMode, motion, setViewMode, setMotion } = usePreferencesStore();
  return (
    <div className="flex flex-col gap-6">
      <Segmented<ViewMode>
        label="Process view"
        value={viewMode}
        onChange={setViewMode}
        options={[
          {
            value: "auto",
            label: "Automatic",
            hint: "3D when WebGL works and motion is allowed.",
          },
          {
            value: "3d",
            label: "Always 3D",
            hint: "Falls back to 2D only without WebGL.",
          },
          {
            value: "2d",
            label: "Always 2D",
            hint: "Lightweight schematic, same workflow.",
          },
        ]}
      />
      <Segmented<MotionPreference>
        label="Motion"
        value={motion}
        onChange={setMotion}
        options={[
          {
            value: "system",
            label: "Follow system",
            hint: "Uses your OS reduced-motion setting.",
          },
          {
            value: "reduce",
            label: "Reduce motion",
            hint: "No scene animation; status text only.",
          },
          {
            value: "full",
            label: "Full motion",
            hint: "Decorative scene animation on.",
          },
        ]}
      />
    </div>
  );
}
