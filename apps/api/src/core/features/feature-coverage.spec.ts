import 'reflect-metadata';
import type { FeatureKey } from '@adoptafacil/contracts';
import { CampaignFundingController } from '../../modules/campaigns/campaign-funding.controller';
import { CommunityModerationController } from '../../modules/community/community-moderation.controller';
import { CommunityModule } from '../../modules/community/community.module';
import { CommunityPostsController } from '../../modules/community/community-posts.controller';
import { PublicCommunityServicesController } from '../../modules/community/community-directory.controller';
import { OrgDonationsDashboardController } from '../../modules/dashboards/org-donations-dashboard.controller';
import { DonationCertificatePublicController } from '../../modules/donations/donation-certificate-public.controller';
import { DonationsModule } from '../../modules/donations/donations.module';
import { MarketplaceModule } from '../../modules/marketplace/marketplace.module';
import { PaymentsModule } from '../../modules/payments/payments.module';
import { ReputationModule } from '../../modules/reputation/reputation.module';
import { ResourcesModule } from '../../modules/resources/resources.module';
import { SponsorshipsModule } from '../../modules/sponsorships/sponsorships.module';
import { REQUIRED_FEATURES_KEY } from './require-feature.decorator';

/**
 * Ola 1 · R1-1: every controller of a switchable module carries its flag, so
 * a controller added later to one of these modules cannot slip out from
 * behind it unnoticed.
 */
type Controller = abstract new (...args: never[]) => unknown;

function controllersOf(module: object): Controller[] {
  return (Reflect.getMetadata('controllers', module) ?? []) as Controller[];
}

function featuresOf(controller: Controller): FeatureKey[] {
  return (Reflect.getMetadata(REQUIRED_FEATURES_KEY, controller) ?? []) as FeatureKey[];
}

const MODULES: Array<[FeatureKey, object, Controller[]]> = [
  ['payments', DonationsModule, [DonationCertificatePublicController]],
  ['payments', PaymentsModule, []],
  ['sponsorships', SponsorshipsModule, []],
  ['community', CommunityModule, []],
  ['reputation', ReputationModule, []],
  ['resources', ResourcesModule, []],
  ['marketplace', MarketplaceModule, []],
];

describe('feature flag coverage (R1-1)', () => {
  it.each(MODULES)('every %s controller of its module is gated', (feature, module, except) => {
    const controllers = controllersOf(module).filter((c) => !except.includes(c));
    expect(controllers.length).toBeGreaterThan(0);
    for (const controller of controllers) {
      expect({ controller: controller.name, features: featuresOf(controller) }).toEqual({
        controller: controller.name,
        features: expect.arrayContaining([feature]),
      });
    }
  });

  it('gates the public certificate verification behind donationCertificates', () => {
    expect(featuresOf(DonationCertificatePublicController)).toEqual(['donationCertificates']);
  });

  it('gates the community wall behind its own flag, and the directory without it', () => {
    expect(featuresOf(CommunityPostsController)).toEqual(['community', 'communityWall']);
    expect(featuresOf(CommunityModerationController)).toEqual(['community', 'communityWall']);
    expect(featuresOf(PublicCommunityServicesController)).toEqual(['community']);
  });

  it('gates money surfaces that live in MVP modules', () => {
    expect(featuresOf(CampaignFundingController)).toEqual(['payments']);
    expect(featuresOf(OrgDonationsDashboardController)).toEqual(['payments']);
  });
});
