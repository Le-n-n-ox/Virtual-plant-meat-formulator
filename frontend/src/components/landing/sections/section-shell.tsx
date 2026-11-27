import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Reveal } from "@/components/landing/reveal";
import { cn } from "@/lib/utils";

/**
 * Surface tone of a band. The page alternates the two so a reader can feel
 * where one section ends and the next begins before reading a word of it.
 *
 * Both tones are theme tokens rather than fixed colours: the same page is read
 * in six themes, three light and three dark, so a literal colour would invert
 * the contrast step in half of them. `bg-muted/30` is deliberately a small step
 * away from `bg-background` — the separation is carried by the border and the
 * whitespace, and the tone only confirms it.
 */
export type SectionTone = "base" | "muted";

const TONE: Record<SectionTone, string> = {
  base: "bg-background",
  muted: "bg-muted/30",
};

/**
 * One band of the landing page: its heading, an optional lead, and its body.
 *
 * Every section goes through this shell, so the page has exactly one answer to
 * padding, measure and tone. Keeping those three decisions in one file is what
 * makes the vertical rhythm consistent — a new section cannot drift by picking
 * its own numbers — and it is why each section file is short enough to read in
 * one go.
 *
 * `heading` is a required prop rather than something a section renders for
 * itself, because the rule for this page is one section, one job, one heading.
 */
export function Section({
  id,
  tone,
  heading,
  lead,
  children,
  bodyClassName,
}: {
  id: string;
  tone: SectionTone;
  heading: string;
  lead?: ReactNode;
  children?: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section
      id={id}
      /*
       * The sticky site header and the sticky section nav are about 6.5rem of
       * chrome together, which is more than the 5.5rem scroll margin globals.css
       * gives every `section[id]`, so an in-page anchor needs its own clearance
       * here or the heading lands underneath the nav.
       */
      className={cn("scroll-mt-28 border-t", TONE[tone])}
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <Reveal className="flex max-w-2xl flex-col gap-3">
          <h2 className="text-h2 text-balance sm:text-h1">{heading}</h2>
          {lead ? (
            <p className="text-body text-pretty text-muted-foreground">
              {lead}
            </p>
          ) : null}
        </Reveal>
        {children ? (
          <div className={cn("mt-12", bodyClassName)}>{children}</div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * The card that repeats across the step, audience and principle grids: an
 * optional eyebrow, an icon tile, a title and one paragraph.
 *
 * Shared so those grids cannot drift apart in radius, padding or icon size,
 * which is the detail that makes a page of cards look either designed or
 * assembled. The eyebrow is `font-numeric` because where it is used it is a
 * step number that the reader counts down a column.
 */
export function FeatureCard({
  icon: Icon,
  eyebrow,
  title,
  children,
}: {
  icon: LucideIcon;
  eyebrow?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="card-lift flex h-full flex-col gap-4 rounded-2xl border bg-card p-6">
      {eyebrow ? (
        <span className="font-numeric text-caption font-medium text-muted-foreground">
          {eyebrow}
        </span>
      ) : null}
      <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-h4">{title}</h3>
        <p className="text-small text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}
