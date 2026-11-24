import { z } from "zod";

export const furnitureQuoteSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,24}$/)
    .refine((value) => value.replace(/\D/g, "").length >= 7 && value.replace(/\D/g, "").length <= 20),
  furnitureType: z.string().trim().min(2).max(120),
  width: z.string().trim().max(16),
  depth: z.string().trim().max(16),
  height: z.string().trim().max(16),
  dimensionUnit: z.enum(["mm", "cm", "in", "ft"]),
  materialPreferences: z.array(z.enum(["solid_wood", "engineered_wood", "metal", "glass", "fabric", "other"])).max(6),
  materialNotes: z.string().trim().max(300),
  woodType: z.string().trim().max(100),
  color: z.string().trim().max(100),
  finishing: z.string().trim().max(100),
  quantity: z.number().int().min(1).max(100),
  description: z.string().trim().min(10).max(5000),
  requirements: z.string().trim().max(3000),
  sourceProductId: z.string().uuid().optional(),
}).strict();

export type FurnitureQuoteInput = z.infer<typeof furnitureQuoteSchema>;
