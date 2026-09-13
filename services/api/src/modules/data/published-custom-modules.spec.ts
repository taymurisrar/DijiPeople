import { readPublishedCustomizationIndex } from './published-custom-modules';

/*
 * BUG-3494 / ADR-0016. Both snapshot shapes that production publish paths
 * write must be read, and anything unreadable must fail closed — an index that
 * guessed would make draft modules reachable.
 */
describe('readPublishedCustomizationIndex', () => {
  it('reads the Publish Center (package) shape from effectiveMetadata', () => {
    const index = readPublishedCustomizationIndex({
      modules: [{ id: 'stale-root-copy' }],
      publishedComponentIds: ['c1'],
      effectiveMetadata: {
        modules: [{ id: 'table-qa', tableKey: 'qaAsset' }],
        fields: [{ id: 'col-serial', tableId: 'table-qa' }],
        forms: [
          {
            id: 'form-main',
            tableId: 'table-qa',
            formKey: 'main',
            name: 'Main',
            type: 'main',
            isDefault: true,
            isActive: true,
            layoutJson: { tabs: [] },
          },
        ],
        views: [
          {
            id: 'view-all',
            tableId: 'table-qa',
            viewKey: 'qaAllAssets',
            name: 'QA All Assets',
            columnsJson: [{ columnKey: 'dd_serialNumber' }],
          },
        ],
      },
    });

    expect(index).not.toBeNull();
    expect([...index!.tableIds]).toEqual(['table-qa']);
    expect([...index!.columnIds]).toEqual(['col-serial']);
    expect(index!.forms.map((form) => form.formKey)).toEqual(['main']);
    expect(index!.views.map((view) => view.viewKey)).toEqual(['qaAllAssets']);
  });

  it('reads the legacy publish() shape (tables / columns)', () => {
    const index = readPublishedCustomizationIndex({
      tables: [{ id: 'table-1' }],
      columns: [{ id: 'col-1' }],
      forms: [],
      views: [],
    });
    expect([...index!.tableIds]).toEqual(['table-1']);
    expect([...index!.columnIds]).toEqual(['col-1']);
  });

  it('drops inactive forms and hidden views', () => {
    const index = readPublishedCustomizationIndex({
      tables: [{ id: 't' }],
      forms: [
        { id: 'f1', tableId: 't', formKey: 'main', isActive: false },
        { id: 'f2', tableId: 't', formKey: 'quick' },
      ],
      views: [
        { id: 'v1', tableId: 't', viewKey: 'hidden', isHidden: true },
        { id: 'v2', tableId: 't', viewKey: 'shown' },
      ],
    });
    expect(index!.forms.map((form) => form.id)).toEqual(['f2']);
    expect(index!.views.map((view) => view.id)).toEqual(['v2']);
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'published'],
    ['a snapshot without any table list', { forms: [], views: [] }],
  ])('fails closed for %s', (_label, value) => {
    expect(readPublishedCustomizationIndex(value)).toBeNull();
  });
});
