import {
  ActivityIcon,
  CpuIcon,
  MousePointerClickIcon,
  RadioIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { Reveal } from "@/components/landing/reveal";
import { FeatureCard, Section } from "./section-shell";

/**
 * One job: back up the "live 3D" claim by showing the chain a single event
 * travels, so the reader can see there is no front-end timer anywhere in it.
 *
 * This is the detail behind step two of "How it works", kept in its own band
 * because it answers a different question — not "what do I do" but "why should
 * I believe the scene".
 */
const STAGES = [
  {
    icon: MousePointerClickIcon,
    title: "You act",
    body: "Add cowpea, change a percentage, start an optimization.",
  },
  {
    icon: ShieldCheckIcon,
    title: "API validates",
    body: "FastAPI checks the request and creates a job.",
  },
  {
    icon: CpuIcon,
    title: "Worker computes",
    body: "Calculations run and publish stage and status.",
  },
  {
    icon: RadioIcon,
    title: "Events stream",
    body: "Server-Sent Events carry real progress to the browser.",
  },
  {
    icon: ActivityIcon,
    title: "Scene responds",
    body: "Shared state updates and the relevant 3D object reacts.",
  },
];

export function EventFlow() {
  return (
    <Section
      id="event-flow"
      tone="base"
      heading="How a real event reaches the 3D scene"
      lead="Progress percentages appear only when the worker can measure them. Otherwise you see the named stage with an indeterminate indicator — never a fake timer."
    >
      <ol className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/*
         * The connecting line is drawn only from the large breakpoint, where
         * the five cards really do sit in one row. Below that the grid wraps
         * and a horizontal rule would point at nothing. `top-19` is the centre
         * of the icon tile: card padding, eyebrow, gap and half the tile.
         */}
        <div
          aria-hidden
          className="absolute inset-x-8 top-19 hidden h-px bg-gradient-to-r from-transparent via-[var(--scene-glow)] to-transparent lg:block"
        />
        {STAGES.map(({ icon, title, body }, i) => (
          <li key={title}>
            <Reveal delay={i * 0.06} className="h-full">
              <FeatureCard icon={icon} eyebrow={`0${i + 1}`} title={title}>
                {body}
              </FeatureCard>
            </Reveal>
          </li>
        ))}
      </ol>
    </Section>
  );
}
