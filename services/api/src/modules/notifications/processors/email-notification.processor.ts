import { Injectable } from '@nestjs/common';
import type { EmailNotificationJobPayload } from '../jobs/notification-job-payload.interface';
import { EmailExecutionService } from '../email/email-execution.service';

@Injectable()
export class EmailNotificationProcessor {
  constructor(private readonly emailExecutionService: EmailExecutionService) {}

  process(job: EmailNotificationJobPayload) {
    return this.emailExecutionService.execute(job.email);
  }
}
