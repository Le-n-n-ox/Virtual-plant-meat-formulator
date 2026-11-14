import {
  ActivityIcon,
  ArrowRightIcon,
  BoxIcon,
  CpuIcon,
  FlaskConicalIcon,
  MousePointerClickIcon,
  RadioIcon,
  ShieldCheckIcon,
  SigmaIcon,
} from "lucide-react";
import Link from "next/link";
import { BrandMark } from "@/components/layout/brand";
import { HeroVisual } from "@/components/landing/hero-visual";
import { Reveal } from "@/components/landing/reveal";
import { SiteHeader } from "@/components/landing/site-header";
import { ThemePicker } from "@/components/theme/theme-picker";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

const STEPS = [
  {
    icon: MousePointerClickIcon,
    title: "You act",
    body: "Add cowpea, change a percentage, start an optimization.",
  },
  {
    icon: ShieldCheckIcon,
    title: "API validates",
    body: "FastAPI checks the request and creates a job.",
  },
  {
    icon: CpuIcon,
    title: "Worker computes",
    body: "Calculations run and publish stage and status.",
  },
  {
    icon: RadioIcon,
    title: "Events stream",
    body: "Server-Sent Events carry real progress to the browser.",
  },
  {
    icon: ActivityIcon,
    title: "Scene responds",
    body: "Shared state updates and the relevant 3D object reacts.",
  },
];

const CROPS = [
  "Cowpea",
  "Bambara groundnut",
  "Amaranth",
  "Sorghum",
  "Finger millet",
  "Pigeon pea",
  "Green gram",
  "Lablab bean",
];

export default function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 opacity-70"
            style={{
              background:
                "radial-gradient(60% 50% at 75% 40%, color-mix(in oklch, var(--primary) 18%, transparent), transparent 70%), radial-gradient(40% 40% at 10% 10%, color-mix(in oklch, var(--scene-crop-2) 16%, transparent), transparent 70%)",
            }}
          />
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:py-20">
            <Reveal className="flex flex-col gap-6">
              <Badge variant="outline" className="gap-1.5">
                <span
                  className="size-1.5 rounded-full bg-primary"
                  aria-hidden
                />
                Indigenous Kenyan crops · scientific workspace
              </Badge>
              <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                Formulate plant-based meat with numbers you can trace.
              </h1>
              <p className="max-w-xl text-lg text-pretty text-muted-foreground">
                Build blends from cowpea, sorghum, amaranth and more. Calculate
                nutrition from source data, predict texture from measured
                experiments, and watch a live 3D process view respond to every
                real event.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/formulations"
                  className={cn(buttonVariants({ size: "lg" }), "h-10 px-4")}
                >
                  <FlaskConicalIcon aria-hidden /> Try the 3D workspace
                </Link>
                <Link
                  href="/methodology"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "h-10 px-4",
                  )}
                >
                  Read the methodology
                </Link>
              </div>
            </Reveal>
            <Reveal
              delay={0.1}
              className="rounded-3xl border bg-card/40 p-2 shadow-sm backdrop-blur"
            >
              <HeroVisual />
            </Reveal>
          </div>
        </section>

        {/* Pillars */}
        <section id="principles" className="scroll-mt-20 border-t bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <Reveal>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Built like a scientific workstation
              </h2>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Scientific values live in tables and charts. The 3D scene adds
                spatial context, feedback and interaction.
              </p>
            </Reveal>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {PILLARS.map(({ icon: Icon, title, body }, i) => (
                <Reveal
                  key={title}
                  delay={i * 0.08}
                  className="rounded-2xl border bg-card p-6"
                >
                  <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <Reveal>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                How a real event reaches the 3D scene
              </h2>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Progress percentages appear only when the worker can measure
                them. Otherwise you see the named stage with an indeterminate
                indicator — never a fake timer.
              </p>
            </Reveal>
            <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {STEPS.map(({ icon: Icon, title, body }, i) => (
                <li key={title}>
                  <Reveal
                    delay={i * 0.06}
                    className="h-full rounded-2xl border bg-card p-5"
                  >
                    <span className="text-xs font-medium text-muted-foreground tabular-nums">
                      0{i + 1}
                    </span>
                    <Icon className="mt-2 size-5 text-primary" aria-hidden />
                    <h3 className="mt-3 text-sm font-semibold">{title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Themes */}
        <section id="themes" className="scroll-mt-20 border-t bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <Reveal>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Six themes, one consistent workspace
              </h2>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Pick a theme — the interface, the charts and the 3D scene above
                all change together.
              </p>
            </Reveal>
            <Reveal delay={0.05} className="mt-8">
              <ThemePicker />
            </Reveal>
          </div>
        </section>

        {/* Crops + CTA */}
        <section>
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <Reveal className="flex flex-col items-start gap-6 rounded-3xl border bg-card p-8 sm:p-10">
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Start from crops grown in Kenya
              </h2>
              <ul className="flex flex-wrap gap-2" aria-label="Example crops">
                {CROPS.map((c, i) => (
                  <li
                    key={c}
                    className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm"
                  >
                    <span
                      aria-hidden
                      className="size-2 rounded-full"
                      style={{ background: `var(--scene-crop-${(i % 6) + 1})` }}
                    />
                    {c}
                  </li>
                ))}
              </ul>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Composition data starts from the Kenya Food Composition Tables
                2018, with FAO/INFOODS guidance and supplementary sources — each
                value keeps its origin, method and licence.
              </p>
              <Link
                href="/dashboard"
                className={cn(buttonVariants({ size: "lg" }), "h-10 px-4")}
              >
                Open the workspace <ArrowRightIcon aria-hidden />
              </Link>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:px-6">
          <span className="flex items-center gap-2">
            <BrandMark className="size-5" /> Virtual Plant-Meat Formulator
          </span>
          <span className="sm:ml-auto">
            3D visuals are illustrative and are not physical simulations.
          </span>
        </div>
      </footer>
    </div>
  );
}
