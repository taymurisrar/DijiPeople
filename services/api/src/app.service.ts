import { Injectable } from '@nestjs/common';
import { getRuntimeHealthPayload } from './config/env.validation';
import { OutboxWorkerService } from './modules/outbox/outbox-worker.service';

@Injectable()
export class AppService {
  constructor(private readonly outboxWorker: OutboxWorkerService) {}

  getHealth() {
    return {
      ...getRuntimeHealthPayload(process.env),
      /*
       * Whether this process is draining the outbox.
       *
       * `OUTBOX_WORKER_ENABLED` is off by default and exactly one deployed
       * service must set it, or `PROVISIONING_REQUESTED` rows accumulate
       * undelivered and a customer who pays never gets a workspace. Production
       * ran without it because the service was configured by hand and
       * `render.yaml` was never applied (BUG-0904, the same drift as BUG-0767).
       *
       * Nothing could see that. The startup log says it, once, and then scrolls
       * away; the API answered `status: ok` either way. Reporting it here turns
       * an invisible configuration gap into something a smoke test can fail on
       * — which is the only durable guard available, because the value lives on
       * the service and not in this repository.
       */
      outboxWorker: { enabled: this.outboxWorker.isEnabled() },
    };
  }
}
