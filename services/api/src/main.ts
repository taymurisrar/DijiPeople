import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getAllowedCorsOrigins, validateDeploymentEnv } from '@repo/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { assertAuthEnvironment } from './common/config/auth.config';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  validateDeploymentEnv(process.env, { app: 'api' });
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');
  const configService = app.get(ConfigService);

  assertAuthEnvironment(configService);

  app.enableShutdownHooks();
  app.setGlobalPrefix('api');

  // ✅ Enable cookie parsing (CRITICAL for auth to work)
  app.use(cookieParser());

  // ✅ CORS must allow credentials for cookies
  app.enableCors({
    origin: getAllowedCorsOrigins(process.env),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const port = Number(process.env.PORT) || 4000;
  const host = '0.0.0.0';

  await app.listen(port, host);

  logger.log(`API is running on http://${host}:${port}/api`);
}

void bootstrap();
