export type ModuleKey =
  | 'dashboard'
  | 'employees'
  | 'attendance'
  | 'leave'
  | 'timesheets';

export type ModuleViewType = 'system' | 'custom';

export type ModuleViewVisibilityScope = 'tenant' | 'role' | 'user';

export type DashboardWidgetKey =
  | 'hero'
  | 'account-summary'
  | 'quick-actions'
  | 'status-cards'
  | 'priority-items'
  | 'employment-details'
  | 'notifications';

export type DashboardViewConfig = {
  layout: 'default' | 'admin-workbench' | 'operations-focus' | 'custom';
  visibleWidgets: DashboardWidgetKey[];
  widgetOrder?: DashboardWidgetKey[];
  hiddenWidgets?: DashboardWidgetKey[];
  meta?: {
    description?: string;
  };
};

export type ModuleViewDto = {
  id: string;
  tenantId: string;
  moduleKey: ModuleKey;
  name: string;
  slug: string;
  type: ModuleViewType;
  isDefault: boolean;
  isShared: boolean;
  visibilityScope: ModuleViewVisibilityScope;
  allowedRoleKeys?: string[] | null;
  allowedUserIds?: string[] | null;
  configJson: DashboardViewConfig | Record<string, unknown>;
  sortOrder: number;
  isActive: boolean;
  createdByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
};
