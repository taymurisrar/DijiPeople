import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  getPlatformDomainConfig,
  resolveTrustProxySetting,
  validateDeploymentEnv,
} from '@repo/config';
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
import { resolveLogLevels } from './log-level';
import { OutboxWorkerService } from './modules/outbox/outbox-worker.service';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { assertAuthEnvironment } from './common/config/auth.config';
import { ConfigService } from '@nestjs/config';
import {
  buildCorsOptions,
  getRuntimeHealthPayload,
  validateApiEnvironment,
} from './config/env.validation';

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

  /*
   * These express handlers answer before Nest's router, so `AppController` is
   * not what serves `/api/health` in production — it is unreachable for these
   * three paths.
   *
   * That mattered on 2026-08-28. The outbox worker's state was added to
   * `AppService.getHealth()` to make BUG-0904's configuration drift
   * observable; every test passed, the release deployed, and the field did not
   * appear — because nothing asks `AppService` anything on this route. A fix
   * that ships and has no effect is worse than an unfixed bug, because the
   * record says it is done.
   *
   * The worker is resolved from the container rather than reading
   * `OUTBOX_WORKER_ENABLED` here a second time, so this reports what the
   * running process actually decided rather than a second interpretation of
   * the same variable.
   */
  const outboxWorker = app.get(OutboxWorkerService, { strict: false });
  const healthPayload = () => ({
    ...getRuntimeHealthPayload(process.env),
    outboxWorker: { enabled: outboxWorker.isEnabled() },
  });
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

function configureBodyParsing(expressApp: {
  use: (...args: unknown[]) => void;
}) {
  const stripeWebhookPath = '/api/billing/stripe/webhook';
  const platformEmailTemplatePath = '/api/super-admin/platform-email/templates';
  // DLP screenshot ingest carries base64 image bytes (TASK-0020/TASK-0023). A
  // full-screen PNG easily exceeds the 1 MB default, so this route gets a larger
  // limit — bounded so a hostile client cannot post an arbitrarily large body.
  // Kept in step with ScreenCaptureBatchDto (per-image cap × batch size).
  const dlpScreenshotPath = '/api/agent/dlp/screenshot-events';
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
  expressApp.use(
    dlpScreenshotPath,
    json({ type: 'application/json', limit: '25mb' }),
  );

  expressApp.use((req: Request, res: Response, next: NextFunction) => {
    if (
      isStripeWebhookRequest(req, stripeWebhookPath) ||
      req.originalUrl.startsWith(platformEmailTemplatePath) ||
      req.originalUrl.startsWith(dlpScreenshotPath)
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
