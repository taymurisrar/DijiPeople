import { storedPersonName } from '../../common/utils/person-name';
import { decideOwnerName } from './owner-name-repair';

describe('BUG-4111 — owner names are what was entered, never a placeholder', () => {
  it('stores an empty surname as empty', () => {
    expect(
      storedPersonName({ firstName: 'Anou', lastName: '', email: 'a@x.test' }),
    ).toEqual({ firstName: 'Anou', lastName: '' });
    expect(
      storedPersonName({
        firstName: 'Anou',
        lastName: null,
        email: 'a@x.test',
      }),
    ).toEqual({ firstName: 'Anou', lastName: '' });
  });

  it('falls back to the email local part for a missing first name', () => {
    expect(
      storedPersonName({
        firstName: null,
        lastName: null,
        email: 'anou@x.test',
      }),
    ).toEqual({ firstName: 'anou', lastName: '' });
  });

  it('repairs "Owner" when every source had no surname', () => {
    expect(
      decideOwnerName(
        { firstName: 'Anou', lastName: 'Owner', email: 'a@x.test' },
        [
          { firstName: 'Anou', lastName: '' },
          { firstName: 'Anou', lastName: null },
        ],
      ).after,
    ).toEqual({ firstName: 'Anou', lastName: '' });
  });

  it('keeps a real surname Owner', () => {
    expect(
      decideOwnerName(
        { firstName: 'Ada', lastName: 'Owner', email: 'a@x.test' },
        [{ firstName: 'Ada', lastName: 'Owner' }],
      ).after,
    ).toBeNull();
  });

  it('keeps a name it cannot prove is a placeholder', () => {
    expect(
      decideOwnerName(
        { firstName: 'Ada', lastName: 'Owner', email: 'a@x.test' },
        [],
      ).after,
    ).toBeNull();
  });

  it('repairs "Workspace Owner" to the email local part', () => {
    expect(
      decideOwnerName(
        { firstName: 'Workspace', lastName: 'Owner', email: 'ops@acme.test' },
        [{ firstName: null, lastName: null }],
      ).after,
    ).toEqual({ firstName: 'ops', lastName: '' });
  });
});
