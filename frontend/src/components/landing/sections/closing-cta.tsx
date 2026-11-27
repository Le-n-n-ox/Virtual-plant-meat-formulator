import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { Reveal } from "@/components/landing/reveal";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Section } from "./section-shell";

/**
 * One job: give the reader who scrolled the whole page somewhere to go.
 *
 * It states the sign-in requirement rather than hiding it, because the primary
 * link leads into the guarded workspace and a visitor who is not signed in
 * lands on /login?next=… — expected, but only if they were told.
 */
export function ClosingCta() {
  return (
    <Section
      id="start"
      tone="base"
      heading="Start a formulation"
      lead="The workspace needs an account. This page and the methodology behind it do not."
    >
      <Reveal className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link
          href="/dashboard"
          className={cn(
            buttonVariants({ size: "lg" }),
            "h-10 w-full px-4 sm:w-auto",
          )}
        >
          Open the workspace <ArrowRightIcon aria-hidden />
        </Link>
        <Link
          href="/login"
          className={cn(
            buttonVariants({ variant: "outline", size: "lg" }),
            "h-10 w-full px-4 sm:w-auto",
          )}
        >
          Sign in
        </Link>
      </Reveal>
    </Section>
  );
}
