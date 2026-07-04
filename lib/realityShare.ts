// REAL1: compressed share codes for franchise realities (same deflate-base64
// pattern as TOUR1: tournament codes).

const REALITY_CODE_PREFIX = "REAL1:";

async function deflateString(input: string): Promise<Uint8Array> {
  const stream = new Blob([input])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function inflateString(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return await new Response(stream).text();
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): Uint8Array {
  const sanitized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (sanitized.length % 4)) % 4;
  const padded = sanitized + "=".repeat(padding);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Encode a reality export JSON string to a REAL1: share code. */
export async function encodeRealityShareCode(exportJson: string): Promise<string> {
  const compressed = await deflateString(exportJson);
  return REALITY_CODE_PREFIX + base64UrlEncode(compressed);
}

export interface DecodeRealityShareResult {
  json: string | null;
  error: string | null;
}

/** Decode a REAL1: code (or pass through raw JSON exports). */
export async function decodeRealityShareCode(input: string): Promise<DecodeRealityShareResult> {
  const trimmed = input.trim();
  if (!trimmed.startsWith(REALITY_CODE_PREFIX)) {
    return trimmed.startsWith("{") ? { json: trimmed, error: null } : { json: null, error: "Expected REAL1: code or JSON export." };
  }
  try {
    const b64 = trimmed.slice(REALITY_CODE_PREFIX.length);
    const bytes = base64UrlDecode(b64);
    const json = await inflateString(bytes);
    return { json, error: null };
  } catch (e) {
    return {
      json: null,
      error: `Invalid reality code: ${e instanceof Error ? e.message : "decode failed"}`,
    };
  }
}

export { REALITY_CODE_PREFIX };
