import { findUnfilledPlaceholders } from './legal.service';

/**
 * The guard that makes placeholders safer than omission.
 *
 * The seeded legal documents mark the contracting party as `{{BLANKS}}` rather
 * than omitting it, so publishing later is filling in five values instead of
 * drafting a clause from nothing. That is only an improvement if the markers
 * cannot escape into a published document — a live Terms of Service reading
 * `{{LEGAL_ENTITY_NAME}}` is worse than one that names nobody at all.
 *
 * So this and `LegalService.publish`'s refusal are one change. Testing the
 * detector alone is enough here because the refusal is a single `if` over its
 * result; what is worth pinning is *what counts as a placeholder*.
 */
describe('findUnfilledPlaceholders', () => {
  it('finds the entity blanks the seeded documents carry', () => {
    const content = `## The operator

This service is provided by **{{LEGAL_ENTITY_NAME}}**, registered in
{{JURISDICTION}} under number {{COMPANY_REGISTRATION_NUMBER}}.`;

    expect(findUnfilledPlaceholders(content)).toEqual([
      '{{LEGAL_ENTITY_NAME}}',
      '{{JURISDICTION}}',
      '{{COMPANY_REGISTRATION_NUMBER}}',
    ]);
  });

  it('reports each blank once, however often it appears', () => {
    // `{{JURISDICTION}}` legitimately appears twice in the Terms draft — once
    // in the operator clause and once in the governing-law sentence. Listing it
    // twice would make the error message read as two separate problems.
    const content = 'in {{JURISDICTION}} … governed by {{JURISDICTION}}';
    expect(findUnfilledPlaceholders(content)).toEqual(['{{JURISDICTION}}']);
  });

  it('says nothing about a document with every blank filled', () => {
    const content = `This service is provided by **Maseer Technologies W.L.L.**,
registered in Qatar under number 123456.`;
    expect(findUnfilledPlaceholders(content)).toEqual([]);
  });

  it('ignores braces that are not placeholders', () => {
    /*
     * Deliberately narrow: uppercase, digits and underscores only. A loose
     * pattern would catch Handlebars, Liquid, or whatever a lawyer's export
     * format emits — and refusing to publish a finished document because its
     * converter left `{{ }}` behind would be a worse failure than the one this
     * prevents.
     */
    const content = '{{ spaced }} {{lowercase}} {{Mixed_Case}} { single } {{}}';
    expect(findUnfilledPlaceholders(content)).toEqual([]);
  });

  it('finds nothing in an empty document', () => {
    expect(findUnfilledPlaceholders('')).toEqual([]);
  });
});
