import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OutboxWorkerService } from './modules/outbox/outbox-worker.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        /*
         * The health payload reports whether this process is draining the
         * outbox (BUG-0904), so the controller now needs the worker. Stubbed
         * rather than instantiated: the real one reads config and would start
         * a timer, and what this spec asserts is the payload's shape.
         */
        { provide: OutboxWorkerService, useValue: { isEnabled: () => false } },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return a health payload', () => {
      expect(appController.getHealth()).toMatchObject({
        app: 'dijipeople-api',
        status: 'ok',
        outboxWorker: { enabled: false },
      });
    });
  });
});
