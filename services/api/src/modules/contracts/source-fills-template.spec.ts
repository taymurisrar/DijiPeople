import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BadRequestException } from '@nestjs/common';
import {
  assessSourceTemplateFill,
  ContractsService,
} from './contracts.service';

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

  it('the eligibility preview and the guard share one rule', () => {
    // A preview with its own copy of the rule is a preview that can promise
    // a template the guard then refuses.
    const guard = source.slice(
      source.indexOf('private async assertSourceCanFillTemplate('),
      source.indexOf('async templateEligibility('),
    );
    const preview = source.slice(
      source.indexOf('async templateEligibility('),
      source.indexOf('private async recordCustomerSigner('),
    );

    expect(guard).toContain('assessSourceTemplateFill(');
    expect(preview).toContain('assessSourceTemplateFill(');
  });
});

/*
 * WS05. A customer agreement template names the customer's signatory, and the
 * catalog declares all three signer fields required. A customer with no
 * signer on file is a gap the operator can close inline (owner decision D3);
 * a customer asked for `tenant.*` is a pairing nothing on the record fixes.
 */
const SIGNER_TEMPLATE =
  '<p>{{customer.legalName}}</p><p>{{customer.primarySigner.name}}, ' +
  '{{customer.primarySigner.title}} ({{customer.primarySigner.email}})</p>';

const CUSTOMER_WITHOUT_SIGNER = {
  counterpartyType: 'CUSTOMER',
  customerAccountId: 'customer-1',
  placeholderValues: {
    'customer.companyName': 'QA E2E Customer',
    'customer.legalName': 'QA E2E Customer',
  },
} as unknown as Source;

const CUSTOMER_WITH_SIGNER = {
  ...CUSTOMER_WITHOUT_SIGNER,
  placeholderValues: {
    ...CUSTOMER_WITHOUT_SIGNER.placeholderValues,
    'customer.primarySigner.name': 'Amal Hassan',
    'customer.primarySigner.title': 'Chief Operating Officer',
    'customer.primarySigner.email': 'amal@example.test',
  },
} as unknown as Source;

describe('assessSourceTemplateFill', () => {
  it('reports a customer without a signer as collectable missing data', () => {
    const result = assessSourceTemplateFill(
      SIGNER_TEMPLATE,
      CUSTOMER_WITHOUT_SIGNER,
    );

    expect(result.unsupportedFields).toEqual([]);
    expect(result.missingFields).toEqual([
      expect.objectContaining({
        key: 'customer.primarySigner.name',
        collectable: true,
      }),
      expect.objectContaining({
        key: 'customer.primarySigner.title',
        collectable: true,
      }),
      expect.objectContaining({
        key: 'customer.primarySigner.email',
        collectable: true,
      }),
    ]);
  });

  it('finds nothing missing once the customer has a signer', () => {
    expect(
      assessSourceTemplateFill(SIGNER_TEMPLATE, CUSTOMER_WITH_SIGNER)
        .unfillable,
    ).toEqual([]);
  });

  it('keeps a template the source can never fill unsupported, not collectable', () => {
    const result = assessSourceTemplateFill(
      PROVISIONING_TEMPLATE,
      CUSTOMER_WITH_SIGNER,
    );

    expect(result.unsupportedFields).toEqual(['tenant.name']);
    expect(result.missingFields).toEqual([]);
  });

  it('does not offer to collect a signer where there is no customer account to hold it', () => {
    const tenantWithoutCustomer = {
      counterpartyType: 'TENANT',
      customerAccountId: undefined,
      placeholderValues: { 'customer.legalName': 'Workspace' },
    } as unknown as Source;

    const result = assessSourceTemplateFill(
      SIGNER_TEMPLATE,
      tenantWithoutCustomer,
    );

    expect(result.missingFields).toHaveLength(3);
    expect(result.missingFields.every((field) => !field.collectable)).toBe(
      true,
    );
  });
});

type RefusalError = {
  response: {
    code: string;
    message: string;
    details: {
      unsupportedFields: string[];
      fieldErrors: Array<{ field: string; message: string }>;
    };
  };
};

