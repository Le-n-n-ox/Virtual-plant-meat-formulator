import {
  ArrowRightIcon,
  BookOpenIcon,
  FlaskConicalIcon,
  ShieldCheckIcon,
  WheatIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { RecentFormulations } from "@/components/formulation/recent-formulations";
import { DataQualityNotice } from "@/components/dashboard/data-quality-notice";
import { RecentJobs } from "@/components/jobs/recent-jobs";
import { BackendStatus } from "@/components/layout/backend-status";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Dashboard" };

const ACTIONS = [
  {
    href: "/formulations",
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
        <p className="text-small text-muted-foreground">Workspace overview</p>
        <h1 className="text-h2 sm:text-h1">Welcome back</h1>
        <p className="max-w-2xl text-small text-muted-foreground">
          Create formulations, calculate nutrition from traceable data and
          compare candidates. Every number shows its source; every visual is
          labelled for what it is.
        </p>
      </header>

      <section aria-label="Quick actions" className="grid gap-4 md:grid-cols-3">
        {/*
         * The card is the whole hit area of each link, so its hover and focus
         * treatment comes from the Card primitive's `interactive` variant
         * instead of being spelled out here. The link keeps `group`, which is
         * what lets the card react to the focus the card itself cannot
         * receive, and `outline-none`, so the indicator is the card's one
         * solid ring rather than that ring plus a browser outline.
         */}
        {ACTIONS.map(({ href, title, body, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-xl outline-none"
          >
            <Card interactive className="h-full">
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
              Your most recently updated formulations.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <RecentFormulations />
            <div>
              <h3 className="mb-2 text-h4">Running and recent jobs</h3>
              <RecentJobs />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <DataQualityNotice />
          <BackendStatus />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheckIcon className="size-4 text-success" aria-hidden />{" "}
                Trust rules
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-4 text-small text-muted-foreground">
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
