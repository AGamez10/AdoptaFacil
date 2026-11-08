// Gestión interna (autenticada) — M09/F-6 en /organizacion/recursos.
export { ResourcesPage } from './pages/resources-page';
export { ResourceNeedDetailPage } from './pages/resource-need-detail-page';
// Portal PÚBLICO del banco de recursos (M09/F-6).
export { PublicResourcesPage } from './pages/public-resources-page';
export { PublicResourceDetailPage } from './pages/public-resource-detail-page';
// Ofrecer ayuda / mis ofertas (autenticadas, cualquier cuenta).
export { OfferResourcePage } from './pages/offer-resource-page';
export { MyResourceOffersPage } from './pages/my-resource-offers-page';
// Ofrecimiento abierto (cuando no hay una necesidad que calce) y su tablero.
export { OpenOfferPage } from './pages/open-offer-page';
export { OpenOffersBoardPage } from './pages/open-offers-board-page';
export { OPEN_OFFER_PATH, OPEN_OFFERS_BOARD_PATH } from './model/open-offers-view';
