import { describe, expect, it } from "vitest";
import { LANE_ORDER } from "./players";
import { ROLE_LABELS, roleLabel } from "./roles";

describe("role labels", () => {
	it("labels every lane with a capitalized display name", () => {
		expect(LANE_ORDER.map(roleLabel)).toEqual(["Top", "Jungle", "Mid", "ADC", "Support"]);
		expect(Object.keys(ROLE_LABELS).sort()).toEqual([...LANE_ORDER].sort());
	});
});
