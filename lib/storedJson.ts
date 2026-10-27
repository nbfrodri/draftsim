/**
 * Large archive rows are stored deflate-compressed inside a small JSON object,
 * so SQLite still sees a valid JSON object (backup validation, json_extract)
 * while the text is 5-7x smaller. Plain JSON rows stay readable.
 */
import { base64UrlDecode, base64UrlEncode, deflateString, inflateString } from "./shareCodec";

const PREFIX = '{"$z":"deflate-raw","d":"';

export function isCompressedStoredJson(text: string): boolean {
	return text.startsWith(PREFIX);
}

export async function compressStoredJson(json: string): Promise<string> {
	return `${PREFIX}${base64UrlEncode(await deflateString(json))}"}`;
}

/** Returns the original JSON text; plain JSON passes through unchanged. */
export async function decompressStoredJson(text: string): Promise<string> {
	if (!isCompressedStoredJson(text)) return text;
	let wrapper: { d?: unknown };
	try { wrapper = JSON.parse(text) as { d?: unknown }; } catch { throw new Error("Saved compressed data is invalid; refusing to overwrite it."); }
	if (typeof wrapper.d !== "string") throw new Error("Saved compressed data is invalid; refusing to overwrite it.");
	try { return await inflateString(base64UrlDecode(wrapper.d)); } catch { throw new Error("Saved compressed data is invalid; refusing to overwrite it."); }
}
