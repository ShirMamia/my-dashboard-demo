export function PageHeader({
  title,
  children,
}: {
  title: React.ReactNode;
  /** Meta and the page's primary action, at inline-end. */
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="min-w-0 text-xl font-semibold">{title}</h1>
      {children ? <div className="flex flex-wrap items-center gap-3">{children}</div> : null}
    </header>
  );
}
