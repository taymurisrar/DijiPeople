import { Logger, LogLevel, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getPlatformDomainConfig, validateDeploymentEnv } from '@repo/config';
import cookieParser from 'cookie-parser';
import {
  type Express,
  json,
  raw,
  urlencoded,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { assertAuthEnvironment } from './common/config/auth.config';
import { ConfigService } from '@nestjs/config';
import {
  buildCorsOptions,
  getRuntimeHealthPayload,
  validateApiEnvironment,
} from './config/env.validation';

/*
 * Nest's default level logs every mapped route at boot, which buries real
 * warnings under several hundred lines. Development keeps them for orientation;
 * production keeps only what someone would act on.
 *
 * LOG_LEVEL names the *lowest* severity to show, the way it usually reads
 * elsewhere: LOG_LEVEL=debug means "debug and everything more serious", not
 * "debug only". Nest wants the explicit list, so the ladder is expanded here.
 *
 * Errors are always included, since the ladder starts there and every setting
 * keeps its head. Setting LOG_LEVEL=error does drop warnings, which is what
 * asking for errors only should do; an unset or unrecognised value falls back
 * to the environment default rather than silencing anything.
 */
const LOG_LEVEL_LADDER: LogLevel[] = [
  'error',
  'warn',
  'log',
  'debug',
  'verbose',
];

function resolveLogLevels(): LogLevel[] {
  const configured = process.env.LOG_LEVEL?.trim().toLowerCase();
  const threshold = LOG_LEVEL_LADDER.indexOf(configured as LogLevel);

  if (configured && threshold !== -1) {
    return LOG_LEVEL_LADDER.slice(0, threshold + 1);
  }

  return process.env.NODE_ENV === 'production'
    ? ['error', 'warn']
    : ['error', 'warn', 'log'];
}

async function bootstrap() {
  validateDeploymentEnv(process.env, { app: 'api' });
  const envReport = validateApiEnvironment(process.env);
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger: resolveLogLevels(),
  });
  const logger = new Logger('Bootstrap');
  const configService = app.get(ConfigService);

  assertAuthEnvironment(configService);

  app.enableShutdownHooks();
  app.setGlobalPrefix('api');

  const expressApp = app.getHttpAdapter().getInstance() as unknown as Express;

  /*
   * Whether `X-Forwarded-*` can be believed.
   *
   * Workspace routing reads the hostname a request arrived on, so this is a
   * security setting, not a cosmetic one: trusting forwarded headers when the
   * API is directly reachable would let a caller name any host it likes. It is
   * therefore off unless the deployment states there is a proxy in front — set
   * explicitly with TRUST_PROXY_HEADERS, or inferred from the hosting platform.
   * See `modules/tenant-domains/request-hostname.ts`.
   */
  const trustProxy = resolveTrustProxySetting(process.env);
  if (trustProxy) {
    (expressApp as unknown as { set(key: string, value: unknown): void }).set(
      'trust proxy',
      trustProxy,
    );
  }

  const healthPayload = () => getRuntimeHealthPayload(process.env);
  expressApp.get('/', (_req, res) => res.json(healthPayload()));
  expressApp.get('/api', (_req, res) => res.json(healthPayload()));
  expressApp.get('/api/health', (_req, res) => res.json(healthPayload()));

  // ✅ Enable cookie parsing (CRITICAL for auth to work)
  app.use(cookieParser());
  configureBodyParsing(expressApp);

  // ✅ CORS must allow credentials for cookies
  app.enableCors(buildCorsOptions(process.env));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(app.get(HttpExceptionFilter));

  const port = Number(process.env.PORT) || 4000;
  const host = '0.0.0.0';

  await app.listen(port, host);

  logger.log(`API is running on http://${host}:${port}/api`);
  logger.log(`Public API base URL: ${envReport.apiBaseUrl}`);

  /*
   * Say out loud whether workspaces can be addressed at all.
   *
   * With no tenant base domain, `createSystemDomain` throws
   * TENANT_BASE_DOMAIN_NOT_CONFIGURED, so provisioning completes and quietly
   * issues no hostname — and the first anyone hears of it is a tenant whose
   * readiness reports a blocked workspace address, days later, with nothing
   * pointing at the cause. One line at boot is the difference between that and
   * a five-second fix. BUG-0284.
   */
  const domains = getPlatformDomainConfig(process.env);
  if (domains.tenantBaseDomain) {
    logger.log(
      `Workspace hostnames: ${domains.protocol}://<slug>.${domains.tenantBaseDomain} (${domains.platformEnvironment})`,
    );
  } else {
    logger.warn(
      'No TENANT_BASE_DOMAIN is configured, so no workspace hostname can be issued. ' +
        'Tenant provisioning will complete without a primary workspace address. ' +
        'Set TENANT_BASE_DOMAIN (localhost is correct for development).',
    );
  }
  for (const warning of envReport.warnings) {
    logger.warn(warning);
  }
}

void bootstrap();

/**
 * How many proxy hops to trust, or false for none.
 *
 * Render and Vercel both terminate TLS and forward, so one hop is correct
 * there. Anything else has to say so explicitly rather than be guessed at.
 */
function resolveTrustProxySetting(env: NodeJS.ProcessEnv): number | false {
  const configured = env.TRUST_PROXY_HEADERS?.trim().toLowerCase();
  if (configured) {
    if (['0', 'false', 'no', 'off'].includes(configured)) return false;
    const hops = Number(configured);
    if (Number.isInteger(hops) && hops > 0) return hops;
    if (['1', 'true', 'yes', 'on'].includes(configured)) return 1;
    return false;
  }
  return env.RENDER === 'true' || env.VERCEL === '1' ? 1 : false;
}

function configureBodyParsing(expressApp: {
  use: (...args: unknown[]) => void;
}) {
  const stripeWebhookPath = '/api/billing/stripe/webhook';
  const platformEmailTemplatePath = '/api/super-admin/platform-email/templates';
  const jsonParser = json({ limit: '1mb' });
  const urlencodedParser = urlencoded({ extended: true, limit: '1mb' });

  expressApp.use(
    stripeWebhookPath,
    raw({ type: 'application/json', limit: '2mb' }),
  );
  expressApp.use(
    platformEmailTemplatePath,
    json({ type: 'application/json', limit: '10mb' }),
  );

  expressApp.use((req: Request, res: Response, next: NextFunction) => {
    if (
      isStripeWebhookRequest(req, stripeWebhookPath) ||
      req.originalUrl.startsWith(platformEmailTemplatePath)
    ) {
      return next();
    }

    return jsonParser(req, res, next);
  });

  expressApp.use((req: Request, res: Response, next: NextFunction) => {
    if (isStripeWebhookRequest(req, stripeWebhookPath)) {
      return next();
    }

    return urlencodedParser(req, res, next);
  });
}

function isStripeWebhookRequest(req: Request, stripeWebhookPath: string) {
  return (req.originalUrl ?? req.url).split('?')[0] === stripeWebhookPath;
}
