import { describe, expect, it } from "vitest";
import { plural } from "./plural";

describe("plural", () => {
	it("uses the singular only for exactly one", () => {
		expect(plural(1, "game")).toBe("1 game");
		expect(plural(0, "game")).toBe("0 games");
		expect(plural(2, "game")).toBe("2 games");
	});
	it("accepts an irregular plural", () => {
		expect(plural(2, "copy", "copies")).toBe("2 copies");
	});
});
