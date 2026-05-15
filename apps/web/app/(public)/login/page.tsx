import { CSSProperties, Suspense } from "react";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { BrandingHeadEffects } from "@/app/components/branding/branding-head-effects";
import { DEFAULT_BRANDING_VALUES } from "@/app/components/branding/branding-defaults";
import { TenantLogo } from "@/app/components/branding/tenant-logo";
import { apiRequestJson, isApiRequestError } from "@/lib/server-api";
import { getTenantHintFromRequest } from "@/lib/tenant-resolution";
import { CompanyCodeLoginStep } from "./company-code-login-step";
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

type PublicTenantResolveResponse = {
  tenant: {
    id: string;
    tenantCode?: string | null;
    slug: string;
    displayName: string;
    status: string;
  };
  branding: {
    appTitle?: string;
    brandName?: string;
    shortBrandName?: string;
    logoUrl?: string;
    faviconUrl?: string;
    loginImageUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string | null;
    loginTitle?: string | null;
    loginSubtitle?: string | null;
    loginFooterText?: string | null;
    portalTagline?: string | null;
    supportEmail?: string | null;
  };
};

export async function generateMetadata({
  searchParams,
}: LoginPageProps): Promise<Metadata> {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestHeaders = await headers();
  const resolveResult = await resolvePublicTenantForLogin(
    resolvedSearchParams,
    requestHeaders.get("host"),
  );
  const branding = resolveResult.data?.branding;
  const tenant = resolveResult.data?.tenant;
  const title =
    branding?.appTitle ||
    branding?.brandName ||
    tenant?.displayName ||
    DEFAULT_BRANDING_VALUES.appTitle;
  const description =
    branding?.loginSubtitle ||
    branding?.portalTagline ||
    "Sign in to DijiPeople";
  const faviconUrl =
    sanitizeLoginAssetUrl(branding?.faviconUrl) || "/favicon.ico";

  return {
    title,
    description,
    icons: {
      icon: faviconUrl,
      shortcut: faviconUrl,
    },
  };
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestHeaders = await headers();
  const resolveResult = await resolvePublicTenantForLogin(
    resolvedSearchParams,
    requestHeaders.get("host"),
  );

  const resolvedTenant = resolveResult.data?.tenant ?? null;
  const branding = resolveResult.data?.branding ?? null;
  const isUnavailable =
    resolveResult.errorCode === "TENANT_SUSPENDED" ||
    resolveResult.errorCode === "TENANT_NOT_ACTIVE";
  const isNotFound =
    resolveResult.errorCode === "TENANT_NOT_FOUND" ||
    Boolean(resolveResult.errorCode && !resolveResult.data && !isUnavailable);

  const brandLabel =
    branding?.shortBrandName ||
    branding?.brandName ||
    DEFAULT_BRANDING_VALUES.shortBrandName;
  const welcomeTitle =
    branding?.loginTitle || DEFAULT_BRANDING_VALUES.welcomeTitle;
  const welcomeSubtitle =
    branding?.loginSubtitle || DEFAULT_BRANDING_VALUES.welcomeSubtitle;
  const primaryColor =
    branding?.primaryColor || DEFAULT_BRANDING_VALUES.primaryColor;
  const secondaryColor =
    branding?.secondaryColor || DEFAULT_BRANDING_VALUES.secondaryColor;
  const accentColor = branding?.accentColor || DEFAULT_BRANDING_VALUES.accentColor;
  const loginBannerImageUrl =
    sanitizeLoginAssetUrl(branding?.loginImageUrl) || "";
  const logoUrl = sanitizeLoginAssetUrl(branding?.logoUrl);
  const faviconUrl = sanitizeLoginAssetUrl(branding?.faviconUrl);
  const pageTitle = branding?.appTitle || DEFAULT_BRANDING_VALUES.appTitle;
  const footerText =
    branding?.loginFooterText || DEFAULT_BRANDING_VALUES.footerText;

  return (
    <main
      className="h-[100svh] overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#eef4f7_100%)]"
      style={
        {
          "--accent": accentColor,
          "--accent-strong": secondaryColor,
        } as CSSProperties
      }
    >
      <BrandingHeadEffects faviconUrl={faviconUrl} title={pageTitle} />
      <div className="mx-auto flex w-full max-w-7xl items-stretch px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8 xl:px-10">
        <div className="grid h-full w-full overflow-hidden rounded-[24px] border border-border/70 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)] lg:min-h-[calc(100svh-4rem)] lg:grid-cols-[1fr_minmax(440px,0.95fr)] xl:rounded-[32px]">
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
              <TenantLogo
                className="h-14 w-auto max-w-[220px] rounded-xl bg-white/95 p-2"
                logoUrl={logoUrl}
                name={brandLabel}
                sizeClassName="h-14 w-auto max-w-[220px]"
              />

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

          <section className="flex min-h-full items-center bg-white px-2 py-4 sm:px-4 sm:py-6 md:px-6 lg:px-8 lg:py-8 xl:px-10 xl:py-10">
            <div className="mx-auto flex w-full max-w-md flex-col justify-center">
              <div className="mb-4 space-y-4 sm:mb-6">
                <div className="inline-flex w-fit rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted lg:hidden">
                  {brandLabel}
                </div>

                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
                    {resolvedTenant ? "Welcome back" : "Find your company"}
                  </h2>
                  <p className="text-xs leading-6 text-muted sm:text-sm">
                    {resolvedTenant
                      ? "Sign in with your work email and password to access your HR workspace."
                      : "Enter your company code or tenant slug to continue to the right HR portal."}
                  </p>
                </div>
              </div>

              <div className="rounded-[24px] border border-border bg-surface/60 p-2 shadow-sm sm:p-4 lg:p-5">
                <Suspense fallback={null}>
                  {isUnavailable ? (
                    <TenantUnavailableState />
                  ) : isNotFound ? (
                    <TenantNotFoundState />
                  ) : resolvedTenant ? (
                    <LoginForm
                      tenantCode={resolvedTenant.tenantCode ?? undefined}
                      tenantSlug={resolvedTenant.slug}
                    />
                  ) : (
                    <CompanyCodeLoginStep />
                  )}
                </Suspense>
              </div>

              <div className="mt-3 space-y-2 text-center sm:mt-6">
                {branding?.supportEmail ? (
                  <div className="text-[10px] leading-5 text-muted">
                    Need help?{" "}
                    <a
                      href={`mailto:${branding.supportEmail}`}
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {branding.supportEmail}
                    </a>
                  </div>
                ) : null}

                {footerText ? (
                  <div className="border-t border-border/60 pt-2 text-[10px] leading-5 text-muted">
                    {footerText}
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function TenantUnavailableState() {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-900">
      This company portal is not currently available. Contact your HR or support team for help.
    </div>
  );
}

function TenantNotFoundState() {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm leading-6 text-red-700">
      We could not find this company portal. Check the login link or use the common login to enter your company code.
    </div>
  );
}

function buildTenantResolvePath(
  hint: ReturnType<typeof getTenantHintFromRequest>,
  host?: string | null,
) {
  const params = new URLSearchParams();

  if (hint.type === "slug" && hint.value) {
    params.set("slug", hint.value);
  } else if (hint.type === "domain" && hint.value) {
    params.set("host", hint.value);
  } else if (hint.type === "tenantCode" && hint.value) {
    params.set("tenantCode", hint.value);
  } else if (hint.source === "host" && host) {
    params.set("host", host);
  }

  const query = params.toString();
  return query ? `/public/tenants/resolve?${query}` : "";
}

function sanitizeLoginAssetUrl(value?: string | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed;
}

async function resolvePublicTenantForLogin(
  searchParams: Awaited<LoginPageProps["searchParams"]>,
  host?: string | null,
) {
  const tenantHint = getTenantHintFromRequest({
    host,
    queryTenant: searchParams?.tenantSlug || searchParams?.tenant || "",
  });
  const tenantResolvePath = buildTenantResolvePath(tenantHint, host);

  return tenantResolvePath
    ? apiRequestJson<PublicTenantResolveResponse>(tenantResolvePath, {
        includeAuth: false,
      })
        .then((data) => ({ data, errorCode: null as string | null }))
        .catch((error: unknown) => ({
          data: null,
          errorCode: isApiRequestError(error) ? error.code ?? null : null,
        }))
    : { data: null, errorCode: null as string | null };
}
