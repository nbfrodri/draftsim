import { describe, expect, it } from "vitest";
import { deflateString, inflateString, base64UrlEncode, base64UrlDecode, assertShareInputSize, MAX_SHARE_INPUT_CHARS } from "./shareCodec";
describe("bounded share codec", () => {
  it("round trips unicode", async () => {
    const text = "España 日本 🎮".repeat(100);
    expect(await inflateString(base64UrlDecode(base64UrlEncode(await deflateString(text))))).toBe(text);
  });
  it("aborts a highly compressible payload before allocating its full output", async () => {
    const compressed = await deflateString("x".repeat(1024 * 1024));
    await expect(inflateString(compressed, 1024)).rejects.toThrow("size limit");
  });
  it("rejects truncated compressed input", async () => {
    const compressed = await deflateString("a tournament");
    await expect(inflateString(compressed.slice(0, 2))).rejects.toThrow();
  });
  it("limits raw JSON before parsing", () => {
    expect(() => assertShareInputSize(" ".repeat(MAX_SHARE_INPUT_CHARS + 1))).toThrow("input limit");
  });
});
