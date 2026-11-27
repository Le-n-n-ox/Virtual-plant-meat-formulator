import Link from "next/link";
import { BrandMark } from "@/components/layout/brand";

/**
 * Page footer. Not a content band: it closes the page and carries the two
 * standing notices.
 *
 * Real links only. Every entry below is either an in-page anchor whose `id`
 * exists in this page's sections, or a route that resolves — `/dashboard` and
 * `/formulations` redirect a signed-out visitor to `/login?next=…`, which is a
 * successful navigation. There is deliberately no link to a formulation id:
 * the footer used to point at `/formulations/demo`, which never existed, and
 * tests/e2e/landing.spec.ts now walks every link to keep that from returning.
 */
const EXPLORE = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#who-its-for", label: "Who it is for" },
  { href: "#event-flow", label: "Live 3D and job events" },
  { href: "#provenance", label: "Data sources" },
  { href: "#themes", label: "Themes" },
];

const WORKSPACE = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/formulations", label: "3D workspace" },
  { href: "/methodology", label: "Methodology" },
  { href: "/login", label: "Sign in" },
];

export function SiteFooter() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.2fr_1fr_1fr]">
        <div className="flex flex-col gap-3">
          <span className="flex items-center gap-2">
            <BrandMark className="size-5" /> Virtual Plant-Meat Formulator
          </span>
          <p className="max-w-sm text-small text-muted-foreground">
            A scientific formulation workspace for plant-based meat from
            indigenous Kenyan crops.
          </p>
        </div>
        <nav aria-label="Explore this page">
          <h2 className="text-small font-medium">Explore</h2>
          <ul className="mt-4 flex flex-col gap-2.5 text-small text-muted-foreground">
            {EXPLORE.map(({ href, label }) => (
              <li key={href}>
                <a
                  className="focus-ring rounded-sm transition-colors hover:text-foreground"
                  href={href}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Workspace">
          <h2 className="text-small font-medium">Workspace</h2>
          <ul className="mt-4 flex flex-col gap-2.5 text-small text-muted-foreground">
            {WORKSPACE.map(({ href, label }) => (
              <li key={href}>
                <Link
                  className="focus-ring rounded-sm transition-colors hover:text-foreground"
                  href={href}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-5 text-caption text-muted-foreground sm:flex-row sm:items-center sm:px-6">
          <span>
            3D visuals are illustrative and are not physical simulations.
          </span>
          <span className="sm:ml-auto">
            Data values belong to their cited sources and licences.
          </span>
        </div>
      </div>
    </footer>
  );
}
