import { redirect } from "next/navigation";

export default async function ActivatePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const target = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        target.append(key, item);
      }
    } else if (value) {
      target.set(key, value);
    }
  }

  redirect(`/activate-account${target.toString() ? `?${target}` : ""}`);
}
