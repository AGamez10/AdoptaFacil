import {
  FormalizationState,
  LEDGER_CATEGORY_LABELS,
  LedgerEntryKind,
  LedgerSource,
  type AnimalSummary,
  type CampaignPublic,
  type OrganizationPublic,
  type ProductPublic,
  type PublicLedgerPage,
  type PublicReview,
  type ResourceNeedPublic,
} from '@adoptafacil/contracts';
import { CATEGORY_LABELS as CAMPAIGN_CATEGORY_LABELS } from '../../../campaigns/model/campaigns-view';
import { publicCampaignDetailHref } from '../../../campaigns/model/campaigns-view';
import { CATEGORY_LABELS as PRODUCT_CATEGORY_LABELS } from '../../../marketplace/model/marketplace-view';
import { publicProductHref } from '../../../marketplace/model/marketplace-view';
import { CATEGORY_LABELS as NEED_CATEGORY_LABELS } from '../../../resources/model/resources-view';
import { publicResourceNeedHref } from '../../../resources/model/resources-view';
import { deriveFormalizationPct } from '../../../../shell/transparency';
import {
  buildAdoptionRequestHref,
  buildSponsorHref,
  isRecentlyPublished,
  publicAnimalDetailHref,
} from '../../model/animals-catalog';
import { buildDonateHref } from '../../components/portal-donate-cta';
import { googleMapsEmbedFromAddress, toGoogleMapsEmbedUrl } from '../../model/google-maps';
import { esc, mailHref, safeHref, safeImgSrc, telHref, waHref } from './safe';

/**
 * View-model de las plantillas (M14, plantillas gratuitas). Se arma SOLO con los
 * datos públicos que el portal clásico ya muestra (mismos endpoints, mismas reglas
 * de visibilidad que `OrgPublicPage`). Todos los textos salen YA escapados y todos
 * los enlaces/imágenes YA saneados (`safe.ts`): una plantilla puede interpolarlos
 * directamente en su HTML sin abrir una vía de inyección.
 *
 * Nada se inventa: si el dato no existe, el campo queda vacío y la plantilla
 * oculta o reemplaza ese bloque por el mismo texto vacío del portal clásico.
 */

/** Datos crudos tal como los devuelven los endpoints públicos. */
export interface TemplateSourceData {
  slug: string;
  organization: OrganizationPublic;
  animals: AnimalSummary[];
  /** Total real reportado por la API (puede superar `animals.length`). */
  animalTotal: number;
  campaigns: CampaignPublic[];
  needs: ResourceNeedPublic[];
  products: ProductPublic[];
  reviews: PublicReview[];
  /** RF14: libro público (null/ausente si no cargó: la sección muestra su texto vacío). */
  ledger?: PublicLedgerPage | null;
}

export type Species = 'perro' | 'gato' | 'otro';

export interface TplAnimal {
  i: number;
  id: string;
  name: string;
  sp: Species;
  spLabel: string;
  sex: string;
  size: string;
  sizeLabel: string;
  /** Edad total en meses (0 cuando la organización no la registró). */
  months: number;
  hasAge: boolean;
  age: string;
  stage: string;
  breed: string;
  coatLabel: string;
  isNew: boolean;
  /** Días desde la publicación (0 si no se conoce). */
  days: number;
  photo: string | null;
  href: string;
  adoptHref: string;
  sponsorHref: string;
  // Paleta del retrato ilustrado de respaldo (solo cuando no hay foto).
  bg: string;
  fig: string;
  ear: string;
  snout: string;
  eye: string;
  light: boolean;
  pattern: 'none' | 'patch' | 'mask' | 'stripes';
  ears: 'floppy' | 'pointy' | 'cat';
}

export interface TplCampaign {
  id: string;
  title: string;
  description: string;
  category: string;
  raised: number;
  goal: number;
  pct: number;
  deadline: string;
  deadlineShort: string;
  deadlineISO: string;
  daysLeft: number;
  href: string;
}

