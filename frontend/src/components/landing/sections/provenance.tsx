import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { Reveal } from "@/components/landing/reveal";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Section } from "./section-shell";

/**
 * One job: name the datasets behind the numbers, and say what their licences
 * allow.
 *
 * Every entry is a source the application really reads, with the wording taken
 * from /methodology and the backend guide's source table — this section must
 * not be the place a new source name appears for the first time. The Kenya
 * Food Composition Tables citation matches `SOURCE_CITATION` in the backend's
 * KFCT importer, so the landing page and the ingested rows agree.
 */
const SOURCES = [
  {
    name: "Kenya Food Composition Tables 2018",
    citation: "FAO & Government of Kenya. 2018. Nairobi, FAO.",
    body: "The starting source for Kenyan foods and crops, and the basis of every ingredient composition record. Used for non-commercial research with acknowledgement of the source.",
  },
  {
    name: "FAO/INFOODS guidance",
    citation: "Food matching, data quality and nutrient tagnames.",
    body: "How a food is identified, how two datasets are merged, and how a nutrient is named. Units and food descriptions are normalised against this guidance before anything is merged.",
  },
  {
    name: "FoodML 2023 high-moisture extrusion dataset",
    citation: "Licensed CC BY 4.0.",
    body: "The published texture measurements the texture models are trained on. Every texture figure in the application is therefore a literature-derived estimate, not a measurement of your product.",
  },
];

export function Provenance() {
  return (
    <Section
      id="provenance"
      tone="base"
      heading="Where the numbers come from"
      lead="Composition and texture data are published datasets. Each value keeps its origin, method and licence, and the licence decides what an export may contain."
      bodyClassName="flex flex-col gap-8"
    >
      <ul className="grid gap-4 md:grid-cols-3">
        {SOURCES.map(({ name, citation, body }, i) => (
          <li key={name}>
            <Reveal delay={i * 0.08} className="h-full">
              <div className="flex h-full flex-col gap-2 rounded-2xl border bg-card p-6">
                <h3 className="text-h4 text-balance">{name}</h3>
                <p className="text-caption text-muted-foreground">{citation}</p>
                <p className="text-small text-muted-foreground">{body}</p>
              </div>
            </Reveal>
          </li>
        ))}
      </ul>
      <Reveal
        delay={0.1}
        className="flex flex-col gap-4 rounded-2xl border bg-muted/40 p-6 sm:p-8"
      >
        <p className="max-w-3xl text-small text-pretty text-muted-foreground">
          Coverage is uneven, and the application says so rather than filling
          the gap. Not every crop, variety or processing form has a complete
          profile; where a value is missing the result is reported as missing
          and the ingredients responsible are named. Exports exclude or
          summarise data whose licence does not allow redistribution.
        </p>
        <Link
          href="/methodology"
          className={cn(
            buttonVariants({ variant: "outline", size: "lg" }),
            "h-10 w-full px-4 sm:w-auto sm:self-start",
          )}
        >
          Read the full methodology <ArrowRightIcon aria-hidden />
        </Link>
      </Reveal>
    </Section>
  );
}
