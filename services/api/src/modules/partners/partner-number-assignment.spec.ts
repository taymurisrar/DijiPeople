import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PartnerType } from '@prisma/client';
import { CreatePartnerDto, UpdatePartnerDto } from './dto/partner.dto';

/*
 * ADR-0027 / EXECPLAN-0055 WP-03 — every Partner gets its number from the
 * platform sequence, on the transaction that creates it, and nothing else can
 * set or change it.
 *
 * Asserted against the source for the same reason
 * `partnership-model-conversion.spec.ts` is: the two partner-experience create
 * sites sit inside transactions that also touch inquiries, timelines and
 * agreements, and standing all of that up to observe one field would fail for
 * reasons unrelated to it. What matters is structural — each create site
 * allocates from the `partner` sequence on its own `tx` — and that is visible
 * in the source. Behaviour of the admin create path is executed in
 * partners-audit.spec.ts; allocation itself on a real database in
 * test/platform-numbering.e2e-spec.ts.
 */
function code(file: string) {
  return readFileSync(join(__dirname, file), 'utf8')
    .split(/\r?\n/)
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');
}

/** The text of each `<prefix>partner.create({ … })` call, brace-balanced. */
function createBlocks(source: string): string[] {
  const blocks: string[] = [];
  const pattern = /\b(?:tx|this\.prisma)\.partner\.create\(/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    let depth = 0;
    let end = match.index + match[0].length - 1;
    for (; end < source.length; end += 1) {
      if (source[end] === '(') depth += 1;
      if (source[end] === ')') depth -= 1;
      if (depth === 0) break;
    }
    blocks.push(source.slice(match.index, end + 1));
  }
  return blocks;
}

describe('partner number assignment', () => {
  const partners = code('partners.service.ts');
  const experience = code(
    '../partner-experience/partner-experience.service.ts',
  );

  it('finds every partner creation site (so the checks below cannot pass vacuously)', () => {
    expect(createBlocks(partners)).toHaveLength(1);
    expect(createBlocks(experience)).toHaveLength(2);
  });

  it('numbers every partner from the partner sequence on the create transaction', () => {
    for (const block of createBlocks(experience)) {
      expect(block).toMatch(/^tx\.partner\.create\(/);
      expect(block).toMatch(
        /partnerNumber:\s*await this\.numbering\.next\('partner', tx\)/,
      );
    }
    const [adminCreate] = createBlocks(partners);
    expect(adminCreate).toMatch(/^tx\.partner\.create\(/);
    expect(adminCreate).toMatch(/\bpartnerNumber,/);
    expect(partners).toMatch(
      /const partnerNumber = await this\.numbering\.next\('partner', tx\)/,
    );
  });

  it('never writes partnerNumber on an update', () => {
    const updateData = partners.slice(
      partners.indexOf('function partnerUpdateData('),
      partners.indexOf('function mergedPartnerIdentity('),
    );
    expect(updateData.length).toBeGreaterThan(0);
    expect(updateData).not.toMatch(/partnerNumber/);
  });

  it.each([
    ['create', CreatePartnerDto],
    ['update', UpdatePartnerDto],
  ] as const)('refuses partnerNumber in the %s body', async (_label, Dto) => {
    const instance = plainToInstance(Dto, {
      type: PartnerType.COMPANY,
      companyName: 'Acme Partners Ltd',
      displayName: 'Acme Partners',
      email: 'partner@example.com',
      defaultCommissionRate: 10,
      partnerNumber: 'PART-999999',
    });
    const failures = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(failures.map((failure) => failure.property)).toContain(
      'partnerNumber',
    );
  });
});
