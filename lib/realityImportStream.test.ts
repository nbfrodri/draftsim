import { describe, expect, it } from "vitest";
import { createRng } from "./rng";
import { splitRealityImport, textChunksFromBytes } from "./realityImportStream";

/** Random JSON values with the characters a naive scanner gets wrong. */
function randomValue(rng: () => number, depth: number): unknown {
	const pick = rng();
	const text = () => ["", "a", "}", "]", "{", "[", ",", ":", "\"", "\\", "\\\"", "Ñandú 🏆", "\n\t", "history", "reality", " "]
		.filter(() => rng() < 0.35).join("");
	if (depth > 3 || pick < 0.3) {
		const s = rng();
		return s < 0.25 ? text() : s < 0.5 ? Math.round((rng() - 0.5) * 1e6) / 100 : s < 0.65 ? rng() < 0.5 : s < 0.75 ? null : -0 + 0;
	}
	if (pick < 0.6) return Array.from({ length: Math.floor(rng() * 4) }, () => randomValue(rng, depth + 1));
	return Object.fromEntries(Array.from({ length: Math.floor(rng() * 4) }, (_, i) => [`${text()}k${i}`, randomValue(rng, depth + 1)]));
}

async function* inChunks(text: string, rng: () => number): AsyncGenerator<string> {
	for (let at = 0; at < text.length;) {
		const size = 1 + Math.floor(rng() * 7);
		yield text.slice(at, at + size);
		at += size;
	}
}

async function split(text: string, rng: () => number) {
	const result = await splitRealityImport(inChunks(text, rng));
	const skeleton = JSON.parse(result.skeleton) as Record<string, unknown>;
	return { skeleton, history: result.history?.map(h => JSON.parse(h) as unknown) ?? null };
}

describe("splitRealityImport", () => {
	it("cuts every history element out of export-shaped documents, for any chunking and key order", async () => {
		for (let seed = 1; seed <= 300; seed++) {
			const rng = createRng(seed);
			const history = Array.from({ length: Math.floor(rng() * 5) }, () => randomValue(rng, 1));
			const reality: Record<string, unknown> = { id: "r\"1", name: "Ré", year: 3, season: randomValue(rng, 1), history, extra: randomValue(rng, 2) };
			const keys = Object.keys(reality).sort(() => rng() - 0.5);
			const doc = { kind: "reality", version: 1, reality: Object.fromEntries(keys.map(k => [k, reality[k]])) };
			const text = rng() < 0.5 ? JSON.stringify(doc) : JSON.stringify(doc, null, 2);
			const out = await split(text, rng);
			expect(out.history).toEqual(history);
			expect(out.skeleton).toEqual({ ...doc, reality: { ...doc.reality, history: [] } });
		}
	});

	it("leaves documents without reality.history whole, including look-alike keys elsewhere", async () => {
		for (let seed = 1; seed <= 200; seed++) {
			const rng = createRng(1000 + seed);
			const doc = { history: [1, 2], other: { reality: { history: [3] } }, reality: { history: "not an array", nested: { history: [4] } }, junk: randomValue(rng, 1) };
			const out = await split(JSON.stringify(doc), rng);
			expect(out.history).toBeNull();
			expect(out.skeleton).toEqual(doc);
		}
	});

	it("rejects truncated or unbalanced input", async () => {
		const rng = createRng(7);
		for (const bad of ['{"reality":{"history":[{"a":1}', '{"reality":{"history":["unterminated]}}', '{"a":1}}']) {
			await expect(splitRealityImport(inChunks(bad, rng))).rejects.toThrow();
		}
	});

	it("streams text from plain and gzip bytes, splitting multibyte characters safely", async () => {
		const text = JSON.stringify({ reality: { history: Array.from({ length: 50 }, (_, i) => ({ name: `Año ${i} 🏆`.repeat(200) })) } });
		const plain = new TextEncoder().encode(text);
		const gz = new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
		for (const bytes of [plain, gz]) {
			const parts: string[] = [];
			for await (const part of textChunksFromBytes(bytes, 997)) parts.push(part);
			expect(parts.join("")).toBe(text);
		}
	});
});
