import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createQuoteCustomer } from "@/lib/quotations/server";
import { prepareQuoteAttachments, QuoteAttachmentError, removeQuoteAttachments, uploadQuoteAttachments, type PreparedQuoteAttachment } from "@/lib/quotations/attachments";
import { interiorQuoteSchema } from "@/lib/interiors/quote-schema";

export const runtime = "nodejs";
const maxRequestBytes = 9 * 1024 * 1024;

function textField(data: FormData, name: string) {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

function numberField(data: FormData, name: string) {
  const raw = textField(data, name).trim();
  return /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : NaN;
}

function stringFields(data: FormData, name: string) {
  return data.getAll(name).filter((value): value is string => typeof value === "string");
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) return NextResponse.json({ error: "Unable to submit this request." }, { status: 403 });
    } catch { return NextResponse.json({ error: "Unable to submit this request." }, { status: 403 }); }
  }
  if (Number(request.headers.get("content-length") ?? 0) > maxRequestBytes) {
    return NextResponse.json({ error: "Please reduce the total size of your attachments to 9 MB." }, { status: 413 });
  }

  let form: FormData;
  try {
    if (!request.headers.get("content-type")?.toLowerCase().includes("multipart/form-data")) {
      return NextResponse.json({ error: "Use the quotation form to submit your request." }, { status: 415 });
    }
    form = await request.formData();
  } catch { return NextResponse.json({ error: "The submitted form could not be read." }, { status: 400 }); }
  if (textField(form, "website")) return NextResponse.json({ error: "Unable to submit this request." }, { status: 400 });

  const rooms = stringFields(form, "roomTypes").map((roomType) => ({
    roomType,
    quantity: numberField(form, `room_quantity_${roomType}`),
    area: textField(form, `room_area_${roomType}`).trim() ? numberField(form, `room_area_${roomType}`) : undefined,
    notes: textField(form, `room_notes_${roomType}`),
  }));
  const raw = {
    fullName: textField(form, "fullName"),
    email: textField(form, "email"),
    phone: textField(form, "phone"),
    propertyType: textField(form, "propertyType"),
    totalSquareFeet: numberField(form, "totalSquareFeet"),
    floorCount: numberField(form, "floorCount"),
    addressLine1: textField(form, "addressLine1"),
    locality: textField(form, "locality"),
    district: textField(form, "district"),
    readinessStatus: textField(form, "readinessStatus"),
    rooms,
    designStyles: stringFields(form, "designStyles"),
    preferredMaterials: stringFields(form, "preferredMaterials"),
    preferredColors: textField(form, "preferredColors"),
    furniturePreferences: textField(form, "furniturePreferences"),
    lightingPreferences: textField(form, "lightingPreferences"),
    wallDesignPreferences: textField(form, "wallDesignPreferences"),
    ceilingDesignPreferences: textField(form, "ceilingDesignPreferences"),
    scopeOfWork: stringFields(form, "scopeOfWork"),
    description: textField(form, "description"),
    referenceIds: stringFields(form, "referenceIds"),
  };
  const parsed = interiorQuoteSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Please check the required details and try again." }, { status: 400 });
  const input = parsed.data;
  const roomCount = input.rooms.reduce((sum, room) => sum + room.quantity, 0);
  if (roomCount > 100) return NextResponse.json({ error: "The total number of rooms cannot exceed 100." }, { status: 400 });

  let attachments: PreparedQuoteAttachment[];
  try { attachments = await prepareQuoteAttachments(form.getAll("attachments")); }
  catch (error) {
    if (error instanceof QuoteAttachmentError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "A reference file could not be read." }, { status: 400 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try { admin = createAdminClient(); }
  catch { return NextResponse.json({ error: "Interior quotation requests are temporarily unavailable." }, { status: 503 }); }

  if (input.referenceIds.length) {
    const { data, error } = await admin.from("interior_references").select("id")
      .in("id", input.referenceIds).eq("is_published", true);
    if (error || data?.length !== input.referenceIds.length) {
      return NextResponse.json({ error: "One of the selected design references is no longer available." }, { status: 422 });
    }
  }

  const uploadedPaths: string[] = [];
  let quoteRequestId: string | null = null;
  let customerId: string | null = null;
  let createdCustomer = false;
  const reference = `IQR-${randomBytes(8).toString("hex").toUpperCase()}`;
  try {
    const customer = await createQuoteCustomer(admin, input);
    customerId = customer.customerId;
    createdCustomer = customer.created;

    const { data: quote, error: quoteError } = await admin.from("interior_quote_requests").insert({
      public_reference: reference,
      customer_id: customerId,
      contact_name: input.fullName,
      contact_email: input.email.trim().toLowerCase(),
      contact_phone: input.phone,
      property_type: input.propertyType,
      total_square_feet: input.totalSquareFeet,
      floor_count: input.floorCount,
      room_count: roomCount,
      location: { address_line1: input.addressLine1, locality: input.locality, district: input.district },
      readiness_status: input.readinessStatus,
      design_preferences: {
        styles: input.designStyles,
        materials: input.preferredMaterials,
        colors: input.preferredColors,
        furniture: input.furniturePreferences,
        lighting: input.lightingPreferences,
        wall_design: input.wallDesignPreferences,
        ceiling_design: input.ceilingDesignPreferences,
      },
      scope_of_work: input.scopeOfWork,
      description: input.description,
    }).select("id").single();
    if (quoteError || !quote) throw new Error("interior request insert failed");
    quoteRequestId = quote.id;

    const { error: roomsError } = await admin.from("interior_quote_request_rooms").insert(input.rooms.map((room) => ({
      request_id: quote.id,
      room_type: room.roomType,
      quantity: room.quantity,
      square_feet: room.area ?? null,
      notes: room.notes || null,
    })));
    if (roomsError) throw new Error("interior room insert failed");

    if (input.referenceIds.length) {
      const { error } = await admin.from("interior_quote_request_references").insert(input.referenceIds.map((referenceId) => ({
        request_id: quote.id,
        reference_id: referenceId,
      })));
      if (error) throw new Error("interior reference link insert failed");
    }

    const uploaded = await uploadQuoteAttachments(admin, "interior", quote.id, attachments);
    uploadedPaths.push(...uploaded.map((item) => item.storagePath));
    if (uploaded.length) {
      const { error } = await admin.from("interior_quote_request_media").insert(uploaded.map((item) => ({
        request_id: quote.id,
        storage_path: item.storagePath,
        media_type: item.mediaType,
        original_filename: item.originalFilename,
        content_type: item.contentType,
        byte_size: item.byteSize,
      })));
      if (error) throw new Error("interior media insert failed");
    }

    return NextResponse.json({ reference }, { status: 201 });
  } catch {
    await removeQuoteAttachments(admin, uploadedPaths);
    if (quoteRequestId) await admin.from("interior_quote_requests").delete().eq("id", quoteRequestId);
    if (createdCustomer && customerId) await admin.from("customers").delete().eq("id", customerId);
    return NextResponse.json({ error: "We could not submit your request. Please try again." }, { status: 503 });
  }
}
