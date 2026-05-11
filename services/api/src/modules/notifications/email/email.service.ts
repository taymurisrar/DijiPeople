import {
  EmailExecutionService,
  SendTemplateEmailInput,
  SendTemplateEmailResult,
} from './email-execution.service';
import { Injectable } from '@nestjs/common';
import { NotificationQueueService } from '../queues/notification-queue.service';

export type { SendTemplateEmailInput, SendTemplateEmailResult };

@Injectable()
export class EmailService {
  constructor(
    private readonly executionService: EmailExecutionService,
    private readonly queueService: NotificationQueueService,
  ) {}

  async previewTemplate(input: {
    tenantId: string;
    templateId: string;
    variables: Record<string, unknown>;
  }) {
    return this.executionService.previewTemplate(input);
  }

  async sendTemplateEmail(
    input: SendTemplateEmailInput,
  ): Promise<SendTemplateEmailResult> {
    return this.queueService.dispatchEmail(input, (payload) =>
      this.executionService.execute(payload),
    );
  }
}
