import {
  ArrowRightIcon,
  BookOpenIcon,
  FlaskConicalIcon,
  ShieldCheckIcon,
  WheatIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BackendStatus } from "@/components/layout/backend-status";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

const ACTIONS = [
  {
    href: "/formulations/demo",
    title: "Open the 3D workspace",
    body: "Build a blend and watch the process view react to validated edits and job events.",
    icon: FlaskConicalIcon,
  },
  {
    href: "/ingredients",
    title: "Ingredient catalogue",
    body: "Indigenous Kenyan crops with source, form and data-quality metadata.",
    icon: WheatIcon,
  },
  {
    href: "/methodology",
    title: "Methodology",
    body: "Data sources, calculation methods and the labelling rules for illustrative visuals.",
    icon: BookOpenIcon,
  },
] as const;

export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Workspace overview</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Welcome back
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Create formulations, calculate nutrition from traceable data and
          compare candidates. Every number shows its source; every visual is
          labelled for what it is.
        </p>
      </header>

      <section aria-label="Quick actions" className="grid gap-4 md:grid-cols-3">
        {ACTIONS.map(({ href, title, body, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardHeader>
                <span className="mb-2 flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Icon className="size-4.5" aria-hidden />
                </span>
                <CardTitle className="flex items-center gap-1">
                  {title}
                  <ArrowRightIcon
                    className="size-4 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden
                  />
                </CardTitle>
                <CardDescription>{body}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent formulations</CardTitle>
            <CardDescription>
              Your saved formulations will appear here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
              <FlaskConicalIcon
                className="size-8 text-muted-foreground"
                aria-hidden
              />
              <p className="text-sm text-muted-foreground">
                The formulations API is not connected yet. Try the demo
                workspace in the meantime.
              </p>
              <Link
                href="/formulations/demo"
                className={cn(buttonVariants({ size: "sm" }))}
              >
                Open demo workspace
              </Link>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <BackendStatus />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheckIcon className="size-4 text-success" aria-hidden />{" "}
                Trust rules
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                <li>
                  Nutrition is calculated from source data, never generated.
                </li>
                <li>Progress appears only when the worker can measure it.</li>
                <li>
                  3D appearance is illustrative unless a validated model says
                  otherwise.
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
