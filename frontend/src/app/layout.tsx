import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { MockProvider } from "@/components/mock-provider";
import { PreferencesHydrator } from "@/components/preferences-hydrator";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/lib/query/provider";
import { JobInvalidator } from "@/lib/query/invalidator";
import "./globals.css";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <TooltipProvider>
            <MockProvider>
              <QueryProvider>
                <JobInvalidator />
                {children}
                <Toaster />
                <PreferencesHydrator />
              </QueryProvider>
            </MockProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