export interface TplNeed {
  id: string;
  title: string;
  category: string;
  need: number;
  got: number;
  unit: string;
  pct: number;
  href: string;
}

export interface TplProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  img: string | null;
  href: string;
  art: 'shirt' | 'collar' | 'mug' | 'cal' | 'bag';
  tint: string;
}

export interface TplReview {
  id: string;
  name: string;
  rating: number;
  date: string;
  text: string;
}

export interface TplLedgerRow {
  id: string;
  date: string;
  concept: string;
  category: string;
  /** Monto con signo y formato COP ("+ $ 50.000"). */
  amount: string;
  income: boolean;
  online: boolean;
  support: boolean;
  voided: boolean;
  voidReason: string;
}

export interface TplLedger {
  rows: TplLedgerRow[];
  income: string;
  expense: string;
  balance: string;
  count: number;
  last: string;
}

export interface TplSocial {
  key: 'instagram' | 'facebook' | 'tiktok' | 'website' | 'whatsapp' | 'email';
  label: string;
  handle: string;
  url: string;
  external: boolean;
}

export interface TplBadge {
  t: string;
  ok: boolean;
}

export interface TplOrg {
  id: string;
  name: string;
  short: string;
  initials: string;
  /** Tipo de organización (solo si la política pública lo expone). */
  type: string;
  city: string;
  dept: string;
  /** "Ciudad, Departamento, País" con lo que exista. */
  place: string;
  /** Descripción corta del perfil (hero), puede ser vacía. */
  lede: string;
  /** "Nosotros" (puede ser vacía ⇒ la sección se oculta). Saltos de línea ⇒ <br>. */
  about: string;
  level: number;
  levelLabel: string;
  formalization: number;
  formalLabel: string;
  /** Mismo criterio que el badge verde del portal clásico. */
  isEsal: boolean;
  rte: boolean;
  nit: string;
  accountability: string;
  accountabilityLabel: string;
  logo: string | null;
  cover: string | null;
  donateHref: string;
  contact: {
    hours: string;
    fullAddress: string;
    phones: string[];
    phoneHrefs: Array<string | null>;
    mapEmbed: string | null;
    mapHref: string | null;
  };
}

export interface TplModel {
  slug: string;
  ORG: TplOrg;
  CAMPAIGN: TplCampaign & { active: boolean };
  CAMPAIGNS: TplCampaign[];
  ANIMALS: TplAnimal[];
  animalTotal: number;
  COUNTS: {
    total: number;
    perros: number;
    gatos: number;
    otros: number;
    nuevos: number;
    seniors: number;
    cachorros: number;
  };
  NEEDS: TplNeed[];
  PRODUCTS: TplProduct[];
  REVIEWS: TplReview[];
  LEDGER: TplLedger;
  SOCIALS: TplSocial[];
  BADGES: TplBadge[];
  /** Reglas de visibilidad (idénticas a `OrgPublicPage`). */
  SHOW: {
    transparencia: boolean;
    nosotros: boolean;
    contacto: boolean;
    redes: boolean;
  };
}

/** Textos fijos, los MISMOS del portal clásico. */
export const COPY = {
  adoptNote: 'Tu aporte es transparente: verás el desglose completo antes de pagar.',
  helpTitle: 'Pequeñas acciones, grandes cambios',
  helpText:
    'Tu apoyo nos permite seguir rescatando, cuidando y encontrando hogares para más animales.',
  helpCta: 'Quiero donar',
  socialsTitle: 'Síguenos',
  socialsText: 'Conoce más de nuestro trabajo y acompáñanos en redes sociales.',
  ledgerTitle: 'Transparencia — libro público',
  ledgerText: 'Cada donación recibida y cada gasto ejecutado, con fecha y soporte.',
  accountability:
    'Rendición de cuentas: disponible cuando la organización tenga campañas y donaciones.',
} as const;

