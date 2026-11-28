import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  // Compiling the whole AppModule outgrew jest's 5 s hook default on a cold CI runner.
  jest.setTimeout(120_000);
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect(({ body }) => {
        const typedBody = body as { app: string; status: string };
        expect(typedBody.app).toBe('dijipeople-api');
        expect(typedBody.status).toBe('ok');
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
