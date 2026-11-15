import { z } from 'zod';
import { COFFEE_MAX_UNITS_PER_ORDER } from '@adoptafacil/contracts';

const uuid = z.string().guid();
const cop = (max: number) => z.number().int().min(0).max(max);
const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const uuidParamSchema = uuid;

export const createProductSchema = z.object({
  name: text(2, 120),
  presentationGrams: z.number().int().min(1).max(100_000),
  description: text(1, 2000).optional(),
  qrDomain: z.string().trim().toLowerCase().min(3).max(253),
});

const lotFields = {
  lotCode: text(1, 40),
  salePriceCop: cop(100_000_000).refine((v) => v > 0, 'Debe ser mayor que cero'),
  unitCostCop: cop(100_000_000),
  shippingFeeCop: cop(10_000_000),
  stockUnits: z.number().int().min(0).max(1_000_000),
  defaultCampaignId: uuid,
};

export const createLotSchema = z.object(lotFields);
export const updateLotSchema = z
  .object(lotFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nada que cambiar');

export const orderStatusQuerySchema = z.object({
  status: z
    .enum(['pending', 'paid', 'needs_refund', 'expired', 'rejected', 'cancelled', 'refunded'])
    .optional(),
});

export const createDeliverySchema = z.object({
  campaignId: uuid,
  amountCop: z
    .number()
    .int()
    .min(-100_000_000)
    .max(100_000_000)
    .refine((v) => v !== 0, 'El monto no puede ser cero'),
  deliveredOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
    .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Fecha inválida'),
  evidence: text(3, 1000),
});

export const checkoutSchema = z.object({
  lotId: uuid,
  quantity: z.number().int().min(1).max(COFFEE_MAX_UNITS_PER_ORDER),
  campaignId: uuid,
  buyer: z.object({
    fullName: text(3, 120),
    email: z.string().trim().toLowerCase().email().max(254),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{7,20}$/, 'Teléfono inválido'),
    address: text(5, 200),
    city: text(2, 80),
    department: text(2, 80),
  }),
  acceptPrivacy: z.literal(true, {
    message: 'Debes autorizar el tratamiento de tus datos para el envío.',
  }),
});

export const offerQuerySchema = z.object({ o: z.enum(['qr', 'web']).optional() });
