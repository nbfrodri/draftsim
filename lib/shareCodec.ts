/** Resource limits apply before base64 decoding and while streaming inflation. */
export const MAX_SHARE_INPUT_CHARS = 64 * 1024 * 1024;
export const MAX_SHARE_OUTPUT_BYTES = 128 * 1024 * 1024;

export function assertShareInputSize(input: string): void {
  if (input.length > MAX_SHARE_INPUT_CHARS) throw new Error("Import exceeds the 64 MiB input limit.");
}

/** Measure UTF-8 without allocating another buffer the size of a reality file. */
export function assertUtf8Size(input: string, maxBytes: number, message: string): void {
  if (input.length > maxBytes) throw new Error(message);
  const encoder = new TextEncoder();
  let bytes = 0;
  for (let start = 0; start < input.length;) {
    let end = Math.min(start + 64 * 1024, input.length);
    // Keep surrogate pairs together across chunks.
    const last = input.charCodeAt(end - 1);
    if (end < input.length && last >= 0xd800 && last <= 0xdbff) end--;
    bytes += encoder.encode(input.slice(start, end)).byteLength;
    if (bytes > maxBytes) throw new Error(message);
    start = end;
  }
}

export async function deflateString(input: string, maxBytes = MAX_SHARE_OUTPUT_BYTES): Promise<Uint8Array> {
  assertUtf8Size(input, maxBytes, `Export exceeds the ${maxBytes / 1024 / 1024} MiB uncompressed limit.`);
  const stream = new Blob([input]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function inflateString(bytes: Uint8Array, maxBytes = MAX_SHARE_OUTPUT_BYTES): Promise<string> {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const chunks: string[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new Error("Import exceeds the uncompressed size limit.");
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function base64UrlEncode(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  }
  const encoded = btoa(chunks.join("")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  assertShareInputSize(encoded);
  return encoded;
}

export function base64UrlDecode(input: string): Uint8Array {
  assertShareInputSize(input);
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
