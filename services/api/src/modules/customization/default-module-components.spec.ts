import { DEFAULT_MODULE_ACTION_COMMANDS } from './customization.service';

/*
 * A custom module used to be created with only its table component — no form,
 * no view, no action bar — while every system module got all three. These pin
 * the shared command set so the two paths cannot drift apart again silently.
 */

describe('DEFAULT_MODULE_ACTION_COMMANDS', () => {
  it('covers the record lifecycle a module needs to be usable', () => {
    expect(DEFAULT_MODULE_ACTION_COMMANDS).toEqual(
      expect.arrayContaining([
        'system.new',
        'system.edit',
        'system.delete',
        'system.refresh',
        'system.save',
      ]),
    );
  });

  it('includes the data transfer commands the import and export flows rely on', () => {
    expect(DEFAULT_MODULE_ACTION_COMMANDS).toEqual(
      expect.arrayContaining([
        'system.import',
        'system.export',
        'system.exportTemplate',
      ]),
    );
  });

  it('has no duplicates, which would render the same button twice', () => {
    const unique = new Set(DEFAULT_MODULE_ACTION_COMMANDS);
    expect(unique.size).toBe(DEFAULT_MODULE_ACTION_COMMANDS.length);
  });

  it('uses namespaced command keys the runtime can resolve', () => {
    for (const command of DEFAULT_MODULE_ACTION_COMMANDS) {
      expect(command).toMatch(/^(system|record)\.[a-zA-Z]+$/);
    }
  });
});
