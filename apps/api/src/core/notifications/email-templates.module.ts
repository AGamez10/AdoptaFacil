import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmailTemplatesController } from './email-templates.controller';
import { PublicEmailController } from './public-email.controller';

/** HTTP surface of the email templates (superadmin panel + public opt-out).
 *  Providers come from the global NotificationModule. */
@Module({
  imports: [AuthModule],
  controllers: [EmailTemplatesController, PublicEmailController],
})
export class EmailTemplatesModule {}