export const EMPTY = {
  animales: 'Esta organización no tiene animales en adopción ahora.',
  productos: 'Esta organización no tiene productos activos en el marketplace por ahora.',
  necesidades: 'Esta organización todavía no ha publicado necesidades en el banco de recursos.',
  campana: 'Esta organización no tiene una campaña de recaudación activa por ahora.',
  resenas: 'Aún no hay reseñas para esta organización. ¡Sé el primero en dejar una!',
  libro:
    'Esta organización aún no ha registrado movimientos. Cuando reciba donaciones o registre gastos, aparecerán aquí.',
} as const;

const FORMALIZATION_LABELS: Record<FormalizationState, string> = {
  [FormalizationState.Informal]: 'Informal',
  [FormalizationState.EnProceso]: 'En proceso',
  [FormalizationState.Formalizada]: 'Formalizada',
  [FormalizationState.ESAL]: 'ESAL',
  [FormalizationState.ESAL_RTE]: 'ESAL + RTE',
};

const ORG_TYPE_LABELS: Record<string, string> = {
  foundation: 'Fundación',
  association: 'Asociación',
  corporation: 'Corporación',
  shelter: 'Refugio',
  natural_person: 'Persona natural',
  other: 'Otro',
};

const GENERIC_PREFIX =
  /^(fundaci[oó]n|refugio|asociaci[oó]n|corporaci[oó]n|albergue|hogar|colectivo)\s+(de\s+|para\s+)?/i;

const COLOMBIA_TZ = 'America/Bogota';

function dateLabel(iso: string, opts: Intl.DateTimeFormatOptions): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-CO', { timeZone: COLOMBIA_TZ, ...opts });
}

