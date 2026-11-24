import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { furnitureQuoteSchema } from "@/lib/quotations/furniture-schema";

export const runtime = "nodejs";

const maxRequestBytes = 9 * 1024 * 1024;
const maxFileBytes = 5 * 1024 * 1024;
const maxFiles = 5;
const bucket = "customer-uploads";
const extensions: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "video/mp4": "mp4", "video/webm": "webm", "application/pdf": "pdf",
};

function textField(data: FormData, name: string) {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

function matchesSignature(type: string, bytes: Uint8Array) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte);
  if (type === "image/webp") return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (type === "application/pdf") return String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  if (type === "video/mp4") return String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";
  if (type === "video/webm") return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  return false;
}

async function resolveVerifiedCustomerId(admin: ReturnType<typeof createAdminClient>) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email_confirmed_at || user.is_anonymous) return null;
    const { data } = await admin.from("customer_auth_links")
      .select("customer_id")
      .eq("user_id", user.id)
      .not("verified_at", "is", null)
      .maybeSingle();
    return data ? data.customer_id as string : null;
  } catch {
    return null;
  }
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

  const files = form.getAll("attachments").filter((value): value is File => value instanceof File && value.size > 0);
  if (form.getAll("attachments").some((value) => !(value instanceof File)) || files.length > maxFiles) {
    return NextResponse.json({ error: "Attach up to five reference files." }, { status: 400 });
  }
  if (files.some((file) => file.size > maxFileBytes) || files.reduce((total, file) => total + file.size, 0) > maxRequestBytes - 128 * 1024) {
    return NextResponse.json({ error: "Each file must be 5 MB or smaller, with a total attachment limit of 9 MB." }, { status: 413 });
  }

  const fileBuffers: Array<{ file: File; bytes: Uint8Array; extension: string }> = [];
  try {
    for (const file of files) {
      const extension = extensions[file.type];
      if (!extension) return NextResponse.json({ error: "Use JPEG, PNG, WebP, MP4, WebM, or PDF files." }, { status: 415 });
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!matchesSignature(file.type, bytes)) return NextResponse.json({ error: `The file “${file.name.slice(0, 80)}” does not match its file type.` }, { status: 415 });
      fileBuffers.push({ file, bytes, extension });
    }
  } catch {
    return NextResponse.json({ error: "A reference file could not be read." }, { status: 400 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Quotation requests are temporarily unavailable." }, { status: 503 });
  }
  const uploadedPaths: string[] = [];
  let customerId = await resolveVerifiedCustomerId(admin);
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

    if (!customerId) {
      const { data: customer, error } = await admin.from("customers").insert({
        full_name: input.fullName,
        email: input.email.trim().toLowerCase(),
        phone: input.phone,
      }).select("id").single();
      if (error || !customer) throw new Error("customer insert failed");
      customerId = customer.id;
      createdCustomer = true;
    }

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

    const mediaRows = [];
    for (const { file, bytes, extension } of fileBuffers) {
      const path = `furniture-requests/${quote.id}/${randomUUID()}.${extension}`;
      const { error } = await admin.storage.from(bucket).upload(path, bytes, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });
      if (error) throw new Error("file upload failed");
      uploadedPaths.push(path);
      mediaRows.push({
        quote_request_id: quote.id,
        storage_path: path,
        media_type: file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "document",
        original_filename: file.name.slice(0, 255),
        content_type: file.type,
        byte_size: file.size,
      });
    }
    if (mediaRows.length) {
      const { error } = await admin.from("quote_request_media").insert(mediaRows);
      if (error) throw new Error("file record insert failed");
    }
    return NextResponse.json({ reference }, { status: 201 });
  } catch {
    if (uploadedPaths.length) await admin.storage.from(bucket).remove(uploadedPaths);
    if (quoteRequestId) await admin.from("quote_requests").delete().eq("id", quoteRequestId);
    if (createdCustomer && customerId) await admin.from("customers").delete().eq("id", customerId);
    return NextResponse.json({ error: "We could not submit your request. Please try again." }, { status: 503 });
  }
}
