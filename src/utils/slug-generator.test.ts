/**
 * @fileoverview Tests for Entity Slug Generation Utilities
 */

import { describe, test, expect } from 'bun:test';
import {
  generateEntitySlug,
  generateInvitationToken,
  normalizeSlug,
  validateSlug,
  generateUniqueSlug,
  calculateInvitationExpiry,
} from './slug-generator';

describe('generateEntitySlug', () => {
  test('generates slug of default length (8 characters)', () => {
    const slug = generateEntitySlug();
    expect(slug).toHaveLength(8);
  });

  test('generates slug of specified length', () => {
    const slug = generateEntitySlug(10);
    expect(slug).toHaveLength(10);
  });

  test('enforces minimum length of 8', () => {
    const slug = generateEntitySlug(5);
    expect(slug).toHaveLength(8);
  });

  test('enforces maximum length of 12', () => {
    const slug = generateEntitySlug(20);
    expect(slug).toHaveLength(12);
  });

  test('generates only lowercase alphanumeric characters', () => {
    const slug = generateEntitySlug(12);
    expect(slug).toMatch(/^[a-z0-9]+$/);
  });

  test('generates unique slugs on multiple calls', () => {
    const slugs = new Set<string>();
    for (let i = 0; i < 100; i++) {
      slugs.add(generateEntitySlug());
    }
    // All 100 should be unique (extremely high probability)
    expect(slugs.size).toBe(100);
  });
});

describe('generateInvitationToken', () => {
  test('generates 64-character hex token', () => {
    const token = generateInvitationToken();
    expect(token).toHaveLength(64);
  });

  test('generates only hex characters', () => {
    const token = generateInvitationToken();
    expect(token).toMatch(/^[0-9a-f]+$/);
  });

  test('generates unique tokens on multiple calls', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      tokens.add(generateInvitationToken());
    }
    expect(tokens.size).toBe(100);
  });
});

describe('normalizeSlug', () => {
  test('converts to lowercase', () => {
    expect(normalizeSlug('MYSLUG')).toBe('myslug');
    expect(normalizeSlug('MySlug')).toBe('myslug');
  });

  test('removes invalid characters', () => {
    expect(normalizeSlug('my-slug')).toBe('myslug');
    expect(normalizeSlug('my_slug')).toBe('myslug');
    expect(normalizeSlug('my slug')).toBe('myslug');
    expect(normalizeSlug('my@slug!')).toBe('myslug');
  });

  test('truncates to 12 characters', () => {
    expect(normalizeSlug('abcdefghijklmnop')).toBe('abcdefghijkl');
  });

  test('handles empty string', () => {
    expect(normalizeSlug('')).toBe('');
  });

  test('handles numbers', () => {
    expect(normalizeSlug('myslug123')).toBe('myslug123');
  });
});

describe('validateSlug', () => {
  test('accepts valid 8-character slug', () => {
    expect(validateSlug('abcd1234')).toBe(true);
  });

  test('accepts valid 12-character slug', () => {
    expect(validateSlug('abcdefgh1234')).toBe(true);
  });

  test('rejects slug shorter than 8 characters', () => {
    expect(validateSlug('abc1234')).toBe(false);
  });

  test('rejects slug longer than 12 characters', () => {
    expect(validateSlug('abcdefghij123')).toBe(false);
  });

  test('rejects uppercase characters', () => {
    expect(validateSlug('ABCD1234')).toBe(false);
    expect(validateSlug('Abcd1234')).toBe(false);
  });

  test('rejects special characters', () => {
    expect(validateSlug('abc-1234')).toBe(false);
    expect(validateSlug('abc_1234')).toBe(false);
    expect(validateSlug('abc 1234')).toBe(false);
  });

  test('rejects empty string', () => {
    expect(validateSlug('')).toBe(false);
  });
});

describe('generateUniqueSlug', () => {
  test('returns normalized slug if not taken', () => {
    const existing = new Set<string>();
    const result = generateUniqueSlug('myorganization', existing);
    expect(result).toBe('myorgani');
  });

  test('adds numeric suffix if base slug is taken', () => {
    const existing = new Set(['myorgani']);
    const result = generateUniqueSlug('myorganization', existing);
    expect(result).toBe('myorgani1');
  });

  test('increments suffix until unique', () => {
    const existing = new Set(['myorgani', 'myorgani1', 'myorgani2']);
    const result = generateUniqueSlug('myorganization', existing);
    expect(result).toBe('myorgani3');
  });

  test('handles short base slugs', () => {
    const existing = new Set<string>();
    const result = generateUniqueSlug('abc', existing);
    // Should fail validation (too short) and fall back or pad
    expect(result.length).toBeGreaterThanOrEqual(8);
  });

  test('falls back to random slug if all suffixes taken', () => {
    // Create existing slugs for suffixes 1-999
    const existing = new Set(['myorgani']);
    for (let i = 1; i < 1000; i++) {
      existing.add(`myorgani${i}`.slice(0, 12));
    }
    const result = generateUniqueSlug('myorganization', existing);
    // Should fall back to random slug
    expect(validateSlug(result)).toBe(true);
    expect(result).not.toContain('myorgani');
  });
});

describe('calculateInvitationExpiry', () => {
  test('returns ISO 8601 string', () => {
    const expiry = calculateInvitationExpiry();
    expect(expiry).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
  });

  test('returns date 7 days in the future', () => {
    const now = new Date();
    const expiry = new Date(calculateInvitationExpiry());
    const diffDays = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    // Should be approximately 7 days (within a few seconds tolerance)
    expect(diffDays).toBeGreaterThan(6.99);
    expect(diffDays).toBeLessThan(7.01);
  });
});
