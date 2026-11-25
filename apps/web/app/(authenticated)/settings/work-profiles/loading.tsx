export default function WorkProfilesLoading() {
  return (
    <div aria-busy="true" className="grid gap-6">
      <div className="h-24 animate-pulse rounded-[24px] bg-surface-strong" />
      <div className="h-80 animate-pulse rounded-[24px] bg-surface-strong" />
    </div>
  );
}
