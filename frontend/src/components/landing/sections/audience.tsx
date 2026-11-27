import {
  BadgeCheckIcon,
  ClipboardCheckIcon,
  FlaskConicalIcon,
} from "lucide-react";
import { Reveal } from "@/components/landing/reveal";
import { FeatureCard, Section } from "./section-shell";

/**
 * One job: let a visitor recognise themselves before they sign in.
 *
 * Each entry describes a capability the application actually has, not a
 * persona we would like to attract — the reviewer row exists because
 * /methodology is public, and the administrator row because a texture model is
 * only served after an approval step.
 */
const AUDIENCES = [
  {
    icon: FlaskConicalIcon,
    title: "Food scientists",
    body: "Build a blend from indigenous Kenyan crops, read the nutrition it implies per 100 g as formulated, and get a texture estimate with a 90 % prediction interval.",
  },
  {
    icon: ClipboardCheckIcon,
    title: "Reviewers and supervisors",
    body: "Check how a figure was produced without an account. The methodology page is public and names every data source, calculation and stated limitation.",
  },
  {
    icon: BadgeCheckIcon,
    title: "Administrators",
    body: "Decide which trained texture model is allowed to serve predictions. A model is used only after approval, and a retired model is never used again.",
  },
];

export function Audience() {
  return (
    <Section
      id="who-its-for"
      tone="base"
      heading="Who it is for"
      lead="Three kinds of reader, one set of numbers."
    >
      <div className="grid gap-4 md:grid-cols-3">
        {AUDIENCES.map(({ icon, title, body }, i) => (
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
