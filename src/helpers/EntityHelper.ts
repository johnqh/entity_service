/**
 * @fileoverview Entity Helper Class
 * @description CRUD operations for entities (personal and organization workspaces)
 */

import { eq, and, sql } from "drizzle-orm";
import {
  EntityType,
  EntityRole,
  type Entity,
  type EntityWithRole,
  type CreateEntityRequest,
  type UpdateEntityRequest,
  type EntityHelperConfig,
} from "../types";
import { generateEntitySlug, validateSlug, normalizeSlug } from "../utils";

/**
 * Advisory-lock namespace for personal-entity creation. Keeps the per-user
 * lock keys from colliding with advisory locks used by other features.
 */
const PERSONAL_ENTITY_LOCK_NAMESPACE = 0x70657273; // "pers"

/**
 * Helper class for entity CRUD operations.
 */
export class EntityHelper {
  constructor(private readonly config: EntityHelperConfig) {}

  /**
   * Insert a personal entity (+ owner membership) using the given executor.
   * The executor is either the base db or a transaction handle, so this can be
   * reused inside `getOrCreatePersonalEntity`'s locked transaction.
   */
  private async insertPersonalEntity(
    executor: Pick<EntityHelperConfig["db"], "insert">,
    firebaseUid: string,
    email?: string
  ): Promise<Entity> {
    const slug = generateEntitySlug();
    const displayName = email?.split("@")[0] ?? "Personal";

    const [entity] = await executor
      .insert(this.config.entitiesTable)
      .values({
        entity_slug: slug,
        entity_type: EntityType.PERSONAL,
        display_name: displayName,
      })
      .returning();

    // Add user as owner of their personal entity
    await executor.insert(this.config.membersTable).values({
      entity_id: entity.id,
      user_id: firebaseUid,
      role: EntityRole.OWNER,
      is_active: true,
    });

    return this.mapRecordToEntity(entity);
  }

  /**
   * Create a personal entity for a user.
   *
   * Prefer {@link getOrCreatePersonalEntity} for the login path: it guards
   * against creating duplicates. This unconditional create is exposed for
   * callers that have already established no personal entity exists.
   * @param firebaseUid - The Firebase UID (used as user_id)
   * @param email - Optional email for display name
   */
  async createPersonalEntity(
    firebaseUid: string,
    email?: string
  ): Promise<Entity> {
    return this.insertPersonalEntity(this.config.db, firebaseUid, email);
  }

  /**
   * Get or create a personal entity for a user.
   * Ensures exactly one personal entity exists per user.
   *
   * The check-then-create runs inside a single transaction guarded by a
   * per-user Postgres advisory lock. Without this, a brand-new user's first
   * authenticated page load fires several requests in parallel (the auth
   * middleware calls this on every request); each request's existence check
   * runs before any other has committed its insert, so every one of them
   * creates a personal entity -- producing duplicates. The advisory lock
   * serializes those concurrent callers so only the first creates the entity
   * and the rest find it.
   *
   * @param firebaseUid - The Firebase UID (used as user_id)
   * @param email - Optional email for display name
   */
  async getOrCreatePersonalEntity(
    firebaseUid: string,
    email?: string
  ): Promise<Entity> {
    return this.config.db.transaction(async tx => {
      // Serialize concurrent get-or-create calls for this user. The lock is
      // released automatically when the transaction ends.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(${PERSONAL_ENTITY_LOCK_NAMESPACE}::int4, hashtext(${firebaseUid}))`
      );

      // Check for existing personal entity where user is owner
      const existing = await tx
        .select({ entity: this.config.entitiesTable })
        .from(this.config.membersTable)
        .innerJoin(
          this.config.entitiesTable,
          eq(this.config.membersTable.entity_id, this.config.entitiesTable.id)
        )
        .where(
          and(
            eq(this.config.membersTable.user_id, firebaseUid),
            eq(this.config.membersTable.role, EntityRole.OWNER),
            eq(this.config.membersTable.is_active, true),
            eq(this.config.entitiesTable.entity_type, EntityType.PERSONAL)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        return this.mapRecordToEntity(existing[0].entity);
      }

      return this.insertPersonalEntity(tx, firebaseUid, email);
    });
  }

  /**
   * Create an organization entity.
   * @param firebaseUid - The Firebase UID (used as user_id)
   * @param request - Entity creation request
   */
  async createOrganizationEntity(
    firebaseUid: string,
    request: CreateEntityRequest
  ): Promise<Entity> {
    // Determine slug
    let slug: string;
    if (request.entitySlug) {
      slug = normalizeSlug(request.entitySlug);
      if (!validateSlug(slug)) {
        throw new Error("Invalid entity slug format");
      }
      // Check availability
      if (!(await this.isSlugAvailable(slug))) {
        throw new Error("Entity slug is already taken");
      }
    } else {
      slug = await this.generateUniqueSlug();
    }

    const [entity] = await this.config.db
      .insert(this.config.entitiesTable)
      .values({
        entity_slug: slug,
        entity_type: EntityType.ORGANIZATION,
        display_name: request.displayName,
        description: request.description ?? null,
      })
      .returning();

    // Add creator as owner
    await this.config.db.insert(this.config.membersTable).values({
      entity_id: entity.id,
      user_id: firebaseUid,
      role: EntityRole.OWNER,
      is_active: true,
    });

    return this.mapRecordToEntity(entity);
  }

