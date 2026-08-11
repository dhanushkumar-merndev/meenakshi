export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: React.ReactNode }) {
  return <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>{actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}</div>;
}
