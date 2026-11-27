"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/client";
import type { ProcessConditions } from "@/lib/api/jobs";
import { describeRunError } from "@/lib/jobs/job-runner";

const TARGETS = [
  { id: "hardness", label: "Hardness" },
  { id: "chewiness", label: "Chewiness" },
] as const;

function optionalNumber(text: string): number | undefined {
  if (text.trim() === "") return undefined;
  const n = Number(text);
  return Number.isFinite(n) ? n : undefined;
}

export function TextureDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (process: ProcessConditions, targets: string[]) => Promise<void>;
}) {
  const [moisture, setMoisture] = useState("");
  const [screw, setScrew] = useState("");
  const [feed, setFeed] = useState("");
  const [targets, setTargets] = useState<string[]>(["hardness"]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const moistureValue = optionalNumber(moisture);
  const valid =
    moistureValue !== undefined &&
    moistureValue >= 0 &&
    moistureValue <= 100 &&
    targets.length > 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || moistureValue === undefined) return;
    setPending(true);
    setError(null);
    try {
      const process: ProcessConditions = { moisture_percent: moistureValue };
      const screwValue = optionalNumber(screw);
      const feedValue = optionalNumber(feed);
      if (screwValue !== undefined) process.screw_speed_rpm = screwValue;
      if (feedValue !== undefined) process.feed_rate_kg_h = feedValue;
      await onSubmit(process, targets);
      onOpenChange(false);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? describeRunError(e.code, e.message)
          : e instanceof Error
            ? e.message
            : "Could not start the job.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Predict texture</DialogTitle>
            <DialogDescription>
              Process conditions for the saved version. The result is a
              literature-derived estimate, not a measurement.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tx-moisture">Moisture (%) — required</Label>
            <Input
              id="tx-moisture"
              type="number"
              min={0}
              max={100}
              step="any"
              value={moisture}
              onChange={(e) => setMoisture(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tx-screw">Screw speed (rpm)</Label>
              <Input
                id="tx-screw"
                type="number"
                min={0}
                step="any"
                value={screw}
                onChange={(e) => setScrew(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tx-feed">Feed rate (kg/h)</Label>
              <Input
                id="tx-feed"
                type="number"
                min={0}
                step="any"
                value={feed}
                onChange={(e) => setFeed(e.target.value)}
              />
            </div>
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-small font-medium">Targets</legend>
            {TARGETS.map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-small">
                <input
                  type="checkbox"
                  checked={targets.includes(t.id)}
                  onChange={(e) =>
                    setTargets((cur) =>
                      e.target.checked
                        ? [...cur, t.id]
                        : cur.filter((x) => x !== t.id),
                    )
                  }
                />
                {t.label}
              </label>
            ))}
          </fieldset>
          {error && (
            <p role="alert" className="text-small text-destructive">
              {error}
            </p>
          )}
          <DialogFooter showCloseButton>
            <Button type="submit" disabled={!valid || pending}>
              Run prediction
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
