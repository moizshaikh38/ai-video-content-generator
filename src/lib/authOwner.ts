// The signed-in account as last reported by AuthProvider. Module-level so a detached (unmounted) save chain reads the CURRENT account,
// not the one captured when it started. Undefined = not known yet.
let owner: string | undefined;
let generation=0;
export const getAuthOwnerGeneration=():number=>generation;
export const getCurrentAuthOwner = (): string | undefined => owner;
export const setCurrentAuthOwner = (id: string | undefined): void => { if(owner!==id)generation++;owner = id; };
/** Strict: the live account must equal the expected owner. An unknown or signed-out account is a mismatch, never a pass. */
export const ownerMismatch = (expected: string | undefined | null, actual: string | undefined | null): boolean => !expected || !actual || expected !== actual;
