import Link from "next/link";

const items = [
  { href: "/dashboard/payroll/calendars", label: "Calendars" },
  { href: "/dashboard/payroll/periods", label: "Periods" },
  { href: "/dashboard/payroll/runs", label: "Runs" },
  { href: "/dashboard/payroll/payslips", label: "Payslips" },
  { href: "/dashboard/payroll/cycles", label: "Payroll Cycles" },
  { href: "/dashboard/payroll/compensation", label: "Employee Compensation" },
];

export function PayrollNav({ currentPath }: { currentPath: string }) {
  return (
    <nav className="flex flex-wrap gap-3">
      {items.map((item) => {
        const isActive =
          currentPath === item.href || currentPath.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            className={`rounded-2xl border px-4 py-3 text-sm font-medium transition ${
              isActive
                ? "border-accent/30 bg-accent-soft text-foreground"
                : "border-border bg-white text-muted hover:border-accent/30 hover:text-foreground"
            }`}
            href={item.href}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
