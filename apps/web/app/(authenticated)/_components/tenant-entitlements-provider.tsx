"use client";

import { createContext, useContext, useMemo, type PropsWithChildren } from "react";

/*
 * What the tenant's subscription includes, for client components.
 *
 * Deliberately a separate context from `AuthenticatedShellProvider` rather than
 * another field on the shell user. Entitlement is a fact about the *tenant's
 * contract*, not about the signed-in person: it does not change when the user
 * changes, no role widens it, and a `global-admin` and a self-service employee
 * on the same tenant see exactly the same set. Folding it into the user object
 * would invite the reading that it is one more thing a sufficiently privileged
 * role can be granted, which is the confusion that produced BUG-1952 in the
 * first place.
 *
 * `null` means "not resolved" — the availability call failed — and is NOT the
 * same as `[]`, which means "resolved, and this plan includes nothing". Callers
 * must distinguish them. `[]` is a legitimate state: a subscription that is
 * neither ACTIVE nor TRIALING entitles nothing.
 */
type TenantEntitlements = {
  enabledFeatureKeys: readonly string[] | null;
};

const TenantEntitlementsContext = createContext<TenantEntitlements | null>(null);

export function TenantEntitlementsProvider({
  enabledFeatureKeys,
  children,
}: PropsWithChildren<{ enabledFeatureKeys: readonly string[] | null }>) {
  /*
   * Memoised on the array's contents rather than its identity. The layout is a
   * server component that rebuilds this array on every navigation, so an
   * identity-keyed memo would re-render every consumer on every page change.
   */
  const key = enabledFeatureKeys === null ? null : enabledFeatureKeys.join(",");
  const value = useMemo<TenantEntitlements>(
    () => ({ enabledFeatureKeys }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on contents, see above
    [key],
  );

  return (
    <TenantEntitlementsContext.Provider value={value}>
      {children}
    </TenantEntitlementsContext.Provider>
  );
}

/**
 * The tenant's resolved capability keys, or `null` when they could not be read.
 *
 * Returns `null` outside a provider too, which keeps the fail-closed property
 * whole: a component rendered somewhere the layout does not wrap gets "unknown"
 * rather than "everything", and its caller renders the unavailable state.
 */
export function useTenantEntitlements(): readonly string[] | null {
  return useContext(TenantEntitlementsContext)?.enabledFeatureKeys ?? null;
}
