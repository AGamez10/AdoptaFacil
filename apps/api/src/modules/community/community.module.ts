import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { CommunityPostsController } from './community-posts.controller';
import { CommunityPostsService } from './community-posts.service';
import { CommunityCommentsService } from './community-comments.service';
import { CommunityLikesService } from './community-likes.service';
import { CommunityModerationController } from './community-moderation.controller';
import { CommunityModerationService } from './community-moderation.service';
import {
  CommunityDirectoryModerationController,
  CommunityPetsController,
  CommunityServicesController,
  PublicCommunityServicesController,
} from './community-directory.controller';
import { CommunityDirectoryService } from './community-directory.service';
import { CommunityPetsService } from './community-pets.service';

/**
 * M11 · Comunidad (Ola 3, F-8): publicaciones, comentarios, likes y
 * moderación básica de plataforma. El feed es CRUZADO por diseño (ver
 * `community.prisma`); comentarios/likes/publicaciones de Persona pasan por
 * funciones SECURITY DEFINER acotadas, nunca un select crudo que evada RLS.
 * Consumes core (tenant/auth/rbac/audit/storage/notifications) — global
 * providers; AuthModule solo para el JwtAuthGuard.
 */
@Module({
  imports: [AuthModule],
  controllers: [
    CommunityPostsController,
    CommunityModerationController,
    // Primer corte del ecosistema: directorio de servicios + ficha de mascota.
    PublicCommunityServicesController,
    CommunityServicesController,
    CommunityPetsController,
    CommunityDirectoryModerationController,
  ],
  providers: [
    CommunityPostsService,
    CommunityCommentsService,
    CommunityLikesService,
    CommunityModerationService,
    CommunityDirectoryService,
    CommunityPetsService,
  ],
})
export class CommunityModule {}
