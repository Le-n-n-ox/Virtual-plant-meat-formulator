import { Reveal } from "@/components/landing/reveal";
import { CROPS, CROP_BLURBS, cropToken } from "@/lib/landing-content";
import { Section } from "./section-shell";

/**
 * One job: show the crops a formulation can start from.
 *
 * Each crop keeps the identity colour the tables, the charts and the 3D scene
 * use for it, which is why the dot reads a `--scene-crop-*` token instead of a
 * colour chosen here: a visitor who later opens the workspace should recognise
 * cowpea by the same swatch.
 *
 * Where the composition data behind these crops comes from is the next
 * section's job, not this one's.
 */
export function Crops() {
  return (
    <Section
      id="crops"
      tone="muted"
      heading="Start from crops grown in Kenya"
      lead="Eight indigenous crops are in the demo catalogue, each one a flour or concentrate a blend can be built from."
    >
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CROPS.map((crop, i) => (
          <li key={crop}>
            <Reveal delay={i * 0.04} className="h-full">
              <div className="card-lift flex h-full flex-col gap-2 rounded-xl border bg-card p-4">
                <span
                  aria-hidden
                  className="size-2.5 rounded-full"
                  style={{ background: cropToken(i) }}
                />
                <h3 className="text-small">{crop}</h3>
                <p className="text-caption text-muted-foreground">
                  {CROP_BLURBS[crop] ?? "Indigenous Kenyan crop"}
                </p>
              </div>
            </Reveal>
          </li>
        ))}
      </ul>
    </Section>
  );
}
