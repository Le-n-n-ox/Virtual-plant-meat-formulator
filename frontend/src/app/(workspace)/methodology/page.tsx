import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ApprovedModels } from "@/components/models/approved-models";

export const metadata: Metadata = { title: "Methodology" };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}

export default function MethodologyPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-4 sm:p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Methodology</h1>
        <p className="text-sm text-muted-foreground">
          How the numbers in this application are produced, and what they do and
          do not mean.
        </p>
      </header>

      <Section title="Data sources">
        <ul className="list-disc pl-5">
          <li>
            <strong>Kenya Food Composition Tables 2018.</strong> Ingredient
            composition. Used for non-commercial research with acknowledgement
            of the source.
          </li>
          <li>
            <strong>FoodML 2023 high-moisture extrusion dataset.</strong> A
            literature dataset of texture measurements used to train the texture
            models. Licensed CC BY 4.0.
          </li>
        </ul>
        <p>
          Every ingredient value keeps its source, method and licence status.
          Exports exclude or summarise data whose licence does not allow
          redistribution.
        </p>
      </Section>

      <Section title="Nutrition">
        <p>
          Nutrition is a <strong>deterministic weighted mixture</strong>: each
          nutrient is the sum of the ingredient values weighted by their share
          of the formulation, reported per 100 g as formulated. There is no
          model and no estimation involved.
        </p>
        <p>
          <strong>Missing data is never treated as zero.</strong> If any
          ingredient has no reported value for a nutrient, the mixture value is
          shown as missing and the ingredients responsible are listed.
        </p>
      </Section>

      <Section title="Protein quality (AAS)">
        <p>
          Protein quality is reported as the{" "}
          <strong>amino acid score (AAS)</strong>: each indispensable amino
          acid, per gram of protein, is compared with the FAO 2013 reference
          pattern, and the lowest ratio gives the score and names the limiting
          amino acid. The provisional default pattern is older child, adolescent
          and adult.
        </p>
        <p>
          It is <strong>not DIAAS</strong>. DIAAS requires true ileal
          digestibility for each amino acid, which this application does not
          have, so digestibility is not applied and the result should not be
          read as a digestibility-corrected score. If any amino acid is missing
          from the data, the score is flagged incomplete.
        </p>
      </Section>

      <Section title="Texture models">
        <p>
          Texture predictions come from machine-learning models trained on
          literature data, so every value is a{" "}
          <strong>literature-derived estimate</strong>, not a measurement of
          your product.
        </p>
        <ul className="list-disc pl-5">
          <li>
            <strong>Group-held-out cross-validation:</strong> samples from the
            same study are kept together, so reported errors reflect performance
            on unseen sources.
          </li>
          <li>
            <strong>90 % prediction intervals</strong> accompany each value.
          </li>
          <li>
            <strong>Applicability domain:</strong> the models were trained on
            blends of protein isolates and concentrates. For a formulation
            outside that range no number is given at all; the page shows why it
            is out of range and the nearest published samples for comparison.
            Optimization with a texture objective only searches blends inside
            the supported range.
          </li>
          <li>
            <strong>Approval workflow:</strong> a trained model is only used
            after an administrator approves it. Retired models are never used.
          </li>
        </ul>
        <h3 className="mt-2 text-sm font-medium text-foreground">
          Approved models (live)
        </h3>
        <ApprovedModels />
      </Section>

      <Section title="Optimization">
        <ul className="list-disc pl-5">
          <li>
            <strong>Linear problems</strong> (protein, cost and nutrient limits)
            are solved as linear programs with HiGHS.
          </li>
          <li>
            <strong>Problems with texture models</strong> use a multistart SLSQP
            search, since those objectives are not linear.
          </li>
          <li>
            Candidates are ranked and marked <strong>Pareto</strong> when no
            other candidate is at least as good on every objective and better on
            one.
          </li>
          <li>
            When no formulation satisfies all constraints, the job reports
            <strong> infeasibility</strong> and lists the limits that conflict.
          </li>
        </ul>
      </Section>

      <Section title="AI explanations">
        <p>
          An NVIDIA-hosted language model can explain stored results in plain
          language. It <strong>only explains</strong>; it never produces
          scientific values. Every number in an explanation is checked against
          the stored result, and any number that does not match is flagged.
          Explanations are not measurements.
        </p>
      </Section>
    </main>
  );
}
