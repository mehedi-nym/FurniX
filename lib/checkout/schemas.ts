import { z } from "zod";

const dimensionValuesSchema = z.record(z.string().min(1).max(50), z.number().finite().min(0).max(10000));

export const checkoutItemSchema = z.object({
  productId: z.uuid(),
  variantId: z.uuid().nullable().optional(),
  quantity: z.number().int().min(1).max(20),
  customization: z.object({
    dimensions: dimensionValuesSchema.default({}),
    optionIds: z.array(z.uuid()).max(30).default([]),
    features: z.record(z.string().min(1).max(50), z.boolean()).default({}),
  }).default({}),
}).strict();

export const checkoutRequestSchema = z.object({
  customer: z.object({
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254),
    phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,24}$/)
      .refine((value) => value.replace(/\D/g, "").length >= 7 && value.replace(/\D/g, "").length <= 20),
  }).strict(),
  delivery: z.object({
    addressLine1: z.string().trim().min(3).max(240),
    addressLine2: z.string().trim().max(240).optional().default(""),
    locality: z.string().trim().min(1).max(120),
    district: z.string().trim().min(1).max(120),
    postalCode: z.string().trim().max(24).optional().default(""),
    deliveryNotes: z.string().trim().max(1000).optional().default(""),
    installationNotes: z.string().trim().max(1000).optional().default(""),
  }).strict(),
  shippingMethodId: z.uuid(),
}).strict();

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;
