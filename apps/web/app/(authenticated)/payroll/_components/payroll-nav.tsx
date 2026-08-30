import Link from "next/link";

const groups = [
  {
    label: "Operations",
    items: [
      { href: "/payroll/dashboard", label: "Overview" },
      { href: "/payroll/runs", label: "Runs" },
      { href: "/payroll/exceptions", label: "Exceptions" },
      { href: "/payroll/payslips", label: "Payslips" },
      { href: "/payroll/delivery", label: "Payments" },
      { href: "/payroll/reports", label: "Reports" },
    ],
  },
  {
    label: "Foundation",
    items: [
      { href: "/payroll/cycles", label: "Cycles" },
      { href: "/payroll/calendars", label: "Calendars" },
      { href: "/payroll/periods", label: "Periods" },
      { href: "/payroll/employee-compensation", label: "Compensation" },
    ],
  },
] as const;

export function PayrollNav({ currentPath }: { currentPath: string }) {
  return (
    <nav
      aria-label="Payroll sections"
      className="flex flex-wrap gap-x-4 gap-y-2"
    >
      {groups.map((group) => (
        <div
          key={group.label}
          /*
           * BUG-1668 — this group of links did not wrap, so even after the
           * outer `<nav>`'s own `flex-wrap` moved a whole group onto its own
           * line at a narrow viewport, the six-item "Operations" group was
           * still one unbroken row wider than a 390px screen on its own —
           * the outer nav wrapping "is allowed to help", per the record's
           * own evidence, but a non-wrapping child made it unable to.
           * `flex-wrap` here lets the pills inside one group wrap onto
           * multiple lines instead of forcing the row past the viewport.
           */
          className="flex flex-wrap items-center gap-1 rounded-xl bg-background p-1"
        >
          <span className="sr-only">{group.label}</span>
          {group.items.map((item) => {
            const isActive =
              currentPath === item.href ||
              currentPath.startsWith(`${item.href}/`) ||
              (item.href === "/payroll/delivery" &&
                currentPath.startsWith("/payroll/delivery-center"));

            return (
              <Link
                key={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                  isActive
                    ? "bg-surface text-accent shadow-sm"
                    : "text-muted hover:bg-surface hover:text-foreground"
                }`}
                href={item.href}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
