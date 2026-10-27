import { describe, expect, it } from "vitest";
import { compressStoredJson, decompressStoredJson, isCompressedStoredJson } from "./storedJson";

describe("stored JSON compression", () => {
	it("round-trips Unicode and large text and stays a JSON object", async () => {
		const json = JSON.stringify({ name: "Ñandú 🏆 é", rows: Array.from({ length: 20000 }, (_, i) => ({ i, team: "Gen.G", score: i * 0.5 })) });
		const stored = await compressStoredJson(json);
		expect(isCompressedStoredJson(stored)).toBe(true);
		expect(typeof JSON.parse(stored)).toBe("object");
		expect(stored.length).toBeLessThan(json.length / 4);
		expect(await decompressStoredJson(stored)).toBe(json);
	});

	it("passes plain JSON through and rejects a damaged compressed row", async () => {
		expect(await decompressStoredJson('{"id":"y1"}')).toBe('{"id":"y1"}');
		await expect(decompressStoredJson('{"$z":"deflate-raw","d":"!!!"}')).rejects.toThrow("refusing to overwrite");
	});
});
