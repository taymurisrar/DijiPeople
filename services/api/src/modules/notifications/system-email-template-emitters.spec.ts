import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EmailTemplateStatus } from '@prisma/client';
import { SYSTEM_EMAIL_TEMPLATES } from './notification-events.catalog';

/*
 * BUG-3500 / REG-506. The seam between an ACTIVE system template and the code
 * that sends it.
 *
 * `EmailTemplateRendererService` requires every declared variable (REG-386), so
 * a template that declares one its emitter does not pass stops the email
 * outright. That already happened once for scheduled reports. It was about to
 * happen for password reset: the system template declared `primaryColor` and
 * `logoUrl`, and both `auth.service.ts` call sites pass neither. It had only
 * worked because hidden per-tenant rows shadowed the system template.
 *
 * Each emitter is a large service with a dozen collaborators, so this reads the
 * `variables` object at each real call site rather than constructing it. The
 * extraction must find keys (a non-empty guard stops it passing over nothing),
 * and line endings are normalised so it behaves the same on a CRLF checkout.
 */

type Emitter = {
  file: string;
  anchor: string;
  occurrences: number;
  variablesFunction?: string;
};

const SRC = join(__dirname, '..', '..');

const EMITTERS: Record<string, Emitter[]> = {
  AUTH_ACCOUNT_ACTIVATION: [
    {
      file: 'modules/auth/user-invitations.service.ts',
      anchor: "eventCode: 'AUTH_ACCOUNT_ACTIVATION'",
      occurrences: 1,
    },
  ],
  AUTH_PASSWORD_RESET: [
    {
      file: 'modules/auth/auth.service.ts',
      anchor: "eventCode: 'AUTH_PASSWORD_RESET'",
      occurrences: 2,
    },
    {
      file: 'modules/employees/employee-profiles.service.ts',
      anchor: "eventCode: 'AUTH_PASSWORD_RESET'",
      occurrences: 1,
    },
  ],
  BILLING_INVOICE_ISSUED: [
    {
      file: 'modules/super-admin/super-admin.service.ts',
      anchor: "eventCode: 'BILLING_INVOICE_ISSUED'",
      occurrences: 1,
      variablesFunction: 'buildInvoiceEmailVariables',
    },
  ],
  PAYSLIP_AVAILABLE: [
    {
      file: 'modules/payslips/payslips.service.ts',
      anchor: "eventCode: 'PAYSLIP_AVAILABLE'",
      occurrences: 1,
    },
  ],
  REPORT_SCHEDULE_DELIVERY: [
    {
      file: 'modules/reporting/schedule/report-scheduler.worker.ts',
      anchor: 'eventCode: REPORT_SCHEDULE_DELIVERY_EVENT',
      occurrences: 1,
    },
  ],
  SUPPORT_CASE_UPDATE: [
    {
      file: 'modules/support-cases/support-cases.service.ts',
      anchor: "eventCode: 'SUPPORT_CASE_UPDATE'",
      occurrences: 1,
    },
  ],
};

