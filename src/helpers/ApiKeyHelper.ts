/**
 * @fileoverview Entity API Key Helper Class
 * @description CRUD and verification for entity-scoped API keys.
 *
 * A key authenticates a caller as the entity itself -- CI jobs, scripts, and
 * service integrations that should outlive any individual member. Only the
 * SHA-256 hash is persisted, so the plaintext is returned once by `createKey`
 * and is unrecoverable afterwards; a lost key is rotated, not recovered.
 *
 * Permission checks are the caller's responsibility: gate writes on
 * `canManageApiKeys` and reads on `canViewApiKeys` via `PermissionHelper`.
 */

import { eq, and, desc } from "drizzle-orm";
import {
  type ApiKeyHelperConfig,
  type CreatedEntityApiKey,
  type EntityApiKey,
  type EntityApiKeyIdentity,
  type ListApiKeysOptions,
} from "../types";
import { generateApiKey, hashApiKey } from "../utils/api-key-generator";

/**
 * Helper class for entity API key operations.
 */
export class ApiKeyHelper {
  constructor(private readonly config: ApiKeyHelperConfig) {}

  /**
   * List an entity's API keys, newest first.
   * Secrets are never included -- only the display prefix.
   */
  async getKeys(
    entityId: string,
    options?: ListApiKeysOptions
  ): Promise<EntityApiKey[]> {
    const conditions = [eq(this.config.apiKeysTable.entity_id, entityId)];
    if (options?.isActive !== undefined) {
      conditions.push(eq(this.config.apiKeysTable.is_active, options.isActive));
    }

    let query = this.config.db
      .select()
      .from(this.config.apiKeysTable)
      .where(and(...conditions))
      .orderBy(desc(this.config.apiKeysTable.created_at))
      .$dynamic();

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.offset(options.offset);
    }

    const results = await query;
    return results.map((record: any) => this.mapRecordToKey(record));
  }

  /**
   * Get a single API key by id, scoped to its entity.
   * Returns null when the key does not exist or belongs to another entity.
   */
  async getKey(entityId: string, keyId: string): Promise<EntityApiKey | null> {
    const results = await this.config.db
      .select()
      .from(this.config.apiKeysTable)
      .where(
        and(
          eq(this.config.apiKeysTable.id, keyId),
          eq(this.config.apiKeysTable.entity_id, entityId)
        )
      )
      .limit(1);

    return results.length > 0 ? this.mapRecordToKey(results[0]) : null;
  }

  /**
   * Mint a new API key for an entity.
   *
   * @param entityId - Entity the key authenticates as
   * @param userId - Firebase UID of the creating user
   * @param keyName - Human-readable label for the key
   * @returns The stored key plus the plaintext secret, shown only here
   */
  async createKey(
    entityId: string,
    userId: string,
    keyName: string
  ): Promise<CreatedEntityApiKey> {
    const generated = await generateApiKey(this.config.keyPrefix);

    const results = await this.config.db
      .insert(this.config.apiKeysTable)
      .values({
        entity_id: entityId,
        key_name: keyName,
        key_hash: generated.keyHash,
        key_prefix: generated.keyPrefix,
        created_by_user_id: userId,
      })
      .returning();

    return { ...this.mapRecordToKey(results[0]), key: generated.key };
  }

  /**
   * Rename an API key or toggle whether it is active.
   * Returns null when the key does not belong to the entity.
   */
  async updateKey(
    entityId: string,
    keyId: string,
    updates: { keyName?: string; isActive?: boolean }
  ): Promise<EntityApiKey | null> {
    const values: Record<string, unknown> = { updated_at: new Date() };
    if (updates.keyName !== undefined) {
      values.key_name = updates.keyName;
    }
    if (updates.isActive !== undefined) {
      values.is_active = updates.isActive;
    }

    const results = await this.config.db
      .update(this.config.apiKeysTable)
      .set(values)
      .where(
        and(
          eq(this.config.apiKeysTable.id, keyId),
          eq(this.config.apiKeysTable.entity_id, entityId)
        )
      )
      .returning();

    return results.length > 0 ? this.mapRecordToKey(results[0]) : null;
  }

  /**
   * Permanently delete an API key.
   * Returns whether a key was removed.
   */
  async revokeKey(entityId: string, keyId: string): Promise<boolean> {
    const results = await this.config.db
      .delete(this.config.apiKeysTable)
      .where(
        and(
          eq(this.config.apiKeysTable.id, keyId),
          eq(this.config.apiKeysTable.entity_id, entityId)
        )
      )
      .returning();

    return results.length > 0;
  }

  /**
   * Resolve a plaintext API key to the entity it authenticates as.
   * Inactive keys do not verify.
   *
   * @param key - The plaintext key from the incoming request
   * @returns The identity behind the key, or null when it is unknown/inactive
   */
  async verifyKey(key: string): Promise<EntityApiKeyIdentity | null> {
    const keyHash = await hashApiKey(key);

    const results = await this.config.db
      .select()
      .from(this.config.apiKeysTable)
      .where(
        and(
          eq(this.config.apiKeysTable.key_hash, keyHash),
          eq(this.config.apiKeysTable.is_active, true)
        )
      )
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    const record = results[0];
    return {
      keyId: record.id,
      entityId: record.entity_id,
      createdByUserId: record.created_by_user_id,
    };
  }

  /**
   * Record that a key was just used.
   * Best-effort bookkeeping -- callers need not await it on the hot path.
   */
  async touchLastUsed(keyId: string): Promise<void> {
    await this.config.db
      .update(this.config.apiKeysTable)
      .set({ last_used_at: new Date() })
      .where(eq(this.config.apiKeysTable.id, keyId));
  }

  /**
   * Map a database record to the client-facing shape.
   */
  private mapRecordToKey(record: any): EntityApiKey {
    return {
      id: record.id,
      entityId: record.entity_id,
      keyName: record.key_name,
      keyPrefix: record.key_prefix,
      createdByUserId: record.created_by_user_id,
      isActive: record.is_active,
      lastUsedAt: record.last_used_at ?? null,
      createdAt: record.created_at ?? null,
      updatedAt: record.updated_at ?? null,
    };
  }
}
