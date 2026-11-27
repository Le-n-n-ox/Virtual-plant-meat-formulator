import { Reveal } from "@/components/landing/reveal";
import { ThemePicker } from "@/components/theme/theme-picker";
import { Section } from "./section-shell";

/**
 * One job: let the visitor change the theme and watch the whole page follow.
 *
 * It sits near the end on purpose — by this point there is a hero visual, a
 * card grid and a crop palette above it to re-colour, so the claim that the
 * interface, the charts and the 3D scene share one set of tokens is something
 * the reader can check by scrolling back up rather than something we assert.
 */
export function Themes() {
  return (
    <Section
      id="themes"
      tone="muted"
      heading="Six themes, one consistent workspace"
      lead="Pick a theme — the interface, the charts and the 3D scene all change together."
    >
      <Reveal delay={0.05}>
        <ThemePicker />
      </Reveal>
    </Section>
  );
}
