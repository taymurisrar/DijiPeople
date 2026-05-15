import Link from "next/link";

const items = [
  { href: "/payroll/calendars", label: "Calendars" },
  { href: "/payroll/periods", label: "Periods" },
  { href: "/payroll/runs", label: "Runs" },
  { href: "/payroll/payslips", label: "Payslips" },
  { href: "/payroll/cycles", label: "Payroll Cycles" },
  { href: "/payroll/compensation", label: "Employee Compensation" },
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
