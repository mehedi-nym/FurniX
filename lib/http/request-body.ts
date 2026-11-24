export class RequestBodyError extends Error {
  readonly status: 400 | 413 | 415;

  constructor(status: 400 | 413 | 415, message: string) {
    super(message);
    this.status = status;
  }
}

function toBlob(chunks: Uint8Array[]) {
  const parts = chunks.map((chunk) => {
    const copy = new Uint8Array(chunk.byteLength);
    copy.set(chunk);
    return copy.buffer;
  });
  return new Blob(parts);
}

/** Bounds request bytes independently of Content-Length before decoding JSON. */
export async function readBoundedJson(request: Request, maxBytes: number): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new RequestBodyError(415, "Invalid request content type.");
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestBodyError(413, "Request is too large.");
  }
  if (!request.body) throw new RequestBodyError(400, "Invalid request body.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new RequestBodyError(413, "Request is too large.");
      }
      chunks.push(value);
    }
    return JSON.parse(await toBlob(chunks).text()) as unknown;
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError(400, "Invalid request body.");
  } finally {
    reader.releaseLock();
  }
}

/** Reads multipart input with a hard cap even when Content-Length is missing or forged. */
export async function readQuoteFormData(request: Request, maxBytes: number): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    throw new RequestBodyError(415, "Use the quotation form to submit your request.");
  }
  if (!request.body) throw new RequestBodyError(400, "The submitted form could not be read.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new RequestBodyError(413, "Please reduce the total size of your attachments to 9 MB.");
      }
      chunks.push(value);
    }
    return await new Response(toBlob(chunks), { headers: { "content-type": contentType } }).formData();
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError(400, "The submitted form could not be read.");
  } finally {
    reader.releaseLock();
  }
}
