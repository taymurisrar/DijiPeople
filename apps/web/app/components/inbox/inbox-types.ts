export type InboxNotification = {
  id: string;
  eventKey: string | null;
  moduleKey: string | null;
  type: string;
  category: string;
  priority: number;
  title: string;
  summary: string | null;
  body: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  relatedRecordNumber: string | null;
  targetUrl: string | null;
  status: string;
  requiresAction: boolean;
  createdAtUtc: string;
};

export type InboxResponse = {
  items: InboxNotification[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  unreadCount: number;
  actionRequiredCount: number;
};
