import { apiRequest, proxyApiJsonResponse } from '@/lib/server-api';

export async function GET() {
  return proxyApiJsonResponse(
    await apiRequest('/payroll/configuration/health', { cache: 'no-store' }),
  );
}
