"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";

type DataTablePaginationProps = {
  page: number;
  pageSize: number;
  totalItems: number;
  pathname: string;
  searchParams?: Record<string, string | undefined>;
  pageSizeOptions?: number[];
};

export function DataTablePagination({
  page,
  pageSize,
  totalItems,
  pathname,
  searchParams = {},
  pageSizeOptions = [10, 25, 50, 100],
}: DataTablePaginationProps) {
  const router = useRouter();

  const safePageSize = Math.max(pageSize, 1);
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * safePageSize + 1;
  const endItem = Math.min(currentPage * safePageSize, totalItems);

  const visiblePages = getVisiblePages(currentPage, totalPages);

  function buildHref(nextPage: number, nextPageSize = safePageSize) {
    const params = new URLSearchParams();

    Object.entries(searchParams).forEach(([key, value]) => {
      if (value && key !== "page" && key !== "pageSize") {
        params.set(key, value);
      }
    });

    params.set("page", String(nextPage));
    params.set("pageSize", String(nextPageSize));

    return `${pathname}?${params.toString()}`;
  }

  function handlePageSizeChange(value: string) {
    const nextPageSize = Number(value);

    if (!Number.isFinite(nextPageSize) || nextPageSize <= 0) {
      return;
    }

    router.push(buildHref(1, nextPageSize));
  }

  if (totalItems === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4 rounded-b-[24px] border-t border-border bg-surface-strong px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="text-sm text-muted">
        Showing{" "}
        <span className="font-semibold text-foreground">{startItem}</span> to{" "}
        <span className="font-semibold text-foreground">{endItem}</span> of{" "}
        <span className="font-semibold text-foreground">{totalItems}</span>{" "}
        records
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex items-center gap-2 text-sm text-muted">
          Rows per page
          <select
            value={safePageSize}
            onChange={(event) => handlePageSizeChange(event.target.value)}
            className="h-10 rounded-xl border border-border bg-white px-3 text-sm text-foreground outline-none transition focus:border-accent"
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <PaginationLink
            disabled={currentPage <= 1}
            href={buildHref(currentPage - 1)}
            label="Previous"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </PaginationLink>

          {visiblePages.map((item, index) =>
            item === "ellipsis" ? (
              <span
                key={`ellipsis-${index}`}
                className="px-2 text-sm text-muted"
              >
                ...
              </span>
            ) : (
              <PaginationLink
                key={item}
                active={item === currentPage}
                href={buildHref(item)}
                label={`Page ${item}`}
              >
                {item}
              </PaginationLink>
            ),
          )}

          <PaginationLink
            disabled={currentPage >= totalPages}
            href={buildHref(currentPage + 1)}
            label="Next"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </PaginationLink>
        </div>
      </div>
    </div>
  );
}

type PaginationLinkProps = {
  href: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
};

function PaginationLink({
  href,
  label,
  active = false,
  disabled = false,
  children,
}: PaginationLinkProps) {
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        aria-label={label}
        className="inline-flex h-10 cursor-not-allowed items-center justify-center gap-1 rounded-xl border border-border bg-white px-3 text-sm font-medium text-muted opacity-50"
      >
        {children}
      </span>
    );
  }

  return (
    <Link
      aria-current={active ? "page" : undefined}
      aria-label={label}
      className={`inline-flex h-10 items-center justify-center gap-1 rounded-xl px-3 text-sm font-semibold transition ${
        active
          ? "bg-accent text-white shadow-sm"
          : "border border-border bg-white text-foreground hover:border-accent/40 hover:text-accent"
      }`}
      href={href}
    >
      {children}
    </Link>
  );
}

function getVisiblePages(
  currentPage: number,
  totalPages: number,
): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 3) {
    return [1, 2, 3, 4, "ellipsis", totalPages];
  }

  if (currentPage >= totalPages - 2) {
    return [
      1,
      "ellipsis",
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }

  return [
    1,
    "ellipsis",
    currentPage - 1,
    currentPage,
    currentPage + 1,
    "ellipsis",
    totalPages,
  ];
}