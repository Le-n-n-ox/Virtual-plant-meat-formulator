import { Stats } from "@/components/landing/stats";
import { Reveal } from "@/components/landing/reveal";
import { Section } from "./section-shell";

/**
 * One job: say what kind of tool this is, in four product facts.
 *
 * The figures come from `Stats`, which counts things that are true of the
 * build — crops in the catalogue, job types, themes — rather than usage or
 * performance metrics, which this project has none of and must not imply.
 */
export function Proof() {
  return (
    <Section
      id="stats"
      tone="base"
      heading="Built like a scientific workstation"
      lead="Scientific values live in tables and charts. The 3D scene adds spatial context, feedback and interaction — it never calculates a result."
    >
      <Reveal delay={0.08}>
        <Stats />
      </Reveal>
    </Section>
  );
}
