import { PublicTenantsService } from './public-tenants.service';

/**
 * BUG-3141 / FILE-02 — the unauthenticated branding route must never open a
 * document that is not a raster image, whatever the stored MIME type claims.
 * SVG is a script host; this is the serving-side half of the fix (the upload
 * side is covered in branding-assets.service.spec.ts).
 */
describe('PublicTenantsService.openBrandingAsset', () => {
  const build = (mimeType: string | null) => {
    const document = {
      id: 'doc-1',
      storageKey: 'tenants/t/logo',
      mimeType,
      sizeInBytes: 10,
      updatedAt: new Date(0),
      originalFileName: 'logo',
    };
    const openFile = jest.fn().mockResolvedValue({ size: 10 });
    const prisma = {
      tenant: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 't', slug: 'acme', status: 'ACTIVE' }),
      },
      document: { findFirst: jest.fn().mockResolvedValue(document) },
    };
    const service = new PublicTenantsService(
      prisma as never,
      {} as never,
      {} as never,
      { openFile } as never,
    );
    jest
      .spyOn(service as never, 'getConfiguredBrandingDocumentId')
      .mockReturnValue('doc-1' as never);
    return { service, openFile, prisma };
  };

  it.each(['image/svg+xml', 'text/html', 'application/octet-stream', null])(
    'refuses %s without opening storage',
    async (mime) => {
      const { service, openFile } = build(mime);
      expect(await service.openBrandingAsset('acme', 'logo')).toBeNull();
      expect(openFile).not.toHaveBeenCalled();
    },
  );

  it('serves a raster logo, looked up inside the tenant', async () => {
    const { service, openFile, prisma } = build('image/png');
    expect(await service.openBrandingAsset('acme', 'logo')).not.toBeNull();
    expect(openFile).toHaveBeenCalledTimes(1);
    const lookup = (
      prisma.document.findFirst.mock.calls as unknown[][]
    )[0][0] as {
      where: { tenantId: string };
    };
    expect(lookup.where.tenantId).toBe('t');
  });
});