function readSource(file: string) {
  return readFileSync(join(SRC, file), 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

function skipQuoted(source: string, index: number, quote: string) {
  for (let cursor = index + 1; cursor < source.length; cursor += 1) {
    if (source[cursor] === '\\') {
      cursor += 1;
      continue;
    }
    if (source[cursor] === quote) return cursor;
  }
  throw new Error('Unterminated string while reading emitter source.');
}

function skipTemplateLiteral(source: string, index: number): number {
  for (let cursor = index + 1; cursor < source.length; cursor += 1) {
    if (source[cursor] === '\\') {
      cursor += 1;
      continue;
    }
    if (source[cursor] === '`') return cursor;
    if (source[cursor] === '$' && source[cursor + 1] === '{') {
      cursor = findClosing(source, cursor + 1);
    }
  }
  throw new Error(
    'Unterminated template literal while reading emitter source.',
  );
}

function findClosing(source: string, open: number): number {
  let depth = 0;
  for (let cursor = open; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (character === "'" || character === '"') {
      cursor = skipQuoted(source, cursor, character);
    } else if (character === '`') {
      cursor = skipTemplateLiteral(source, cursor);
    } else if ('{(['.includes(character)) {
      depth += 1;
    } else if ('})]'.includes(character)) {
      depth -= 1;
      if (depth === 0) return cursor;
    }
  }
  throw new Error('Unbalanced brackets while reading emitter source.');
}

function topLevelKeys(body: string) {
  const segments: string[] = [];
  let depth = 0;
  let start = 0;
  for (let cursor = 0; cursor < body.length; cursor += 1) {
    const character = body[cursor];
    if (character === "'" || character === '"') {
      cursor = skipQuoted(body, cursor, character);
    } else if (character === '`') {
      cursor = skipTemplateLiteral(body, cursor);
    } else if ('{(['.includes(character)) {
      depth += 1;
    } else if ('})]'.includes(character)) {
      depth -= 1;
    } else if (character === ',' && depth === 0) {
      segments.push(body.slice(start, cursor));
      start = cursor + 1;
    }
  }
  segments.push(body.slice(start));

  return segments
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      if (segment.startsWith('...')) {
        throw new Error(
          `A spread in an emitter's variables cannot be checked: ${segment}`,
        );
      }
      const match = /^([A-Za-z_$][\w$]*)\s*(?::|$)/.exec(segment);
      if (!match) {
        throw new Error(
          `Unrecognised variables entry: ${segment.slice(0, 60)}`,
        );
      }
      return match[1];
    });
}

function objectKeysAt(source: string, open: number) {
  return topLevelKeys(source.slice(open + 1, findClosing(source, open)));
}

function suppliedVariables(emitter: Emitter) {
  const source = readSource(emitter.file);
  const results: string[][] = [];
  let from = 0;

  for (;;) {
    const anchor = source.indexOf(emitter.anchor, from);
    if (anchor < 0) break;
    from = anchor + emitter.anchor.length;

    const variables = source.indexOf('variables:', anchor);
    if (variables < 0 || variables - anchor > 1500) {
      throw new Error(
        `No variables object near ${emitter.anchor} in ${emitter.file}`,
      );
    }
    let cursor = variables + 'variables:'.length;
    while (/\s/.test(source[cursor])) cursor += 1;

    if (source[cursor] === '{') {
      results.push(objectKeysAt(source, cursor));
      continue;
    }

    if (!emitter.variablesFunction) {
      throw new Error(
        `Variables at ${emitter.file} are not an object literal.`,
      );
    }
    const fn = source.indexOf(`function ${emitter.variablesFunction}(`);
    const returned = source.indexOf('return {', fn);
    if (fn < 0 || returned < 0) {
      throw new Error(
        `Cannot find ${emitter.variablesFunction} in ${emitter.file}`,
      );
    }
    results.push(objectKeysAt(source, source.indexOf('{', returned)));
  }

  return results;
}

const ACTIVE_TEMPLATES = SYSTEM_EMAIL_TEMPLATES.filter(
  (seed) => seed.status === EmailTemplateStatus.ACTIVE,
);

describe('ACTIVE system email templates against their emitters', () => {
  it('names an emitter for every ACTIVE template', () => {
    expect(ACTIVE_TEMPLATES.length).toBeGreaterThan(0);
    for (const seed of ACTIVE_TEMPLATES) {
      expect(EMITTERS[seed.eventCode]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it.each(ACTIVE_TEMPLATES.map((seed) => [seed.eventCode, seed]))(
    '%s declares only variables every emitter passes',
    (_eventCode, seed) => {
      const declared = Object.keys(seed.availableVariables);

      for (const emitter of EMITTERS[seed.eventCode]) {
        const callSites = suppliedVariables(emitter);
        expect(callSites).toHaveLength(emitter.occurrences);

        for (const supplied of callSites) {
          expect(supplied.length).toBeGreaterThanOrEqual(3);
          const missing = declared.filter((name) => !supplied.includes(name));
          expect({ file: emitter.file, missing }).toEqual({
            file: emitter.file,
            missing: [],
          });
        }
      }
    },
  );
});
