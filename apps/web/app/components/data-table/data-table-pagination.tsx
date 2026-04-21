import Link from "next/link";

type DataTablePaginationProps = {
  page: number;
  pageSize: number;
  totalItems: number;
  pathname: string;
  searchParams?: Record<string, string | undefined>;
};

export function DataTablePagination({
  page,
  pageSize,
  totalItems,
  pathname,
  searchParams = {},
}: DataTablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  function buildHref(nextPage: number) {
    const params = new URLSearchParams();

    Object.entries(searchParams).forEach(([key, value]) => {
      if (value && key !== "page") {
        params.set(key, value);
      }
    });

    params.set("page", String(nextPage));
    params.set("pageSize", String(pageSize));

    return `${pathname}?${params.toString()}`;
  }

  const visiblePages = getVisiblePages(currentPage, totalPages);

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="text-sm text-muted">
        Showing <span className="font-semibold text-foreground">{startItem}</span>{" "}
        to <span className="font-semibold text-foreground">{endItem}</span> of{" "}
        <span className="font-semibold text-foreground">{totalItems}</span> results
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          aria-disabled={currentPage <= 1}
          className={`rounded-2xl border px-4 py-2 text-sm font-medium transition ${
            currentPage <= 1
              ? "pointer-events-none border-border text-muted opacity-50"
              : "border-border text-foreground hover:border-accent/30 hover:text-accent"
          }`}
          href={buildHref(currentPage - 1)}
        >
          Previous
        </Link>

        {visiblePages.map((item, index) =>
          item === "ellipsis" ? (
            <span key={`ellipsis-${index}`} className="px-2 text-muted">
              ...
            </span>
          ) : (
            <Link
              key={item}
              className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                item === currentPage
                  ? "bg-accent text-white"
                  : "border border-border text-foreground hover:border-accent/30 hover:text-accent"
              }`}
              href={buildHref(item)}
            >
              {item}
            </Link>
          ),
        )}

        <Link
          aria-disabled={currentPage >= totalPages}
          className={`rounded-2xl border px-4 py-2 text-sm font-medium transition ${
            currentPage >= totalPages
              ? "pointer-events-none border-border text-muted opacity-50"
              : "border-border text-foreground hover:border-accent/30 hover:text-accent"
          }`}
          href={buildHref(currentPage + 1)}
        >
          Next
        </Link>
      </div>
    </div>
  );
}

function getVisiblePages(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 3) {
    return [1, 2, 3, 4, "ellipsis", totalPages] as const;
  }

  if (currentPage >= totalPages - 2) {
    return [1, "ellipsis", totalPages - 3, totalPages - 2, totalPages - 1, totalPages] as const;
  }

  return [
    1,
    "ellipsis",
    currentPage - 1,
    currentPage,
    currentPage + 1,
    "ellipsis",
    totalPages,
  ] as const;
}