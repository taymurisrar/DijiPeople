export type SharedLookupOption = {
  id: string;
  name: string;
  key?: string | null;
  code?: string | null;
};

export type GenericDocumentRecord = {
  id: string;
  tenantId: string;
  documentTypeId?: string | null;
  documentCategoryId?: string | null;
  title?: string | null;
  originalFileName: string;
  storedFileName?: string | null;
  mimeType?: string | null;
  fileExtension?: string | null;
  sizeInBytes?: number | null;
  storageKey?: string | null;
  description?: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  documentType: {
    id: string;
    key?: string | null;
    name: string;
  } | null;
  documentCategory: {
    id: string;
    code?: string | null;
    name: string;
  } | null;
  uploadedByUser: {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    email: string;
  } | null;
  links: Array<{
    id: string;
    entityType: string;
    entityId: string;
    employeeId?: string | null;
    candidateId?: string | null;
    leaveRequestId?: string | null;
    createdAt: string;
  }>;
  viewPath: string;
  downloadPath: string;
};

export type GenericDocumentListResponse = {
  items: GenericDocumentRecord[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  filters: {
    documentTypeId?: string | null;
    documentCategoryId?: string | null;
    title?: string | null;
    uploadedByUserId?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    uploadedFrom?: string | null;
    uploadedTo?: string | null;
  };
};
