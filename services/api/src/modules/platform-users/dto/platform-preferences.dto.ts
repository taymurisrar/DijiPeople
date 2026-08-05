import { IsIn } from 'class-validator';

export const DASHBOARD_VIEWS = [
  'PRESALES',
  'SUPPORT',
  'BILLING',
  'ADMIN',
] as const;

export class UpdatePlatformPreferencesDto {
  @IsIn(DASHBOARD_VIEWS)
  defaultDashboardView!: (typeof DASHBOARD_VIEWS)[number];
}
