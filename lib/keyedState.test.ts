import { describe, expect, it } from "vitest";
import { syncKey } from "./keyedState";

describe("syncKey", () => {
	it("keeps the state while the key is unchanged", () => {
		const state = { key: "a", value: 5 };
		expect(syncKey(state, "a", 0)).toBe(state);
	});

	it("resets on every key change, including returning to an earlier key", () => {
		let state = { key: "a", value: 5 };
		state = syncKey(state, "b", 0);
		expect(state).toEqual({ key: "b", value: 0 });
		state = syncKey({ ...state, value: 0 }, "a", 0);
		expect(state).toEqual({ key: "a", value: 0 });
	});
});
