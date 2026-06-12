"use client";

import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import {
  type BrandingSettings,
  resolveTenantBranding,
} from "@/lib/branding";
import {
  type PublicTenantSettings,
  toBrandingSettingsRecord,
} from "@/lib/public-tenant-settings";
import {
  applyTenantBranding,
  resolveRouteTitle,
} from "@/lib/tenant-branding-client";

export type { PublicTenantSettings } from "@/lib/public-tenant-settings";

type TenantSettingsContextValue = {
  branding: BrandingSettings;
  publicSettings: PublicTenantSettings;
  setBrandingDraft: (branding: BrandingSettings | null) => void;
  updatePublicSettings: (settings: PublicTenantSettings) => void;
};

const TenantSettingsContext = createContext<TenantSettingsContextValue | null>(
  null,
);

export function TenantSettingsProvider({
  children,
  initialPublicSettings,
}: PropsWithChildren<{
  initialPublicSettings: PublicTenantSettings;
}>) {
  const pathname = usePathname();
  const [publicSettings, setPublicSettings] = useState(initialPublicSettings);
  const [brandingDraft, setBrandingDraft] = useState<BrandingSettings | null>(
    null,
  );

  const persistedBranding = useMemo(
    () =>
      resolveTenantBranding({
        ...toBrandingSettingsRecord(publicSettings),
        tenantName: publicSettings.tenantName,
      }),
    [publicSettings],
  );
  const branding = brandingDraft ?? persistedBranding;

  const updatePublicSettings = useCallback((settings: PublicTenantSettings) => {
    setPublicSettings((current) => ({ ...current, ...settings }));
    setBrandingDraft(null);
  }, []);

  useEffect(() => {
    const currentSearchParams = new URLSearchParams(window.location.search);
    const tenantSlug =
      currentSearchParams.get("tenantSlug") ??
      currentSearchParams.get("tenant");
    if (!tenantSlug || tenantSlug === publicSettings.tenantSlug) return;

    const controller = new AbortController();
    void fetch(
      `/api/tenant-settings/public-branding?tenantSlug=${encodeURIComponent(tenantSlug)}`,
      { signal: controller.signal },
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((settings: PublicTenantSettings | null) => {
        if (settings) updatePublicSettings(settings);
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [pathname, publicSettings.tenantSlug, updatePublicSettings]);

  useEffect(() => {
    applyTenantBranding(branding, resolveRouteTitle(pathname));
  }, [branding, pathname]);

  const value = useMemo<TenantSettingsContextValue>(
    () => ({
      branding,
      publicSettings,
      setBrandingDraft,
      updatePublicSettings,
    }),
    [branding, publicSettings, updatePublicSettings],
  );

  return (
    <TenantSettingsContext.Provider value={value}>
      {children}
    </TenantSettingsContext.Provider>
  );
}

export function useTenantSettings() {
  const value = useContext(TenantSettingsContext);
  if (!value) {
    throw new Error(
      "useTenantSettings must be used inside TenantSettingsProvider.",
    );
  }
  return value;
}

export function useBrandingTokens() {
  return useTenantSettings().branding;
}

// Branding is intentionally the same root state, not a second provider tree.
export const TenantBrandingProvider = TenantSettingsProvider;
