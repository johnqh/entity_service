/**
 * @fileoverview Tests for Entity API Key Generation Utilities
 */

import { describe, test, expect } from "vitest";
import {
  generateApiKey,
  hashApiKey,
  validateKeyPrefix,
} from "./api-key-generator";

describe("validateKeyPrefix", () => {
  test("accepts lowercase alphanumeric prefixes", () => {
    expect(validateKeyPrefix("sk")).toBe(true);
    expect(validateKeyPrefix("shyft")).toBe(true);
    expect(validateKeyPrefix("v2")).toBe(true);
  });

  test("rejects empty, uppercase, and punctuated prefixes", () => {
    expect(validateKeyPrefix("")).toBe(false);
    expect(validateKeyPrefix("SK")).toBe(false);
    expect(validateKeyPrefix("sk_live")).toBe(false);
    expect(validateKeyPrefix("sk-live")).toBe(false);
  });

  test("rejects prefixes longer than 12 characters", () => {
    expect(validateKeyPrefix("a".repeat(12))).toBe(true);
    expect(validateKeyPrefix("a".repeat(13))).toBe(false);
  });
});

describe("hashApiKey", () => {
  test("returns a 64-character hex digest", async () => {
    const hash = await hashApiKey("sk_test");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("is deterministic", async () => {
    expect(await hashApiKey("sk_test")).toBe(await hashApiKey("sk_test"));
  });

  test("differs for different keys", async () => {
    expect(await hashApiKey("sk_a")).not.toBe(await hashApiKey("sk_b"));
  });

  test("matches the known SHA-256 digest of a fixed input", async () => {
    // Reference digest for "abc" -- guards against an encoding regression
    expect(await hashApiKey("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });
});

describe("generateApiKey", () => {
  test("returns a key carrying the requested prefix", async () => {
    const { key } = await generateApiKey("shyft");
    expect(key.startsWith("shyft_")).toBe(true);
  });

  test("defaults to the 'sk' prefix", async () => {
    const { key } = await generateApiKey();
    expect(key.startsWith("sk_")).toBe(true);
  });

  test("hash matches the plaintext key", async () => {
    const { key, keyHash } = await generateApiKey();
    expect(keyHash).toBe(await hashApiKey(key));
  });

  test("display prefix is a leading slice of the key", async () => {
    const { key, keyPrefix } = await generateApiKey();
    expect(key.startsWith(keyPrefix)).toBe(true);
    expect(keyPrefix).toHaveLength(12);
  });

  test("generates distinct keys", async () => {
    const a = await generateApiKey();
    const b = await generateApiKey();
    expect(a.key).not.toBe(b.key);
    expect(a.keyHash).not.toBe(b.keyHash);
  });

  test("rejects an invalid prefix", async () => {
    await expect(generateApiKey("BAD")).rejects.toThrow(
      /Invalid API key prefix/
    );
  });
});
