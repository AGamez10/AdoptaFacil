import {
  Injectable,
  NotFoundException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../core/auth/auth.types';
import { FollowUpService } from './followup.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Checks that the caller is the milestone's adopter before the file
 * interceptor reads the upload (guards run before interceptors): only the
 * adopter can make the API hold a photo or video in memory.
 */
@Injectable()
export class FollowUpAdopterGuard implements CanActivate {
  constructor(private readonly followUps: FollowUpService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const id = req.params?.id;
    if (!req.user || typeof id !== 'string' || !UUID_RE.test(id)) {
      throw new NotFoundException('Hito de seguimiento no encontrado o no eres el adoptante.');
    }
    await this.followUps.assertAdopterCanSubmit(id, req.user.id);
    return true;
  }
}
