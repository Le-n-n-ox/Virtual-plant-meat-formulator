import type { ReactNode } from "react";

export default function FormulationLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-screen gap-6 p-6 lg:grid-cols-2">
      <section
        aria-label="Scene panel (3D or 2D fallback)"
        className="rounded-lg border p-6"
      >
        <h2 className="font-semibold">Scene panel (3D or 2D fallback)</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Not implemented yet
        </p>
      </section>
      <section
        aria-label="Active tab content"
        className="rounded-lg border p-6"
      >
        <h2 className="font-semibold">Active tab content</h2>
        <div className="mt-3">{children}</div>
      </section>
    </div>
  );
}
