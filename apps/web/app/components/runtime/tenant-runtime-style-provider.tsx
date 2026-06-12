"use client";

import type { CSSProperties, ReactNode } from "react";
import type { TenantRuntimeConfig } from "../../../lib/runtime/tenant-runtime.types";
import { buildTenantRuntimeCssVariables } from "./tenant-runtime-css-variables";

export function TenantRuntimeStyleProvider({
  children,
  className,
  tenant,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly tenant: TenantRuntimeConfig;
}) {
  return (
    <div
      className={className}
      data-tenant-runtime={tenant.tenantSlug}
      style={buildTenantRuntimeCssVariables(tenant) as CSSProperties}
    >
      {children}
    </div>
  );
}
