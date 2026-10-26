import { describe, expect, it } from "vitest";
import type { EventRecordIdentity } from "./eventHistory";
import { eventPickerEvents, resolveEventSelection, selectPickerEvent, selectPickerRegion } from "./eventPicker";
import { INTERNATIONAL_LABELS, type InternationalId } from "./types";

const groups: { identity: EventRecordIdentity }[] = [
	{ identity: { id: "winter-lpl", label: "LPL · Winter Split", phaseIndex: 0, split: "winter", leagueId: "LPL" } },
	{ identity: { id: "winter-lck", label: "LCK · Winter Split", phaseIndex: 0, split: "winter", leagueId: "LCK" } },
	{ identity: { id: "spring-lck", label: "LCK · Spring Split", phaseIndex: 2, split: "spring", leagueId: "LCK" } },
	{ identity: { id: "msi", label: "MSI", phaseIndex: 3, event: "msi" } },
];

describe("season event picker", () => {
	it("offers only existing events, with split regions in league order", () => {
		const events = eventPickerEvents(groups);
		expect(events.map(e => e.key)).toEqual(["split:winter", "split:spring", "event:msi"]);
		expect(events[0].regions).toEqual(["LCK", "LPL"]);
		expect(events[1].regions).toEqual(["LCK"]);
		expect(events[2].regions).toEqual([]);
	});
	it.each(Object.keys(INTERNATIONAL_LABELS) as InternationalId[])("shows %s without domestic regions", event => {
		const available = eventPickerEvents([{ identity: { id: event, label: INTERNATIONAL_LABELS[event], event } }]);
		expect(available).toMatchObject([{ key: `event:${event}`, label: INTERNATIONAL_LABELS[event], regions: [] }]);
	});
	it("defaults to the current phase, then the last group, and retains a valid selection", () => {
		expect(resolveEventSelection(groups, 2)?.id).toBe("spring-lck");
		expect(resolveEventSelection(groups, 99)?.id).toBe("msi");
		expect(resolveEventSelection(groups, 2, { groupId: "winter-lpl" })?.id).toBe("winter-lpl");
		expect(resolveEventSelection(groups, 2, { groupId: "removed" })?.id).toBe("spring-lck");
		expect(resolveEventSelection([], 0)).toBeUndefined();
	});
	it("remembers the region across splits and international events", () => {
		const initial = selectPickerRegion(groups, "split:winter", "LPL");
		const international = selectPickerEvent(groups, "event:msi", initial);
		expect(resolveEventSelection(groups, 0, international)?.leagueId).toBeUndefined();
		expect(selectPickerEvent(groups, "split:winter", international)?.groupId).toBe("winter-lpl");
		const spring = selectPickerEvent(groups, "split:spring", initial);
		expect(spring?.groupId).toBe("spring-lck");
		expect(selectPickerEvent(groups, "split:winter", spring)?.groupId).toBe("winter-lpl");
		const lck = selectPickerRegion(groups, "split:winter", "LCK");
		expect(selectPickerEvent(groups, "split:spring", lck)?.rememberedRegion).toBe("LCK");
	});
	it("does not invent missing event/region combinations", () => {
		expect(selectPickerEvent(groups, "split:summer")).toBeUndefined();
		expect(selectPickerRegion(groups, "split:spring", "LPL")).toBeUndefined();
		expect(selectPickerRegion(groups, "event:msi", "LCK")).toBeUndefined();
	});
	it("preserves unknown domestic regions as unknown", () => {
		const unknown = [{ identity: { id: "unknown", label: "League · Winter Split", split: "winter" as const } }];
		expect(eventPickerEvents(unknown)[0].regions).toEqual([undefined]);
		expect(selectPickerRegion(unknown, "split:winter", undefined)?.groupId).toBe("unknown");
	});
	it("defaults to the first known region before an unknown region", () => {
		const mixed = [{ identity: { id: "unknown", label: "League · Winter Split", split: "winter" as const } }, ...groups];
		expect(selectPickerEvent(mixed, "split:winter")?.groupId).toBe("winter-lck");
	});
});
