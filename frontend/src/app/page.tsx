import { CropMarquee } from "@/components/landing/crop-marquee";
import { ScrollProgress } from "@/components/landing/scroll-progress";
import { SectionNav } from "@/components/landing/section-nav";
import { SiteHeader } from "@/components/landing/site-header";
import { Audience } from "@/components/landing/sections/audience";
import { ClosingCta } from "@/components/landing/sections/closing-cta";
import { Crops } from "@/components/landing/sections/crops";
import { EventFlow } from "@/components/landing/sections/event-flow";
import { Hero } from "@/components/landing/sections/hero";
import { HowItWorks } from "@/components/landing/sections/how-it-works";
import { Principles } from "@/components/landing/sections/principles";
import { Proof } from "@/components/landing/sections/proof";
import { Provenance } from "@/components/landing/sections/provenance";
import { SiteFooter } from "@/components/landing/sections/site-footer";
import { Themes } from "@/components/landing/sections/themes";

/**
 * Public landing page.
 *
 * This file is the running order and nothing else: every band lives in
 * components/landing/sections/, owns one job and one heading, and gets its
 * padding, measure and surface tone from the shared `Section` shell there. The
 * order is the argument the page makes — what this is, what it is like to use,
 * who it is for, why the numbers can be trusted, where they come from — so
 * reordering it here is the only edit needed to change that argument.
 *
 * Surface tones alternate down the list (hero base, marquee muted, stats base,
 * and so on), which is why each section states its own tone rather than
 * deriving one: an inserted section would otherwise silently invert every band
 * below it.
 */
export default function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <ScrollProgress />
      <SiteHeader />
      <SectionNav />

      <main className="flex-1">
        <Hero />
        <CropMarquee />
        <Proof />
        <HowItWorks />
        <Audience />
        <Principles />
        <EventFlow />
        <Crops />
        <Provenance />
        <Themes />
        <ClosingCta />
      </main>

      <SiteFooter />
    </div>
  );
}
