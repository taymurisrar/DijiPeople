import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CompensationFormulaService } from './compensation-formula.service';

describe('CompensationFormulaService', () => {
  const service = new CompensationFormulaService();

  it('evaluates arithmetic and approved functions with Decimal money', () => {
    const [component] = service.resolveComponents(
      [
        {
          id: 'hra-id',
          payComponentId: 'hra',
          code: 'HRA',
          calculationMethod: 'FORMULA',
          formulaExpression: 'ROUND(MAX(BASIC * 0.25, 1000), 2)',
        },
      ],
      { basic: new Prisma.Decimal(5000) },
    );

    expect(component.calculatedAmount.toString()).toBe('1250');
  });

  it('supports common basic salary aliases in formulas', () => {
    const [component] = service.resolveComponents(
      [
        {
          id: 'eobi-id',
          payComponentId: 'eobi',
          code: 'EOBI',
          calculationMethod: 'FORMULA',
          formulaExpression: 'MIN(BasicSalary, 40000) * 0.01',
        },
      ],
      { basic: new Prisma.Decimal(65000) },
    );

    expect(component.calculatedAmount.toString()).toBe('400');
  });

  it('supports friendly component names with spaces in formulas', () => {
    const result = service.resolveComponents(
      [
        {
          id: 'basic-id',
          payComponentId: 'basic',
          code: 'BASIC_SALARY_J9RUUZ',
          name: 'Basic Salary',
          calculationMethod: 'FIXED',
          fixedAmount: '65000',
        },
        {
          id: 'house-id',
          payComponentId: 'house',
          code: 'HOUSE_ALLOWANCE_UWCLPO',
          name: 'House Allowance',
          calculationMethod: 'FORMULA',
          formulaExpression: 'Basic Salary * 0.25',
          minimumAmount: '1000',
          maximumAmount: '25000',
          roundingMethod: 'UP',
        },
      ],
      { basic: new Prisma.Decimal(65000) },
    );

    expect(
      result
        .find((component) => component.code === 'HOUSE_ALLOWANCE_UWCLPO')
        ?.calculatedAmount.toString(),
    ).toBe('16250');
  });

  it('supports brace tokens and percent literals', () => {
    const [component] = service.resolveComponents(
      [
        {
          id: 'shift-id',
          payComponentId: 'shift',
          code: 'SHIFT_ALLOWANCE',
          name: 'Shift Allowance',
          calculationMethod: 'FORMULA',
          formulaExpression: '({BasicSalary} * 20%) + 500',
        },
      ],
      { basic: new Prisma.Decimal(10000) },
    );

    expect(component.calculatedAmount.toString()).toBe('2500');
  });

  it('uses the configured percentage base component', () => {
    const result = service.resolveComponents(
      [
        {
          id: 'basic-id',
          payComponentId: 'basic',
          code: 'BASIC_SALARY_J9RUUZ',
          name: 'Basic Salary',
          calculationMethod: 'FIXED',
          fixedAmount: '10000',
        },
        {
          id: 'allowance-id',
          payComponentId: 'allowance',
          code: 'ALLOWANCE',
          calculationMethod: 'FIXED',
          fixedAmount: '2000',
        },
        {
          id: 'deduction-id',
          payComponentId: 'deduction',
          code: 'DEDUCTION',
          calculationMethod: 'PERCENTAGE',
          percentage: '10',
          percentageBaseComponentId: 'allowance',
        },
      ],
      { basic: new Prisma.Decimal(10000) },
    );

    expect(
      result
        .find((component) => component.code === 'DEDUCTION')
        ?.calculatedAmount.toString(),
    ).toBe('200');
  });

  it('resolves component references in dependency order', () => {
    const result = service.resolveComponents(
      [
        {
          id: 'housing-id',
          payComponentId: 'housing',
          code: 'HOUSING',
          calculationMethod: 'FORMULA',
          formulaExpression: 'BASIC * 0.2',
        },
        {
          id: 'transport-id',
          payComponentId: 'transport',
          code: 'TRANSPORT',
          calculationMethod: 'FORMULA',
          formulaExpression: 'HOUSING + 250',
        },
      ],
      { basic: '10000' },
    );

    expect(
      result
        .find((component) => component.code === 'TRANSPORT')
        ?.calculatedAmount.toString(),
    ).toBe('2250');
  });

  it('rejects circular component references', () => {
    expect(() =>
      service.resolveComponents(
        [
          {
            id: 'a-id',
            payComponentId: 'a',
            code: 'A',
            calculationMethod: 'FORMULA',
            formulaExpression: 'B + 1',
          },
          {
            id: 'b-id',
            payComponentId: 'b',
            code: 'B',
            calculationMethod: 'FORMULA',
            formulaExpression: 'A + 1',
          },
        ],
        { basic: '1000' },
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects unknown references and division by zero', () => {
    expect(() =>
      service.resolveComponents(
        [
          {
            id: 'x-id',
            payComponentId: 'x',
            code: 'X',
            calculationMethod: 'FORMULA',
            formulaExpression: 'UNKNOWN + 1',
          },
        ],
        { basic: '1000' },
      ),
    ).toThrow(BadRequestException);

    expect(() =>
      service.resolveComponents(
        [
          {
            id: 'x-id',
            payComponentId: 'x',
            code: 'X',
            calculationMethod: 'FORMULA',
            formulaExpression: 'BASIC / 0',
          },
        ],
        { basic: '1000' },
      ),
    ).toThrow(BadRequestException);
  });
});
