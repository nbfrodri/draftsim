// Hand-rolled validation/sanitization helpers.
// No external dependencies — suitable for offline/Tauri packaging.
//
// Design: validators return { ok: true, value } | { ok: false, path, reason }.
// Sanitizers coerce bad values to a safe default and record the offending path.
// Both are composable and produce full dot-path strings for error reporting.

export type ValidationOk<T> = { ok: true; value: T };
export type ValidationFail = { ok: false; path: string; reason: string };
export type ValidationResult<T> = ValidationOk<T> | ValidationFail;

// ─── Primitive checkers ──────────────────────────────────────────────────────

export function isFiniteNumber(value: unknown, path: string): ValidationResult<number> {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { ok: true, value };
  }
  return {
    ok: false,
    path,
    reason: `expected finite number, got ${value === null ? "null" : typeof value} (${String(value)})`,
  };
}

export function isBoolean(value: unknown, path: string): ValidationResult<boolean> {
  if (typeof value === "boolean") {
    return { ok: true, value };
  }
  return {
    ok: false,
    path,
    reason: `expected boolean, got ${value === null ? "null" : typeof value} (${String(value)})`,
  };
}

export function isString(value: unknown, path: string): ValidationResult<string> {
  if (typeof value === "string") {
    return { ok: true, value };
  }
  return {
    ok: false,
    path,
    reason: `expected string, got ${value === null ? "null" : typeof value} (${String(value)})`,
  };
}

// ─── Optional field helper ───────────────────────────────────────────────────
// Returns { ok: true, value: undefined } when the field is absent/undefined,
// otherwise delegates to the supplied checker.

export function optional<T>(
  value: unknown,
  path: string,
  checker: (v: unknown, p: string) => ValidationResult<T>,
): ValidationResult<T | undefined> {
  if (value === undefined || value === null) {
    return { ok: true, value: undefined };
  }
  return checker(value, path);
}

// ─── Record-of validator ─────────────────────────────────────────────────────
// Validates every value in a plain-object record, collecting all failures.
// Returns either { ok: true, value: Record<string, V> } or the first failure.
// When `onFail` is supplied (sanitize mode) it is called for each bad entry and
// a sanitized value is substituted — the function always returns ok: true in
// that mode.

export function validateRecord<V>(
  data: unknown,
  path: string,
  validateEntry: (entry: unknown, entryPath: string) => ValidationResult<V>,
  onFail?: (fail: ValidationFail) => V,
): ValidationResult<Record<string, V>> {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, path, reason: "expected plain object" };
  }
  const result: Record<string, V> = {};
  for (const [key, rawValue] of Object.entries(data as Record<string, unknown>)) {
    const entryPath = `${path}.${key}`;
    const res = validateEntry(rawValue, entryPath);
    if (res.ok) {
      result[key] = res.value;
    } else if (onFail) {
      result[key] = onFail(res);
    } else {
      return res;
    }
  }
  return { ok: true, value: result };
}

// ─── Sanitization accumulator ────────────────────────────────────────────────
// Collects bad-field paths then lets callers emit one aggregated console.warn.

export class SanitizationLog {
  private readonly badPaths: string[] = [];

  record(fail: ValidationFail): void {
    this.badPaths.push(`${fail.path}: ${fail.reason}`);
  }

  hasErrors(): boolean {
    return this.badPaths.length > 0;
  }

  flush(label: string): void {
    if (this.badPaths.length > 0) {
      console.warn(
        `[dataValidation] ${label} — ${this.badPaths.length} malformed field(s) coerced to safe defaults:\n` +
          this.badPaths.map((p) => `  • ${p}`).join("\n"),
      );
      this.badPaths.length = 0;
    }
  }
}

// ─── Numeric field sanitizer ─────────────────────────────────────────────────
// Returns the field value if it is a finite number, otherwise 0 and logs.

export function sanitizeNumber(
  value: unknown,
  path: string,
  log: SanitizationLog,
  defaultValue = 0,
): number {
  const result = isFiniteNumber(value, path);
  if (result.ok) return result.value;
  log.record(result);
  return defaultValue;
}

// ─── Boolean field sanitizer ─────────────────────────────────────────────────

export function sanitizeBoolean(
  value: unknown,
  path: string,
  log: SanitizationLog,
  defaultValue = false,
): boolean {
  const result = isBoolean(value, path);
  if (result.ok) return result.value;
  log.record(result);
  return defaultValue;
}

// ─── String field sanitizer ──────────────────────────────────────────────────

export function sanitizeString(
  value: unknown,
  path: string,
  log: SanitizationLog,
  defaultValue = "",
): string {
  const result = isString(value, path);
  if (result.ok) return result.value;
  log.record(result);
  return defaultValue;
}
