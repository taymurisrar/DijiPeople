import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { EmailTemplate, EmailTemplateStatus } from '@prisma/client';
import { SYSTEM_EMAIL_TEMPLATES } from '../notification-events.catalog';
import { EmailTemplateAuthoringService } from './email-template-authoring.service';
import { EmailTemplateRendererService } from './email-template-renderer.service';

/*
 * ITEM-0181 / REG-507. The template authoring API after the editor stopped
 * sending HTML and JSON: what a tenant may author, how Customize replaces a
 * default, and that every read and write stays inside the caller's tenant.
 */

const TENANT = 'tenant-1';
const USER = { tenantId: TENANT, userId: 'user-1' } as Parameters<
  EmailTemplateAuthoringService['listTemplates']
>[0];

function systemRow(
  eventCode: string,
  id = `system-${eventCode}`,
): EmailTemplate {
  const seed = SYSTEM_EMAIL_TEMPLATES.find(
    (item) => item.eventCode === eventCode,
  );
  if (!seed) throw new Error(`no seed for ${eventCode}`);
  return {
    id,
    tenantId: null,
    scopeKey: seed.scopeKey,
    eventCode: seed.eventCode,
    templateKey: seed.templateKey,
    name: seed.name,
    description: seed.description,
    subjectTemplate: seed.subjectTemplate,
    htmlTemplate: seed.htmlTemplate,
    textTemplate: seed.textTemplate,
    availableVariables: seed.availableVariables,
    moduleKey: null,
    status: seed.status,
    version: 1,
    isSystem: true,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
  };
}

function tenantRow(overrides: Partial<EmailTemplate> = {}): EmailTemplate {
  return {
    ...systemRow('PAYSLIP_AVAILABLE', 'tenant-template-1'),
    tenantId: TENANT,
    scopeKey: `TENANT:${TENANT}`,
    isSystem: false,
    status: EmailTemplateStatus.DRAFT,
    createdBy: 'user-1',
    updatedBy: 'user-1',
    ...overrides,
  };
}

function buildService(input: {
  rows?: EmailTemplate[];
  features?: string[];
  occupant?: EmailTemplate | null;
  keyTaken?: boolean;
}) {
  const rows = input.rows ?? [];
  const repository = {
    listTemplates: jest.fn(async () => rows),
    findVisibleTemplateById: jest.fn(
      async (tenantId: string, id: string) =>
        rows.find(
          (row) =>
            row.id === id &&
            (row.scopeKey === 'SYSTEM' ||
              (row.tenantId === tenantId && !row.isSystem)),
        ) ?? null,
    ),
    findTemplateByScopeAndKey: jest.fn(async () =>
      input.keyTaken ? { id: 'taken' } : null,
    ),
    findTemplateRowByScopeAndKey: jest.fn(async () => input.occupant ?? null),
    createTenantTemplate: jest.fn(async (data: Record<string, unknown>) =>
      tenantRow({
        id: 'created-1',
        ...(data as Partial<EmailTemplate>),
      }),
    ),
    updateTenantTemplate: jest.fn(
      async (tenantId: string, id: string, data: Record<string, unknown>) => {
        const row = rows.find(
          (item) => item.id === id && item.tenantId === tenantId,
        );
        return row ? { ...row, ...(data as Partial<EmailTemplate>) } : null;
      },
    ),
    activateTenantTemplate: jest.fn(),
    archiveTenantTemplate: jest.fn(),
    listScopeTargets: jest.fn(async () => ({
      organizations: [],
      businessUnits: [],
      departments: [],
      teams: [],
    })),
    scopeTargetExists: jest.fn(async () => true),
  };
  const emailService = {
    sendTemplateEmail: jest.fn(async () => ({ status: 'SENT' })),
  };
  const auditService = { log: jest.fn(async () => undefined) };

  const service = Object.create(
    EmailTemplateAuthoringService.prototype,
  ) as EmailTemplateAuthoringService;
  Object.assign(service, {
    repository,
    emailService,
    renderer: new EmailTemplateRendererService(),
    featureAccess: {
      getResolvedTenantFeatures: jest.fn(async () => ({
        enabledKeys: input.features ?? ['payroll'],
      })),
    },
    auditService,
  });

  return { service, repository, emailService, auditService };
}

