import type { EventRecordIdentity } from "./eventHistory";
import { INTERNATIONAL_LABELS, LEAGUE_IDS, type LeagueId } from "./types";

type Group = { identity: EventRecordIdentity };
export interface EventPickerSelection { groupId: string; rememberedRegion?: LeagueId }
export const eventPickerKey = (identity: EventRecordIdentity) => identity.split ? `split:${identity.split}` : `event:${identity.event}`;

/** Available events retain calendar order; domestic regions use the canonical league order. */
export function eventPickerEvents(groups: readonly Group[]) {
	const seen = new Set<string>();
	return groups.flatMap(({ identity }) => {
		const key = eventPickerKey(identity);
		if (seen.has(key)) return [];
		seen.add(key);
		const matching = groups.filter(g => eventPickerKey(g.identity) === key);
		const regions: (LeagueId | undefined)[] = identity.split ? LEAGUE_IDS.filter(id => matching.some(g => g.identity.leagueId === id)) : [];
		if (identity.split && matching.some(g => !g.identity.leagueId)) regions.push(undefined);
		return [{ key, split: identity.split, event: identity.event, label: identity.split ? `${identity.split[0].toUpperCase()}${identity.split.slice(1)} Split` : identity.event ? INTERNATIONAL_LABELS[identity.event] : identity.label, regions }];
	});
}

export function resolveEventSelection(groups: readonly Group[], phaseIndex: number, selection?: EventPickerSelection) {
	return groups.find(g => g.identity.id === selection?.groupId)?.identity
		?? groups.find(g => g.identity.phaseIndex === phaseIndex)?.identity
		?? groups.at(-1)?.identity;
}

/** Keep the preferred region through internationals and splits where it is unavailable. */
export function selectPickerEvent(groups: readonly Group[], key: string, previous?: EventPickerSelection): EventPickerSelection | undefined {
	const matching = groups.filter(g => eventPickerKey(g.identity) === key);
	const ordered = eventPickerEvents(matching)[0];
	const identity = (matching.find(g => previous?.rememberedRegion !== undefined && g.identity.leagueId === previous.rememberedRegion)
		?? matching.find(g => g.identity.leagueId === ordered?.regions[0])
		?? matching[0])?.identity;
	return identity && { groupId: identity.id, rememberedRegion: previous?.rememberedRegion ?? identity.leagueId };
}

export function selectPickerRegion(groups: readonly Group[], key: string, region: LeagueId | undefined): EventPickerSelection | undefined {
	const identity = groups.find(g => g.identity.split && eventPickerKey(g.identity) === key && g.identity.leagueId === region)?.identity;
	return identity && { groupId: identity.id, rememberedRegion: region };
}
