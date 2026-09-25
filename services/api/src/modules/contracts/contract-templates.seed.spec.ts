import { ContractType } from '@prisma/client';
import { PLATFORM_CONTRACT_TEMPLATES } from '../../../prisma/seed-config';
import {
  CONTRACT_PLACEHOLDER_REGISTRY,
  extractContractPlaceholders,
} from './contracts.service';
import { outOfContextPlaceholders } from './placeholder-context';

/**
 * QA agreements DEFECT-3 (TASK-0032 WP-11). The seeded Individual Partner
 * Agreement — and six other system templates — had no signature block, so a
 * fully executed agreement's visible body carried no signature at all.
 *
 * Every system template is also run through the ADR-0020 context validator
 * that `createTemplate` applies to operator-authored templates. The seed
 * bypasses the service, so without this a future seed template referencing a
 * placeholder its type cannot resolve would only be found by a failed send.
 */
describe('seeded platform contract templates', () => {
  const registered = new Set(CONTRACT_PLACEHOLDER_REGISTRY.map((d) => d.key));

  it.each(PLATFORM_CONTRACT_TEMPLATES.map((t) => [t.key, t] as const))(
    '%s has a platform and counterparty signature block',
    (_key, template) => {
      for (const token of [
        '{{signature.platform.name}}',
        '{{signature.platform.date}}',
        '{{signature.counterparty.name}}',
        '{{signature.counterparty.date}}',
      ])
        expect(template.contentHtml).toContain(token);
    },
  );

  it.each(PLATFORM_CONTRACT_TEMPLATES.map((t) => [t.key, t] as const))(
    '%s references only registered placeholders valid for its type',
    (_key, template) => {
      const definitions = extractContractPlaceholders(template.contentHtml);
      expect(
        definitions.map((d) => d.key).filter((key) => !registered.has(key)),
      ).toEqual([]);
      expect(
        outOfContextPlaceholders(
          definitions,
          template.contractType as ContractType,
        ).map((d) => d.key),
      ).toEqual([]);
    },
  );
});
