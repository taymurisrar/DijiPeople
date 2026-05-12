import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { validateDeploymentEnv } from '@repo/config';
import cookieParser from 'cookie-parser';
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
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');
  const configService = app.get(ConfigService);

  assertAuthEnvironment(configService);

  app.enableShutdownHooks();
  app.setGlobalPrefix('api');

  const healthPayload = () => getRuntimeHealthPayload(process.env);
  app.getHttpAdapter().get('/', (_req, res) => res.json(healthPayload()));
  app.getHttpAdapter().get('/api', (_req, res) => res.json(healthPayload()));
  app
    .getHttpAdapter()
    .get('/api/health', (_req, res) => res.json(healthPayload()));

  // ✅ Enable cookie parsing (CRITICAL for auth to work)
  app.use(cookieParser());

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
