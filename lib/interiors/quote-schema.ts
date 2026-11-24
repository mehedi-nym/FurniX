import { z } from "zod";

export const interiorRoomTypes = [
  "living_room", "master_bedroom", "guest_bedroom", "kids_room", "kitchen", "washroom", "dining_room", "balcony", "office",
] as const;

export const interiorScopeTypes = [
  "complete_interior", "furniture_only", "wall_decoration", "ceiling_lighting", "kitchen_interior", "bedroom_interior", "partial_renovation", "full_renovation",
] as const;

const roomSchema = z.object({
  roomType: z.enum(interiorRoomTypes),
  quantity: z.number().int().min(1).max(30),
  area: z.number().finite().positive().max(100000).optional(),
  notes: z.string().trim().max(500),
}).strict();

export const interiorQuoteSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,24}$/)
    .refine((value) => value.replace(/\D/g, "").length >= 7 && value.replace(/\D/g, "").length <= 20),
  propertyType: z.enum(["residential", "commercial", "office", "other"]),
  totalSquareFeet: z.number().finite().positive().max(1000000),
  floorCount: z.number().int().min(1).max(100),
  addressLine1: z.string().trim().min(3).max(240),
  locality: z.string().trim().min(1).max(120),
  district: z.string().trim().min(1).max(120),
  readinessStatus: z.enum(["planning", "under_construction", "ready", "occupied", "renovation"]),
  rooms: z.array(roomSchema).min(1).max(9),
  designStyles: z.array(z.enum(["modern", "minimalist", "royal", "classic", "contemporary"])).max(5),
  preferredMaterials: z.array(z.enum(["solid_wood", "engineered_wood", "stone", "glass", "metal", "fabric", "other"])).max(7),
  preferredColors: z.string().trim().max(500),
  furniturePreferences: z.string().trim().max(1000),
  lightingPreferences: z.string().trim().max(1000),
  wallDesignPreferences: z.string().trim().max(1000),
  ceilingDesignPreferences: z.string().trim().max(1000),
  scopeOfWork: z.array(z.enum(interiorScopeTypes)).min(1).max(8),
  description: z.string().trim().min(10).max(5000),
  referenceIds: z.array(z.uuid()).max(12),
}).strict().superRefine((value, context) => {
  if (new Set(value.referenceIds).size !== value.referenceIds.length) {
    context.addIssue({ code: "custom", path: ["referenceIds"], message: "Remove duplicate references." });
  }
  if (new Set(value.rooms.map((room) => room.roomType)).size !== value.rooms.length) {
    context.addIssue({ code: "custom", path: ["rooms"], message: "Each room type should be listed once." });
  }
  if (new Set(value.scopeOfWork).size !== value.scopeOfWork.length) {
    context.addIssue({ code: "custom", path: ["scopeOfWork"], message: "Remove duplicate work scopes." });
  }
});

export type InteriorQuoteInput = z.infer<typeof interiorQuoteSchema>;
