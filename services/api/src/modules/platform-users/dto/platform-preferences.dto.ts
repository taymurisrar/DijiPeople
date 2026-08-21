import { IsIn, IsOptional } from 'class-validator';

export const DASHBOARD_VIEWS = [
  'PRESALES',
  'SUPPORT',
  'BILLING',
  'ADMIN',
] as const;

export const UI_THEMES = ['SYSTEM', 'LIGHT', 'DARK'] as const;
export const UI_DENSITIES = ['COMFORTABLE', 'COMPACT'] as const;

/**
 * Where an operator lands after signing in.
 *
 * An allow-list of routes this application owns, never free text. A preference
 * that accepted any string would be an open redirect wearing a settings form:
 * whoever could write the preference could choose where the next sign-in goes.
 */
export const LANDING_ROUTES = [
  '/',
  '/leads',
  '/customers',
  '/onboarding',
  '/tenants',
  '/subscriptions',
  '/invoices',
  '/support/cases',
  '/contracts',
] as const;

export class UpdatePlatformPreferencesDto {
  /*
   * Optional now, and it was not before. A form that saves theme should not
   * have to restate the dashboard view to avoid clearing it — and every field
   * being optional is what lets one screen own a subset of the preferences.
   */
  @IsOptional()
  @IsIn(DASHBOARD_VIEWS)
  defaultDashboardView?: (typeof DASHBOARD_VIEWS)[number];

  @IsOptional()
  @IsIn(UI_THEMES)
  uiTheme?: (typeof UI_THEMES)[number];

  @IsOptional()
  @IsIn(UI_DENSITIES)
  uiDensity?: (typeof UI_DENSITIES)[number];

  @IsOptional()
  @IsIn(LANDING_ROUTES)
  defaultLandingRoute?: (typeof LANDING_ROUTES)[number];
}
