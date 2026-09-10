/**
 * Injection token for the resolved, validated storage configuration.
 *
 * Kept in its own file so `storage.config.ts` stays a pure function of the
 * environment with no Nest dependency — that is what lets the configuration
 * rules be unit-tested directly against an env object.
 */
export const STORAGE_CONFIG = Symbol('STORAGE_CONFIG');
