import { BeakerIcon, PlayIcon, ScrollTextIcon } from "lucide-react";
import { Reveal } from "@/components/landing/reveal";
import { FeatureCard, Section } from "./section-shell";

/**
 * One job: take a first-time visitor from an empty formulation to a result in
 * three steps. This is the "what will I actually do here" section, so it stays
 * at the level of the user's actions; the machinery behind step two is the next
 * section's job.
 */
const STEPS = [
  {
    icon: BeakerIcon,
    title: "Build the blend",
    body: "Add crops from the catalogue or drag them into the mixing vessel, then set each one's share of the formulation. The editor applies the same validation rules as the API, so an invalid blend never reaches a job.",
  },
  {
    icon: PlayIcon,
    title: "Run a calculation",
    body: "Nutrition, texture and optimization each run as a backend job. The named stage comes from worker events; a percentage appears only when an event carries a real completed and total count.",
  },
  {
    icon: ScrollTextIcon,
    title: "Read the result with its sources",
    body: "Every value arrives with its data source, model version and uncertainty where there is one. Missing data is reported as missing and the ingredients responsible are named — it is never treated as zero.",
  },
];

export function HowItWorks() {
  return (
    <Section
      id="how-it-works"
      tone="muted"
      heading="How it works, in three steps"
      lead="There is no demo data path: the app talks only to the real backend, so each step is the real thing."
    >
      <ol className="grid gap-4 md:grid-cols-3">
        {STEPS.map(({ icon, title, body }, i) => (
          <li key={title}>
            <Reveal delay={i * 0.08} className="h-full">
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
