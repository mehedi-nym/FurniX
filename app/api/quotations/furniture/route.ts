import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { furnitureQuoteSchema } from "@/lib/quotations/furniture-schema";
import { createQuoteCustomer } from "@/lib/quotations/server";
import { prepareQuoteAttachments, QuoteAttachmentError, removeQuoteAttachments, uploadQuoteAttachments, type PreparedQuoteAttachment } from "@/lib/quotations/attachments";

export const runtime = "nodejs";

const maxRequestBytes = 9 * 1024 * 1024;

function textField(data: FormData, name: string) {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) {
        return NextResponse.json({ error: "Unable to submit this request." }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Unable to submit this request." }, { status: 403 });
    }
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > maxRequestBytes) {
    return NextResponse.json({ error: "Please reduce the total size of your attachments to 9 MB." }, { status: 413 });
  }

  let form: FormData;
  try {
    if (!request.headers.get("content-type")?.toLowerCase().includes("multipart/form-data")) {
      return NextResponse.json({ error: "Use the quotation form to submit your request." }, { status: 415 });
    }
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "The submitted form could not be read." }, { status: 400 });
  }

  if (textField(form, "website")) return NextResponse.json({ error: "Unable to submit this request." }, { status: 400 });

  const rawQuantity = textField(form, "quantity");
  const payload = {
    fullName: textField(form, "fullName"),
    email: textField(form, "email"),
    phone: textField(form, "phone"),
    furnitureType: textField(form, "furnitureType"),
    width: textField(form, "width"),
    depth: textField(form, "depth"),
    height: textField(form, "height"),
    dimensionUnit: textField(form, "dimensionUnit"),
    materialPreferences: form.getAll("materialPreferences").filter((value): value is string => typeof value === "string"),
    materialNotes: textField(form, "materialNotes"),
    woodType: textField(form, "woodType"),
    color: textField(form, "color"),
    finishing: textField(form, "finishing"),
    quantity: /^\d+$/.test(rawQuantity) ? Number(rawQuantity) : NaN,
    description: textField(form, "description"),
    requirements: textField(form, "requirements"),
    sourceProductId: textField(form, "sourceProductId") || undefined,
  };
  const parsed = furnitureQuoteSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: "Please check the required details and try again." }, { status: 400 });

  const input = parsed.data;
  const dimensionEntries = (["width", "depth", "height"] as const)
    .filter((key) => input[key] !== "")
    .map((key) => [key, Number(input[key])] as const);
  if (dimensionEntries.some(([, value]) => !Number.isFinite(value) || value <= 0 || value > 10000)) {
    return NextResponse.json({ error: "Dimensions must be positive values within the supported range." }, { status: 400 });
  }
  const dimensions: Record<string, number | string> = Object.fromEntries(dimensionEntries);
  if (dimensionEntries.length) dimensions.unit = input.dimensionUnit;

  let fileBuffers: PreparedQuoteAttachment[];
  try {
    fileBuffers = await prepareQuoteAttachments(form.getAll("attachments"));
  } catch (error) {
    if (error instanceof QuoteAttachmentError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "A reference file could not be read." }, { status: 400 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Quotation requests are temporarily unavailable." }, { status: 503 });
  }
  const uploadedPaths: string[] = [];
  let customerId: string | null = null;
  let createdCustomer = false;
  let quoteRequestId: string | null = null;
  const reference = `FQR-${randomBytes(8).toString("hex").toUpperCase()}`;

  try {
    let sourceProduct: { id: string; name: string } | null = null;
    if (input.sourceProductId) {
      const { data, error } = await admin.from("products").select("id,name")
        .eq("id", input.sourceProductId).eq("is_published", true).maybeSingle();
      if (error || !data) return NextResponse.json({ error: "The selected product is no longer available." }, { status: 422 });
      sourceProduct = data;
    }

    const customer = await createQuoteCustomer(admin, input);
    customerId = customer.customerId;
    createdCustomer = customer.created;

    const { data: quote, error: quoteError } = await admin.from("quote_requests").insert({
      public_reference: reference,
      customer_id: customerId,
      description: input.description,
      contact_name: input.fullName,
      contact_email: input.email.trim().toLowerCase(),
      contact_phone: input.phone,
    }).select("id").single();
    if (quoteError || !quote) throw new Error("quote request insert failed");
    quoteRequestId = quote.id;

    const requirementLines = [input.requirements, input.materialNotes ? `Material notes: ${input.materialNotes}` : ""]
      .filter(Boolean).join("\n\n") || null;
    const { error: itemError } = await admin.from("quote_request_items").insert({
      quote_request_id: quote.id,
      source_product_id: sourceProduct?.id ?? null,
      furniture_type: sourceProduct?.name ?? input.furnitureType,
      dimensions,
      material_preferences: input.materialPreferences,
      wood_type: input.woodType || null,
      color: input.color || null,
      finishing: input.finishing || null,
      quantity: input.quantity,
      requirements: requirementLines,
    });
    if (itemError) throw new Error("quote item insert failed");

    const uploaded = await uploadQuoteAttachments(admin, "furniture", quote.id, fileBuffers);
    uploadedPaths.push(...uploaded.map((item) => item.storagePath));
    const mediaRows = uploaded.map((item) => ({
        quote_request_id: quote.id,
        storage_path: item.storagePath,
        media_type: item.mediaType,
        original_filename: item.originalFilename,
        content_type: item.contentType,
        byte_size: item.byteSize,
      }));
    if (mediaRows.length) {
      const { error } = await admin.from("quote_request_media").insert(mediaRows);
      if (error) throw new Error("file record insert failed");
    }
    return NextResponse.json({ reference }, { status: 201 });
  } catch {
    await removeQuoteAttachments(admin, uploadedPaths);
    if (quoteRequestId) await admin.from("quote_requests").delete().eq("id", quoteRequestId);
    if (createdCustomer && customerId) await admin.from("customers").delete().eq("id", customerId);
    return NextResponse.json({ error: "We could not submit your request. Please try again." }, { status: 503 });
  }
}
