/**
 * Transport for the native `persist_batch` command (src-tauri/src/storage.rs).
 *
 * A save used to cross the Tauri IPC as one JSON string holding every
 * statement, up to ~18 MB for a mid-year franchise snapshot (see
 * docs/plans/2026-10-26-windows-bulk-blank-screen.md). Bind values longer than
 * `inlineLimit` are now sent first as raw UTF-8 chunks of at most `chunkBytes`
 * (`persist_stage_chunk`), then `persist_batch` sends the statements with
 * `{ $staged: n }` placeholders. Staging writes nothing: the native side
 * resolves the placeholders and runs every statement in one transaction, so
 * atomicity and statement order are unchanged. A failed chunk fails the save
 * before any SQL runs; the caller's retry stages everything again under a new
 * token, and the native side drops data left by an older token.
 */
export type SqlStatement = { query: string; bindValues: unknown[] };
export type PersistInvoke = (
  command: string,
  args?: Record<string, unknown> | Uint8Array,
  options?: { headers: Record<string, string> },
) => Promise<unknown>;

/** Strings longer than this (UTF-16 units) are staged instead of inlined. */
export const PERSIST_INLINE_LIMIT = 256 * 1024;
/** Largest raw chunk per IPC message. */
export const PERSIST_CHUNK_BYTES = 1024 * 1024;

let saveSequence = 0;

export async function sendPersistBatch(
  invoke: PersistInvoke,
  statements: SqlStatement[],
  options: { inlineLimit?: number; chunkBytes?: number } = {},
): Promise<void> {
  const inlineLimit = options.inlineLimit ?? PERSIST_INLINE_LIMIT;
  const chunkBytes = options.chunkBytes ?? PERSIST_CHUNK_BYTES;
  const large: string[] = [];
  const sent = statements.map(s => ({
    query: s.query,
    bindValues: s.bindValues.map(v => {
      if (typeof v !== "string" || v.length <= inlineLimit) return v;
      large.push(v);
      return { $staged: large.length - 1 };
    }),
  }));
  if (!large.length) {
    await invoke("persist_batch", { statements });
    return;
  }
  const stagingToken = `save-${Date.now().toString(36)}-${++saveSequence}`;
  const encoder = new TextEncoder();
  for (let blob = 0; blob < large.length; blob++) {
    // Encode one value at a time; chunks split bytes, and the native side
    // validates UTF-8 only after joining them.
    const bytes = encoder.encode(large[blob]);
    const headers = { "draftsim-stage": stagingToken, "draftsim-blob": String(blob) };
    for (let offset = 0; offset < bytes.byteLength; offset += chunkBytes) {
      await invoke("persist_stage_chunk", bytes.subarray(offset, offset + chunkBytes), { headers });
    }
  }
  await invoke("persist_batch", { statements: sent, stagingToken });
}