/** Hash estable (FNV-1a) para elegir la paleta del retrato ilustrado. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const COATS = [
  { bg: '#2B2B33', fig: '#121216', ear: '#0B0B0E', snout: '#2E2E36', light: false },
  { bg: '#7B5D45', fig: '#4A3526', ear: '#3A291D', snout: '#6B4E38', light: false },
  { bg: '#E7E2DA', fig: '#FBFAF7', ear: '#E6DFD5', snout: '#EFE9E1', light: true },
  { bg: '#C99F69', fig: '#8E6534', ear: '#6F4E27', snout: '#B88A52', light: false },
  { bg: '#8C96A3', fig: '#4F5966', ear: '#3E4651', snout: '#6E7885', light: false },
  { bg: '#E9CFA4', fig: '#D9B07A', ear: '#B98B53', snout: '#F2DEBE', light: true },
  { bg: '#D98C5F', fig: '#A65A2E', ear: '#7E4220', snout: '#C9814F', light: false },
  { bg: '#B08A5E', fig: '#8A6440', ear: '#5E4129', snout: '#A9845B', light: false },
] as const;

const CAT_EYES = ['#F4B942', '#7FB069', '#6E8A9A', '#E0A243'];
const PATTERNS = ['none', 'none', 'none', 'patch', 'mask'] as const;

function speciesOf(a: AnimalSummary): Species {
  return a.species === 'dog' ? 'perro' : a.species === 'cat' ? 'gato' : 'otro';
}

function ageText(totalMonths: number): string {
  if (totalMonths < 12) return totalMonths <= 1 ? '< 1 mes' : `${totalMonths} meses`;
  const y = Math.floor(totalMonths / 12);
  const m = totalMonths % 12;
  return (y === 1 ? '1 año' : `${y} años`) + (m && y < 3 ? ` y ${m} m` : '');
}

function toAnimal(
  slug: string,
  organizationId: string,
  a: AnimalSummary,
  i: number,
  now: Date,
): TplAnimal {
  const sp = speciesOf(a);
  const female = a.sex === 'female';
  const h = hash(a.id);
  const coat = COATS[h % COATS.length];
  const months = a.computedAge?.totalMonths ?? 0;
  const hasAge = Boolean(a.computedAge);
  const sizeBase = a.size === 'small' ? 'Pequeño' : a.size === 'large' ? 'Grande' : 'Mediano';
  const sizeLabel = female ? sizeBase.replace(/o$/, 'a') : sizeBase;
  const stage = !hasAge
    ? ''
    : months < 12
      ? sp === 'gato'
        ? 'Gatito'
        : 'Cachorro'
      : months < 36
        ? 'Joven'
        : months < 96
          ? 'Adulto'
          : 'Senior';
  const created = a.createdAt ? new Date(a.createdAt).getTime() : NaN;
  const days = Number.isNaN(created)
    ? 0
    : Math.max(0, Math.floor((now.getTime() - created) / 864e5));
  const spLabel =
    sp === 'perro'
      ? female
        ? 'Perra'
        : 'Perro'
      : sp === 'gato'
        ? female
          ? 'Gata'
          : 'Gato'
        : 'Otro';
  const pattern = sp === 'gato' && h % 5 === 0 ? 'stripes' : PATTERNS[(h >>> 3) % PATTERNS.length];
  return {
    i,
    id: esc(a.id),
    name: esc(a.name),
    sp,
    spLabel,
    sex: a.sex === 'female' ? 'Hembra' : a.sex === 'male' ? 'Macho' : '',
    size: sizeBase,
    sizeLabel,
    months,
    hasAge,
    age: hasAge ? (a.computedAge?.approximate ? '~' : '') + ageText(months) : 'Edad sin registrar',
    stage,
    breed: esc(a.breed ?? ''),
    coatLabel: '',
    isNew: isRecentlyPublished(a.createdAt, now),
    days,
    photo: safeImgSrc(a.photoUrl),
    href: esc(publicAnimalDetailHref(slug, a.id)),
    adoptHref: esc(buildAdoptionRequestHref(organizationId, a)),
    sponsorHref: esc(buildSponsorHref(a)),
    bg: coat.bg,
    fig: coat.fig,
    ear: coat.ear,
    snout: coat.snout,
    light: coat.light,
    eye: sp === 'gato' ? CAT_EYES[h % CAT_EYES.length] : coat.light ? '#3A2A1C' : '#1A120C',
    pattern,
    ears: sp === 'gato' ? 'cat' : (h >>> 5) % 2 ? 'floppy' : 'pointy',
  };
}

function toCampaign(c: CampaignPublic, now: Date): TplCampaign {
  const goal = Math.max(0, c.goalAmount);
  const raised = Math.max(0, c.raisedAmount);
  const end = new Date(c.deadline).getTime();
  return {
    id: esc(c.id),
    title: esc(c.title),
    description: esc(c.description ?? ''),
    category: esc(CAMPAIGN_CATEGORY_LABELS[c.category] ?? ''),
    raised,
    goal,
    pct: goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0,
    deadline: esc(dateLabel(c.deadline, { day: 'numeric', month: 'short', year: 'numeric' })),
    deadlineShort: esc(
      dateLabel(c.deadline, { day: '2-digit', month: '2-digit', year: 'numeric' }),
    ),
    deadlineISO: esc(c.deadline),
    daysLeft: Number.isNaN(end) ? 0 : Math.max(0, Math.ceil((end - now.getTime()) / 864e5)),
    href: esc(publicCampaignDetailHref(c.id)),
  };
}

const EMPTY_CAMPAIGN: TplCampaign = {
  id: '',
  title: '',
  description: '',
  category: '',
  raised: 0,
  goal: 0,
  pct: 0,
  deadline: '',
  deadlineShort: '',
  deadlineISO: '',
  daysLeft: 0,
  href: '',
};

const PRODUCT_ART: Record<string, TplProduct['art']> = {
  accessories: 'collar',
  toys: 'collar',
  food: 'bag',
  medicine: 'bag',
  hygiene: 'mug',
  other: 'bag',
};
const PRODUCT_TINTS = ['#E9CFA4', '#D98C5F', '#8C96A3', '#C99F69'];

function displayHandle(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, '');
    return (u.hostname.replace(/^www\./, '') + path).slice(0, 60);
  } catch {
    return '';
  }
}

function buildSocials(org: OrganizationPublic): TplSocial[] {
  const out: TplSocial[] = [];
  const links = org.socialLinks ?? {};
  const meta = [
    ['instagram', 'Instagram'],
    ['facebook', 'Facebook'],
    ['tiktok', 'TikTok'],
    ['website', 'Sitio web'],
  ] as const;
  for (const [key, label] of meta) {
    const raw = links[key];
    // Solo enlaces absolutos http(s): una red nunca apunta a una ruta interna.
    const url = raw && /^https?:\/\//i.test(raw.trim()) ? safeHref(raw) : null;
    if (url)
      out.push({ key, label, handle: esc(displayHandle(raw as string)), url, external: true });
  }
  const wa = waHref(org.whatsapp);
  if (wa)
    out.push({
      key: 'whatsapp',
      label: 'WhatsApp',
      handle: esc(org.whatsapp),
      url: wa,
      external: true,
    });
  const mail = mailHref(org.contactEmail);
  if (mail)
    out.push({
      key: 'email',
      label: 'Correo',
      handle: esc(org.contactEmail),
      url: mail,
      external: false,
    });
  return out;
}

/** Arma el view-model saneado de una organización. `now` es inyectable para pruebas. */
const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

