/**
 * Streamed reality import: a long reality's export can be larger than the
 * longest string the engine can hold, so it is never joined into one text.
 * The scanner walks the JSON text chunk by chunk and cuts every element of
 * `reality.history` out as its own text; everything else forms a small
 * skeleton with `"history":[]`. Key order does not matter.
 *
 * Input is untrusted: only structure is tracked here; each part is still
 * parsed with JSON.parse and validated by the caller, with per-part limits.
 */

/** Hard cap on the whole decoded import (several times the 512 MiB single-text limit). */
export const MAX_STREAMED_IMPORT_CHARS = 2 * 1024 * 1024 * 1024;
/** Each archived year must still fit comfortably in one string. */
export const MAX_IMPORT_ENTRY_CHARS = 128 * 1024 * 1024;
export const MAX_IMPORT_ENTRIES = 5_000;
/** The skeleton (identity + live season) without its history. */
export const MAX_IMPORT_SKELETON_CHARS = 256 * 1024 * 1024;

export interface SplitRealityImport {
	/** JSON text of the whole document with `reality.history` emptied. */
	skeleton: string;
	/** JSON text of each history element, in order; null when the document has no history array. */
	history: string[] | null;
}

const tooLarge = (what: string) => new Error(`This reality file is too large to import (${what}).`);

type Frame = { kind: "object" | "array"; key: string | null; expectKey: boolean };

const MAX_KEY_CHARS = 256;

/** Splits a reality export into skeleton and per-year texts without building one string. */
export async function splitRealityImport(chunks: AsyncIterable<string>): Promise<SplitRealityImport> {
	const stack: Frame[] = [];
	const skeleton: string[] = [];
	let skeletonChars = 0;
	const history: string[] = [];
	let sawHistory = false;
	let total = 0;
	let inString = false, escaped = false;
	// Raw characters of the object key being read (outside history only), and the last key.
	let keyChars: string[] | null = null;
	let lastKey: string | null = null;
	// Stack depth of the history array while inside it, and the element being captured.
	let historyDepth = -1;
	let element: string[] | null = null, elementChars = 0;

	const pushSkeleton = (text: string) => {
		skeletonChars += text.length;
		if (skeletonChars > MAX_IMPORT_SKELETON_CHARS) throw tooLarge("season data");
		skeleton.push(text);
	};
	const atHistoryLevel = () => historyDepth >= 0 && stack.length === historyDepth + 1;
	const isHistoryArrayPath = () => stack.length === 2 && stack[0]!.key === "reality" && stack[1]!.kind === "object" && stack[1]!.key === "history";

	for await (const chunk of chunks) {
		total += chunk.length;
		if (total > MAX_STREAMED_IMPORT_CHARS) throw tooLarge("over 2 GiB");
		// Text before `from` has already been routed to the skeleton, an element, or dropped.
		let from = 0;
		const flushTo = (end: number) => {
			if (end <= from) return;
			const text = chunk.slice(from, end);
			if (element) {
				elementChars += text.length;
				if (elementChars > MAX_IMPORT_ENTRY_CHARS) throw tooLarge("an archived year over 128 MiB");
				element.push(text);
			} else if (historyDepth < 0) pushSkeleton(text);
			// Whitespace between history elements is dropped.
			from = end;
		};
		const startElement = (i: number) => { flushTo(i); element = []; elementChars = 0; };
		const endElement = (i: number) => {
			flushTo(i);
			history.push(element!.join(""));
			element = null;
			if (history.length > MAX_IMPORT_ENTRIES) throw tooLarge("too many archived years");
		};
		for (let i = 0; i < chunk.length; i++) {
			const c = chunk.charCodeAt(i);
			if (inString) {
				if (keyChars && keyChars.length <= MAX_KEY_CHARS) keyChars.push(chunk[i]!);
				if (escaped) escaped = false;
				else if (c === 92 /* \ */) escaped = true;
				else if (c === 34 /* " */) {
					inString = false;
					if (keyChars) {
						keyChars.pop(); // closing quote
						try { lastKey = keyChars.length <= MAX_KEY_CHARS ? JSON.parse(`"${keyChars.join("")}"`) as string : null; }
						catch { throw new Error("The file is not valid JSON or is truncated."); }
						keyChars = null;
					}
				}
				continue;
			}
			if (c === 34) {
				if (atHistoryLevel() && !element) startElement(i);
				inString = true;
				const top = stack[stack.length - 1];
				if (historyDepth < 0 && top?.kind === "object" && top.expectKey) keyChars = [];
				continue;
			}
			if (c === 58 /* : */) {
				const top = stack[stack.length - 1];
				if (top?.kind === "object" && top.expectKey) { top.key = lastKey; top.expectKey = false; }
				continue;
			}
			if (c === 44 /* , */) {
				if (atHistoryLevel() && element) { endElement(i); from = i + 1; continue; }
				const top = stack[stack.length - 1];
				if (top?.kind === "object") top.expectKey = true;
				continue;
			}
			if (c === 123 /* { */ || c === 91 /* [ */) {
				if (atHistoryLevel() && !element) startElement(i);
				if (historyDepth < 0 && c === 91 && isHistoryArrayPath()) {
					// "[" stays in the skeleton; each element is captured on its own.
					flushTo(i + 1);
					sawHistory = true;
					stack.push({ kind: "array", key: null, expectKey: false });
					historyDepth = stack.length - 1;
					continue;
				}
				stack.push({ kind: c === 123 ? "object" : "array", key: null, expectKey: c === 123 });
				continue;
			}
			if (c === 125 /* } */ || c === 93 /* ] */) {
				if (atHistoryLevel()) {
					// Closing the history array: finish the last element; "]" goes to the skeleton.
					if (element) endElement(i); else flushTo(i);
					historyDepth = -1;
					stack.pop();
					continue;
				}
				if (!stack.length) throw new Error("The file is not valid JSON or is truncated.");
				stack.pop();
				continue;
			}
			// Numbers, true, false and null directly inside the history array.
			if (atHistoryLevel() && !element && c > 32) startElement(i);
		}
		flushTo(chunk.length);
	}
	if (inString || stack.length) throw new Error("The file is not valid JSON or is truncated.");
	return { skeleton: skeleton.join(""), history: sawHistory ? history : null };
}

/** Text chunks of a file's bytes: gzip (by magic number) is inflated as it is read. */
export async function* textChunksFromBytes(bytes: Uint8Array, chunkBytes = 8 * 1024 * 1024): AsyncGenerator<string> {
	const decoder = new TextDecoder("utf-8");
	if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
		const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip")).getReader();
		let inflated = 0;
		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				inflated += value.byteLength;
				// Untrusted input: stop a decompression bomb before it exhausts memory.
				if (inflated > MAX_STREAMED_IMPORT_CHARS) throw tooLarge("over 2 GiB uncompressed");
				const text = decoder.decode(value, { stream: true });
				if (text) yield text;
			}
		} finally {
			await reader.cancel().catch(() => {});
			reader.releaseLock();
		}
	} else {
		for (let at = 0; at < bytes.length; at += chunkBytes) {
			const text = decoder.decode(bytes.subarray(at, at + chunkBytes), { stream: true });
			if (text) yield text;
		}
	}
	const tail = decoder.decode();
	if (tail) yield tail;
}
