import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PasswordService } from '../auth/password.service';
import { DefaultCredentialsCheck } from './default-credentials.check';
import { RbacController } from './rbac.controller';
import { RbacService } from './rbac.service';
import { RolesGuard } from './roles.guard';

/**
 * RBAC (§13). `@Global` so {@link RolesGuard} and {@link RbacService} are
 * available to every module (each module — this app's and Fabián's — protects
 * its own endpoints with `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(...)`).
 * Imports AuthModule for the JwtAuthGuard used by this controller.
 */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [RbacController],
  // PasswordService is stateless; provided here (AuthModule does not export it)
  // for the AF-037 boot check.
  providers: [RbacService, RolesGuard, PasswordService, DefaultCredentialsCheck],
  exports: [RbacService, RolesGuard],
})
export class RbacModule {}
