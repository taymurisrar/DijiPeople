import { RecruitmentService } from './recruitment.service';

/**
 * Storage keys must not reach the client.
 *
 * `mapCandidate` used to spread the Prisma row (`...document`) into the API
 * response. `candidateInclude` has no `select`, so every scalar came back —
 * including `storageKey`, `storageProvider` and `checksumSha256` — and anyone
 * holding `recruitment.read` received the raw object key for every candidate
 * document and résumé. That is the FILE-18 leak, and it is the reason a storage
 * key can no longer be sent back to the API as input either.
 *
 * The projection is now an explicit field list. This test is what stops someone
 * reintroducing the spread, or adding a sensitive column to the model and
 * having it appear in the response for free.
 */
describe('candidate document projection', () => {
  const FORBIDDEN = [
    'storageKey',
    'storageProvider',
    'checksumSha256',
    'tenantId',
  ];

  function project(document: Record<string, unknown>) {
    // The projection is a pure function of its input, so it is exercised
    // directly rather than through a fully mocked service graph.
    const service = Object.create(
      RecruitmentService.prototype,
    ) as RecruitmentService;

    return (
      service as unknown as {
        mapCandidateDocument: (
          candidateId: string,
          doc: Record<string, unknown>,
        ) => Record<string, unknown>;
      }
    ).mapCandidateDocument('candidate-1', document);
  }

  const storedDocument = {
    id: 'doc-1',
    tenantId: 'tenant-a',
    name: 'Resume',
    kind: 'resume',
    fileName: 'ayesha-khan-cv.pdf',
    contentType: 'application/pdf',
    fileSizeBytes: 2048,
    storageKey: 'tenants/tenant-a/recruitment/candidate-1/2026/09/abc.pdf',
    storageProvider: 'r2',
    checksumSha256: 'a'.repeat(64),
    scanStatus: 'SCAN_NOT_CONFIGURED',
    isResume: true,
    isPrimaryResume: true,
    isLatestResume: true,
    sourceChannel: 'UPLOAD',
    uploadedAt: new Date('2026-09-10T00:00:00Z'),
    parserVersion: null,
    parsingStatus: null,
    parsedAt: null,
    extractionConfidence: null,
    parsingWarnings: null,
    candidateId: 'candidate-1',
    createdAt: new Date('2026-09-10T00:00:00Z'),
    updatedAt: new Date('2026-09-10T00:00:00Z'),
    createdById: 'user-1',
    updatedById: 'user-1',
  };

  it.each(FORBIDDEN)('never returns %s', (field) => {
    expect(Object.keys(project(storedDocument))).not.toContain(field);
  });

  it('returns only fields the projection names', () => {
    // A snapshot of the key set rather than of values: it fails when a field is
    // added, which is the moment someone has to decide whether it is safe to
    // expose.
    expect(Object.keys(project(storedDocument)).sort()).toEqual([
      'candidateId',
      'contentType',
      'createdAt',
      'downloadPath',
      'extractionConfidence',
      'fileName',
      'fileSizeBytes',
      'id',
      'isLatestResume',
      'isPrimaryResume',
      'isResume',
      'kind',
      'name',
      'parsedAt',
      'parserVersion',
      'parsingStatus',
      'parsingWarnings',
      'scanStatus',
      'sourceChannel',
      'updatedAt',
      'uploadedAt',
      'viewPath',
    ]);
  });

  it('addresses the document by id, never by key', () => {
    const projected = project(storedDocument);

    expect(projected.viewPath).toBe(
      '/api/candidates/candidate-1/documents/doc-1/view',
    );
    expect(projected.downloadPath).toBe(
      '/api/candidates/candidate-1/documents/doc-1/download',
    );
    expect(JSON.stringify(projected)).not.toContain('tenants/tenant-a');
  });

  it('offers no path when the document has no stored object', () => {
    const projected = project({ ...storedDocument, storageKey: null });

    expect(projected.viewPath).toBeNull();
    expect(projected.downloadPath).toBeNull();
  });
});
