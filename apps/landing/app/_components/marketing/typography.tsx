import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The public site's headings, in one place.
 *
 * They were previously typed out per page and had drifted into three different
 * systems. Every page agreed on the h1 — serif, `text-4xl`, `sm:text-5xl` — and
 * then diverged completely below it:
 *
 *   - `/` used a sans `text-3xl font-semibold` for section headings
 *   - `/plans` used a serif `text-3xl`
 *   - `/features` used serif at `text-2xl`, `text-3xl` and `text-4xl`, plus a
 *     `font-mono` eyebrow where every other page used sans
 *
 * So a visitor moving between pages saw the same content hierarchy rendered
 * three ways, which reads as three sites. Serif wins for section headings: it
 * pairs with the h1 the pages already share, and it is what the two most
 * recently designed pages had converged on independently.
 *
 * These are components rather than exported class strings on purpose. A string
 * can be pasted and then edited in one place; a component cannot drift without
 * every page moving with it.
 */

/** The small uppercase label above a heading. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">
      {children}
    </p>
  );
}

/** The one h1 on a page. */
export function PageHeading({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h1
      className={[
        "font-serif text-4xl leading-tight text-foreground sm:text-5xl",
        className ?? "",
      ].join(" ")}
    >
      {children}
    </h1>
  );
}

/** A top-level section heading. */
export function SectionHeading({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={["font-serif text-3xl text-foreground", className ?? ""].join(
        " ",
      )}
    >
      {children}
    </h2>
  );
}

/** The paragraph directly under a page heading. */
export function Lede({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={["text-lg leading-8 text-muted", className ?? ""].join(" ")}
    >
      {children}
    </p>
  );
}

/**
 * The closing call to action.
 *
 * Four pages ended with a dark panel carrying a heading, a line of copy and two
 * buttons — the same component written out four times, with four different
 * paddings, two different corner radii and, on one page, a radial gradient
 * nothing else on the site used. Repeating a component by hand is how a design
 * system becomes a resemblance.
 */
export function ClosingCta({
  title,
  body,
  primary,
  secondary,
}: {
  title: string;
  body: string;
  primary: { href: string; label: string };
  secondary?: { href: string; label: string };
}) {
  return (
    <section className="my-10 rounded-[28px] bg-foreground p-6 text-white sm:p-10">
      <h2 className="font-serif text-3xl">{title}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-white/72">{body}</p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link
          className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-white/90"
          href={primary.href}
        >
          {primary.label}
        </Link>
        {secondary ? (
          <Link
            className="inline-flex items-center justify-center rounded-xl border border-white/25 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            href={secondary.href}
          >
            {secondary.label}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
