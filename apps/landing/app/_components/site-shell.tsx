import Link from "next/link";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/features", label: "Features" },
  { href: "/plans", label: "Plans" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

const loginHref =
  process.env.NEXT_PUBLIC_WEB_APP_URL ||
  process.env.NEXT_PUBLIC_APP_PORTAL_URL ||
  "http://localhost:3001/dashboard";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white/88 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link className="flex items-center gap-3" href="/">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-sm font-bold text-white">
            DP
          </span>
          <span className="text-base font-semibold text-foreground">
            DijiPeople
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <Link
              className="rounded-xl px-3 py-2 text-sm font-medium text-muted transition hover:bg-surface-muted hover:text-foreground"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            className="rounded-xl px-3 py-2 text-sm font-semibold text-muted transition hover:bg-surface-muted hover:text-foreground"
            href={loginHref}
          >
            Login
          </Link>
          <Link
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
            href="/subscribe"
          >
            Start subscription
          </Link>
        </div>

        <details className="group relative md:hidden">
          <summary className="list-none rounded-xl border border-border px-3 py-2 text-sm font-semibold">
            Menu
          </summary>
          <div className="absolute right-0 top-12 w-64 rounded-2xl border border-border bg-white p-2 shadow-lg">
            {navItems.map((item) => (
              <Link
                className="block rounded-xl px-3 py-2 text-sm font-medium text-muted hover:bg-surface-muted hover:text-foreground"
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
            <div className="my-2 border-t border-border" />
            <Link
              className="block rounded-xl px-3 py-2 text-sm font-medium text-muted hover:bg-surface-muted hover:text-foreground"
              href={loginHref}
            >
              Login
            </Link>
            <Link
              className="mt-1 block rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-white"
              href="/subscribe"
            >
              Start subscription
            </Link>
          </div>
        </details>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-white/80">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 text-sm text-muted sm:px-6 lg:grid-cols-[1fr_auto] lg:px-8">
        <div>
          <p className="font-semibold text-foreground">DijiPeople</p>
          <p className="mt-2 max-w-2xl leading-6">
            Enterprise SaaS for HR operations, tenant configuration, employee
            lifecycle workflows, and subscription-ready growth.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/plans">Plans</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/subscribe">Subscribe</Link>
        </div>
      </div>
    </footer>
  );
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {children}
    </main>
  );
}
