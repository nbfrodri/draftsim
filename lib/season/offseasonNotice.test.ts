import { describe, expect, it } from "vitest";
import { OFFSEASON_MARKET_NOTICE, offseasonMarketNotice } from "./offseasonNotice";

describe("offseasonMarketNotice", () => {
	it("explains deferred AI moves only once the season is complete", () => {
		expect(offseasonMarketNotice({ status: "complete" })).toBe(OFFSEASON_MARKET_NOTICE);
		expect(offseasonMarketNotice({ status: "in-progress" } as never)).toBeNull();
		expect(offseasonMarketNotice(null)).toBeNull();
	});
	it("mentions the next year and Offseason moves", () => {
		expect(OFFSEASON_MARKET_NOTICE).toMatch(/next year/);
		expect(OFFSEASON_MARKET_NOTICE).toMatch(/Offseason moves/);
	});
});
