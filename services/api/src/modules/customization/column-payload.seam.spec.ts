import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import * as ts from 'typescript';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { CreateCustomizationColumnDto } from './dto/customization.dto';
import { CustomizationService } from './customization.service';

/*
 * SEAM — BUG-3492. What the Add field dialog sends must be accepted by the DTO
 * and by `CustomizationService.createColumn`.
 *
 * The dialog sent `maxLength: null` for every field type without a length, the
 * DTO let `null` through (`@IsOptional`), and the service compared `null < 1`.
 * Each side was reasonable on its own; no test sent the client's payload to the
 * server. This one does, with the client's own builder: the web file is read
 * and transpiled here, so a change to what the dialog sends is tested against
 * the server on the next run instead of drifting silently.
 *
 * The pipe uses the same options as `main.ts`.
 */
type ColumnPayloadInput = {
  mode: 'create' | 'edit';
  columnKey: string;
  displayName: string;
  fieldType: string;
  isRequired: boolean;
  isVisible: boolean;
  isSearchable: boolean;
  isFilterable: boolean;
  isSortable: boolean;
  maxLength: number | null;
  defaultValue: string;
  lookupTargetTableKey: string;
  options: ReadonlyArray<{ label: string; value: string; active: boolean }>;
  sortOrder: number | null;
};

type ClientModule = {
  buildColumnPayload: (input: ColumnPayloadInput) => Record<string, unknown>;
};

function loadClientPayloadBuilder(): ClientModule {
  const file = join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    '..',
    'apps',
    'web',
    'app',
    '(authenticated)',
    'settings',
    'customization',
    '_lib',
    'column-payload.ts',
  );
  const output = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
    },
  }).outputText;
  const module = { exports: {} as Record<string, unknown> };
  runInNewContext(output, { module, exports: module.exports });
  return module.exports as unknown as ClientModule;
}

type Internals = Record<string, (...args: unknown[]) => unknown>;

describe('Add field dialog payload → DTO → createColumn', () => {
  const client = loadClientPayloadBuilder();
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  });
  const user = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    tenantName: 'Acme',
    roleKeys: ['system-admin'],
    permissionKeys: ['customization.columns.create'],
  } as unknown as AuthenticatedUser;

  let service: CustomizationService;
  let create: jest.Mock;

  beforeEach(() => {
    create = jest.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'column-1', ...data }),
    );
    const prisma = { customizationColumn: { create } };
    service = new CustomizationService(prisma as unknown as PrismaService);
    const internals = service as unknown as Internals;
    jest
      .spyOn(internals, 'resolveLayerPackage')
      .mockResolvedValue({ id: 'package-1', isDefault: false, isSystem: false });
    jest
      .spyOn(internals, 'ensureCustomizationTable')
      .mockResolvedValue({ id: 'table-1', tableKey: 'qaAsset' });
    jest
      .spyOn(internals, 'ensurePackageModuleMembership')
      .mockResolvedValue(undefined);
    jest
      .spyOn(internals, 'addDefaultSolutionComponent')
      .mockResolvedValue({ id: 'component-1' });
  });

  function dialogInput(patch: Partial<ColumnPayloadInput>): ColumnPayloadInput {
    return {
      mode: 'create',
      columnKey: 'dd_condition',
      displayName: 'Condition',
      fieldType: 'text',
      isRequired: false,
      isVisible: true,
      isSearchable: false,
      isFilterable: false,
      isSortable: false,
      maxLength: null,
      defaultValue: '',
      lookupTargetTableKey: '',
      options: [],
      sortOrder: 10,
      ...patch,
    };
  }

  async function submit(body: Record<string, unknown>) {
    const dto = (await pipe.transform(body, {
      type: 'body',
      metatype: CreateCustomizationColumnDto,
    })) as CreateCustomizationColumnDto;
    return service.createColumn(user, 'qaAsset', dto);
  }

  it.each([
    [
      'a choice field',
      {
        fieldType: 'choice',
        options: [
          { label: 'Good', value: 'good', active: true },
          { label: 'Damaged', value: 'damaged', active: true },
        ],
      },
    ],
    [
      'a reference field targeting Employees',
      {
        columnKey: 'dd_assignedEmployee',
        fieldType: 'reference',
        lookupTargetTableKey: 'employees',
      },
    ],
    ['a text field with a blank length', { fieldType: 'text' }],
    ['a number field', { fieldType: 'number' }],
    ['a date and time field', { fieldType: 'datetime' }],
    ['a yes/no field', { fieldType: 'boolean' }],
  ])('creates %s', async (_label, patch) => {
    const body = client.buildColumnPayload(dialogInput(patch));

    await expect(submit(body)).resolves.toMatchObject({ id: 'column-1' });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ maxLength: null }),
      }),
    );
  });

  it('keeps a typed length on a text field', async () => {
    const body = client.buildColumnPayload(
      dialogInput({ fieldType: 'text', maxLength: 40 }),
    );

    await submit(body);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ maxLength: 40 }),
      }),
    );
  });

  it('still refuses a text field whose length is 0', async () => {
    const body = client.buildColumnPayload(
      dialogInput({ fieldType: 'text', maxLength: 0 }),
    );

    await expect(submit(body)).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('accepts maxLength: null from a client that still sends it', async () => {
    // The shape every already-open browser tab sends until it reloads.
    const body = {
      ...client.buildColumnPayload(dialogInput({ fieldType: 'choice' })),
      optionSetJson: { options: [{ label: 'A', value: 'a', active: true }] },
      maxLength: null,
    };

    await expect(submit(body)).resolves.toMatchObject({ id: 'column-1' });
  });
});
