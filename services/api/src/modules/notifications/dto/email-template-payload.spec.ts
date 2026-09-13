import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  PreviewDraftEmailTemplateDto,
  PreviewEmailTemplateDto,
  TestSendEmailTemplateDto,
} from './email-execution.dto';
import {
  CreateEmailTemplateDto,
  UpdateEmailTemplateDto,
} from './email-template.dto';

/*
 * ITEM-0181 / REG-508. The seam between the template editor and these DTOs.
 *
 * The global ValidationPipe runs `whitelist` + `forbidNonWhitelisted`, so a
 * field the editor sends that a DTO does not declare is a 400, not an ignored
 * extra. The editor's payload builders are pinned to this fixture by
 * `apps/web/.../templates/_lib/email-template-editing.spec.ts`; this validates
 * the same file against the real DTOs with the pipe's options.
 */
const FIXTURE = join(
  __dirname,
  '..',
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
  'notifications',
  'templates',
  '_lib',
  'email-template-payload.fixture.json',
);

const payloads = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<
  string,
  Record<string, unknown>
>;

function errorsFor(dto: new () => object, payload: Record<string, unknown>) {
  return validateSync(plainToInstance(dto, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  }).map((error) => error.property);
}

describe('email template editor payloads against the API DTOs', () => {
  it.each([
    ['create', CreateEmailTemplateDto],
    ['update', UpdateEmailTemplateDto],
    ['previewSaved', PreviewEmailTemplateDto],
    ['previewDraft', PreviewDraftEmailTemplateDto],
    ['testSend', TestSendEmailTemplateDto],
  ] as const)('accepts the %s payload', (name, dto) => {
    expect(payloads[name]).toBeDefined();
    expect(errorsFor(dto, payloads[name])).toEqual([]);
  });

  it('would reject a field the DTO does not declare, so the check has teeth', () => {
    expect(
      errorsFor(CreateEmailTemplateDto, {
        ...payloads.create,
        variablesJson: '{}',
      }),
    ).toEqual(['variablesJson']);
  });
});
