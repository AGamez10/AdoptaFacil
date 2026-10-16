import { Injectable, Logger } from '@nestjs/common';
import { NotificationMessage, NotificationPort } from './notification.port';

/**
 * Simulable adapter (local-dev): writes notifications to the log instead of
 * contacting a real provider. Selected when NOTIFICATION_DRIVER=log (the only
 * driver in Ola 1). The single stub for the whole API (T-107).
 */
@Injectable()
export class LogNotificationAdapter implements NotificationPort {
  private readonly logger = new Logger('NotificationPort');

  async send(message: NotificationMessage): Promise<void> {
    const extras = [
      message.html ? 'html=yes' : '',
      message.attachments?.length ? `attachments=${message.attachments.length}` : '',
    ]
      .filter(Boolean)
      .join(' ');
    this.logger.log(
      `[SIMULATED] to=${message.to} subject="${message.subject}"${extras ? ` ${extras}` : ''}`,
    );
  }
}
