"use client";

import { Button } from "@/app/components/ui/button";
import { describePage } from "../_lib/decisions";

/** Previous / next over a server-paged list, with the exact total the API counted. */
export function RecordPager({
  disabled,
  label,
  onSkip,
  pageSize,
  shown,
  skip,
  total,
}: {
  disabled?: boolean;
  label: string;
  onSkip: (skip: number) => void;
  pageSize: number;
  shown: number;
  skip: number;
  total: number;
}) {
  const page = describePage(skip, shown, total, pageSize);
  return (
    <nav
      aria-label={`${label} pages`}
      className="flex flex-wrap items-center gap-3"
    >
      <p className="text-sm text-muted" role="status">
        {`${label} ${page.label}`}
      </p>
      <Button
        disabled={disabled || !page.hasPrev}
        onClick={() => onSkip(Math.max(0, skip - pageSize))}
        size="sm"
        variant="secondary"
      >
        Previous page
      </Button>
      <Button
        disabled={disabled || !page.hasNext}
        onClick={() => onSkip(skip + pageSize)}
        size="sm"
        variant="secondary"
      >
        Next page
      </Button>
    </nav>
  );
}
