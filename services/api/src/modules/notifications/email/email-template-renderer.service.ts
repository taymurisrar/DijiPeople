import { BadRequestException, Injectable } from '@nestjs/common';
import { EmailTemplate } from '@prisma/client';
import {
  assertSafeHtmlTemplate,
  escapeHtmlValue,
  sanitizeHtmlTemplate,
} from './email-safety';

const PLACEHOLDER_PATTERN = /{{\s*([a-zA-Z0-9_.-]+)\s*}}/g;

export type EmailTemplateRenderInput = {
  template: Pick<
    EmailTemplate,
    | 'subjectTemplate'
    | 'htmlTemplate'
    | 'textTemplate'
    | 'availableVariables'
  >;
  variables: Record<string, unknown>;
};

export type EmailTemplateRenderResult = {
  renderedSubject: string;
  renderedHtml: string;
  renderedText: string | null;
  missingVariables: string[];
  usedVariables: string[];
};

@Injectable()
export class EmailTemplateRendererService {
  render(input: EmailTemplateRenderInput): EmailTemplateRenderResult {
    assertSafeHtmlTemplate(input.template.htmlTemplate);

    const availableVariables = extractAvailableVariables(
      input.template.availableVariables,
    );
    const usedVariables = collectUsedVariables([
      input.template.subjectTemplate,
      input.template.htmlTemplate,
      input.template.textTemplate ?? '',
    ]);
    const requiredVariables = availableVariables.length
      ? availableVariables
      : usedVariables;
    const missingVariables = requiredVariables.filter(
      (variable) => resolveVariable(input.variables, variable) === undefined,
    );

    if (missingVariables.length > 0) {
      throw new BadRequestException({
        code: 'EMAIL_TEMPLATE_VARIABLES_MISSING',
        message: `Missing email template variables: ${missingVariables.join(', ')}.`,
        missingVariables,
        usedVariables,
      });
    }

    return {
      renderedSubject: renderTemplateString(
        input.template.subjectTemplate,
        input.variables,
        'text',
      ),
      renderedHtml: sanitizeHtmlTemplate(
        renderTemplateString(input.template.htmlTemplate, input.variables, 'html'),
      ),
      renderedText: input.template.textTemplate
        ? renderTemplateString(input.template.textTemplate, input.variables, 'text')
        : null,
      missingVariables,
      usedVariables,
    };
  }
}

function renderTemplateString(
  template: string,
  variables: Record<string, unknown>,
  mode: 'html' | 'text',
) {
  return template.replace(PLACEHOLDER_PATTERN, (_match, variablePath) => {
    const value = resolveVariable(variables, variablePath);
    if (value === undefined || value === null) {
      return '';
    }

    return mode === 'html' ? escapeHtmlValue(value) : String(value);
  });
}

function collectUsedVariables(templates: string[]) {
  const used = new Set<string>();

  for (const template of templates) {
    for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
      if (match[1]) {
        used.add(match[1]);
      }
    }
  }

  return Array.from(used).sort();
}

function extractAvailableVariables(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean).sort();
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.keys(value as Record<string, unknown>).filter(Boolean).sort();
}

function resolveVariable(source: Record<string, unknown>, path: string) {
  return path.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }
    return (current as Record<string, unknown>)[key];
  }, source);
}
