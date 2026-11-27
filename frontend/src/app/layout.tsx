import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import { PreferencesHydrator } from "@/components/preferences-hydrator";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/lib/query/provider";
import { JobInvalidator } from "@/lib/query/invalidator";
import "./globals.css";

/*
 * Three faces, one per job (the type scale that sizes them lives in
 * globals.css):
 *
 *   --font-sans    Geist          body copy, controls, table text
 *   --font-display Space Grotesk  every heading, through --font-heading
 *   --font-mono    Geist Mono     figures read down a column (.font-numeric)
 *
 * Headings were set in Geist at a heavier weight until now, which left the
 * hierarchy resting on size alone: a 14 px panel heading and a 14 px paragraph
 * read as the same thing in a dense workspace. Space Grotesk was chosen over
 * tightening Geist because it changes the voice as well as the weight — its
 * flat terminals and narrow apertures read as instrument lettering next to
 * Geist's humanist body text, which suits a scientific tool and makes a
 * heading legible as a heading at 16 px. It is a variable font (300-700) in the
 * same grotesque skeleton as Geist, so the pairing stays quiet, and next/font
 * self-hosts it with a metric-matched fallback, so the extra face costs one
 * subsetted woff2 and no layout shift.
 */
const geistSans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});
const displayFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: {
    default: "Virtual Plant-Meat Formulator",
    template: "%s · Virtual Plant-Meat Formulator",
  },
  description:
    "A scientific formulation workspace for plant-based meat from indigenous Kenyan crops: traceable nutrition, validated predictions and a live 3D process view.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${displayFont.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <TooltipProvider>
            <QueryProvider>
              <JobInvalidator />
              {children}
              <Toaster />
              <PreferencesHydrator />
            </QueryProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
