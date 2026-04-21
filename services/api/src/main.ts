import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getAllowedCorsOrigins, getAppPort } from '@repo/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.setGlobalPrefix('api');
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
  const port = getAppPort('api', process.env);
  const host = process.env.HOST ?? '0.0.0.0';

  await app.listen(port, host);
}
void bootstrap();
