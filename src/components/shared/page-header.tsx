export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: React.ReactNode }) {
  // On a narrow phone, several buttons wrapping to 2-3 rows pushes the page
  // content down further than a scroll costs -- one row that scrolls
  // sideways (like the tab bars elsewhere) keeps the header a fixed height.
  // -mx-3/px-3 lets that row's scroll area bleed to the screen edge, matching
  // the workspace's own edge padding, so swiping doesn't feel clipped.
  return <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>{actions ? <div className="-mx-3 flex items-center gap-2 overflow-x-auto px-3 sm:mx-0 sm:shrink-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&>*]:shrink-0">{actions}</div> : null}</div>;
}
