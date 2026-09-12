/*
 * BUG-3336 — the subscription routes had no `loading.tsx` at all, so
 * `SubscriptionSettingsPage` awaiting three API calls server-side meant the
 * previous screen sat on the page, unchanged, until the slowest of them
 * returned. Matches the skeleton convention used elsewhere under
 * `(authenticated)/` (see `employees/loading.tsx`).
 */
export default function SubscriptionSettingsLoading() {
  return (
    <div className="space-y-6">
      <div className="h-14 animate-pulse rounded-[20px] bg-surface-strong" />
      <div className="h-48 animate-pulse rounded-[24px] bg-surface-strong" />
      <div className="h-80 animate-pulse rounded-[24px] bg-surface-strong" />
    </div>
  );
}
