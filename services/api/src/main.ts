import { Logger, ValidationPipe } from '@nestjs/common';
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

async function bootstrap() {
  validateDeploymentEnv(process.env, { app: 'api' });
  const envReport = validateApiEnvironment(process.env);
  const app = await NestFactory.create(AppModule, { bodyParser: false });
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
