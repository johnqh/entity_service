/**
 * @fileoverview Entity Slug Generation Utilities
 * @description Functions for generating unique entity slugs and invitation tokens
 */

/** Characters allowed in entity slugs (lowercase alphanumeric) */
const SLUG_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Default length for generated entity slugs */
const DEFAULT_SLUG_LENGTH = 8;

/** Length for invitation tokens (hex characters) */
const INVITATION_TOKEN_LENGTH = 32;

/**
 * Generate a random entity slug.
 * @param length - Length of the slug (default 8, max 12)
 * @returns A random alphanumeric slug
 */
export function generateEntitySlug(length: number = DEFAULT_SLUG_LENGTH): string {
  const actualLength = Math.min(Math.max(length, 8), 12);
  let slug = '';
  for (let i = 0; i < actualLength; i++) {
    slug += SLUG_CHARS[Math.floor(Math.random() * SLUG_CHARS.length)];
  }
  return slug;
}

/**
 * Generate a unique invitation token.
 * @returns A 64-character hex string
 */
export function generateInvitationToken(): string {
  const bytes = new Uint8Array(INVITATION_TOKEN_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Normalize a user-provided slug to valid format.
 * Converts to lowercase and removes invalid characters.
 * @param input - The user-provided slug
 * @returns Normalized slug
 */
export function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 12);
}

/**
 * Validate that a slug meets the requirements.
 * @param slug - The slug to validate
 * @returns Whether the slug is valid
 */
export function validateSlug(slug: string): boolean {
  return /^[a-z0-9]{8,12}$/.test(slug);
}

/**
 * Generate a slug with a numeric suffix to avoid collisions.
 * @param baseSlug - The base slug to append suffix to
 * @param existingSlugs - Set of existing slugs to avoid
 * @returns A unique slug with suffix if needed
 */
export function generateUniqueSlug(
  baseSlug: string,
  existingSlugs: Set<string>
): string {
  const normalized = normalizeSlug(baseSlug).slice(0, 8);

  if (!existingSlugs.has(normalized) && validateSlug(normalized)) {
    return normalized;
  }

  // Try adding numeric suffixes
  for (let i = 1; i < 1000; i++) {
    const suffix = i.toString();
    const candidate = (normalized.slice(0, 12 - suffix.length) + suffix).slice(
      0,
      12
    );
    if (!existingSlugs.has(candidate) && validateSlug(candidate)) {
      return candidate;
    }
  }

  // Fall back to random slug
  return generateEntitySlug();
}

/**
 * Calculate invitation expiry date (7 days from now).
 * @returns ISO 8601 string for expiry date
 */
export function calculateInvitationExpiry(): string {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 7);
  return expiryDate.toISOString();
}
