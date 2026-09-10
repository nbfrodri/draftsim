import { MAX_SHARE_OUTPUT_BYTES,assertShareInputSize,base64UrlDecode,base64UrlEncode,deflateString,inflateString } from "./shareCodec";
// REAL1: compressed share codes for franchise realities (same deflate-base64
// pattern as TOUR1: tournament codes).

const REALITY_CODE_PREFIX = "REAL1:";
/** Reality files can contain a century of archives; match the decoded-code limit. */
export function assertRealityJsonSize(input: string): void {
  if (input.length > MAX_SHARE_OUTPUT_BYTES || new TextEncoder().encode(input).byteLength > MAX_SHARE_OUTPUT_BYTES) {
    throw new Error("Reality exceeds the 128 MiB uncompressed limit.");
  }
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
  try { if (input.trimStart().startsWith("{")) assertRealityJsonSize(input); else assertShareInputSize(input); } catch (error) {
    return { json: null, error: (error as Error).message };
  }
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
