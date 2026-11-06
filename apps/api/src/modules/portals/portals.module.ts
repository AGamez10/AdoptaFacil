import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { PortalThemeController } from './portal-theme.controller';
import { PortalThemeService } from './portal-theme.service';
import { PortalSubdomainController } from './portal-subdomain.controller';
import { PortalSubdomainService } from './portal-subdomain.service';
import { PortalPreviewController } from './portal-preview.controller';
import { PortalPreviewService } from './portal-preview.service';
import { OrgQrController, PublicOrgQrController } from './org-qr.controller';
import { OrgQrService } from './org-qr.service';

/**
 * M14 · Portals (T-027) — per-organization brand personalization by TOKENS.
 * Consumes core (tenant/auth/rbac/audit): RolesGuard / AuditService /
 * TenantContextService are global; AuthModule is imported for the JwtAuthGuard
 * used by these controllers. Owns only the portal_themes table (RLS) and the
 * public theme read; the transparency indicator's % is DERIVED on the consumer
 * from the org contract (FORMALIZATION_SEQUENCE), so it needs no endpoint here.
 * Also owns real-subdomain resolution (subdomain → slug, T-portal-subdomain):
 * a public read-only lookup, no tenant context, no new table.
 * Also owns the fixed per-organization QR (organization_qr_links, RLS) and
 * its public scan resolution (`resolve_organization_qr`).
 */
@Module({
  imports: [AuthModule],
  controllers: [
    PortalThemeController,
    PortalSubdomainController,
    PortalPreviewController,
    OrgQrController,
    PublicOrgQrController,
  ],
  providers: [PortalThemeService, PortalSubdomainService, PortalPreviewService, OrgQrService],
})
export class PortalsModule {}
