import { BadRequestException } from '@nestjs/common';
import { validateCalculationFields } from './salary-package-rules.service';

describe('salary package component validation', () => {
  it('requires fixed amount for fixed components', () => {
    expect(() => validateCalculationFields('FIXED')).toThrow(
      new BadRequestException(
        'Fixed salary package components require fixed amount.',
      ),
    );
  });

  it('requires percentage for percentage components', () => {
    expect(() => validateCalculationFields('PERCENTAGE')).toThrow(
      new BadRequestException(
        'Percentage salary package components require percentage.',
      ),
    );
  });

  it('rejects unsupported formula tokens instead of evaluating JavaScript', () => {
    expect(() =>
      validateCalculationFields('FORMULA', null, null, 'process.exit()'),
    ).toThrow(
      new BadRequestException(
        'Formula expression contains unsupported tokens.',
      ),
    );
  });
});