describe('EmailTemplateAuthoringService.listTemplates', () => {
  it('hides system templates a tenant cannot use and flags the customizable ones', async () => {
    const { service } = buildService({
      rows: [
        systemRow('AUTH_PASSWORD_RESET'),
        systemRow('BILLING_INVOICE_ISSUED'),
        systemRow('AUTH_OTP'),
        systemRow('PAYSLIP_AVAILABLE'),
        tenantRow(),
      ],
      features: [],
    });

    const { items } = await service.listTemplates(USER);

    expect(items.map((item) => [item.id, item.customizable])).toEqual([
      ['system-AUTH_PASSWORD_RESET', true],
      ['tenant-template-1', false],
    ]);
  });
});

describe('EmailTemplateAuthoringService.createTemplate', () => {
  const content = {
    name: 'Payslip',
    eventCode: 'PAYSLIP_AVAILABLE',
    subjectTemplate: 'Payslip for {{payrollPeriod}}',
    htmlTemplate:
      '<p onclick="x()">Hello {{recipientName}}</p><script>alert(1)</script>',
  };

  it('derives the key and variables from the event and sanitises the body', async () => {
    const { service, repository, auditService } = buildService({});

    await service.createTemplate(USER, content);

    expect(repository.createTenantTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        scopeKey: `TENANT:${TENANT}`,
        templateKey: 'PAYSLIP_AVAILABLE',
        htmlTemplate: '<p>Hello {{recipientName}}</p>',
        availableVariables: {
          recipientName: 'Recipient name',
          payrollPeriod: 'Pay period',
          payslipNumber: 'Payslip number',
        },
        status: EmailTemplateStatus.DRAFT,
      }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        action: 'EMAIL_TEMPLATE_CREATED',
        entityType: 'EmailTemplate',
      }),
    );
  });

  it('refuses a token the event does not supply', async () => {
    const { service, repository } = buildService({});
    await expect(
      service.createTemplate(USER, {
        ...content,
        htmlTemplate: '<p>{{salary}}</p>',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.createTenantTemplate).not.toHaveBeenCalled();
  });

  it('refuses events that are platform mail, unsent, or outside the plan', async () => {
    const { service } = buildService({ features: [] });
    for (const eventCode of [
      'BILLING_INVOICE_ISSUED',
      'AUTH_OTP',
      'LEAVE_APPROVED',
      'PAYSLIP_AVAILABLE',
    ]) {
      await expect(
        service.createTemplate(USER, { ...content, eventCode }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('reports a key already used at that scope as a conflict', async () => {
    const { service } = buildService({ keyTaken: true });
    await expect(service.createTemplate(USER, content)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('EmailTemplateAuthoringService.cloneTemplate (Customize)', () => {
  it('creates a draft tenant copy under the system key so it replaces the default', async () => {
    const { service, repository, auditService } = buildService({
      rows: [systemRow('AUTH_PASSWORD_RESET')],
    });

    await service.cloneTemplate(USER, 'system-AUTH_PASSWORD_RESET');

    expect(repository.createTenantTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        scopeKey: `TENANT:${TENANT}`,
        templateKey: 'AUTH_PASSWORD_RESET',
        name: 'Password reset email',
        status: EmailTemplateStatus.DRAFT,
      }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EMAIL_TEMPLATE_CUSTOMIZED' }),
    );
  });

  it('opens the existing tenant copy instead of failing on the unique key', async () => {
    const existing = tenantRow({
      id: 'existing-copy',
      eventCode: 'AUTH_PASSWORD_RESET',
      templateKey: 'AUTH_PASSWORD_RESET',
    });
    const { service, repository } = buildService({
      rows: [systemRow('AUTH_PASSWORD_RESET')],
      occupant: existing,
    });

    const result = await service.cloneTemplate(
      USER,
      'system-AUTH_PASSWORD_RESET',
    );

    expect(result.id).toBe('existing-copy');
    expect(repository.createTenantTemplate).not.toHaveBeenCalled();
  });

  it('refuses when the key is held by a row the tenant does not own', async () => {
    const { service } = buildService({
      rows: [systemRow('AUTH_PASSWORD_RESET')],
      occupant: tenantRow({
        isSystem: true,
        templateKey: 'AUTH_PASSWORD_RESET',
      }),
    });
    await expect(
      service.cloneTemplate(USER, 'system-AUTH_PASSWORD_RESET'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('treats platform mail as not found for the tenant', async () => {
    const { service } = buildService({
      rows: [systemRow('BILLING_INVOICE_ISSUED')],
    });
    await expect(
      service.cloneTemplate(USER, 'system-BILLING_INVOICE_ISSUED'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('EmailTemplateAuthoringService.updateTemplate', () => {
  it('writes through the tenant-scoped update with catalog variables, ignoring client JSON', async () => {
    const { service, repository } = buildService({ rows: [tenantRow()] });

    await service.updateTemplate(USER, 'tenant-template-1', {
      subjectTemplate: 'Payslip {{payslipNumber}}',
      availableVariables: { anything: 'typed by hand' },
    });

    expect(repository.updateTenantTemplate).toHaveBeenCalledWith(
      TENANT,
      'tenant-template-1',
      expect.objectContaining({
        subjectTemplate: 'Payslip {{payslipNumber}}',
        availableVariables: expect.objectContaining({
          payslipNumber: 'Payslip number',
        }) as unknown,
      }),
      'user-1',
    );
    const data = repository.updateTenantTemplate.mock.calls[0][2];
    expect(data.availableVariables).not.toHaveProperty('anything');
  });

  it('cannot reach a system template or another tenant template', async () => {
    const { service } = buildService({
      rows: [
        systemRow('AUTH_PASSWORD_RESET'),
        tenantRow({
          id: 'other',
          tenantId: 'tenant-2',
          scopeKey: 'TENANT:tenant-2',
        }),
      ],
    });
    await expect(
      service.updateTemplate(USER, 'system-AUTH_PASSWORD_RESET', { name: 'x' }),
    ).rejects.toThrow();
    await expect(
      service.updateTemplate(USER, 'other', { name: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('EmailTemplateAuthoringService preview and test send', () => {
  it('renders with catalog samples and escapes a hostile override value', async () => {
    const { service } = buildService({ rows: [tenantRow()] });

    const rendered = await service.previewTemplate(USER, 'tenant-template-1', {
      htmlTemplate: '<p>{{recipientName}} — {{payrollPeriod}}</p>',
      variables: { recipientName: '<img src=x onerror=alert(1)>' },
    });

    expect(rendered.renderedHtml).toContain(
      '&lt;img src=x onerror=alert(1)&gt;',
    );
    expect(rendered.renderedHtml).toContain('September 2026');
    expect(rendered.renderedHtml).not.toContain('<img');
  });

  it('previews an unsaved template for an authorable event', async () => {
    const { service } = buildService({});
    const rendered = await service.previewDraftTemplate(USER, {
      eventCode: 'PAYSLIP_AVAILABLE',
      subjectTemplate: 'Payslip {{payslipNumber}}',
      htmlTemplate: '<p>{{recipientName}}</p>',
    });
    expect(rendered.renderedSubject).toBe('Payslip PS-2026-09-0117');
  });

  it('sends a test with sample values when the body names only a recipient', async () => {
    const { service, emailService } = buildService({ rows: [tenantRow()] });

    await service.testSendTemplate(USER, 'tenant-template-1', {
      recipient: 'Person@Example.com',
    });

    expect(emailService.sendTemplateEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        templateId: 'tenant-template-1',
        recipient: 'person@example.com',
        dryRun: false,
        variables: expect.objectContaining({
          payrollPeriod: 'September 2026',
        }) as unknown,
      }),
    );
  });
});