describe('the refusal tells a missing signer apart from a wrong source', () => {
  it('asks for the signer, naming each field', async () => {
    const assert = buildService(SIGNER_TEMPLATE);

    const error = (await assert('template-1', CUSTOMER_WITHOUT_SIGNER).catch(
      (reason: unknown) => reason,
    )) as RefusalError;

    expect(error.response.code).toBe('CONTRACT_SOURCE_CANNOT_FILL_TEMPLATE');
    expect(error.response.message).toMatch(/no authorized signer/i);
    expect(error.response.details.unsupportedFields).toEqual([]);
    expect(
      error.response.details.fieldErrors.map((item) => item.field),
    ).toEqual([
      'customer.primarySigner.name',
      'customer.primarySigner.title',
      'customer.primarySigner.email',
    ]);
  });

  it('keeps the wrong-source message for an unsupported namespace', async () => {
    const assert = buildService(PROVISIONING_TEMPLATE);

    const error = (await assert('template-1', CUSTOMER_SOURCE).catch(
      (reason: unknown) => reason,
    )) as RefusalError;

    expect(error.response.message).toMatch(/does not carry \(tenant\)/);
    expect(error.response.details.unsupportedFields).toEqual(['tenant.name']);
  });
});

describe('GET /contracts/template-eligibility', () => {
  const platformAdmin = {
    userId: 'user-1',
    tenantId: 'platform',
    permissionKeys: ['contracts.manage', 'contracts.read'],
    roleKeys: [],
    platform: { id: 'user-1', role: 'SUPER_ADMIN', status: 'ACTIVE' },
  } as never;

  function eligibilityService(source: Source) {
    const service = Object.create(
      ContractsService.prototype,
    ) as ContractsService;
    Object.assign(service, {
      resolveSource: jest.fn(() => Promise.resolve(source)),
      prisma: {
        contractTemplate: {
          findMany: jest.fn(() =>
            Promise.resolve([
              {
                id: 'signer-template',
                name: 'Customer Agreement',
                contractType: 'CUSTOMER_AGREEMENT',
                versions: [{ contentHtml: SIGNER_TEMPLATE }],
              },
              {
                id: 'provisioning-template',
                name: 'Tenant Provisioning',
                contractType: 'SERVICE_AGREEMENT',
                versions: [{ contentHtml: PROVISIONING_TEMPLATE }],
              },
              {
                id: 'draft-template',
                name: 'Unpublished',
                contractType: 'NDA',
                versions: [],
              },
            ]),
          ),
        },
      },
    });
    return service;
  }

  it('marks the signer template collectable and the provisioning one ineligible', async () => {
    const result = await eligibilityService(
      CUSTOMER_WITHOUT_SIGNER,
    ).templateEligibility(platformAdmin, 'customer', 'customer-1');

    expect(result.canCollectSigner).toBe(true);
    // A template with no published version is not offered at all.
    expect(result.items).toEqual([
      expect.objectContaining({
        templateId: 'signer-template',
        eligible: false,
        status: 'NEEDS_SIGNER',
      }),
      expect.objectContaining({
        templateId: 'provisioning-template',
        eligible: false,
        status: 'INELIGIBLE',
        unsupportedFields: ['tenant.name'],
      }),
    ]);
  });

  it('marks the signer template eligible once the customer has a signer', async () => {
    const result = await eligibilityService(
      CUSTOMER_WITH_SIGNER,
    ).templateEligibility(platformAdmin, 'customer', 'customer-1');

    expect(result.items[0]).toMatchObject({
      templateId: 'signer-template',
      eligible: true,
      status: 'ELIGIBLE',
      missingFields: [],
    });
    expect(result.signer.name).toBe('Amal Hassan');
  });

  it('refuses a caller without contract management access', async () => {
    const reader = {
      userId: 'user-2',
      tenantId: 'platform',
      permissionKeys: ['contracts.read'],
      roleKeys: [],
      // Reads contracts, does not manage them.
      platform: {
        id: 'user-2',
        role: 'PLATFORM_OPERATIONS',
        status: 'ACTIVE',
      },
    } as never;

    await expect(
      eligibilityService(CUSTOMER_WITH_SIGNER).templateEligibility(
        reader,
        'customer',
        'customer-1',
      ),
    ).rejects.toThrow(/management access/i);
  });
});
