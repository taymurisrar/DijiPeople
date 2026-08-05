import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
export type PlatformRuntimeModuleKey =
  | 'leads'
  | 'partners'
  | 'partner-inquiries'
  | 'partner-onboarding'
  | 'customers'
  | 'customer-onboarding'
  | 'tenants'
  | 'subscriptions'
  | 'plans'
  | 'invoices'
  | 'payments'
  | 'commissions'
  | 'contracts'
  | 'contract-templates'
  | 'signature-requests'
  | 'support-cases'
  | 'monitoring-incidents';
export type PlatformRuntimeQuery = {
  page?: string;
  pageSize?: string;
  search?: string;
  viewKey?: string;
  filters?: string;
  sort?: string;
  selectedColumns?: string;
};

export type PlatformRuntimeListEnvelope = {
  moduleKey: PlatformRuntimeModuleKey;
  viewKey?: string;
  page: number;
  pageSize: number;
  search?: string;
  filters: unknown[];
  sort: unknown[];
  selectedColumns: string[];
};
export interface PlatformRuntimeAdapter {
  readonly moduleKey: PlatformRuntimeModuleKey;
  list(user: AuthenticatedUser, query: PlatformRuntimeQuery): Promise<unknown>;
  get(user: AuthenticatedUser, id: string): Promise<unknown>;
  create(
    user: AuthenticatedUser,
    values: Record<string, unknown>,
  ): Promise<unknown>;
  update(
    user: AuthenticatedUser,
    id: string,
    values: Record<string, unknown>,
    version?: number,
  ): Promise<unknown>;
  remove(user: AuthenticatedUser, id: string): Promise<unknown>;
  execute(
    user: AuthenticatedUser,
    action: string,
    input: Record<string, unknown>,
    id?: string,
  ): Promise<unknown>;
}
