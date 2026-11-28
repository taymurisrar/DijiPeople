export default function DecisionsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading Decisions" className="grid gap-6" role="status">
      <div className="h-24 animate-pulse rounded-[24px] bg-surface-strong" />
      <div className="h-80 animate-pulse rounded-[24px] bg-surface-strong" />
    </div>
  );
}
