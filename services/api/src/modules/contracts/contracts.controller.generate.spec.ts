import { BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { ContractsController } from './contracts.controller';
import type { ContractsService } from './contracts.service';

/*
 * The format is a path segment the client chooses. An unsupported one used to
 * throw a plain Error, which the filter reports as a 500 and records as a
 * system fault (found re-verifying TASK-0032's agreement fixes).
 */
describe('ContractsController.generate', () => {
  it('refuses an unsupported format as a bad request without generating anything', async () => {
    const generateDocument = jest.fn();
    const controller = new ContractsController({
      generateDocument,
    } as unknown as ContractsService);

    await expect(
      controller.generate(
        {} as AuthenticatedUser,
        'contract-1',
        'html',
        {} as Response,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(generateDocument).not.toHaveBeenCalled();
  });
});
