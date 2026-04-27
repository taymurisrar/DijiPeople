import { BadRequestException } from '@nestjs/common';
import { RecruitmentService } from './recruitment.service';

describe('RecruitmentService', () => {
  let service: RecruitmentService;
  let recruitmentRepository: {
    findCandidateById: jest.Mock;
    findJobOpeningById: jest.Mock;
  };

  beforeEach(() => {
    recruitmentRepository = {
      findCandidateById: jest.fn(),
      findJobOpeningById: jest.fn(),
    };

    service = new RecruitmentService(
      recruitmentRepository as never,
      { buildQueuedJob: jest.fn() } as never,
    );
  });

  it('rejects application submission when the job opening is outside the tenant', async () => {
    recruitmentRepository.findCandidateById.mockResolvedValue({
      id: 'candidate-1',
    });
    recruitmentRepository.findJobOpeningById.mockResolvedValue(null);

    await expect(
      service.submitApplication(
        {
          tenantId: 'tenant-1',
          userId: 'user-1',
        } as never,
        {
          candidateId: 'c7f37ba4-f630-4162-b7ce-37b6692e55e3',
          jobOpeningId: 'db7aa603-c8d2-44fb-9b3c-a55a29a5af47',
        } as never,
      ),
    ).rejects.toThrow(
      new BadRequestException(
        'Selected job opening does not belong to this tenant.',
      ),
    );
  });
});
