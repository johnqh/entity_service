/**
 * @fileoverview Tests for ApiKeyHelper
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import { ApiKeyHelper } from "./ApiKeyHelper";
import { hashApiKey } from "../utils/api-key-generator";

const mockEntityId = "entity-uuid-123";
const mockUserId = "firebase-uid-123";
const mockKeyId = "key-uuid-123";

/** A row as it comes back from the database */
function mockRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: mockKeyId,
    entity_id: mockEntityId,
    key_name: "CI deploy",
    key_hash: "0".repeat(64),
    key_prefix: "shyft_a1b2c3",
    created_by_user_id: mockUserId,
    is_active: true,
    last_used_at: null,
    created_at: new Date("2026-01-01T00:00:00Z"),
    updated_at: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

/** Capture of what the helper asked the database to do */
interface MockState {
  inserted: any[];
  updated: any[];
  deleted: number;
}

function createMockConfig(rows: any[] = [mockRecord()]) {
  const state: MockState = { inserted: [], updated: [], deleted: 0 };

  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.$dynamic = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue(rows);
  chain.offset = vi.fn().mockResolvedValue(rows);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.values = vi.fn().mockImplementation((values: any) => {
    state.inserted.push(values);
    return chain;
  });
  chain.update = vi.fn().mockReturnValue(chain);
  chain.set = vi.fn().mockImplementation((values: any) => {
    state.updated.push(values);
    return chain;
  });
  chain.delete = vi.fn().mockImplementation(() => {
    state.deleted += 1;
    return chain;
  });
  chain.returning = vi.fn().mockResolvedValue(rows);
  // `await query` on a chain that was never terminated by limit/offset
  chain.then = (resolve: any) => Promise.resolve(rows).then(resolve);

  return {
    config: {
      db: chain,
      entitiesTable: {},
      membersTable: {},
      usersTable: {},
      apiKeysTable: {
        id: "id",
        entity_id: "entity_id",
        key_hash: "key_hash",
        is_active: "is_active",
        created_at: "created_at",
      },
      keyPrefix: "shyft",
    } as any,
    state,
    chain,
  };
}

describe("createKey", () => {
  let helper: ApiKeyHelper;
  let mock: ReturnType<typeof createMockConfig>;

  beforeEach(() => {
    mock = createMockConfig();
    helper = new ApiKeyHelper(mock.config);
  });

  test("returns the plaintext key exactly once", async () => {
    const created = await helper.createKey(mockEntityId, mockUserId, "CI");
    expect(created.key).toMatch(/^shyft_[0-9a-f]{48}$/);
  });

  test("persists the hash of the key, never the key itself", async () => {
    const created = await helper.createKey(mockEntityId, mockUserId, "CI");
    const [values] = mock.state.inserted;

    expect(values.key_hash).toBe(await hashApiKey(created.key));
    expect(JSON.stringify(values)).not.toContain(created.key);
  });

  test("records the creating user and entity", async () => {
    await helper.createKey(mockEntityId, mockUserId, "CI");
    const [values] = mock.state.inserted;

    expect(values.entity_id).toBe(mockEntityId);
    expect(values.created_by_user_id).toBe(mockUserId);
    expect(values.key_name).toBe("CI");
  });

  test("uses the configured issuer prefix", async () => {
    const { config } = createMockConfig();
    const created = await new ApiKeyHelper({
      ...config,
      keyPrefix: "acme",
    }).createKey(mockEntityId, mockUserId, "CI");

    expect(created.key.startsWith("acme_")).toBe(true);
  });
});

describe("getKeys", () => {
  test("maps records to the client-facing shape without secrets", async () => {
    const mock = createMockConfig();
    const keys = await new ApiKeyHelper(mock.config).getKeys(mockEntityId);

    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({
      id: mockKeyId,
      entityId: mockEntityId,
      keyName: "CI deploy",
      keyPrefix: "shyft_a1b2c3",
      isActive: true,
    });
    expect(keys[0]).not.toHaveProperty("key");
    expect(keys[0]).not.toHaveProperty("keyHash");
  });
});

describe("getKey", () => {
  test("returns null when no row matches", async () => {
    const mock = createMockConfig([]);
    const key = await new ApiKeyHelper(mock.config).getKey(
      mockEntityId,
      mockKeyId
    );
    expect(key).toBeNull();
  });
});

describe("updateKey", () => {
  test("renames a key", async () => {
    const mock = createMockConfig();
    await new ApiKeyHelper(mock.config).updateKey(mockEntityId, mockKeyId, {
      keyName: "Renamed",
    });

    expect(mock.state.updated[0]).toMatchObject({ key_name: "Renamed" });
  });

  test("deactivates a key without touching its name", async () => {
    const mock = createMockConfig();
    await new ApiKeyHelper(mock.config).updateKey(mockEntityId, mockKeyId, {
      isActive: false,
    });

    expect(mock.state.updated[0]).toMatchObject({ is_active: false });
    expect(mock.state.updated[0]).not.toHaveProperty("key_name");
  });

  test("returns null when the key belongs to another entity", async () => {
    const mock = createMockConfig([]);
    const result = await new ApiKeyHelper(mock.config).updateKey(
      mockEntityId,
      mockKeyId,
      { keyName: "Renamed" }
    );
    expect(result).toBeNull();
  });
});

describe("revokeKey", () => {
  test("reports success when a row was deleted", async () => {
    const mock = createMockConfig();
    const revoked = await new ApiKeyHelper(mock.config).revokeKey(
      mockEntityId,
      mockKeyId
    );

    expect(revoked).toBe(true);
    expect(mock.state.deleted).toBe(1);
  });

  test("reports failure when nothing matched", async () => {
    const mock = createMockConfig([]);
    const revoked = await new ApiKeyHelper(mock.config).revokeKey(
      mockEntityId,
      mockKeyId
    );
    expect(revoked).toBe(false);
  });
});

describe("verifyKey", () => {
  test("resolves a known key to its entity", async () => {
    const mock = createMockConfig();
    const identity = await new ApiKeyHelper(mock.config).verifyKey("shyft_abc");

    expect(identity).toEqual({
      keyId: mockKeyId,
      entityId: mockEntityId,
      createdByUserId: mockUserId,
    });
  });

  test("returns null for an unknown or inactive key", async () => {
    const mock = createMockConfig([]);
    const identity = await new ApiKeyHelper(mock.config).verifyKey("shyft_bad");
    expect(identity).toBeNull();
  });
});

describe("touchLastUsed", () => {
  test("stamps last_used_at", async () => {
    const mock = createMockConfig();
    await new ApiKeyHelper(mock.config).touchLastUsed(mockKeyId);

    expect(mock.state.updated[0].last_used_at).toBeInstanceOf(Date);
  });
});
