import {
  PLATFORM_CONTRACT_TEMPLATES,
  planSystemContractTemplateWrite,
  seedPlatformContractTemplates,
} from '../../../prisma/seed-config';

/*
 * ADR-0023 (ITEM-0207). `seed:config` used to rewrite version 1 of each system
 * agreement template in place on every deploy, so a template's history no
 * longer showed what earlier agreements had been drafted from. A seeded change
 * is now published as a new version; existing versions are never rewritten,
 * and an operator's own version is never superseded by a deploy.
 */
const seeded = { title: 'Partner Agreement', contentHtml: '<p>v2 text</p>' };

describe('planSystemContractTemplateWrite', () => {
  it('creates version 1 when the template has none', () => {
    expect(planSystemContractTemplateWrite(null, seeded)).toEqual({
      action: 'create-first',
      version: 1,
    });
  });

  it('writes nothing when the latest version already carries the seeded text', () => {
    expect(
      planSystemContractTemplateWrite(
        { version: 3, createdById: null, ...seeded },
        seeded,
      ),
    ).toEqual({ action: 'none' });
  });

  it('publishes the next version when the seeded text changed', () => {
    expect(
      planSystemContractTemplateWrite(
        {
          version: 1,
          createdById: null,
          title: seeded.title,
          contentHtml: '<p>v1 text</p>',
        },
        seeded,
      ),
    ).toEqual({ action: 'publish-next', version: 2 });
  });

  it("keeps an operator's own version rather than superseding it", () => {
    expect(
      planSystemContractTemplateWrite(
        {
          version: 2,
          createdById: 'platform-user-1',
          title: 'Our edited agreement',
          contentHtml: '<p>operator text</p>',
        },
        seeded,
      ),
    ).toEqual({ action: 'keep-operator-version' });
  });
});

describe('seedPlatformContractTemplates', () => {
  function fakeClient(
    latestFor: (key: string) => {
      version: number;
      title: string;
      contentHtml: string;
      createdById: string | null;
    } | null,
  ) {
    const created: Array<{ key: string; version: number }> = [];
    const unpublished: string[] = [];
    let currentKey = '';
    const client = {
      contractTemplate: {
        upsert: jest.fn(
          async (args: { where: { key_contractType: { key: string } } }) => {
            currentKey = args.where.key_contractType.key;
            return { id: `template-${currentKey}` };
          },
        ),
      },
      contractTemplateVersion: {
        findFirst: jest.fn(async () => latestFor(currentKey)),
        updateMany: jest.fn((args: { where: { templateId: string } }) => {
          unpublished.push(args.where.templateId);
          return Promise.resolve({ count: 1 });
        }),
        create: jest.fn(
          (args: { data: { templateId: string; version: number } }) => {
            created.push({
              key: args.data.templateId.replace('template-', ''),
              version: args.data.version,
            });
            return Promise.resolve({});
          },
        ),
        upsert: jest.fn(),
      },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
      ),
    };
    return { client, created, unpublished };
  }

  it('never rewrites an existing version, and publishes a changed one as the next version', async () => {
    const [changed, ...rest] = PLATFORM_CONTRACT_TEMPLATES;
    const { client, created, unpublished } = fakeClient((key) =>
      key === changed.key
        ? {
            version: 1,
            createdById: null,
            title: changed.title,
            contentHtml: '<p>older system text</p>',
          }
        : {
            version: 1,
            createdById: null,
            title: rest.find((item) => item.key === key)!.title,
            contentHtml: rest.find((item) => item.key === key)!.contentHtml,
          },
    );

    await seedPlatformContractTemplates(client as never);

    expect(client.contractTemplateVersion.upsert).not.toHaveBeenCalled();
    expect(created).toEqual([{ key: changed.key, version: 2 }]);
    expect(unpublished).toEqual([`template-${changed.key}`]);
  });
});