/** Filas del libro que la plantilla muestra sin abrir el diálogo. */
const LEDGER_PREVIEW = 5;

function ledgerDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

function buildLedger(page: PublicLedgerPage | null | undefined): TplLedger {
  const totals = page?.totals;
  return {
    rows: (page?.items ?? []).slice(0, LEDGER_PREVIEW).map((e) => {
      const income = e.kind === LedgerEntryKind.Income;
      return {
        id: esc(e.id),
        date: esc(ledgerDate(e.occurredOn)),
        concept: esc(e.concept),
        category: esc(LEDGER_CATEGORY_LABELS[e.category] ?? ''),
        amount: `${income ? '+' : '−'} ${esc(COP.format(Math.max(0, e.amountCop)))}`,
        income,
        online: e.source === LedgerSource.OnlineDonation,
        support: Boolean(e.hasSupport),
        voided: Boolean(e.voided),
        voidReason: esc(e.voidReason ?? ''),
      };
    }),
    income: esc(COP.format(totals?.incomeCop ?? 0)),
    expense: esc(COP.format(totals?.expenseCop ?? 0)),
    balance: esc(COP.format(totals?.balanceCop ?? 0)),
    count: totals?.entryCount ?? 0,
    last: totals?.lastEntryOn ? esc(ledgerDate(totals.lastEntryOn)) : '',
  };
}

