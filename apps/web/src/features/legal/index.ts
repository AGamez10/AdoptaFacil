// LegalDocumentPage se carga al visitarla (routes.tsx): trae todos los textos legales.
export { LegalIndexPage } from './pages/legal-index-page';
export { MyAuthorizationsPage } from './pages/my-authorizations-page';
export { LegalAcceptanceGate } from './components/legal-acceptance-gate';
export { LegalConsentFields } from './components/legal-consent-fields';
export {
  acceptancesFrom,
  requiredConsentsGiven,
  type ConsentAudience,
  type ConsentState,
} from './model/consent';
