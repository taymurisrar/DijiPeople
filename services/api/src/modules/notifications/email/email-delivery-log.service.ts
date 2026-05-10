import { Injectable } from '@nestjs/common';
import { NotificationsRepository } from '../notifications.repository';
import type { EmailDeliveryLogCreateInput } from '../interfaces/notification-contracts.interface';

@Injectable()
export class EmailDeliveryLogService {
  constructor(private readonly repository: NotificationsRepository) {}

  createDeliveryLog(input: EmailDeliveryLogCreateInput) {
    return this.repository.createDeliveryLog(input);
  }

  listTenantLogs(tenantId: string) {
    return this.repository.listDeliveryLogs(tenantId, {
      page: 1,
      pageSize: 25,
    });
  }
}
