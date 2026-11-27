"use client";

import { cn } from "@/lib/utils";
import {
  type AminoAcidUnit,
  type EnergyUnit,
  type ProteinUnit,
  usePreferencesStore,
} from "@/stores/preferencesStore";

function Choice<T extends string>({
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
      <div className="grid gap-2 sm:grid-cols-2">
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

/**
 * Display units (guide §5 page 17). These change only what the user sees; the
 * values sent to and stored from the backend stay in canonical units.
 */
export function UnitsPreferences() {
  const {
    aminoAcidUnit,
    energyUnit,
    proteinUnit,
    setAminoAcidUnit,
    setEnergyUnit,
    setProteinUnit,
  } = usePreferencesStore();

  return (
    <div className="flex flex-col gap-6">
      <p className="text-caption text-muted-foreground">
        Display only. Values sent to and stored from the backend stay in
        canonical units (mg per g protein, kcal, grams per 100 g).
      </p>
      <Choice<AminoAcidUnit>
        label="Amino acids"
        value={aminoAcidUnit}
        onChange={setAminoAcidUnit}
        options={[
          {
            value: "mg",
            label: "Milligrams",
            hint: "mg per g protein, as reported.",
          },
          {
            value: "g",
            label: "Grams",
            hint: "g per g protein.",
          },
        ]}
      />
      <Choice<EnergyUnit>
        label="Energy"
        value={energyUnit}
        onChange={setEnergyUnit}
        options={[
          { value: "kcal", label: "kcal", hint: "Kilocalories per 100 g." },
          { value: "kJ", label: "kJ", hint: "Kilojoules per 100 g." },
        ]}
      />
      <Choice<ProteinUnit>
        label="Protein"
        value={proteinUnit}
        onChange={setProteinUnit}
        options={[
          {
            value: "g_per_100g",
            label: "g per 100 g",
            hint: "Grams of protein in 100 g of product.",
          },
          {
            value: "percent",
            label: "Percent of mass",
            hint: "Same number, labelled as %.",
          },
        ]}
      />
    </div>
  );
}
