// Module: M11 community · primer corte del ecosistema (directorio + mascotas)
//
// Comunidad abre AdoptaFácil al resto del ecosistema animal: un DIRECTORIO de
// servicios (veterinarias, peluquerías, paseadores y tiendas) con reseñas
// moderadas, y una FICHA DE MASCOTA privada para quien ya adoptó. Todo detrás
// del flag `community` (FEATURE_COMMUNITY, apagado por defecto).
//
// Reglas de datos:
//   - Un perfil de servicio pertenece al tenant de quien lo crea (RLS normal).
//     Nace `pending` y solo se ve en público cuando la plataforma lo aprueba;
//     editar su contenido lo devuelve a `pending` (se modera de nuevo).
//   - Una reseña replica el `organizationId` del perfil reseñado (como los
//     comentarios de M11) y se escribe vía función SECURITY DEFINER. Reutiliza
//     el vocabulario de estados de M12 (`ReviewStatus`).
//   - La ficha de mascota es privada de su dueña: nunca se expone en público.

import type { ReviewStatus } from './reputation';

/** Tipo de servicio del directorio — enum CERRADO. */
export enum ServiceCategory {
  Veterinary = 'veterinary',
  Grooming = 'grooming',
  Walking = 'walking',
  PetShop = 'pet_shop',
}

export const SERVICE_CATEGORIES: readonly ServiceCategory[] = [
  ServiceCategory.Veterinary,
  ServiceCategory.Grooming,
  ServiceCategory.Walking,
  ServiceCategory.PetShop,
];

/** Estado de un perfil de servicio. `hidden` = aprobado y luego retirado. */
export enum ServiceListingStatus {
  Pending = 'pending',
  Approved = 'approved',
  Rejected = 'rejected',
  Hidden = 'hidden',
}

/** Datos que escribe quien publica el perfil. Ninguno es dato personal
 *  sensible: son datos de contacto comerciales que el negocio decide publicar. */
export interface ServiceListingInput {
  category: ServiceCategory;
  name: string;
  description?: string;
  department: string;
  city: string;
  address?: string;
  phone?: string;
  whatsapp?: string;
  website?: string;
  email?: string;
}

export type CreateServiceListingInput = ServiceListingInput;
export type UpdateServiceListingInput = Partial<ServiceListingInput>;

/** Perfil visto por su dueño (incluye estado y motivo de moderación). */
export interface ServiceListing extends ServiceListingInput {
  id: string;
  organizationId: string;
  status: ServiceListingStatus;
  moderationReason?: string;
  /** Aliado de AdoptaFácil: solo la plataforma lo marca. */
  isPartner: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Perfil visto en el directorio público (solo aprobados). */
export interface ServiceListingPublic extends ServiceListingInput {
  id: string;
  /** Aliado de AdoptaFácil (sello y primer lugar en el directorio). */
  isPartner: boolean;
  /** Promedio de reseñas aprobadas (1–5), o ausente si no hay ninguna. */
  ratingAverage?: number;
  ratingCount: number;
  createdAt: string;
}

export interface ServiceListingsPage<T = ServiceListingPublic> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/** Reseña de un servicio en público: sin identificador de la autora, solo
 *  su primer nombre. */
export interface ServiceReviewPublic {
  id: string;
  rating: number;
  comment?: string;
  authorName: string;
  createdAt: string;
}

/** Reseña vista por la plataforma en la cola de moderación. */
export interface ServiceReview extends ServiceReviewPublic {
  listingId: string;
  listingName: string;
  status: ReviewStatus;
  moderationReason?: string;
}

export interface ServiceReviewsPage<T = ServiceReviewPublic> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/** Dejar una reseña (1–5 estrellas, comentario opcional hasta 1000). */
export interface CreateServiceReviewInput {
  rating: number;
  comment?: string;
}

/** Decisión de plataforma sobre un perfil. `reason` obligatorio salvo al aprobar. */
export interface ModerateServiceListingInput {
  decision: 'approve' | 'reject' | 'hide';
  reason?: string;
}

/** Plataforma: marcar o quitar la alianza de un negocio con AdoptaFácil. */
export interface SetServiceListingPartnerInput {
  partner: boolean;
  /** Nota interna para la auditoría (p. ej. referencia del acuerdo). */
  reason?: string;
}

/** Decisión de plataforma sobre una reseña. `reason` obligatorio al rechazar u ocultar. */
export interface ModerateServiceReviewInput {
  decision: 'approve' | 'reject' | 'hide';
  reason?: string;
}

// ============================================================================
// Ficha de mascota (privada de su dueña)
// ============================================================================

export type PetSpecies = 'dog' | 'cat' | 'other';
export type PetSex = 'male' | 'female' | 'unknown';

export interface PetProfileInput {
  name: string;
  species: PetSpecies;
  breed?: string;
  sex?: PetSex;
  /** Fecha aproximada de nacimiento, `YYYY-MM-DD`. */
  birthDate?: string;
  sterilized?: boolean;
  /** Nombre de la organización de donde fue adoptada (texto libre). */
  adoptedFrom?: string;
  notes?: string;
}

export type CreatePetProfileInput = PetProfileInput;
export type UpdatePetProfileInput = Partial<PetProfileInput>;

export interface PetProfile extends PetProfileInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}
