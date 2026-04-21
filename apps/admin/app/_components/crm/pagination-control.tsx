"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function PaginationControl({
  page,
  totalPages,
}: {
  page: number;
  totalPages: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function goTo(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(nextPage));
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex items-center justify-between rounded-[28px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="text-sm text-slate-600">
        Page {page} of {Math.max(totalPages, 1)}
      </div>
      <div className="flex gap-3">
        <button
          className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          disabled={page <= 1}
          onClick={() => goTo(page - 1)}
          type="button"
        >
          Previous
        </button>
        <button
          className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          disabled={page >= totalPages}
          onClick={() => goTo(page + 1)}
          type="button"
        >
          Next
        </button>
      </div>
    </div>
  );
}