export function buildTemplateModel(src: TemplateSourceData, now: Date = new Date()): TplModel {
  const org = src.organization;
  const name = org.name ?? '';
  const short = name.replace(GENERIC_PREFIX, '').trim() || name;
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  const state = org.formalizationState;
  const level = org.verificationLevel?.level ?? 0;
  const contact = org.extendedContact;
  const phones = (contact?.additionalPhones ?? []).filter((p) => p.trim());
  const location = org.location;
  const mapEmbed =
    (contact?.mapUrl ? toGoogleMapsEmbedUrl(contact.mapUrl) : null) ??
    googleMapsEmbedFromAddress(
      contact?.fullAddress,
      location?.city,
      location?.department,
      location?.country ?? 'Colombia',
    );
  const about = (org.aboutUs ?? '').trim();
  const hasContact = Boolean(
    contact && (contact.hours || contact.fullAddress || contact.mapUrl || phones.length > 0),
  );

  const animals = src.animals.map((a, i) => toAnimal(src.slug, org.id, a, i, now));
  const campaigns = src.campaigns.map((c) => toCampaign(c, now));
  const socials = buildSocials(org);

  const badges: TplBadge[] = [];
  if (state)
    badges.push({
      t: FORMALIZATION_LABELS[state] ?? esc(state),
      ok: state === FormalizationState.ESAL,
    });
  if (org.rteVigente) badges.push({ t: 'RTE vigente', ok: true });

  return {
    slug: esc(src.slug),
    ORG: {
      id: esc(org.id),
      name: esc(name),
      short: esc(short),
      initials: esc(initials),
      type: org.organizationType
        ? esc(ORG_TYPE_LABELS[org.organizationType] ?? org.organizationType)
        : '',
      city: esc(location?.city ?? ''),
      dept: esc(location?.department ?? ''),
      place: esc(
        [location?.city, location?.department, location?.country].filter(Boolean).join(', '),
      ),
      lede: esc((org.description ?? '').trim()),
      about: esc(about).replace(/\r?\n/g, '<br>'),
      level,
      levelLabel: esc(org.verificationLevel?.label ?? ''),
      formalization: state ? deriveFormalizationPct(state) : 0,
      formalLabel: state ? (FORMALIZATION_LABELS[state] ?? esc(state)) : '',
      isEsal: state === FormalizationState.ESAL,
      rte: Boolean(org.rteVigente),
      nit: esc(org.nit ?? ''),
      accountability: COPY.accountability,
      accountabilityLabel: 'No disponible',
      logo: safeImgSrc(org.logoUrl),
      cover: safeImgSrc(org.coverPhotos?.[0]),
      donateHref: esc(buildDonateHref(org)),
      contact: {
        hours: esc(contact?.hours ?? ''),
        fullAddress: esc(contact?.fullAddress ?? ''),
        phones: phones.map(esc),
        phoneHrefs: phones.map(telHref),
        mapEmbed: mapEmbed ? safeHref(mapEmbed) : null,
        mapHref:
          contact?.mapUrl && /^https?:\/\//i.test(contact.mapUrl) ? safeHref(contact.mapUrl) : null,
      },
    },
    CAMPAIGN: { ...(campaigns[0] ?? EMPTY_CAMPAIGN), active: campaigns.length > 0 },
    CAMPAIGNS: campaigns,
    ANIMALS: animals,
    animalTotal: Math.max(src.animalTotal, animals.length),
    COUNTS: {
      total: Math.max(src.animalTotal, animals.length),
      perros: animals.filter((a) => a.sp === 'perro').length,
      gatos: animals.filter((a) => a.sp === 'gato').length,
      otros: animals.filter((a) => a.sp === 'otro').length,
      nuevos: animals.filter((a) => a.isNew).length,
      seniors: animals.filter((a) => a.stage === 'Senior').length,
      cachorros: animals.filter((a) => a.hasAge && a.months < 12).length,
    },
    NEEDS: src.needs.map((n) => ({
      id: esc(n.id),
      title: esc(n.title),
      category: esc(NEED_CATEGORY_LABELS[n.category] ?? ''),
      need: Math.max(0, n.quantityNeeded),
      got: Math.max(0, n.quantityFulfilled),
      unit: esc(n.unit),
      pct:
        n.quantityNeeded > 0
          ? Math.min(100, Math.round((n.quantityFulfilled / n.quantityNeeded) * 100))
          : 0,
      href: esc(publicResourceNeedHref(n.id)),
    })),
    PRODUCTS: src.products.map((p, i) => {
      const first = [...(p.images ?? [])].sort((a, b) => a.order - b.order)[0];
      return {
        id: esc(p.id),
        name: esc(p.name),
        category: esc(PRODUCT_CATEGORY_LABELS[p.category] ?? ''),
        price: Math.max(0, p.price),
        img: safeImgSrc(first?.url),
        href: esc(publicProductHref(p.id)),
        art: PRODUCT_ART[p.category] ?? 'bag',
        tint: PRODUCT_TINTS[i % PRODUCT_TINTS.length],
      };
    }),
    REVIEWS: src.reviews.map((r) => ({
      id: esc(r.id),
      name: esc(r.authorName?.trim() || 'Anónimo'),
      rating: Math.max(0, Math.min(5, Math.round(r.rating))),
      date: esc(dateLabel(r.createdAt, { month: 'short', year: 'numeric' })),
      text: esc(r.comment ?? ''),
    })),
    LEDGER: buildLedger(src.ledger),
    SOCIALS: socials,
    BADGES: badges,
    SHOW: {
      transparencia: level > 0,
      nosotros: about.length > 0,
      contacto: hasContact,
      redes: socials.length > 0,
    },
  };
}