  /**
   * Get entity by ID.
   */
  async getEntity(entityId: string): Promise<Entity | null> {
    const results = await this.config.db
      .select()
      .from(this.config.entitiesTable)
      .where(eq(this.config.entitiesTable.id, entityId))
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    return this.mapRecordToEntity(results[0]);
  }

  /**
   * Get entity by slug.
   */
  async getEntityBySlug(slug: string): Promise<Entity | null> {
    const results = await this.config.db
      .select()
      .from(this.config.entitiesTable)
      .where(eq(this.config.entitiesTable.entity_slug, slug))
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    return this.mapRecordToEntity(results[0]);
  }

  /**
   * Get all entities a user is a member of.
   * If the user has no entities, a personal entity is automatically created.
   * @param firebaseUid - The Firebase UID (used as user_id)
   * @param email - Optional email for display name if creating personal entity
   */
  async getUserEntities(
    firebaseUid: string,
    email?: string
  ): Promise<EntityWithRole[]> {
    const results = await this.config.db
      .select({
        entity: this.config.entitiesTable,
        role: this.config.membersTable.role,
      })
      .from(this.config.membersTable)
      .innerJoin(
        this.config.entitiesTable,
        eq(this.config.membersTable.entity_id, this.config.entitiesTable.id)
      )
      .where(
        and(
          eq(this.config.membersTable.user_id, firebaseUid),
          eq(this.config.membersTable.is_active, true)
        )
      );

    // If user has no entities, create a personal entity for them. Route through
    // the locked get-or-create so concurrent first-login requests can't each
    // create a duplicate personal entity.
    if (results.length === 0) {
      const personalEntity = await this.getOrCreatePersonalEntity(
        firebaseUid,
        email
      );
      return [
        {
          ...personalEntity,
          userRole: EntityRole.OWNER,
        },
      ];
    }

    return results.map(({ entity, role }) => ({
      ...this.mapRecordToEntity(entity),
      userRole: role as EntityRole,
    }));
  }

  /**
   * Update entity details.
   */
  async updateEntity(
    entityId: string,
    request: UpdateEntityRequest
  ): Promise<Entity> {
    const updates: Record<string, any> = {
      updated_at: new Date(),
    };

    if (request.displayName !== undefined) {
      updates.display_name = request.displayName;
    }

    if (request.description !== undefined) {
      updates.description = request.description;
    }

    if (request.avatarUrl !== undefined) {
      updates.avatar_url = request.avatarUrl;
    }

    if (request.entitySlug !== undefined) {
      const slug = normalizeSlug(request.entitySlug);
      if (!validateSlug(slug)) {
        throw new Error("Invalid entity slug format");
      }
      // Check if changing slug
      const existing = await this.getEntity(entityId);
      if (existing && existing.entitySlug !== slug) {
        if (!(await this.isSlugAvailable(slug))) {
          throw new Error("Entity slug is already taken");
        }
        updates.entity_slug = slug;
      }
    }

    const [updated] = await this.config.db
      .update(this.config.entitiesTable)
      .set(updates)
      .where(eq(this.config.entitiesTable.id, entityId))
      .returning();

    return this.mapRecordToEntity(updated);
  }

  /**
   * Delete an entity.
   * Only organizations can be deleted; personal entities cannot.
   */
  async deleteEntity(entityId: string): Promise<void> {
    const entity = await this.getEntity(entityId);
    if (!entity) {
      throw new Error("Entity not found");
    }

    if (entity.entityType === EntityType.PERSONAL) {
      throw new Error("Personal entities cannot be deleted");
    }

    await this.config.db
      .delete(this.config.entitiesTable)
      .where(eq(this.config.entitiesTable.id, entityId));
  }

  /**
   * Check if a slug is available.
   */
  async isSlugAvailable(slug: string): Promise<boolean> {
    const results = await this.config.db
      .select({ id: this.config.entitiesTable.id })
      .from(this.config.entitiesTable)
      .where(eq(this.config.entitiesTable.entity_slug, slug))
      .limit(1);

    return results.length === 0;
  }

  /**
   * Generate a unique slug.
   */
  private async generateUniqueSlug(): Promise<string> {
    for (let attempts = 0; attempts < 10; attempts++) {
      const slug = generateEntitySlug();
      if (await this.isSlugAvailable(slug)) {
        return slug;
      }
    }
    throw new Error("Failed to generate unique slug");
  }

  /**
   * Map database record to Entity type.
   */
  private mapRecordToEntity(record: any): Entity {
    return {
      id: record.id,
      entitySlug: record.entity_slug,
      entityType: record.entity_type as EntityType,
      displayName: record.display_name,
      description: record.description,
      avatarUrl: record.avatar_url,
      createdAt: record.created_at?.toISOString() ?? new Date().toISOString(),
      updatedAt: record.updated_at?.toISOString() ?? new Date().toISOString(),
    };
  }
}
