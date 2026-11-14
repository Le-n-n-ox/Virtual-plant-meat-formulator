type PlaceholderPageProps = {
  title: string;
  pageNumber: number;
  owner: string;
  phase: string;
  children?: React.ReactNode;
};

export function PlaceholderPage({
  title,
  pageNumber,
  owner,
  phase,
  children,
}: PlaceholderPageProps) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-8">
      <p className="text-sm text-muted-foreground">
        Page {pageNumber} · Owner: {owner} · Phase: {phase}
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p>Not implemented yet</p>
      {children}
    </main>
  );
}
