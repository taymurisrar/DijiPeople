import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { ContractsService } from './contracts.service';

/*
 * BUG-1541. A "Tenant Provisioning & Service Order" was created from a
 * **customer**. `customerSource()` emits the `customer.*` namespace and nothing
 * else — it sets `tenantId: undefined` explicitly — so of the template's 39
 * placeholders, 8 resolved and 31 did not: every `tenant.*`, every
 * `implementation.*`, every `hosting.*`, both `commercial.*`.
 *
 * The generated agreement rendered raw handlebars where a counterparty would
 * read their own workspace address. Read from production on 2026-08-27 through
 * `GET /api/contracts/{id}/document-fields`, every unresolved placeholder came
 * back with `source: null` — nothing on that path had ever been going to fill
 * them.
 *
 * The renderer was not at fault: it keeps an unresolved token deliberately, so
 * the signature gate can refuse an incomplete document. What was missing is
 * anyone refusing the *pairing*, which is knowable before a byte is generated.
 */

type Source = Parameters<ContractsService['assertSourceCanFillTemplate']>[1];

function buildService(contentHtml: string | null) {
  const service = Object.create(ContractsService.prototype) as ContractsService;

  Object.assign(service, {
    prisma: {
      contractTemplateVersion: {
        findFirst: () =>
          Promise.resolve(contentHtml === null ? null : { contentHtml }),
      },
    },
  });

  return (templateId: string | undefined, source: Source) =>
    (
      service as unknown as {
        assertSourceCanFillTemplate(
          id: string | undefined,
          src: Source,
        ): Promise<void>;
      }
    ).assertSourceCanFillTemplate(templateId, source);
}

/* What a customer source actually produces — `customer.*` and nothing more. */
const CUSTOMER_SOURCE = {
  counterpartyType: 'CUSTOMER',
  placeholderValues: {
    'customer.companyName': 'QA E2E Customer',
    'customer.legalName': 'QA E2E Customer',
  },
} as unknown as Source;

const TENANT_SOURCE = {
  counterpartyType: 'TENANT',
  placeholderValues: {
    'customer.companyName': 'QA E2E Customer',
    'customer.legalName': 'QA E2E Customer',
    'tenant.name': 'QA E2E Signup B',
  },
} as unknown as Source;

/* `tenant.name` is declared required in CONTRACT_PLACEHOLDER_REGISTRY. */
const PROVISIONING_TEMPLATE =
  '<h1>{{contract.title}}</h1><p>{{tenant.name}}</p>';
const CUSTOMER_TEMPLATE =
  '<h1>{{contract.title}}</h1><p>{{customer.legalName}}</p>';

describe('a source that cannot fill a template is refused at creation', () => {
  it('refuses a provisioning template created from a customer', async () => {
    const assert = buildService(PROVISIONING_TEMPLATE);

    await expect(assert('template-1', CUSTOMER_SOURCE)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('names the namespaces that cannot be filled', async () => {
    // The operator has to know which source would work. "Invalid" would not
    // tell them, and the previous behaviour told them nothing at all.
    const assert = buildService(PROVISIONING_TEMPLATE);

    await expect(assert('template-1', CUSTOMER_SOURCE)).rejects.toMatchObject({
      response: {
        code: 'CONTRACT_SOURCE_CANNOT_FILL_TEMPLATE',
        details: { namespaces: ['tenant'] },
      },
    });
  });

  it('allows the same template from a source that carries the fields', async () => {
    const assert = buildService(PROVISIONING_TEMPLATE);

    await expect(assert('template-1', TENANT_SOURCE)).resolves.toBeUndefined();
  });

  it('allows a template whose required fields the customer does carry', async () => {
    const assert = buildService(CUSTOMER_TEMPLATE);

    await expect(
      assert('template-1', CUSTOMER_SOURCE),
    ).resolves.toBeUndefined();
  });

  it('does nothing when no template was chosen', async () => {
    // A contract drafted without a template has no pairing to check.
    const assert = buildService(null);

    await expect(assert(undefined, CUSTOMER_SOURCE)).resolves.toBeUndefined();
  });

  it('leaves an unpublished template to the error that already covers it', async () => {
    // `create` refuses this with its own message; saying it twice differently
    // is worse than saying it once.
    const assert = buildService(null);

    await expect(
      assert('template-1', CUSTOMER_SOURCE),
    ).resolves.toBeUndefined();
  });
});

/*
 * The suite above proves the rule; this proves it is reached.
 *
 * Removing the call from `createFromSource` while keeping the helper passed
 * every test in this file, which made the guard decorative. Driving the whole
 * of `createFromSource` would need the source resolver, the eligibility check
 * and `create` all stubbed to assert one line, so the call site is asserted
 * directly instead — the same trade as the proxy-header guard in apps/web.
 */
describe('the rule is actually reached', () => {
  const source = readFileSync(
    path.join(__dirname, 'contracts.service.ts'),
    'utf8',
  );

  it('createFromSource calls assertSourceCanFillTemplate', () => {
    const body = source.slice(
      source.indexOf('async createFromSource('),
      source.indexOf('private async assertSourceCanFillTemplate('),
    );

    expect(body).toContain('assertSourceCanFillTemplate(');
  });
});
