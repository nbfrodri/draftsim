import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { validateWorkbookZip } from "./zipImportLimits";
describe("workbook expansion limits", () => {
  it("counts the actual expanded payload across ZIP members", async () => {
    const zip = new JSZip();
    zip.file("first.xml", "a".repeat(700));
    zip.file("second.xml", "b".repeat(700));
    const bytes = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
    expect(bytes.byteLength).toBeLessThan(1024);
    await expect(validateWorkbookZip(bytes, 1024)).rejects.toThrow("decompressed");
    await expect(validateWorkbookZip(bytes, 2048)).resolves.toBeUndefined();
  });
});
