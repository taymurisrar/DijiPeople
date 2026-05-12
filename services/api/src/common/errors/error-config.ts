import { ConfigService } from '@nestjs/config';

export type ErrorFrameworkConfig = {
  enabled: boolean;
  storage: 'database' | 'file' | 'console' | 'none';
  retentionDays: number;
  includeStack: boolean;
  includeRequestBody: boolean;
  exposeStackToSystemCustomizer: boolean;
  downloadRole: string;
  traceHeader: string;
  supportMessage: string;
  verboseResponse: boolean;
};

export function getErrorFrameworkConfig(config: ConfigService): ErrorFrameworkConfig {
  return {
    enabled: readBoolean(config, 'ERROR_LOG_ENABLED', true),
    storage: readStorage(config.get<string>('ERROR_LOG_STORAGE') ?? 'database'),
    retentionDays: readPositiveNumber(config.get<string>('ERROR_LOG_RETENTION_DAYS'), 90),
    includeStack: readBoolean(config, 'ERROR_LOG_INCLUDE_STACK', true),
    includeRequestBody: readBoolean(config, 'ERROR_LOG_INCLUDE_REQUEST_BODY', false),
    exposeStackToSystemCustomizer: readBoolean(config, 'ERROR_LOG_EXPOSE_STACK_TO_SYSTEM_CUSTOMIZER', true),
    downloadRole: config.get<string>('ERROR_LOG_DOWNLOAD_ROLE')?.trim() || 'System Customizer',
    traceHeader: (config.get<string>('ERROR_TRACE_HEADER')?.trim() || 'x-trace-id').toLowerCase(),
    supportMessage:
      config.get<string>('ERROR_SUPPORT_MESSAGE')?.trim() ||
      'Share this reference ID with support if the issue continues.',
    verboseResponse: readBoolean(config, 'ERROR_VERBOSE_RESPONSE', false),
  };
}

function readBoolean(config: ConfigService, key: string, fallback: boolean) {
  const value = config.get<string>(key);
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function readPositiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readStorage(value: string): ErrorFrameworkConfig['storage'] {
  const normalized = value.toLowerCase();
  return normalized === 'file' || normalized === 'console' || normalized === 'none'
    ? normalized
    : 'database';
}
