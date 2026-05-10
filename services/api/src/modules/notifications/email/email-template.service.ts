import { Injectable, NotImplementedException } from '@nestjs/common';
import { NotificationsRepository } from '../notifications.repository';
import type { EmailTemplateLookupInput } from '../interfaces/notification-contracts.interface';

@Injectable()
export class EmailTemplateService {
  constructor(private readonly repository: NotificationsRepository) {}

  findTemplateForEvent(input: EmailTemplateLookupInput) {
    return this.repository.findTemplateForEvent(input);
  }

  renderTemplate() {
    throw new NotImplementedException(
      'Template rendering is intentionally deferred for the next implementation phase.',
    );
  }
}
