import Link from "next/link";

export function AttendancePagination({
  basePath,
  currentPage,
  totalPages,
  queryString,
}: {
  basePath: string;
  currentPage: number;
  totalPages: number;
  queryString: string;
}) {
  if (totalPages <= 1) {
    return null;
  }

  const previousParams = new URLSearchParams(queryString);
  previousParams.set("page", String(Math.max(1, currentPage - 1)));

  const nextParams = new URLSearchParams(queryString);
  nextParams.set("page", String(Math.min(totalPages, currentPage + 1)));

  return (
    <div className="flex items-center justify-between rounded-[22px] border border-border bg-surface px-5 py-4 shadow-sm">
      <p className="text-sm text-muted">
        Page {currentPage} of {totalPages}
      </p>
      <div className="flex gap-3">
        <Link
          className={`rounded-xl border border-border px-4 py-2 text-sm ${
            currentPage <= 1 ? "pointer-events-none opacity-50" : ""
          }`}
          href={`${basePath}?${previousParams.toString()}`}
        >
          Previous
        </Link>
        <Link
          className={`rounded-xl border border-border px-4 py-2 text-sm ${
            currentPage >= totalPages ? "pointer-events-none opacity-50" : ""
          }`}
          href={`${basePath}?${nextParams.toString()}`}
        >
          Next
        </Link>
      </div>
    </div>
  );
}
