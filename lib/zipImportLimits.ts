import type JSZip from "jszip";

type ContentStream = {
  on(event: "data", callback: (chunk: Uint8Array) => void): ContentStream;
  on(event: "error", callback: (error: Error) => void): ContentStream;
  on(event: "end", callback: () => void): ContentStream;
  pause(): ContentStream;
  resume(): ContentStream;
};
// Documented JSZip API omitted by its bundled legacy type declarations.
// https://stuk.github.io/jszip/documentation/api_zipobject/internal_stream.html
type StreamedEntry = JSZip.JSZipObject & { internalStream(type: "uint8array"): ContentStream };

/** Count actual inflated bytes before ExcelJS materializes XML/cells in memory. */
export async function validateWorkbookZip(data: ArrayBuffer, maxBytes = 128 * 1024 * 1024): Promise<void> {
  if (data.byteLength > 64 * 1024 * 1024) throw new Error("Workbook exceeds the 64 MiB input limit.");
  const { default: Zip } = await import("jszip");
  const zip = await Zip.loadAsync(data);
  const entries = Object.values(zip.files);
  if (entries.length > 10000) throw new Error("Workbook has too many ZIP entries.");
  let bytes = 0;
  for (const entry of entries) {
    if (entry.dir) continue;
    await new Promise<void>((resolve, reject) => {
      const stream = (entry as StreamedEntry).internalStream("uint8array");
      stream.on("data", chunk => {
        bytes += chunk.byteLength;
        if (bytes > maxBytes) {
          stream.pause();
          reject(new Error("Workbook exceeds the decompressed size limit."));
        }
      }).on("error", reject).on("end", resolve).resume();
    });
  }
}
