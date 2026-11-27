import { ArrowRightIcon, BookOpenIcon } from "lucide-react";
import Link from "next/link";
import { HeroVisual } from "@/components/landing/hero-visual";
import { Reveal } from "@/components/landing/reveal";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Hero: say what this is for, and offer exactly two ways in — open the
 * workspace, or read the methodology first. Nothing else belongs in this band.
 *
 * Two calls to action and not three: the primary one needs a sign-in, the
 * secondary one does not, so between them every visitor has somewhere to go.
 *
 * The labelling rule (frontend guide §1, rule 3) is written as a sentence
 * beside the visual, not only as a chip inside it. It has to be readable
 * without hovering, and it has to survive the 2D fallback, which replaces
 * everything drawn inside the frame.
 */
export function Hero() {
  return (
    <section id="hero" className="relative isolate overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-70"
        style={{
          background:
            "radial-gradient(60% 50% at 75% 40%, color-mix(in oklch, var(--primary) 18%, transparent), transparent 70%), radial-gradient(40% 40% at 10% 10%, color-mix(in oklch, var(--scene-crop-2) 16%, transparent), transparent 70%)",
        }}
      />
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:py-24">
        <Reveal className="flex flex-col gap-6">
          <Badge variant="outline" className="gap-1.5">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden />
            Scientific formulation workspace
          </Badge>
          <h1 className="text-h1 text-balance sm:text-display">
            Formulate plant-based meat from indigenous Kenyan crops, with{" "}
            <span className="text-gradient">
              every number traced to its source.
            </span>
          </h1>
          {/*
           * The lead takes the h3 size step but not its weight: at 18px it has
           * to read as a paragraph under the headline, not as a second heading.
           */}
          <p className="max-w-xl text-h3 font-normal text-pretty text-muted-foreground">
            Build a blend from cowpea, sorghum, amaranth and more. Nutrition is
            calculated from published composition tables, texture comes from
            published extrusion measurements with a prediction interval, and the
            3D process view moves only when a real worker event says so.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Link
              href="/formulations"
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-10 w-full px-4 sm:w-auto",
              )}
            >
              Open the 3D workspace <ArrowRightIcon aria-hidden />
            </Link>
            <Link
              href="/methodology"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-10 w-full px-4 sm:w-auto",
              )}
            >
              <BookOpenIcon aria-hidden /> Read the methodology
            </Link>
          </div>
          <ul className="flex flex-col gap-2 text-small text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-8">
            <li className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-success" aria-hidden />
              No invented progress
            </li>
            <li className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-info" aria-hidden />
              Real worker events
            </li>
            <li className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-warning" aria-hidden />
              Illustrative 3D, always labelled
            </li>
          </ul>
        </Reveal>
        <Reveal delay={0.1} className="flex flex-col gap-3">
          <HeroVisual />
          <p className="text-caption text-pretty text-muted-foreground">
            The 3D view is illustrative: a drawing of validated formulation
            state and the stage a worker reports. It is not a physical,
            molecular or mechanical simulation, and it never produces a value.
          </p>
        </Reveal>
      </div>
      <div className="mx-auto flex w-full max-w-6xl justify-center px-4 pb-10 sm:px-6">
        <a
          href="#stats"
          aria-label="Scroll to overview"
          className="focus-ring flex flex-col items-center gap-1 rounded-md px-2 py-1 text-caption text-muted-foreground transition-colors hover:text-foreground"
        >
          Scroll
          <span
            aria-hidden
            className="animate-bounce text-body leading-none motion-reduce:animate-none"
          >
            ↓
          </span>
        </a>
      </div>
    </section>
  );
}
