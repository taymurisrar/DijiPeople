import { EmailTemplateStatus } from '@prisma/client';
import { sanitizeEmailTemplateHtml } from './email/email-safety';
import {
  containsPlaceholderCopy,
  listEmailTemplateAuthoringEvents,
  NOTIFICATION_EVENT_CATALOG,
  planSystemTemplateWrite,
  SYSTEM_EMAIL_TEMPLATE_PLACEHOLDERS,
  SYSTEM_EMAIL_TEMPLATES,
  templateTokens,
} from './notification-events.catalog';
import { SYSTEM_EMAIL_TEMPLATE_COPY } from './system-email-templates.copy';

/*
 * BUG-3500 / REG-505. Every system email template was ACTIVE, and six of them
 * had a body reading "This is a system placeholder email template. Configure
 * tenant-specific content before production sending." Nothing asserted the
 * catalog's copy at all, so the placeholder was indistinguishable from real
 * copy to every test in the repository.
 */
const OLD_PLACEHOLDER =
  'This is a system placeholder email template. Configure tenant-specific content before production sending.';

describe('system email templates', () => {
  it('seeds exactly one template per catalog event that names one', () => {
    const named = NOTIFICATION_EVENT_CATALOG.filter(
      (event) => event.systemTemplateKey,
    );
    expect(SYSTEM_EMAIL_TEMPLATES.map((seed) => seed.eventCode).sort()).toEqual(
      named.map((event) => event.code).sort(),
    );
    expect(SYSTEM_EMAIL_TEMPLATES).toHaveLength(11);
    expect(SYSTEM_EMAIL_TEMPLATE_PLACEHOLDERS).toBe(SYSTEM_EMAIL_TEMPLATES);
  });

  it('recognises the old placeholder wording', () => {
    expect(containsPlaceholderCopy(OLD_PLACEHOLDER)).toBe(true);
    expect(
      containsPlaceholderCopy(
        'System placeholder template for Leave approved.',
      ),
    ).toBe(true);
  });

  it.each(SYSTEM_EMAIL_TEMPLATES.map((seed) => [seed.templateKey, seed]))(
    '%s carries real copy with no placeholder wording',
    (_key, seed) => {
      for (const value of [
        seed.name,
        seed.description,
        seed.subjectTemplate,
        seed.htmlTemplate,
        seed.textTemplate,
      ]) {
        expect(value.trim().length).toBeGreaterThan(0);
        expect(containsPlaceholderCopy(value)).toBe(false);
      }
      expect(seed.textTemplate).not.toMatch(/<[a-z][^>]*>/i);
      expect(seed.isSystem).toBe(true);
    },
  );

  it.each(SYSTEM_EMAIL_TEMPLATES.map((seed) => [seed.templateKey, seed]))(
    '%s declares exactly the variables its copy uses',
    (_key, seed) => {
      /*
       * Declared-but-unused would still be required at send time (REG-386), so
       * it can only stop an email; used-but-undeclared renders blank. Both
       * directions are a defect.
       */
      expect(
        templateTokens(
          seed.subjectTemplate,
          seed.htmlTemplate,
          seed.textTemplate,
        ),
      ).toEqual(Object.keys(seed.availableVariables).sort());
    },
  );

  it('is ACTIVE only for events something sends by email today', () => {
    const statusByEvent = Object.fromEntries(
      SYSTEM_EMAIL_TEMPLATES.map((seed) => [seed.eventCode, seed.status]),
    );
    expect(statusByEvent).toEqual({
      AUTH_ACCOUNT_ACTIVATION: EmailTemplateStatus.ACTIVE,
      AUTH_PASSWORD_RESET: EmailTemplateStatus.ACTIVE,
      BILLING_INVOICE_ISSUED: EmailTemplateStatus.ACTIVE,
      PAYSLIP_AVAILABLE: EmailTemplateStatus.ACTIVE,
      REPORT_SCHEDULE_DELIVERY: EmailTemplateStatus.ACTIVE,
      SUPPORT_CASE_UPDATE: EmailTemplateStatus.ACTIVE,
      AUTH_OTP: EmailTemplateStatus.DRAFT,
      LEAVE_APPROVAL_REQUEST: EmailTemplateStatus.DRAFT,
      LEAVE_APPROVED: EmailTemplateStatus.DRAFT,
      TIMESHEET_APPROVAL_REQUEST: EmailTemplateStatus.DRAFT,
      PAYROLL_PROCESSED: EmailTemplateStatus.DRAFT,
    });
  });

  it('refuses to load a catalog event that names a template with no authored copy', async () => {
    await jest.isolateModulesAsync(async () => {
      jest.doMock('./system-email-templates.copy', () => ({
        SYSTEM_EMAIL_TEMPLATE_COPY: new Map(),
      }));
      await expect(import('./notification-events.catalog')).rejects.toThrow(
        /no authored copy/,
      );
    });
    jest.dontMock('./system-email-templates.copy');
  });
});

