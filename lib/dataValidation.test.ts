import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isFiniteNumber,
  isBoolean,
  isString,
  optional,
  validateRecord,
  SanitizationLog,
  sanitizeNumber,
  sanitizeBoolean,
  sanitizeString,
} from "./dataValidation";

// ─── isFiniteNumber ──────────────────────────────────────────────────────────

describe("isFiniteNumber", () => {
  it("accepts a positive integer", () => {
    const r = isFiniteNumber(42, "path");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(42);
  });

  it("accepts zero and negative floats", () => {
    expect(isFiniteNumber(0, "p").ok).toBe(true);
    expect(isFiniteNumber(-3.14, "p").ok).toBe(true);
  });

  it("rejects null", () => {
    const r = isFiniteNumber(null, "items.X.ad");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.path).toBe("items.X.ad");
      expect(r.reason).toMatch(/null/);
    }
  });

  it("rejects undefined", () => {
    expect(isFiniteNumber(undefined, "p").ok).toBe(false);
  });

  it("rejects NaN", () => {
    expect(isFiniteNumber(NaN, "p").ok).toBe(false);
  });

  it("rejects Infinity", () => {
    expect(isFiniteNumber(Infinity, "p").ok).toBe(false);
  });

  it("rejects a numeric string", () => {
    const r = isFiniteNumber("5", "p");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/string/);
  });
});

// ─── isBoolean ───────────────────────────────────────────────────────────────

describe("isBoolean", () => {
  it("accepts true and false", () => {
    expect(isBoolean(true, "p").ok).toBe(true);
    expect(isBoolean(false, "p").ok).toBe(true);
  });

  it("rejects null and 1", () => {
    expect(isBoolean(null, "p").ok).toBe(false);
    expect(isBoolean(1, "p").ok).toBe(false);
  });
});

// ─── isString ────────────────────────────────────────────────────────────────

describe("isString", () => {
  it("accepts a non-empty string", () => {
    const r = isString("hello", "p");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("hello");
  });

  it("accepts an empty string", () => {
    expect(isString("", "p").ok).toBe(true);
  });

  it("rejects null", () => {
    const r = isString(null, "p");
    expect(r.ok).toBe(false);
  });

  it("rejects a number", () => {
    expect(isString(3, "p").ok).toBe(false);
  });
});

// ─── optional ────────────────────────────────────────────────────────────────

describe("optional", () => {
  it("returns ok:true with undefined when value is null", () => {
    const r = optional(null, "p", isFiniteNumber);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeUndefined();
  });

  it("returns ok:true with undefined when value is undefined", () => {
    const r = optional(undefined, "p", isFiniteNumber);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeUndefined();
  });

  it("delegates to checker when value is present and valid", () => {
    const r = optional(7, "p", isFiniteNumber);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(7);
  });

  it("delegates to checker when value is present and invalid", () => {
    const r = optional("bad", "p", isFiniteNumber);
    expect(r.ok).toBe(false);
  });
});

// ─── validateRecord ──────────────────────────────────────────────────────────

describe("validateRecord — strict mode (no onFail)", () => {
  it("validates a well-formed record", () => {
    const data = { a: 1, b: 2 };
    const r = validateRecord(data, "root", (v, p) => isFiniteNumber(v, p));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ a: 1, b: 2 });
  });

  it("fails on first bad entry", () => {
    const data = { a: 1, b: null };
    const r = validateRecord(data, "root", (v, p) => isFiniteNumber(v, p));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.path).toBe("root.b");
  });

  it("rejects non-object input", () => {
    const r = validateRecord("nope", "root", (v, p) => isFiniteNumber(v, p));
    expect(r.ok).toBe(false);
  });
});

describe("validateRecord — sanitize mode (with onFail)", () => {
  it("coerces bad entries to default and always returns ok:true", () => {
    const data = { a: 1, b: null, c: "bad" };
    const bads: string[] = [];
    const r = validateRecord(
      data,
      "root",
      (v, p) => isFiniteNumber(v, p),
      (fail) => {
        bads.push(fail.path);
        return 0;
      },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value["a"]).toBe(1);
      expect(r.value["b"]).toBe(0);
      expect(r.value["c"]).toBe(0);
    }
    expect(bads).toContain("root.b");
    expect(bads).toContain("root.c");
  });
});

// ─── SanitizationLog ─────────────────────────────────────────────────────────

