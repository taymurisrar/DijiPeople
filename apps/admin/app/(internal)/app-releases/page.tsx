import { redirect } from "next/navigation";

/**
 * Moved into Settings on 2026-08-28.
 *
 * This was a hand-rolled top-level page that rendered its own `<main>` with
 * `dark:` variants the admin shell never switches on, so it appeared as a dark
 * panel in a light product. It now lives on the standard settings shell beside
 * the rollout screen it has always been a pair with.
 *
 * A redirect rather than a deletion: the URL is in bookmarks and in the release
 * runbook, and neither should answer 404 to make a move look tidy.
 */
export default function AppReleasesRedirect() {
  redirect("/settings/desktop-agent");
}
