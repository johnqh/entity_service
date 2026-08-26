/**
 * @fileoverview Entity API Key Generation Utilities
 * @description Functions for minting and hashing entity-scoped API keys.
 *
 * Keys are stored as a SHA-256 hash only -- the plaintext is returned once at
 * creation and is unrecoverable afterwards. This keeps the library free of
 * encryption key management; a caller that needs a reveal-later flow should
 * store its own encrypted copy alongside.
 */

/** Number of random bytes in the secret portion of a key */
const API_KEY_BYTES = 24;

/** Default prefix applied when the caller does not supply one */
const DEFAULT_KEY_PREFIX = "sk";

/** Number of leading characters retained for display in listings */
const DISPLAY_PREFIX_LENGTH = 12;

/**
 * A freshly minted API key.
 * The plaintext `key` is the only copy -- it is never stored.
 */
export interface GeneratedApiKey {
  /** Full plaintext key, shown to the user exactly once */
  key: string;
  /** SHA-256 hex digest used as the lookup index */
  keyHash: string;
  /** Leading characters retained for display (e.g. "sk_a1b2c3d4") */
  keyPrefix: string;
}

/**
 * Validate an API key prefix.
 * Prefixes are short lowercase alphanumeric tags such as "sk" or "shyft".
 *
 * @param prefix - The prefix to validate
 * @returns Whether the prefix is usable
 */
export function validateKeyPrefix(prefix: string): boolean {
  return /^[a-z0-9]{1,12}$/.test(prefix);
}

/**
 * Compute the SHA-256 hex digest of an API key.
 * Used both when minting a key and when verifying one on an incoming request.
 *
 * @param key - The plaintext API key
 * @returns The 64-character hex digest
 */
export async function hashApiKey(key: string): Promise<string> {
  const bytes = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), b =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

/**
 * Generate a new API key.
 *
 * @param prefix - Short tag identifying the key's issuer (default "sk")
 * @returns The plaintext key plus the hash and display prefix to persist
 * @throws If the prefix is not lowercase alphanumeric
 */
export async function generateApiKey(
  prefix: string = DEFAULT_KEY_PREFIX
): Promise<GeneratedApiKey> {
  if (!validateKeyPrefix(prefix)) {
    throw new Error(
      `Invalid API key prefix: "${prefix}". Use 1-12 lowercase alphanumeric characters.`
    );
  }

  const bytes = new Uint8Array(API_KEY_BYTES);
  crypto.getRandomValues(bytes);
  const secret = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join(
    ""
  );

  const key = `${prefix}_${secret}`;
  return {
    key,
    keyHash: await hashApiKey(key),
    keyPrefix: key.slice(0, DISPLAY_PREFIX_LENGTH),
  };
}
