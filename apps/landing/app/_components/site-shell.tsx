import Link from "next/link";
import Image from "next/image";

import { landingEnv } from "@/lib/env";
import { contactInfo } from "./marketing/content";
import { HeaderNav, type NavItem } from "./header-nav";

const navItems: readonly NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/features", label: "Features" },
  { href: "/plans", label: "Plans" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/partners", label: "Partners" },
];

/** The skip link's target. One id, set on the single `<main>` in `PageShell`. */
export const MAIN_CONTENT_ID = "main-content";

// Sign-in lives in the tenant workspace app, not here. This used to read
// NEXT_PUBLIC_WEB_APP_URL directly, fall through to NEXT_PUBLIC_APP_PORTAL_URL
// — a variable defined nowhere in this repository, so always undefined — and
// then to a hardcoded http://localhost:3001/dashboard, which is the value
// production actually served. landingEnv.workspaceUrl resolves through
// @repo/config, which fails the build rather than emitting a loopback URL.
const loginHref = `${landingEnv.workspaceUrl.replace(/\/+$/, "")}/login`;

export function SiteHeader() {
  return (
    <>
      {/*
        BUG-0064 / WCAG 2.4.1. Without this a keyboard user traversed nine
        header stops before reaching content, on every page. Hidden until
        focused rather than visually hidden permanently — a skip link nobody can
        see when they land on it is a skip link nobody uses.
      */}
      <a
        className="sr-only left-4 top-4 z-[100] rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:absolute focus:outline-none focus:ring-2 focus:ring-accent/40"
        href={`#${MAIN_CONTENT_ID}`}
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-white/88 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link className="flex items-center gap-3" href="/">
            <Image
              src="/logo-primary-horizontal.svg"
              alt="DijiPeople"
              width={370}
              height={100}
              priority
              className="h-10 w-auto sm:h-11"
            />
          </Link>

          <HeaderNav items={navItems} loginHref={loginHref} />
        </div>
      </header>
    </>
  );
}

/**
 * Footer link sizing is deliberate: `py-2` takes each target past the 24x24
 * minimum of WCAG 2.5.8. The bare inline links here measured 20px tall on
 * mobile, which is the kind of miss that only shows up when something measures
 * it.
 */
const footerLinkClass =
  "inline-flex min-h-[24px] items-center rounded-lg px-1 py-2 text-muted underline-offset-4 transition hover:text-foreground hover:underline";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-white/80">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm text-muted sm:px-6 lg:grid-cols-[1.2fr_1fr_1fr] lg:px-8">
        <div>
          <Image
            src="/logo-primary-horizontal.svg"
            alt="DijiPeople"
            width={370}
            height={100}
            className="h-9 w-auto"
          />
          <p className="mt-2 max-w-md leading-6">
            Enterprise SaaS for HR operations, tenant configuration, employee
            lifecycle workflows, and subscription-ready growth.
          </p>
        </div>

        <nav aria-label="Footer">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground">
            Product
          </h2>
          <ul className="mt-2 grid">
            {[
              { href: "/features", label: "Features" },
              { href: "/plans", label: "Plans" },
              { href: "/subscribe", label: "Subscribe" },
              { href: "/partners", label: "Partners" },
            ].map((item) => (
              <li key={item.href}>
                <Link className={footerLinkClass} href={item.href}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground">
            Contact
          </h2>
          {/*
            Actionable rather than decorative. These were plain text, so on a
            phone the number could not be tapped and the address could not be
            opened — on the page whose whole purpose is starting a conversation.
          */}
          <ul className="mt-2 grid">
            <li>
              <Link className={footerLinkClass} href="/contact">
                Contact us
              </Link>
            </li>
            <li>
              <a
                className={footerLinkClass}
                href={`mailto:${contactInfo.businessEmail}`}
              >
                {contactInfo.businessEmail}
              </a>
            </li>
            <li>
              <a
                className={footerLinkClass}
                href={`tel:${contactInfo.phone.replace(/[^\d+]/g, "")}`}
              >
                {contactInfo.phone}
              </a>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8"
      id={MAIN_CONTENT_ID}
      // Focusable only programmatically, so activating the skip link actually
      // moves focus rather than only moving the scroll position.
      tabIndex={-1}
    >
      {children}
    </main>
  );
}
