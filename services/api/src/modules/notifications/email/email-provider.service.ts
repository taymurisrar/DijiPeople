import { Injectable, NotImplementedException } from '@nestjs/common';
import { NotificationsRepository } from '../notifications.repository';
import type { EmailProviderLookupInput } from '../interfaces/notification-contracts.interface';

@Injectable()
export class EmailProviderService {
  constructor(private readonly repository: NotificationsRepository) {}

  findDefaultProvider(input: EmailProviderLookupInput) {
    return this.repository.findDefaultProvider(input);
  }

  sendWithProvider() {
    throw new NotImplementedException(
      'Provider delivery is intentionally deferred until provider integrations are introduced.',
    );
  }
}
