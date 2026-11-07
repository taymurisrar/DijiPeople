import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/*
 * RUN-007 SESS-005: `Button href="/api/auth/logout?..."` rendered a next/link, which
 * prefetches into the viewport in production. The prefetch is a real GET, so
 * drawing the "Sign in again" button logged the user out and redirected
 * cross-origin (an intermittent CORS error on the RSC prefetch). A route handler
 * must be a plain anchor; pages must stay client-navigated links.
 */
jest.mock("next/link", () => {
  const { createElement: h } = jest.requireActual(
    "react",
  ) as typeof import("react");
  return {
    __esModule: true,
    default: ({
      href,
      children,
      className,
    }: {
      href: string;
      children: unknown;
      className?: string;
    }) =>
      h("a", { href, className, "data-next-link": "true" }, children as never),
  };
});

import { Button } from "./button";

const render = (href: string) =>
  renderToStaticMarkup(createElement(Button, { href }, "Go"));

describe("Button with an href", () => {
  it.each([
    "/api/auth/logout?reason=session-expired&next=%2Femployees",
    "/api/me/payslips/abc/download",
    "/api/attendance/export?from=2026-01-01",
  ])(
    "renders a route handler (%s) as a plain anchor that is never prefetched",
    (href) => {
      const html = render(href);
      expect(html).toContain(`href="${href.replace(/&/g, "&amp;")}"`);
      expect(html).not.toContain("data-next-link");
    },
  );

  it("keeps ordinary pages as client-navigated links", () => {
    expect(render("/employees")).toContain('data-next-link="true"');
    expect(render("/settings/branding")).toContain('data-next-link="true"');
  });

  it("does not treat a page whose name merely starts with api as a route handler", () => {
    expect(render("/apiary")).toContain('data-next-link="true"');
  });
});
