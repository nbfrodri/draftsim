export interface Keyed<T> { key: string; value: T }

/** Returns the same state while the key matches, otherwise a fresh state for the new key. */
export function syncKey<T>(state: Keyed<T>, key: string, initial: T): Keyed<T> {
	return state.key === key ? state : { key, value: initial };
}
