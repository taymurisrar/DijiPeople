export const dashboardSystemViews = [
  {
    moduleKey: 'dashboard',
    name: 'My dashboard',
    slug: 'ess-overview',
    type: 'system',
    isDefault: true,
    isShared: true,
    visibilityScope: 'tenant',
    sortOrder: 0,
    configJson: {
      layout: 'default',
      visibleWidgets: [
        'hero',
        'account-summary',
        'quick-actions',
        'status-cards',
        'priority-items',
        'employment-details',
      ],
      meta: {
        description: 'Default employee self-service dashboard.',
      },
    },
  },
  {
    moduleKey: 'dashboard',
    name: 'Admin workbench',
    slug: 'admin-workbench',
    type: 'system',
    isDefault: false,
    isShared: true,
    visibilityScope: 'tenant',
    sortOrder: 1,
    configJson: {
      layout: 'admin-workbench',
      visibleWidgets: [
        'hero',
        'notifications',
        'quick-actions',
        'status-cards',
        'priority-items',
        'employment-details',
      ],
      meta: {
        description:
          'Admin-first view with alerts, actions, and employee context.',
      },
    },
  },
  {
    moduleKey: 'dashboard',
    name: 'Operations focus',
    slug: 'operations-focus',
    type: 'system',
    isDefault: false,
    isShared: true,
    visibilityScope: 'tenant',
    sortOrder: 2,
    configJson: {
      layout: 'operations-focus',
      visibleWidgets: ['status-cards', 'quick-actions', 'priority-items'],
      meta: {
        description: 'Condensed operational view for daily follow-up.',
      },
    },
  },
] as const;
