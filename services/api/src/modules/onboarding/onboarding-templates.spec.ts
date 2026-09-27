import { NotFoundException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';

function buildService(findTemplateById: jest.Mock = jest.fn(async () => null)) {
  const onboardingRepository = {
    findTemplateById,
  };
  const service = new OnboardingService(
    onboardingRepository as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, onboardingRepository };
}

const template = {
  id: 'template-1',
  tenantId: 'tenant-a',
  name: 'Standard onboarding',
  description: 'Default checklist',
  taskBlueprints: [{ title: 'Collect documents' }],
  isDefault: true,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

describe('OnboardingService.findTemplateById', () => {
  it('returns the mapped template when it belongs to the tenant', async () => {
    const { service, onboardingRepository } = buildService(
      jest.fn(async () => template),
    );

    await expect(
      service.findTemplateById('tenant-a', 'template-1'),
    ).resolves.toEqual({
      id: 'template-1',
      tenantId: 'tenant-a',
      name: 'Standard onboarding',
      description: 'Default checklist',
      taskBlueprints: [{ title: 'Collect documents' }],
      isDefault: true,
      isActive: true,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    });
    expect(onboardingRepository.findTemplateById).toHaveBeenCalledWith(
      'tenant-a',
      'template-1',
    );
  });

  it('throws NotFoundException for a template belonging to another tenant', async () => {
    // The repository itself filters by { tenantId, id } via findFirst, so a
    // cross-tenant id resolves to null exactly like a missing id would.
    const { service } = buildService(jest.fn(async () => null));

    await expect(
      service.findTemplateById('tenant-b', 'template-1'),
    ).rejects.toThrow(NotFoundException);
  });
});
