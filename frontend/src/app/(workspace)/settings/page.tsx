import type { Metadata } from "next";
import { DisplayPreferences } from "@/components/settings/display-preferences";
import { ThemePicker } from "@/components/theme/theme-picker";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Stored on this device.</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>
            Six themes. The interface, charts and the 3D process view all follow
            the selected theme.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ThemePicker />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Display and accessibility</CardTitle>
        </CardHeader>
        <CardContent>
          <DisplayPreferences />
        </CardContent>
      </Card>
    </main>
  );
}
