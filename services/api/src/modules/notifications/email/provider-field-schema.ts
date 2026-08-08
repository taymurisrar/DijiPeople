import { EmailProviderType } from '@prisma/client';

/*
 * What each provider type needs configured, described once on the server.
 *
 * The settings screen used to present a free-text "Configuration JSON" box, so
 * a user had to already know that SMTP wants `host`/`port`/`username`/`password`
 * and SendGrid wants `apiKey`. Getting it wrong produced a validation error
 * from the API with no indication of the right shape.
 *
 * This is the same list `validateProviderConfiguration` enforces. Keep the two
 * in step: a field required here and not there is merely annoying, but a field
 * required there and missing here is a form a user cannot submit.
 */

export type ProviderFieldType = 'text' | 'number' | 'password' | 'boolean';

export type ProviderField = {
  key: string;
  label: string;
  type: ProviderFieldType;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  /* Secrets are write-only: stored encrypted and returned masked. */
  secret?: boolean;
  defaultValue?: string | number | boolean;
};

export type ProviderSchema = {
  providerType: EmailProviderType;
  label: string;
  description: string;
  fields: ProviderField[];
};

const SMTP_FIELDS: ProviderField[] = [
  {
    key: 'host',
    label: 'Host',
    type: 'text',
    required: true,
    placeholder: 'smtp.example.com',
  },
  {
    key: 'port',
    label: 'Port',
    type: 'number',
    required: true,
    defaultValue: 587,
    helpText:
      'Commonly 587 for STARTTLS, 465 for implicit TLS, 2525 for relays.',
  },
  {
    key: 'username',
    label: 'Username',
    type: 'text',
    required: true,
  },
  {
    key: 'password',
    label: 'Password',
    type: 'password',
    required: true,
    secret: true,
  },
  {
    key: 'secure',
    label: 'Use implicit TLS',
    type: 'boolean',
    required: false,
    helpText:
      'Leave off unless the port is 465. Other ports negotiate STARTTLS automatically.',
  },
];

function apiKeyProvider(
  providerType: EmailProviderType,
  label: string,
  description: string,
  extra: ProviderField[] = [],
): ProviderSchema {
  return {
    providerType,
    label,
    description,
    fields: [
      {
        key: 'apiKey',
        label: 'API key',
        type: 'password',
        required: true,
        secret: true,
      },
      ...extra,
    ],
  };
}

export const PROVIDER_SCHEMAS: ProviderSchema[] = [
  {
    providerType: EmailProviderType.CONSOLE,
    label: 'Console',
    description:
      'Writes the rendered email to the server log instead of sending it. Useful for local work.',
    fields: [],
  },
  {
    providerType: EmailProviderType.DEV,
    label: 'Development',
    description: 'Records the email without delivering it.',
    fields: [],
  },
  {
    providerType: EmailProviderType.SMTP,
    label: 'SMTP',
    description: 'Sends through any SMTP relay, including Mailtrap and Gmail.',
    fields: SMTP_FIELDS,
  },
  apiKeyProvider(
    EmailProviderType.SES,
    'Amazon SES',
    'Sends through Amazon Simple Email Service.',
    [
      {
        key: 'region',
        label: 'Region',
        type: 'text',
        required: true,
        placeholder: 'us-east-1',
      },
      {
        key: 'accessKeyId',
        label: 'Access key id',
        type: 'text',
        required: true,
      },
    ],
  ),
  apiKeyProvider(
    EmailProviderType.SENDGRID,
    'SendGrid',
    'Sends through the SendGrid API.',
  ),
  apiKeyProvider(
    EmailProviderType.MAILGUN,
    'Mailgun',
    'Sends through the Mailgun API.',
    [
      {
        key: 'domain',
        label: 'Sending domain',
        type: 'text',
        required: true,
        placeholder: 'mail.example.com',
      },
    ],
  ),
  apiKeyProvider(
    EmailProviderType.POSTMARK,
    'Postmark',
    'Sends through the Postmark API.',
  ),
  {
    providerType: EmailProviderType.CUSTOM,
    label: 'Custom',
    description:
      'An in-house transport. At least one secret value is required so the credential is stored encrypted.',
    fields: [
      {
        key: 'endpoint',
        label: 'Endpoint',
        type: 'text',
        required: true,
        placeholder: 'https://mail.internal.example.com/send',
      },
      {
        key: 'apiKey',
        label: 'API key',
        type: 'password',
        required: true,
        secret: true,
      },
    ],
  },
];

export function providerSchemaFor(providerType: EmailProviderType) {
  return (
    PROVIDER_SCHEMAS.find((schema) => schema.providerType === providerType) ??
    null
  );
}
