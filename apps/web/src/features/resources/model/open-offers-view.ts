import {
  OPEN_OFFER_CATEGORIES,
  ResourceOpenOfferStatus,
  type ResourceNeed,
  ResourceNeedStatus,
  type ResourceOpenOffer,
  type ResourceOpenOfferBoardItem,
} from '@adoptafacil/contracts';
import { CATEGORY_LABELS } from './resources-view';

/** Página del ofrecimiento abierto ("Tengo algo para donar"). */
export const OPEN_OFFER_PATH = '/tengo-para-donar';

/** Tablero de ofrecimientos para organizaciones. */
export const OPEN_OFFERS_BOARD_PATH = '/organizacion/recursos/ofrecimientos';

/** Categorías del formulario de ofrecimiento abierto (sin medicamentos). */
export const OPEN_OFFER_CATEGORY_OPTIONS = OPEN_OFFER_CATEGORIES.map((value) => ({
  value,
  label: CATEGORY_LABELS[value],
}));

/** Estado visible para quien ofrece (vencido = abierto con fecha pasada). */
export function openOfferStatusLabel(offer: Pick<ResourceOpenOffer, 'status' | 'expired'>): string {
  if (offer.status === ResourceOpenOfferStatus.Open) {
    return offer.expired ? 'Vencido' : 'Esperando una organización';
  }
  return offer.status === ResourceOpenOfferStatus.Claimed ? 'Una organización lo tomó' : 'Retirado';
}

export function openOfferStatusVariant(
  offer: Pick<ResourceOpenOffer, 'status' | 'expired'>,
): 'success' | 'secondary' | 'warning' {
  if (offer.status === ResourceOpenOfferStatus.Claimed) return 'success';
  if (offer.status === ResourceOpenOfferStatus.Open && !offer.expired) return 'warning';
  return 'secondary';
}

const normalizeUnit = (unit: string): string => unit.trim().toLowerCase();

/** Necesidades propias a las que se puede asociar el ofrecimiento: activas,
 *  misma categoría y misma unidad (la base de datos exige lo mismo). */
export function compatibleNeeds(
  needs: readonly ResourceNeed[],
  offer: Pick<ResourceOpenOfferBoardItem, 'category' | 'unit'>,
): ResourceNeed[] {
  return needs.filter(
    (need) =>
      (need.status === ResourceNeedStatus.Needed ||
        need.status === ResourceNeedStatus.PartiallyFulfilled) &&
      need.category === offer.category &&
      normalizeUnit(need.unit) === normalizeUnit(offer.unit),
  );
}

/** Días que faltan para que venza (0 si ya venció). */
export function daysLeft(expiresAtIso: string, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((new Date(expiresAtIso).getTime() - now.getTime()) / 86_400_000));
}
