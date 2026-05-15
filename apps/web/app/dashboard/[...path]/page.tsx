import { redirect } from "next/navigation";
import { toCanonicalPath } from "@/lib/routes";

type LegacyDashboardRedirectProps = {
  params: Promise<{ path?: string[] }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LegacyDashboardRedirect({
  params,
  searchParams,
}: LegacyDashboardRedirectProps): Promise<never> {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const legacyPath = `/dashboard/${(resolvedParams.path ?? []).join("/")}`;
  const query = buildQueryString(resolvedSearchParams);

  redirect(`${toCanonicalPath(legacyPath)}${query}`);
}

function buildQueryString(params: Record<string, string | string[] | undefined>) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        search.append(key, item);
      }
    } else if (value !== undefined) {
      search.set(key, value);
    }
  }

  const query = search.toString();
  return query ? `?${query}` : "";
}
