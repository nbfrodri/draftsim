/** Resource limits apply before base64 decoding and while streaming inflation. */
export const MAX_SHARE_INPUT_CHARS = 64 * 1024 * 1024;
export const MAX_SHARE_OUTPUT_BYTES = 128 * 1024 * 1024;

export function assertShareInputSize(input: string): void {
  if (input.length > MAX_SHARE_INPUT_CHARS) throw new Error("Import exceeds the 64 MiB input limit.");
}

export async function deflateString(input: string): Promise<Uint8Array> {
  if (new TextEncoder().encode(input).byteLength > MAX_SHARE_OUTPUT_BYTES) {
    throw new Error("Export exceeds the 128 MiB uncompressed limit.");
  }
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