describe('sanitizeEmailTemplateHtml', () => {
  it.each(SYSTEM_EMAIL_TEMPLATES.map((seed) => [seed.templateKey, seed]))(
    'keeps every token and link in %s',
    (_key, seed) => {
      const sanitized = sanitizeEmailTemplateHtml(seed.htmlTemplate);
      expect(templateTokens(sanitized)).toEqual(
        templateTokens(seed.htmlTemplate),
      );
      for (const match of seed.htmlTemplate.matchAll(/href="([^"]+)"/g)) {
        expect(sanitized).toContain(`href="${match[1]}"`);
      }
      expect(sanitized).toContain('style=');
    },
  );

  it('removes scripts, event handlers, frames and javascript links', () => {
    const sanitized = sanitizeEmailTemplateHtml(
      '<p onclick="steal()">Hi</p><script>alert(1)</script><iframe src="https://evil.example"></iframe><a href="javascript:alert(1)">x</a><form><input name="p"></form>',
    );
    expect(sanitized).toContain('<p>Hi</p>');
    expect(sanitized).not.toMatch(
      /onclick|<script|<iframe|javascript:|<form|<input/i,
    );
  });

  it('refuses script expressions and external resources in styles', () => {
    expect(() =>
      sanitizeEmailTemplateHtml(
        '<p style="background:url(https://tracker.example/p.gif)">Hi</p>',
      ),
    ).toThrow();
  });
});

describe('planSystemTemplateWrite (seed guard)', () => {
  it('creates a missing row and refreshes an untouched system default', () => {
    expect(planSystemTemplateWrite(null)).toBe('create');
    expect(
      planSystemTemplateWrite({
        tenantId: null,
        isSystem: true,
        updatedBy: null,
      }),
    ).toBe('update');
  });

  it('never writes a tenant row, a non-system row or a row a person saved', () => {
    expect(
      planSystemTemplateWrite({
        tenantId: 'tenant-1',
        isSystem: false,
        updatedBy: 'user-1',
      }),
    ).toBe('skip');
    expect(
      planSystemTemplateWrite({
        tenantId: 'tenant-1',
        isSystem: true,
        updatedBy: null,
      }),
    ).toBe('skip');
    expect(
      planSystemTemplateWrite({
        tenantId: null,
        isSystem: false,
        updatedBy: null,
      }),
    ).toBe('skip');
    expect(
      planSystemTemplateWrite({
        tenantId: null,
        isSystem: true,
        updatedBy: 'user-1',
      }),
    ).toBe('skip');
  });
});

describe('email template authoring events (ITEM-0181)', () => {
  it('offers only tenant mail that is sent today and inside the plan', () => {
    expect(
      listEmailTemplateAuthoringEvents(new Set(['payroll'])).map(
        (event) => event.code,
      ),
    ).toEqual([
      'AUTH_ACCOUNT_ACTIVATION',
      'AUTH_PASSWORD_RESET',
      'PAYSLIP_AVAILABLE',
      'REPORT_SCHEDULE_DELIVERY',
    ]);
    expect(
      listEmailTemplateAuthoringEvents(new Set()).map((event) => event.code),
    ).not.toContain('PAYSLIP_AVAILABLE');
  });

  it('carries each event variables and default content from the copy', () => {
    for (const event of listEmailTemplateAuthoringEvents(
      new Set(['payroll']),
    )) {
      const copy = SYSTEM_EMAIL_TEMPLATE_COPY.get(event.code);
      expect(copy).toBeDefined();
      expect(event.variables).toEqual(copy?.variables);
      expect(event.defaultContent.htmlTemplate).toBe(copy?.htmlTemplate);
      for (const variable of event.variables) {
        expect(variable.sample.length).toBeGreaterThan(0);
      }
    }
  });
});
