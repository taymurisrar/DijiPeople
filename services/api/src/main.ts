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
import { PrismaService } from './common/prisma/prisma.service';
import { livenessReport } from './common/health/liveness';
import { installUnhandledRejectionHandler } from './common/process/unhandled-rejection';
import { probeReadiness } from './common/health/readiness';
import { OutboxWorkerService } from './modules/outbox/outbox-worker.service';
import { TenantEntitlementService } from './common/security/tenant-entitlement.service';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AuthenticatedRateLimitInterceptor } from './common/interceptors/authenticated-rate-limit.interceptor';
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
  // A forgotten .catch must not take every tenant down (BUG-4625).
  installUnhandledRejectionHandler(new Logger('UnhandledRejection'));
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
  /*
   * Plan-entitlement enforcement is reported the same way, for the same reason
   * (DP-QA-005): production defaults to REPORT_ONLY, the setting lives on the
   * service, and the only durable guard is a deployment check that reads it from
   * the running process. Added here, not only in `AppService` — see above.
   */
  const entitlements = app.get(TenantEntitlementService, { strict: false });
  const healthPayload = async () => ({
    ...getRuntimeHealthPayload(process.env),
    outboxWorker: { enabled: outboxWorker.isEnabled() },
    entitlementEnforcement: await entitlements.describeEnforcement(),
  });
  const serveHealth = (_req: Request, res: Response, next: NextFunction) => {
    healthPayload()
      .then((payload) => res.json(payload))
      .catch(next);
  };
  expressApp.get('/', serveHealth);
  expressApp.get('/api', serveHealth);
  expressApp.get('/api/health', serveHealth);

  // Liveness: process-up only, no database and no imports (common/health/
  // liveness.ts). This is the route a restart decision may use. `/api` and
  // `/api/health` above read the entitlement mode from the database whenever
  // their cache has expired, so they are not safe for that (ITEM-0236).
  expressApp.get('/api/health/live', (_req: Request, res: Response) => {
    res.json(livenessReport());
  });

  // Readiness is NOT liveness: it probes the database and answers 503 when it is
  // unreachable, so it is for monitors and operators. Do not point Render's
  // healthCheckPath at it - that would turn a Neon blip into a restart loop.
  // Concurrent probes share one in-flight SELECT 1 so an unauthenticated caller
  // cannot multiply database work.
  const prisma = app.get(PrismaService, { strict: false });
  let inflightReadiness: ReturnType<typeof probeReadiness> | null = null;
  expressApp.get('/api/health/ready', (_req: Request, res: Response) => {
    inflightReadiness ??= probeReadiness(
      () => prisma.$queryRaw`SELECT 1`,
    ).finally(() => {
      inflightReadiness = null;
    });
    void inflightReadiness.then((report) =>
      res.status(report.ready ? 200 : 503).json(report),
    );
  });

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
  // RATE-03: the only prior rate limiter, PublicRateLimitGuard, covers 13
  // pre-session handlers and no authenticated route at all. See the
  // interceptor's own doc comment for why this is an interceptor, not a guard.
  app.useGlobalInterceptors(app.get(AuthenticatedRateLimitInterceptor));

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
  // Provider webhooks are signed over their exact bytes, so they must reach
  // their controllers unparsed.
  const rawWebhookPaths = [
    '/api/billing/stripe/webhook',
    '/api/billing/safepay/webhook',
  ];
  const platformEmailTemplatePath = '/api/super-admin/platform-email/templates';
  // DLP screenshot ingest carries base64 image bytes (TASK-0020/TASK-0023). A
  // full-screen PNG easily exceeds the 1 MB default, so this route gets a larger
  // limit — bounded so a hostile client cannot post an arbitrarily large body.
  // Kept in step with ScreenCaptureBatchDto (per-image cap × batch size).
  const dlpScreenshotPath = '/api/agent/dlp/screenshot-events';
  const jsonParser = json({ limit: '1mb' });
  const urlencodedParser = urlencoded({ extended: true, limit: '1mb' });

  for (const path of rawWebhookPaths) {
    expressApp.use(path, raw({ type: 'application/json', limit: '2mb' }));
  }
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
      isRawWebhookRequest(req, rawWebhookPaths) ||
      req.originalUrl.startsWith(platformEmailTemplatePath) ||
      req.originalUrl.startsWith(dlpScreenshotPath)
    ) {
      return next();
    }

    return jsonParser(req, res, next);
  });

  expressApp.use((req: Request, res: Response, next: NextFunction) => {
    if (isRawWebhookRequest(req, rawWebhookPaths)) {
      return next();
    }

    return urlencodedParser(req, res, next);
  });
}

function isRawWebhookRequest(req: Request, rawWebhookPaths: string[]) {
  return rawWebhookPaths.includes((req.originalUrl ?? req.url).split('?')[0]);
}
