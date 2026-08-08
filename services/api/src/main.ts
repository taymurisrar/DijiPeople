import { Logger, LogLevel, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { validateDeploymentEnv } from '@repo/config';
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
  for (const warning of envReport.warnings) {
    logger.warn(warning);
  }
}

void bootstrap();

function configureBodyParsing(expressApp: {
  use: (...args: unknown[]) => void;
}) {
  const stripeWebhookPath = '/api/billing/stripe/webhook';
  const jsonParser = json({ limit: '1mb' });
  const urlencodedParser = urlencoded({ extended: true, limit: '1mb' });

  expressApp.use(
    stripeWebhookPath,
    raw({ type: 'application/json', limit: '2mb' }),
  );

  expressApp.use((req: Request, res: Response, next: NextFunction) => {
    if (isStripeWebhookRequest(req, stripeWebhookPath)) {
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
