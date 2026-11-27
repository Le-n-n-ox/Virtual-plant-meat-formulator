import { BoxIcon, ShieldCheckIcon, SigmaIcon } from "lucide-react";
import { Reveal } from "@/components/landing/reveal";
import { FeatureCard, Section } from "./section-shell";

/**
 * One job: state the three commitments the rest of the product is held to.
 *
 * These are the non-negotiable rules from the frontend guide §1 restated for a
 * visitor, which is why the wording is careful about what the scene is: the
 * guide forbids ever describing it as a molecular or mechanical simulation.
 */
const PILLARS = [
  {
    icon: SigmaIcon,
    title: "Science",
    body: "Nutrition is a weighted calculation from traceable ingredient records — amino acids stored individually, limiting amino acid shown, missing data shown as missing.",
  },
  {
    icon: BoxIcon,
    title: "Live 3D",
    body: "An interactive process scene that reacts to validated edits and real backend job events. Rotate, inspect, compare — or switch to the 2D view.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Trust",
    body: "Every result carries its source, model version and uncertainty. Animation is never presented as a physical or molecular simulation.",
  },
];

export function Principles() {
  return (
    <Section
      id="principles"
      tone="muted"
      heading="Principles, not promises"
      lead="The scene is a communication layer. The numbers always come from the data services."
    >
      <div className="grid gap-4 md:grid-cols-3">
        {PILLARS.map(({ icon, title, body }, i) => (
          <Reveal key={title} delay={i * 0.08} className="h-full">
            <FeatureCard icon={icon} title={title}>
              {body}
            </FeatureCard>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
