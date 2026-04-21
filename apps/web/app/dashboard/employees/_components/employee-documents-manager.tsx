"use client";

import { DocumentList } from "@/app/dashboard/_components/documents/document-list";
import { DocumentUploadForm } from "@/app/dashboard/_components/documents/document-upload-form";
import { GenericDocumentRecord } from "@/app/dashboard/_components/documents/types";
import { EmployeeDocumentSummary } from "../types";
import { useEmployeeLookups } from "./use-employee-lookups";

export function EmployeeDocumentsManager({
  documents,
  employeeId,
}: {
  documents: EmployeeDocumentSummary[];
  employeeId: string;
}) {
  const { documentTypes, documentCategories } = useEmployeeLookups();

  const genericDocuments: GenericDocumentRecord[] = documents.map((document) => ({
    id: document.id,
    tenantId: "",
    documentTypeId: document.documentTypeId,
    documentCategoryId: document.documentCategoryId,
    title: document.title,
    originalFileName: document.fileName,
    mimeType: document.mimeType,
    sizeInBytes: document.size,
    storageKey: document.storageKey,
    description: document.description,
    isArchived: false,
    createdAt: document.createdAt,
    updatedAt: document.createdAt,
    documentType: document.documentType,
    documentCategory: document.documentCategory,
    uploadedByUser: document.uploadedByUser,
    links: [],
    viewPath: `/api/employees/${employeeId}/documents/${document.id}/view`,
    downloadPath: `/api/employees/${employeeId}/documents/${document.id}/download`,
  }));

  return (
    <div className="grid gap-6">
      <DocumentUploadForm
        documentCategories={documentCategories}
        documentTypes={documentTypes}
        entityId={employeeId}
        entityType="EMPLOYEE"
        includeEntityFields={false}
        submitLabel="Upload employee document"
        uploadUrl={`/api/employees/${employeeId}/documents/upload`}
      />
      <DocumentList
        deleteUrlBuilder={(documentId) =>
          `/api/employees/${employeeId}/documents/${documentId}`
        }
        documents={genericDocuments}
        emptyMessage="No employee documents uploaded yet."
      />
    </div>
  );
}
