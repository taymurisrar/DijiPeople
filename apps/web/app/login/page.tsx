import { CSSProperties, Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { apiRequestJson } from "@/lib/server-api";
import { FaviconSync } from "@/app/components/branding/favicon-sync";
import { TenantLogo } from "@/app/components/branding/tenant-logo";
import { LoginForm } from "./login-form";

const valuePoints = [
  "Employee records and profiles",
  "Leave, attendance, and approvals",
  "Documents, access, and reporting",
];

type LoginPageProps = {
  searchParams?: Promise<{
    tenant?: string;
    tenantSlug?: string;
  }>;
};

type PublicBrandingResponse = {
  tenantName: string;
  brandName: string;
  shortBrandName: string;
  logoUrl: string;
  faviconUrl?: string;
  loginBannerImageUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  welcomeTitle: string;
  welcomeSubtitle: string;
  supportEmail: string;
  showBrandingOnLoginPage?: boolean;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getSessionUser();

  if (user) {
    redirect("/dashboard");
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const tenantSlug =
    resolvedSearchParams?.tenantSlug || resolvedSearchParams?.tenant || "";
  const query = tenantSlug ? `?tenantSlug=${encodeURIComponent(tenantSlug)}` : "";
  const branding = await apiRequestJson<PublicBrandingResponse>(
    `/tenant-settings/public-branding${query}`,
    { includeAuth: false },
  ).catch(() => null);

  const brandLabel = branding?.shortBrandName || branding?.brandName || "DijiPeople";
  const welcomeTitle = branding?.welcomeTitle || "People operations, without the mess.";
  const welcomeSubtitle =
    branding?.welcomeSubtitle ||
    "A clean HR workspace for admins, HR teams, managers, and employees.";
  const primaryColor = branding?.primaryColor || "#0f766e";
  const secondaryColor = branding?.secondaryColor || "#0f172a";
  const accentColor = branding?.accentColor || "#14b8a6";
  const showBranding = branding?.showBrandingOnLoginPage !== false;
  const loginBannerImageUrl = branding?.loginBannerImageUrl || "";

  return (
    <main
      className="min-h-[100svh] bg-[linear-gradient(180deg,#f8fafc_0%,#eef4f7_100%)]"
      style={{
        "--accent": accentColor,
        "--accent-strong": secondaryColor,
      } as CSSProperties}
    >
      <FaviconSync faviconUrl={branding?.faviconUrl ?? null} />
      <div className="mx-auto flex min-h-[100svh] w-full max-w-7xl items-stretch px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8 xl:px-10">
        <div className="grid w-full overflow-hidden rounded-[24px] border border-border/70 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)] lg:min-h-[calc(100svh-4rem)] lg:grid-cols-[1fr_minmax(440px,0.95fr)] xl:rounded-[32px]">
          <section
            className="border-b border-border/60 px-5 py-5 text-white sm:px-6 sm:py-6 lg:flex lg:flex-col lg:justify-between lg:border-b-0 lg:border-r lg:px-8 lg:py-8 xl:px-10 xl:py-10"
            style={{
              background: loginBannerImageUrl
                ? `linear-gradient(145deg, ${primaryColor}cc 0%, ${secondaryColor}cc 100%), url(${loginBannerImageUrl})`
                : `linear-gradient(145deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <div className="space-y-5">
              <div className="inline-flex w-fit rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/90 sm:px-4 sm:py-1.5">
                {brandLabel}
              </div>
              {showBranding ? (
                <TenantLogo
                  className="h-14 w-auto max-w-[220px] rounded-xl bg-white/95 p-2"
                  logoUrl={branding?.logoUrl ?? null}
                  name={brandLabel}
                  sizeClassName="h-14 w-auto max-w-[220px]"
                />
              ) : null}

              <div className="space-y-2 sm:space-y-3">
                <h1 className="max-w-xl text-2xl font-semibold leading-tight sm:text-3xl xl:text-4xl">
                  {welcomeTitle}
                </h1>
                <p className="max-w-lg text-sm leading-6 text-white/75 sm:text-base">
                  {welcomeSubtitle}
                </p>
              </div>

              <div className="grid gap-2.5 sm:gap-3">
                {valuePoints.map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-white/12 bg-white/10 px-4 py-3 text-sm text-white/90 backdrop-blur-sm"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="flex min-h-full items-center bg-white px-4 py-6 sm:px-6 sm:py-8 md:px-8 lg:px-10 lg:py-10 xl:px-14 xl:py-12">
            <div className="mx-auto flex w-full max-w-md flex-col justify-center">
              <div className="mb-6 space-y-4 sm:mb-8">
                <div className="inline-flex w-fit rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted lg:hidden">
                  {brandLabel}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted sm:text-sm">
                    Secure Sign In
                  </p>
                  <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
                    Welcome back
                  </h2>
                  <p className="text-sm leading-6 text-muted sm:text-base">
                    Sign in with your work email and password to access your HR workspace.
                  </p>
                </div>
              </div>

              <div className="rounded-[24px] border border-border bg-surface/60 p-4 shadow-sm sm:p-5 lg:p-6">
                <Suspense fallback={null}>
                  <LoginForm />
                </Suspense>
              </div>

              <div className="mt-5 text-center text-xs leading-5 text-muted sm:mt-6">
                Use the email account assigned by your organization. If you were invited
                recently, activate your account first from the invitation email.
                {branding?.supportEmail ? ` Need help? ${branding.supportEmail}` : ""}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
