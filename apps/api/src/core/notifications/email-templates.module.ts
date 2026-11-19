import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmailTemplatesController } from './email-templates.controller';
import { PublicEmailController } from './public-email.controller';
import { InboxController } from './inbox/inbox.controller';
import { PushController } from './push/push.controller';

/** HTTP surface of the email templates (superadmin panel + public opt-out)
 *  and of each person's notification inbox (`/me/notifications`).
 *  Providers come from the global NotificationModule. */
@Module({
  imports: [AuthModule],
  controllers: [EmailTemplatesController, PublicEmailController, InboxController, PushController],
})
export class EmailTemplatesModule {}
