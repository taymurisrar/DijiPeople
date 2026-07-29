import { apiRequest, proxyApiJsonResponse } from '@/lib/server-api';

export async function POST() {
  return proxyApiJsonResponse(
    await apiRequest('/payroll/configuration/initialize-defaults', {
      method: 'POST',
    }),
  );
}
