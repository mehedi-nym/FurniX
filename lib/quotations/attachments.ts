import "server-only";

import { randomUUID } from "node:crypto";

const maxRequestBytes = 9 * 1024 * 1024;
const maxFileBytes = 5 * 1024 * 1024;
const maxFiles = 5;
const bucket = "customer-uploads";
const extensions: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "video/mp4": "mp4", "video/webm": "webm", "application/pdf": "pdf",
};

export class QuoteAttachmentError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export type PreparedQuoteAttachment = {
  file: File;
  bytes: Uint8Array;
  extension: string;
  mediaType: "image" | "video" | "document";
};

export type UploadedQuoteAttachment = {
  storagePath: string;
  mediaType: "image" | "video" | "document";
  originalFilename: string;
  contentType: string;
  byteSize: number;
};

function matchesSignature(type: string, bytes: Uint8Array) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte);
  if (type === "image/webp") return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (type === "application/pdf") return String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  if (type === "video/mp4") return String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";
  if (type === "video/webm") return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  return false;
}

export async function prepareQuoteAttachments(values: FormDataEntryValue[]): Promise<PreparedQuoteAttachment[]> {
  const files = values.filter((value): value is File => value instanceof File && value.size > 0);
  if (values.some((value) => typeof value !== "string" && !(value instanceof File)) || files.length > maxFiles) {
    throw new QuoteAttachmentError("Attach up to five reference files.", 400);
  }
  if (files.some((file) => file.size > maxFileBytes) || files.reduce((total, file) => total + file.size, 0) > maxRequestBytes - 128 * 1024) {
    throw new QuoteAttachmentError("Each file must be 5 MB or smaller, with a total attachment limit of 9 MB.", 413);
  }

  const prepared: PreparedQuoteAttachment[] = [];
  for (const file of files) {
    const extension = extensions[file.type];
    if (!extension) throw new QuoteAttachmentError("Use JPEG, PNG, WebP, MP4, WebM, or PDF files.", 415);
    let bytes: Uint8Array;
    try { bytes = new Uint8Array(await file.arrayBuffer()); }
    catch { throw new QuoteAttachmentError("A reference file could not be read.", 400); }
    if (!matchesSignature(file.type, bytes)) {
      throw new QuoteAttachmentError(`The file “${file.name.slice(0, 80)}” does not match its file type.`, 415);
    }
    const mediaType = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "document";
    prepared.push({ file, bytes, extension, mediaType });
  }
  return prepared;
}

export async function uploadQuoteAttachments(
  admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  requestType: "furniture" | "interior",
  requestId: string,
  files: PreparedQuoteAttachment[],
) {
  const uploaded: UploadedQuoteAttachment[] = [];
  try {
    for (const { file, bytes, extension, mediaType } of files) {
      const storagePath = `${requestType}-requests/${requestId}/${randomUUID()}.${extension}`;
      const { error } = await admin.storage.from(bucket).upload(storagePath, bytes, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });
      if (error) throw new Error("Could not upload a quotation attachment.");
      uploaded.push({
        storagePath,
        mediaType,
        originalFilename: file.name.slice(0, 255),
        contentType: file.type,
        byteSize: file.size,
      });
    }
  } catch {
    await removeQuoteAttachments(admin, uploaded.map((item) => item.storagePath));
    throw new Error("Could not upload a quotation attachment.");
  }
  return uploaded;
}

export async function removeQuoteAttachments(
  admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  paths: string[],
) {
  if (paths.length) await admin.storage.from(bucket).remove(paths);
}