describe("SanitizationLog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hasErrors returns false when nothing was recorded", () => {
    const log = new SanitizationLog();
    expect(log.hasErrors()).toBe(false);
  });

  it("hasErrors returns true after recording a failure", () => {
    const log = new SanitizationLog();
    log.record({ ok: false, path: "x.y", reason: "bad" });
    expect(log.hasErrors()).toBe(true);
  });

  it("flush emits one console.warn listing all bad paths", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const log = new SanitizationLog();
    log.record({ ok: false, path: "items.Boots.ad", reason: "expected finite number, got null" });
    log.record({ ok: false, path: "items.Boots.ap", reason: "expected finite number, got string" });
    log.flush("items.json");
    expect(warn).toHaveBeenCalledTimes(1);
    const msg: string = warn.mock.calls[0][0] as string;
    expect(msg).toContain("items.json");
    expect(msg).toContain("items.Boots.ad");
    expect(msg).toContain("items.Boots.ap");
    expect(msg).toContain("2 malformed");
  });

  it("flush does not warn when there are no errors", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const log = new SanitizationLog();
    log.flush("items.json");
    expect(warn).not.toHaveBeenCalled();
  });

  it("flush clears state so a second flush does not re-warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const log = new SanitizationLog();
    log.record({ ok: false, path: "x", reason: "bad" });
    log.flush("label");
    log.flush("label");
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

// ─── sanitize* helpers ───────────────────────────────────────────────────────

describe("sanitizeNumber", () => {
  it("returns the value when valid", () => {
    const log = new SanitizationLog();
    expect(sanitizeNumber(7.5, "p", log)).toBe(7.5);
    expect(log.hasErrors()).toBe(false);
  });

  it("returns 0 and logs when null", () => {
    const log = new SanitizationLog();
    const v = sanitizeNumber(null, "items.X.hp", log);
    expect(v).toBe(0);
    expect(log.hasErrors()).toBe(true);
  });

  it("returns 0 and logs when a string is passed", () => {
    const log = new SanitizationLog();
    const v = sanitizeNumber("not-a-number", "items.X.ad", log);
    expect(v).toBe(0);
    expect(log.hasErrors()).toBe(true);
  });

  it("uses a custom default value when supplied", () => {
    const log = new SanitizationLog();
    expect(sanitizeNumber(null, "p", log, 99)).toBe(99);
  });
});

describe("sanitizeBoolean", () => {
  it("returns the value when valid", () => {
    const log = new SanitizationLog();
    expect(sanitizeBoolean(true, "p", log)).toBe(true);
    expect(log.hasErrors()).toBe(false);
  });

  it("returns false and logs when null", () => {
    const log = new SanitizationLog();
    const v = sanitizeBoolean(null, "items.X.isAntiHeal", log);
    expect(v).toBe(false);
    expect(log.hasErrors()).toBe(true);
  });
});

describe("sanitizeString", () => {
  it("returns the value when valid", () => {
    const log = new SanitizationLog();
    expect(sanitizeString("Boots", "p", log)).toBe("Boots");
    expect(log.hasErrors()).toBe(false);
  });

  it("returns empty string and logs when null", () => {
    const log = new SanitizationLog();
    const v = sanitizeString(null, "items.X.name", log);
    expect(v).toBe("");
    expect(log.hasErrors()).toBe(true);
  });
});

// ─── Integration: shape of a valid MerakiItem entry ─────────────────────────

describe("MerakiItem-shaped entry validation", () => {
  interface FakeItem {
    name: string;
    ad: number;
    ap: number;
    armor: number;
    mr: number;
    hp: number;
    abilityHaste: number;
    attackSpeed: number;
    crit: number;
    armorPen: number;
    magicPen: number;
    lifesteal: number;
    omnivamp: number;
    movespeed: number;
    cost: number;
    isAntiHeal: boolean;
  }

  function sanitizeItem(raw: Record<string, unknown>, key: string): { item: FakeItem; log: SanitizationLog } {
    const log = new SanitizationLog();
    const p = `items.${key}`;
    const item: FakeItem = {
      name: sanitizeString(raw["name"], `${p}.name`, log, key),
      ad: sanitizeNumber(raw["ad"], `${p}.ad`, log),
      ap: sanitizeNumber(raw["ap"], `${p}.ap`, log),
      armor: sanitizeNumber(raw["armor"], `${p}.armor`, log),
      mr: sanitizeNumber(raw["mr"], `${p}.mr`, log),
      hp: sanitizeNumber(raw["hp"], `${p}.hp`, log),
      abilityHaste: sanitizeNumber(raw["abilityHaste"], `${p}.abilityHaste`, log),
      attackSpeed: sanitizeNumber(raw["attackSpeed"], `${p}.attackSpeed`, log),
      crit: sanitizeNumber(raw["crit"], `${p}.crit`, log),
      armorPen: sanitizeNumber(raw["armorPen"], `${p}.armorPen`, log),
      magicPen: sanitizeNumber(raw["magicPen"], `${p}.magicPen`, log),
      lifesteal: sanitizeNumber(raw["lifesteal"], `${p}.lifesteal`, log),
      omnivamp: sanitizeNumber(raw["omnivamp"], `${p}.omnivamp`, log),
      movespeed: sanitizeNumber(raw["movespeed"], `${p}.movespeed`, log),
      cost: sanitizeNumber(raw["cost"], `${p}.cost`, log),
      isAntiHeal: sanitizeBoolean(raw["isAntiHeal"], `${p}.isAntiHeal`, log),
    };
    return { item, log };
  }

  it("valid entry produces no log errors and correct values", () => {
    const raw = {
      name: "Boots",
      ad: 0, ap: 0, armor: 0, mr: 0, hp: 0,
      abilityHaste: 0, attackSpeed: 0, crit: 0,
      armorPen: 0, magicPen: 0, lifesteal: 0,
      omnivamp: 0, movespeed: 25, cost: 300,
      isAntiHeal: false,
    };
    const { item, log } = sanitizeItem(raw, "Boots");
    expect(log.hasErrors()).toBe(false);
    expect(item.movespeed).toBe(25);
    expect(item.isAntiHeal).toBe(false);
  });

  it("entry with null numeric field is coerced to 0", () => {
    const raw = {
      name: "BadItem",
      ad: null, ap: 0, armor: 0, mr: 0, hp: 0,
      abilityHaste: 0, attackSpeed: 0, crit: 0,
      armorPen: 0, magicPen: 0, lifesteal: 0,
      omnivamp: 0, movespeed: 0, cost: 500,
      isAntiHeal: false,
    };
    const { item, log } = sanitizeItem(raw, "BadItem");
    expect(item.ad).toBe(0);
    expect(log.hasErrors()).toBe(true);
  });

  it("entry where a number field has a string value is coerced to 0", () => {
    const raw = {
      name: "WeirdItem",
      ad: "thirty", ap: 0, armor: 0, mr: 0, hp: 0,
      abilityHaste: 0, attackSpeed: 0, crit: 0,
      armorPen: 0, magicPen: 0, lifesteal: 0,
      omnivamp: 0, movespeed: 0, cost: 500,
      isAntiHeal: false,
    };
    const { item, log } = sanitizeItem(raw, "WeirdItem");
    expect(item.ad).toBe(0);
    expect(log.hasErrors()).toBe(true);
  });
});

// ─── Integration: shape of a valid AbilityProfile entry ─────────────────────

describe("AbilityProfile-shaped entry validation", () => {
  interface FakeProfile {
    alias: string;
    hardCCDuration: number;
    ultCooldown: number;
    ultCastTime: number;
    hasResets: boolean;
    burstWindowSeconds: number;
  }

  function sanitizeProfile(raw: Record<string, unknown>, key: string): { profile: FakeProfile; log: SanitizationLog } {
    const log = new SanitizationLog();
    const p = `abilities.${key}`;
    const profile: FakeProfile = {
      alias: sanitizeString(raw["alias"], `${p}.alias`, log, key),
      hardCCDuration: sanitizeNumber(raw["hardCCDuration"], `${p}.hardCCDuration`, log),
      ultCooldown: sanitizeNumber(raw["ultCooldown"], `${p}.ultCooldown`, log, 90),
      ultCastTime: sanitizeNumber(raw["ultCastTime"], `${p}.ultCastTime`, log),
      hasResets: sanitizeBoolean(raw["hasResets"], `${p}.hasResets`, log),
      burstWindowSeconds: sanitizeNumber(raw["burstWindowSeconds"], `${p}.burstWindowSeconds`, log, 4),
    };
    return { profile, log };
  }

  it("valid Aatrox entry produces no errors", () => {
    const raw = {
      alias: "Aatrox",
      hardCCDuration: 3,
      ultCooldown: 120,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 4,
    };
    const { profile, log } = sanitizeProfile(raw, "Aatrox");
    expect(log.hasErrors()).toBe(false);
    expect(profile.hardCCDuration).toBe(3);
    expect(profile.hasResets).toBe(false);
  });

  it("null hardCCDuration is coerced to 0", () => {
    const raw = {
      alias: "Unknown",
      hardCCDuration: null,
      ultCooldown: 90,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 4,
    };
    const { profile, log } = sanitizeProfile(raw, "Unknown");
    expect(profile.hardCCDuration).toBe(0);
    expect(log.hasErrors()).toBe(true);
  });

  it("missing optional-feeling fields use their defaults", () => {
    // ultCooldown missing → defaults to 90; burstWindowSeconds missing → 4
    const raw = {
      alias: "Partial",
      hardCCDuration: 0,
      ultCooldown: undefined,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: undefined,
    };
    const { profile, log } = sanitizeProfile(raw, "Partial");
    expect(profile.ultCooldown).toBe(90);
    expect(profile.burstWindowSeconds).toBe(4);
    expect(log.hasErrors()).toBe(true); // undefined counts as malformed
  });

  it("string-where-number is coerced and logged", () => {
    const raw = {
      alias: "Weirdo",
      hardCCDuration: "two",
      ultCooldown: 120,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 3,
    };
    const { profile, log } = sanitizeProfile(raw, "Weirdo");
    expect(profile.hardCCDuration).toBe(0);
    expect(log.hasErrors()).toBe(true);
  });
});
