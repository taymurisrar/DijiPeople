-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER,
    "storageKey" TEXT,
    "uploadedByUserId" TEXT,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "employeeId" TEXT,
    "candidateId" TEXT,
    "leaveRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "DocumentLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Document_tenantId_idx" ON "Document"("tenantId");
CREATE INDEX "Document_tenantId_category_idx" ON "Document"("tenantId", "category");
CREATE INDEX "Document_tenantId_uploadedByUserId_idx" ON "Document"("tenantId", "uploadedByUserId");

-- CreateIndex
CREATE INDEX "DocumentLink_tenantId_idx" ON "DocumentLink"("tenantId");
CREATE INDEX "DocumentLink_tenantId_documentId_idx" ON "DocumentLink"("tenantId", "documentId");
CREATE INDEX "DocumentLink_tenantId_employeeId_idx" ON "DocumentLink"("tenantId", "employeeId");
CREATE INDEX "DocumentLink_tenantId_candidateId_idx" ON "DocumentLink"("tenantId", "candidateId");
CREATE INDEX "DocumentLink_tenantId_leaveRequestId_idx" ON "DocumentLink"("tenantId", "leaveRequestId");

-- AddForeignKey
ALTER TABLE "Document"
ADD CONSTRAINT "Document_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Document"
ADD CONSTRAINT "Document_uploadedByUserId_fkey"
FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DocumentLink"
ADD CONSTRAINT "DocumentLink_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentLink"
ADD CONSTRAINT "DocumentLink_documentId_fkey"
FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentLink"
ADD CONSTRAINT "DocumentLink_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentLink"
ADD CONSTRAINT "DocumentLink_candidateId_fkey"
FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentLink"
ADD CONSTRAINT "DocumentLink_leaveRequestId_fkey"
FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
