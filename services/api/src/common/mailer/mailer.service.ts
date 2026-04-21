import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendPasswordResetLink(input: {
    to: string;
    fullName: string;
    resetLink: string;
  }) {
    return this.deliverLink({
      to: input.to,
      subject: 'password reset',
      link: input.resetLink,
    });
  }

  async sendAccountActivationLink(input: {
    to: string;
    fullName: string;
    activationLink: string;
  }) {
    return this.deliverLink({
      to: input.to,
      subject: 'account activation',
      link: input.activationLink,
    });
  }

  private async deliverLink(input: {
    to: string;
    subject: string;
    link: string;
  }) {
    const deliveryMode = this.configService.get('MAIL_DELIVERY_MODE') ?? 'log';

    if (deliveryMode === 'log') {
      this.logger.log(
        `${input.subject} email queued for ${input.to}: ${input.link}`,
      );
      return {
        deliveryMode: 'log',
        accepted: true,
        link: input.link,
      };
    }

    this.logger.warn(
      `Unsupported mail delivery mode "${deliveryMode}". Falling back to log.`,
    );
    this.logger.log(
      `${input.subject} email queued for ${input.to}: ${input.link}`,
    );

    return {
      deliveryMode: 'log',
      accepted: true,
      link: input.link,
    };
  }
}
