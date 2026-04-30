// Types extracted to break the import cycle between identities.ts (which
// references the IdentityLabel union and is the data source) and any
// downstream consumer that needs the surrounding types.

export interface GameDuration {
  min: number;
  max: number;
}

// Versus rating: -2 (hard counter) → +2 (hard favorite). Used in the
// IDENTITY_PROFILES.vs matrix to express how each identity fares against
// each other identity.
export type IdentityVsIdentity = -2 | -1 | 0 | 1 | 2;
